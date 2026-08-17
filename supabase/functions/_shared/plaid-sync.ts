import type { AccountBase, Item, RemovedTransaction, Transaction } from "npm:plaid@45.0.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";
import { getPlaidAccessToken } from "./plaid-credentials.ts";
import { createPlaidClient, plaidError, plaidRequestError, safePlaidMessage } from "./plaid.ts";
import { categorizePlaidTransaction, type BudgetCategoryRow, type PlaidCategoryRuleRow } from "./plaid-categories.ts";
import {
  categoryFieldsForPlaidUpdate,
  planPlaidTransactionWrite,
  planSupersededPendingMetadataMerge,
  type ExistingPlaidTransactionRow,
} from "./plaid-transaction-reconciliation.ts";
import {
  isPlaidInvestmentAccount,
  manualReconciliationCandidates,
  normalizePlaidAccountType,
  plaidAccountBalanceUpdate,
  plaidAccountUpsertDecision,
  shouldImportAsSpendingTransaction,
  type ReconciliationAccount,
} from "./plaid-account-normalization.ts";
import { syncPlaidInvestments, type InvestmentSyncSummary } from "./plaid-investments.ts";

type PlaidItemRow = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: string;
  sync_cursor: string | null;
  investment_transactions_start_date: string | null;
  investments_last_synced_at: string | null;
};

type AccountRow = {
  id: string;
  plaid_account_id: string;
  plaid_account_type: string | null;
  reconciliation_status?: string;
};

export type SyncSummary = {
  added: number;
  modified: number;
  removed: number;
  accounts: number;
  holdings: number;
  investment_transactions: number;
  investments_status: InvestmentSyncSummary["status"];
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currencyCode(account: AccountBase) {
  return (account.balances.iso_currency_code ?? account.balances.unofficial_currency_code ?? "CAD").slice(0, 3).toUpperCase();
}

function logPlaidSync(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "plaid-sync", event, ...details }));
}

async function plaidItemByUuid(admin: SupabaseClient, itemUuid: string) {
  const { data, error } = await admin.from("plaid_items").select("*").eq("id", itemUuid).single();
  if (error || !data) throw new HttpError(404, "Bank connection was not found.");
  return data as PlaidItemRow;
}

export async function plaidItemByPlaidId(admin: SupabaseClient, plaidItemId: string) {
  const { data, error } = await admin.from("plaid_items").select("*").eq("plaid_item_id", plaidItemId).maybeSingle();
  if (error) throw new HttpError(500, "Unable to load bank connection.");
  return (data ?? null) as PlaidItemRow | null;
}

