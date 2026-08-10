import type { AccountBase, RemovedTransaction, Transaction } from "npm:plaid@45.0.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";
import { getPlaidAccessToken } from "./plaid-credentials.ts";
import { createPlaidClient, plaidError, safePlaidMessage } from "./plaid.ts";
import { categorizePlaidTransaction, categoryForPlaidSync, type BudgetCategoryRow, type PlaidCategoryRuleRow } from "./plaid-categories.ts";

type PlaidItemRow = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: string;
  sync_cursor: string | null;
};

type AccountRow = {
  id: string;
  plaid_account_id: string;
};

type ExistingTransactionRow = {
  id: string;
  category_id: string | null;
  category_source: string | null;
};

export type SyncSummary = {
  added: number;
  modified: number;
  removed: number;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currencyCode(account: AccountBase) {
  return (account.balances.iso_currency_code ?? account.balances.unofficial_currency_code ?? "CAD").slice(0, 3).toUpperCase();
}

function accountType(account: AccountBase) {
  if (account.type === "credit") return "credit_card";
  if (account.type === "depository" && account.subtype === "savings") return "savings";
  if (account.type === "depository") return "chequing";
  if (account.type === "investment") return "non_registered_investment";
  return "other";
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
  institutionName: string | null,
  accounts: AccountBase[],
) {
  if (!accounts.length) return;

  for (const account of accounts) {
    const syncedFields = {
      name: account.name,
      type: accountType(account),
      institution: institutionName,
      current_balance: account.balances.current ?? 0,
      balance_as_of: today(),
      plaid_item_uuid: itemUuid,
      plaid_account_id: account.account_id,
      official_name: account.official_name,
      mask: account.mask,
      account_subtype: account.subtype,
      institution_name: institutionName,
      available_balance: account.balances.available,
      currency_code: currencyCode(account),
      is_plaid_connected: true,
      plaid_connection_status: "connected",
      last_synced_at: new Date().toISOString(),
    };

    const { data: existing, error: lookupError } = await admin
      .from("accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("plaid_account_id", account.account_id)
      .maybeSingle();

    if (lookupError) throw new HttpError(500, "Unable to load synced account.");

    if (existing) {
      const { error } = await admin.from("accounts").update(syncedFields).eq("id", existing.id).eq("user_id", userId);
      if (error) throw new HttpError(500, "Unable to update synced account.");
      continue;
    }

    const { error } = await admin.from("accounts").insert({
      ...syncedFields,
      user_id: userId,
      notes: null,
      include_in_net_worth: true,
      archived: false,
    });

    if (error) throw new HttpError(500, "Unable to save synced account.");
  }
}

async function loadAccountMap(admin: SupabaseClient, userId: string, itemUuid: string) {
  const { data, error } = await admin
    .from("accounts")
    .select("id, plaid_account_id")
    .eq("user_id", userId)
    .eq("plaid_item_uuid", itemUuid)
    .not("plaid_account_id", "is", null);

  if (error) throw new HttpError(500, "Unable to load synced accounts.");

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

async function existingTransaction(admin: SupabaseClient, userId: string, plaidTransactionId: string) {
  const { data, error } = await admin
    .from("transactions")
    .select("id, category_id, category_source")
    .eq("user_id", userId)
    .eq("plaid_transaction_id", plaidTransactionId)
    .maybeSingle();

  if (error) throw new HttpError(500, "Unable to load existing transaction.");
  return (data ?? null) as ExistingTransactionRow | null;
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

  if (transaction.pending_transaction_id) {
    await admin
      .from("transactions")
      .update({ removed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("plaid_transaction_id", transaction.pending_transaction_id)
      .is("removed_at", null);
  }

  const existing = await existingTransaction(admin, userId, transaction.transaction_id);
  const categorization = categorizePlaidTransaction(transaction, categories, rules);
  const syncCategory = categoryForPlaidSync(existing, categorization);
  const transactionDate =
    transaction.authorized_date && transaction.authorized_date <= transaction.date
      ? transaction.authorized_date
      : transaction.date;
  const amount = Math.abs(transaction.amount);
  if (amount <= 0) return;

  const type = transaction.amount < 0 ? "income" : "expense";
  const plaidPrimary = transaction.personal_finance_category?.primary ?? null;
  const plaidDetailed = transaction.personal_finance_category?.detailed ?? null;

  const payload = {
    user_id: userId,
    account_id: accountId,
    destination_account_id: null,
    type,
    amount,
    merchant: transaction.merchant_name ?? transaction.name,
    description: transaction.original_description ?? transaction.name,
    transaction_date: transactionDate,
    posted_date: transaction.pending ? null : transaction.date,
    notes: null,
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
    category_id: syncCategory.category_id,
    category_source: syncCategory.category_source,
  };

  if (existing) {
    const { error } = await admin.from("transactions").update(payload).eq("id", existing.id).eq("user_id", userId);
    if (error) throw new HttpError(500, "Unable to update synced transaction.");
    return;
  }

  const { error } = await admin.from("transactions").insert(payload);
  if (error) throw new HttpError(500, "Unable to save synced transaction.");
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

async function syncItem(admin: SupabaseClient, item: PlaidItemRow, accessToken: string): Promise<SyncSummary> {
  const plaid = createPlaidClient();
  let cursor = item.sync_cursor ?? undefined;
  let hasMore = true;
  const added: Transaction[] = [];
  const modified: Transaction[] = [];
  const removed: RemovedTransaction[] = [];
  const syncAccounts = new Map<string, AccountBase>();

  try {
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
    throw new HttpError(502, safePlaidMessage(error));
  }

  await upsertPlaidAccounts(admin, item.user_id, item.id, item.institution_name, [...syncAccounts.values()]);

  const accountMap = await loadAccountMap(admin, item.user_id, item.id);
  const categories = await loadCategories(admin, item.user_id);
  const rules = await loadCategoryRules(admin, item.user_id);

  for (const transaction of [...added, ...modified]) {
    await upsertTransaction(admin, item.user_id, accountMap, categories, rules, transaction);
  }

  for (const transaction of removed) {
    await markRemoved(admin, item.user_id, transaction);
  }

  const lastSyncedAt = new Date().toISOString();
  const { error } = await admin
    .from("plaid_items")
    .update({
      sync_cursor: cursor || null,
      last_synced_at: lastSyncedAt,
      status: "connected",
      error_code: null,
      error_message: null,
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

  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
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