export async function upsertPlaidAccounts(
  admin: SupabaseClient,
  userId: string,
  itemUuid: string,
  institutionId: string | null,
  institutionName: string | null,
  accounts: AccountBase[],
) {
  if (!accounts.length) return { returned: 0, created: 0, updated: 0, needs_review: 0, investments: 0 };

  const { data: manualRows, error: manualError } = await admin
    .from("accounts")
    .select("id, name, type, institution, mask, plaid_account_id, archived")
    .eq("user_id", userId)
    .is("plaid_account_id", null);
  if (manualError) throw new HttpError(500, "Unable to load manual accounts for reconciliation.");
  const manualAccounts = (manualRows ?? []) as ReconciliationAccount[];
  let created = 0;
  let updated = 0;
  let needsReview = 0;
  let investments = 0;

  for (const account of accounts) {
    const mappedType = normalizePlaidAccountType(String(account.type), account.subtype ? String(account.subtype) : null);
    const investmentAccount = isPlaidInvestmentAccount({ type: String(account.type) });
    if (investmentAccount) investments += 1;
    const syncedFields = {
      ...plaidAccountBalanceUpdate(account.balances, today()),
      plaid_item_uuid: itemUuid,
      plaid_account_id: account.account_id,
      official_name: account.official_name,
      mask: account.mask,
      account_subtype: account.subtype,
      institution_id: institutionId,
      institution_name: institutionName,
      plaid_account_type: String(account.type),
      currency_code: currencyCode(account),
      is_plaid_connected: true,
      plaid_connection_status: "connected",
      investment_sync_status: investmentAccount ? "pending" : "not_applicable",
      last_synced_at: new Date().toISOString(),
    };

    const { data: existing, error: lookupError } = await admin
      .from("accounts")
      .select("id, reconciliation_status")
      .eq("user_id", userId)
      .eq("plaid_account_id", account.account_id)
      .maybeSingle();

    if (lookupError) throw new HttpError(500, "Unable to load synced account.");

    if (existing) {
      const decision = plaidAccountUpsertDecision(existing.id, 0);
      const displayFields = existing.reconciliation_status === "linked"
        ? {}
        : { name: account.name, type: mappedType, institution: institutionName };
      const { error } = await admin
        .from("accounts")
        .update({ ...syncedFields, ...displayFields })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (error) throw new HttpError(500, "Unable to update synced account.");
      updated += 1;
      if (decision.action !== "update") throw new HttpError(500, "Invalid account reconciliation decision.");
      continue;
    }

    const candidates = manualReconciliationCandidates(
      {
        name: account.name,
        official_name: account.official_name,
        mask: account.mask,
        type: String(account.type),
        subtype: account.subtype ? String(account.subtype) : null,
      },
      institutionName,
      manualAccounts,
    );
    const decision = plaidAccountUpsertDecision(null, candidates.length);
    const reconciliationStatus = decision.reconciliationStatus;
    if (candidates.length) needsReview += 1;

    const { error } = await admin.from("accounts").insert({
      ...syncedFields,
      user_id: userId,
      name: account.name,
      type: mappedType,
      institution: institutionName,
      notes: null,
      include_in_net_worth: decision.includeInNetWorth,
      archived: false,
      reconciliation_status: reconciliationStatus,
    });

    if (error) throw new HttpError(500, "Unable to save synced account.");
    created += 1;
  }

  logPlaidSync("accounts_reconciled", {
    item_uuid: itemUuid,
    institution: institutionName,
    returned: accounts.length,
    created,
    updated,
    needs_review: needsReview,
    investments,
    account_types: accounts.map((account) => ({ type: account.type, subtype: account.subtype ?? null })),
  });
  return { returned: accounts.length, created, updated, needs_review: needsReview, investments };
}

async function loadAccountMap(admin: SupabaseClient, userId: string, itemUuid: string) {
  const { data, error } = await admin
    .from("accounts")
    .select("id, plaid_account_id, plaid_account_type")
    .eq("user_id", userId)
    .eq("plaid_item_uuid", itemUuid)
    .not("plaid_account_id", "is", null);

  if (error) throw new HttpError(500, "Unable to load synced accounts.");

  return new Map(
    (data as AccountRow[])
      .filter((account) => shouldImportAsSpendingTransaction(account.plaid_account_type))
      .map((account) => [account.plaid_account_id, account.id]),
  );
}

async function loadInvestmentAccountMap(admin: SupabaseClient, userId: string, itemUuid: string) {
  const { data, error } = await admin
    .from("accounts")
    .select("id, plaid_account_id, plaid_account_type")
    .eq("user_id", userId)
    .eq("plaid_item_uuid", itemUuid)
    .eq("plaid_account_type", "investment")
    .not("plaid_account_id", "is", null);
  if (error) throw new HttpError(500, "Unable to load investment accounts.");
  return new Map((data as AccountRow[]).map((account) => [account.plaid_account_id, account.id]));
}

async function loadCategories(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("budget_categories")
    .select("id, name, group_name")
    .eq("user_id", userId)
    .eq("archived", false);

  if (error) throw new HttpError(500, "Unable to load budget categories.");
  return (data ?? []) as BudgetCategoryRow[];
}

async function loadCategoryRules(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("plaid_category_rules")
    .select("id, match_text, category_id, priority, active")
    .eq("user_id", userId)
    .eq("active", true)
    .order("priority", { ascending: true });

  if (error) throw new HttpError(500, "Unable to load Plaid category rules.");
  return (data ?? []) as PlaidCategoryRuleRow[];
}

async function existingTransactions(
  admin: SupabaseClient,
  userId: string,
  plaidTransactionIds: Array<string | null | undefined>,
) {
  const ids = [...new Set(plaidTransactionIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return [];

  const { data, error } = await admin
    .from("transactions")
    .select("id, plaid_transaction_id, category_id, category_source, type_override, excluded_from_spending, notes")
    .eq("user_id", userId)
    .in("plaid_transaction_id", ids);

  if (error) throw new HttpError(500, "Unable to load existing transactions.");
  return (data ?? []) as ExistingPlaidTransactionRow[];
}

async function markSupersededPending(
  admin: SupabaseClient,
  userId: string,
  transaction: ExistingPlaidTransactionRow,
) {
  const { error } = await admin
    .from("transactions")
    .update({
      removed_at: new Date().toISOString(),
      pending: false,
    })
    .eq("id", transaction.id)
    .eq("user_id", userId)
    .eq("plaid_transaction_id", transaction.plaid_transaction_id);

  if (error) throw new HttpError(500, "Unable to reconcile a pending transaction.");
}

async function mergeSupersededPendingMetadata(
  admin: SupabaseClient,
  userId: string,
  posted: ExistingPlaidTransactionRow,
  pending: ExistingPlaidTransactionRow,
) {
  const merge = planSupersededPendingMetadataMerge(posted, pending);

  if (merge.category) {
    const { error } = await admin
      .from("transactions")
      .update(merge.category)
      .eq("id", posted.id)
      .eq("user_id", userId)
      .or("category_source.is.null,category_source.neq.manual");
    if (error) throw new HttpError(500, "Unable to preserve a pending transaction category.");
  }

  if (merge.typeOverride) {
    const { error } = await admin
      .from("transactions")
      .update({ type_override: merge.typeOverride })
      .eq("id", posted.id)
      .eq("user_id", userId)
      .is("type_override", null);
    if (error) throw new HttpError(500, "Unable to preserve a pending transaction classification.");
  }

  if (merge.excludeFromSpending) {
    const { error } = await admin
      .from("transactions")
      .update({ excluded_from_spending: true })
      .eq("id", posted.id)
      .eq("user_id", userId)
      .eq("excluded_from_spending", false);
    if (error) throw new HttpError(500, "Unable to preserve a pending transaction exclusion.");
  }

  if (merge.notes !== null) {
    const { error } = await admin
      .from("transactions")
      .update({ notes: merge.notes })
      .eq("id", posted.id)
      .eq("user_id", userId)
      .is("notes", null);
    if (error) throw new HttpError(500, "Unable to preserve pending transaction notes.");
  }
}

async function upsertTransaction(
  admin: SupabaseClient,
  userId: string,
  accountMap: Map<string, string>,
  categories: BudgetCategoryRow[],
  rules: PlaidCategoryRuleRow[],
  transaction: Transaction,
) {
  const accountId = accountMap.get(transaction.account_id);
  if (!accountId) return;
  const categorization = categorizePlaidTransaction(transaction, categories, rules);
  const transactionDate =
    transaction.authorized_date && transaction.authorized_date <= transaction.date
      ? transaction.authorized_date
      : transaction.date;
  const amount = Math.abs(transaction.amount);
  if (amount <= 0) return;

  const type = transaction.amount < 0 ? "income" : "expense";
  const plaidPrimary = transaction.personal_finance_category?.primary ?? null;
  const plaidDetailed = transaction.personal_finance_category?.detailed ?? null;

  // These are Plaid-owned fields. User-owned notes, type_override, and
  // excluded_from_spending are deliberately absent so updates and rekeys keep them.
  const syncedFields = {
    account_id: accountId,
    destination_account_id: null,
    type,
    amount,
    merchant: transaction.merchant_name ?? transaction.name,
    description: transaction.original_description ?? transaction.name,
    transaction_date: transactionDate,
    posted_date: transaction.pending ? null : transaction.date,
    pending: transaction.pending,
    provider: "plaid",
    external_id: transaction.transaction_id,
    external_account_id: transaction.account_id,
    imported_at: new Date().toISOString(),
    plaid_transaction_id: transaction.transaction_id,
    plaid_account_id: transaction.account_id,
    plaid_pending_transaction_id: transaction.pending_transaction_id,
    merchant_name: transaction.merchant_name,
    original_description: transaction.original_description,
    authorized_date: transaction.authorized_date,
    payment_channel: transaction.payment_channel,
    source: "plaid",
    logo_url: transaction.logo_url,
    website: transaction.website,
    plaid_category_primary: plaidPrimary,
    plaid_category_detailed: plaidDetailed,
    removed_at: null,
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await existingTransactions(admin, userId, [
      transaction.transaction_id,
      transaction.pending_transaction_id,
    ]);
    const decision = planPlaidTransactionWrite(
      existing,
      transaction.transaction_id,
      transaction.pending_transaction_id,
    );

    if (decision.action === "update") {
      const { error } = await admin
        .from("transactions")
        .update(syncedFields)
        .eq("id", decision.target.id)
        .eq("user_id", userId);

      if (!error) {
        if (decision.supersededPending) {
          await mergeSupersededPendingMetadata(
            admin,
            userId,
            decision.target,
            decision.supersededPending,
          );
        }
        const categoryFields = categoryFieldsForPlaidUpdate(decision.target, categorization);
        if ("category_id" in categoryFields) {
          const { error: categoryError } = await admin
            .from("transactions")
            .update(categoryFields)
            .eq("id", decision.target.id)
            .eq("user_id", userId)
            .or("category_source.is.null,category_source.neq.manual");
          if (categoryError) throw new HttpError(500, "Unable to categorize a synced transaction.");
        }
        if (decision.supersededPending) {
          await markSupersededPending(admin, userId, decision.supersededPending);
        }
        return;
      }
      if (error.code === "23505" && attempt === 0) continue;
      throw new HttpError(500, "Unable to update synced transaction.");
    }

    const { error } = await admin.from("transactions").insert({
      ...syncedFields,
      user_id: userId,
      notes: null,
      category_id: categorization.category_id,
      category_source: categorization.category_source,
    });

    if (!error) return;
    if (error.code === "23505" && attempt === 0) continue;
    throw new HttpError(500, "Unable to save synced transaction.");
  }

  throw new HttpError(500, "Unable to save synced transaction.");
}

async function markRemoved(admin: SupabaseClient, userId: string, removed: RemovedTransaction) {
  const { error } = await admin
    .from("transactions")
    .update({
      removed_at: new Date().toISOString(),
      pending: false,
    })
    .eq("user_id", userId)
    .eq("plaid_transaction_id", removed.transaction_id);

  if (error) throw new HttpError(500, "Unable to remove synced transaction.");
}

async function setConnectionError(admin: SupabaseClient, item: PlaidItemRow, error: unknown) {
  const parsed = plaidError(error);
  const status = parsed?.error_code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error";

  await admin
    .from("plaid_items")
    .update({
      status,
      error_code: parsed?.error_code ?? "PLAID_ERROR",
      error_message: safePlaidMessage(error),
      transactions_status: "error",
    })
    .eq("id", item.id)
    .eq("user_id", item.user_id);

  await admin
    .from("accounts")
    .update({
      plaid_connection_status: status,
      is_plaid_connected: status === "login_required",
    })
    .eq("user_id", item.user_id)
    .eq("plaid_item_uuid", item.id);
}

function productMetadata(item: Item) {
  const products = new Set([...(item.products ?? []), ...item.billed_products].map(String));
  return {
    available_products: item.available_products,
    billed_products: item.billed_products,
    consented_products: item.consented_products ?? [],
    transactions_status: products.has("transactions") ? "available" : "unknown",
  };
}

async function refreshAccounts(admin: SupabaseClient, item: PlaidItemRow, accessToken: string) {
  const response = await createPlaidClient().accountsGet({ access_token: accessToken });
  const summary = await upsertPlaidAccounts(
    admin,
    item.user_id,
    item.id,
    item.institution_id,
    item.institution_name,
    response.data.accounts as AccountBase[],
  );
  const { error } = await admin
    .from("plaid_items")
    .update({ ...productMetadata(response.data.item), investment_accounts_count: summary.investments })
    .eq("id", item.id)
    .eq("user_id", item.user_id);
  if (error) throw new HttpError(500, "Unable to save Plaid product availability.");
  return summary;
}

async function syncItem(admin: SupabaseClient, item: PlaidItemRow, accessToken: string): Promise<SyncSummary> {
  const plaid = createPlaidClient();
  let cursor = item.sync_cursor ?? undefined;
  let hasMore = true;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];
  const syncAccounts = new Map<string, AccountBase>();
  let accountSummary: Awaited<ReturnType<typeof upsertPlaidAccounts>> = {
    returned: 0,
    created: 0,
    updated: 0,
    needs_review: 0,
    investments: 0,
  };

  try {
    accountSummary = await refreshAccounts(admin, item, accessToken);
    while (hasMore) {
      const response = await plaid.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 500,
        options: {
          include_original_description: true,
        },
      });

      for (const account of response.data.accounts) syncAccounts.set(account.account_id, account);
      added.push(...response.data.added);
      modified.push(...response.data.modified);
      removed.push(...response.data.removed);
      cursor = response.data.next_cursor;
      hasMore = response.data.has_more;
    }
  } catch (error) {
    await setConnectionError(admin, item, error);
    throw plaidRequestError("transactions_sync", error);
  }

  if (syncAccounts.size) {
    await upsertPlaidAccounts(
      admin,
      item.user_id,
      item.id,
      item.institution_id,
      item.institution_name,
      [...syncAccounts.values()],
    );
  }

  const accountMap = await loadAccountMap(admin, item.user_id, item.id);
  const categories = await loadCategories(admin, item.user_id);
  const rules = await loadCategoryRules(admin, item.user_id);

  for (const transaction of [...added, ...modified]) {
    await upsertTransaction(admin, item.user_id, accountMap, categories, rules, transaction);
  }

  for (const transaction of removed) {
    await markRemoved(admin, item.user_id, transaction);
  }

  const investmentAccountMap = await loadInvestmentAccountMap(admin, item.user_id, item.id);
  const investmentSummary = await syncPlaidInvestments(admin, item, accessToken, investmentAccountMap);

  const lastSyncedAt = new Date().toISOString();
  const { error } = await admin
    .from("plaid_items")
    .update({
      sync_cursor: cursor || null,
      last_synced_at: lastSyncedAt,
      status: "connected",
      error_code: null,
      error_message: null,
      transactions_status: "available",
    })
    .eq("id", item.id)
    .eq("user_id", item.user_id);

  if (error) throw new HttpError(500, "Unable to save sync state.");

  await admin
    .from("accounts")
    .update({
      last_synced_at: lastSyncedAt,
      plaid_connection_status: "connected",
      is_plaid_connected: true,
    })
    .eq("user_id", item.user_id)
    .eq("plaid_item_uuid", item.id);

  logPlaidSync("transactions_complete", {
    item_uuid: item.id,
    institution: item.institution_name,
    accounts: accountSummary.returned,
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    holdings: investmentSummary.holdings,
    investment_transactions: investmentSummary.investment_transactions,
    investments_status: investmentSummary.status,
  });

  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    accounts: accountSummary.returned,
    holdings: investmentSummary.holdings,
    investment_transactions: investmentSummary.investment_transactions,
    investments_status: investmentSummary.status,
  };
}

export async function syncPlaidItemByUuid(admin: SupabaseClient, itemUuid: string, userId?: string) {
  const item = await plaidItemByUuid(admin, itemUuid);
  if (userId && item.user_id !== userId) throw new HttpError(404, "Bank connection was not found.");
  const accessToken = await getPlaidAccessToken(admin, item.id);
  return syncItem(admin, item, accessToken);
}

export async function syncPlaidItemByPlaidId(admin: SupabaseClient, plaidItemId: string) {
  const item = await plaidItemByPlaidId(admin, plaidItemId);
  if (!item) return null;
  const accessToken = await getPlaidAccessToken(admin, item.id);
  return syncItem(admin, item, accessToken);
}

export async function syncPlaidInvestmentsByPlaidId(
  admin: SupabaseClient,
  plaidItemId: string,
  options: { holdings?: boolean; transactions?: boolean } = {},
) {
  const item = await plaidItemByPlaidId(admin, plaidItemId);
  if (!item) return null;
  const accessToken = await getPlaidAccessToken(admin, item.id);
  await refreshAccounts(admin, item, accessToken);
  const accountMap = await loadInvestmentAccountMap(admin, item.user_id, item.id);
  return syncPlaidInvestments(admin, item, accessToken, accountMap, options);
}
