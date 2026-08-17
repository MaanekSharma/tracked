import type {
  Holding,
  InvestmentTransaction,
  Security,
} from "npm:plaid@45.0.0";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { createPlaidClient, plaidError } from "./plaid.ts";
import { investmentCapabilityStatus, investmentHoldingIdentity } from "./plaid-account-normalization.ts";

type InvestmentItemRow = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_name: string | null;
  investment_transactions_start_date: string | null;
  investments_last_synced_at: string | null;
};

type InvestmentAccountMap = Map<string, string>;

export type InvestmentSyncSummary = {
  status: "available" | "balance_only" | "unavailable" | "pending" | "error";
  holdings: number;
  investment_transactions: number;
  transaction_start_date: string | null;
};

type InvestmentSyncOptions = {
  holdings?: boolean;
  transactions?: boolean;
};

const BALANCE_ONLY_ERROR_CODES = new Set([
  "ADDITIONAL_CONSENT_REQUIRED",
  "NO_INVESTMENT_ACCOUNTS",
  "PRODUCT_NOT_ENABLED",
  "PRODUCT_NOT_SUPPORTED",
  "PRODUCTS_NOT_SUPPORTED",
]);

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthsBefore(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() - months);
  return copy;
}

function daysBefore(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

function currencyCode(value: { iso_currency_code?: string | null; unofficial_currency_code?: string | null }) {
  return (value.iso_currency_code ?? value.unofficial_currency_code ?? "CAD").slice(0, 12).toUpperCase();
}

function logInvestmentSync(event: string, details: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "plaid-investments", event, ...details }));
}

async function setInvestmentStatus(
  admin: SupabaseClient,
  item: InvestmentItemRow,
  status: InvestmentSyncSummary["status"],
  accountStatus: "pending" | "available" | "balance_only" | "error",
  investmentAccountIds: string[],
) {
  await admin
    .from("plaid_items")
    .update({ investments_status: status })
    .eq("id", item.id)
    .eq("user_id", item.user_id);

  if (investmentAccountIds.length) {
    await admin
      .from("accounts")
      .update({ investment_sync_status: accountStatus })
      .eq("user_id", item.user_id)
      .eq("plaid_item_uuid", item.id)
      .in("plaid_account_id", investmentAccountIds);
  }
}

async function upsertSecurities(
  admin: SupabaseClient,
  item: InvestmentItemRow,
  securities: Security[],
) {
  if (securities.length) {
    const payload = securities.map((security) => ({
      user_id: item.user_id,
      plaid_item_uuid: item.id,
      plaid_security_id: security.security_id,
      name: security.name,
      ticker_symbol: security.ticker_symbol,
      security_type: security.type,
      security_subtype: security.subtype ?? null,
      close_price: security.close_price,
      close_price_as_of: security.close_price_as_of,
      currency_code: currencyCode(security),
      institution_security_id: security.institution_security_id,
      institution_id: security.institution_id,
    }));
    const { error } = await admin
      .from("investment_securities")
      .upsert(payload, { onConflict: "user_id,plaid_item_uuid,plaid_security_id" });
    if (error) throw error;
  }

  const { data, error } = await admin
    .from("investment_securities")
    .select("id, plaid_security_id")
    .eq("user_id", item.user_id)
    .eq("plaid_item_uuid", item.id);
  if (error) throw error;
  return new Map((data ?? []).map((security) => [security.plaid_security_id as string, security.id as string]));
}

async function replaceHoldings(
  admin: SupabaseClient,
  item: InvestmentItemRow,
  holdings: Holding[],
  accountMap: InvestmentAccountMap,
  securityMap: Map<string, string>,
) {
  const payload = holdings.flatMap((holding) => {
    const accountId = accountMap.get(holding.account_id);
    const securityId = securityMap.get(holding.security_id);
    if (!accountId || !securityId) return [];
    return [{
      user_id: item.user_id,
      plaid_item_uuid: item.id,
      account_id: accountId,
      plaid_account_id: holding.account_id,
      security_id: securityId,
      plaid_security_id: holding.security_id,
      quantity: holding.quantity,
      institution_value: holding.institution_value,
      institution_price: holding.institution_price,
      institution_price_as_of: holding.institution_price_as_of ?? null,
      cost_basis: holding.cost_basis,
      currency_code: currencyCode(holding),
    }];
  });

  if (payload.length) {
    const { error } = await admin
      .from("investment_holdings")
      .upsert(payload, { onConflict: "user_id,plaid_account_id,plaid_security_id" });
    if (error) throw error;
  }

  const currentKeys = new Set(payload.map((holding) => investmentHoldingIdentity(holding.plaid_account_id, holding.plaid_security_id)));
  const { data: existing, error: existingError } = await admin
    .from("investment_holdings")
    .select("id, plaid_account_id, plaid_security_id")
    .eq("user_id", item.user_id)
    .eq("plaid_item_uuid", item.id);
  if (existingError) throw existingError;
  const staleIds = (existing ?? [])
    .filter((holding) => !currentKeys.has(investmentHoldingIdentity(holding.plaid_account_id, holding.plaid_security_id)))
    .map((holding) => holding.id as string);
  if (staleIds.length) {
    const { error } = await admin
      .from("investment_holdings")
      .delete()
      .eq("user_id", item.user_id)
      .in("id", staleIds);
    if (error) throw error;
  }

  return payload.length;
}

async function upsertInvestmentTransactions(
  admin: SupabaseClient,
  item: InvestmentItemRow,
  transactions: InvestmentTransaction[],
  accountMap: InvestmentAccountMap,
  securityMap: Map<string, string>,
) {
  const payload = transactions.flatMap((transaction) => {
    const accountId = accountMap.get(transaction.account_id);
    if (!accountId) return [];
    return [{
      user_id: item.user_id,
      plaid_item_uuid: item.id,
      account_id: accountId,
      plaid_account_id: transaction.account_id,
      security_id: transaction.security_id ? securityMap.get(transaction.security_id) ?? null : null,
      plaid_security_id: transaction.security_id,
      plaid_investment_transaction_id: transaction.investment_transaction_id,
      cancel_transaction_id: transaction.cancel_transaction_id ?? null,
      transaction_date: transaction.date,
      transaction_datetime: transaction.transaction_datetime ?? null,
      name: transaction.name,
      quantity: transaction.quantity,
      amount: transaction.amount,
      price: transaction.price,
      fees: transaction.fees,
      transaction_type: transaction.type,
      transaction_subtype: transaction.subtype,
      currency_code: currencyCode(transaction),
    }];
  });

  if (payload.length) {
    const { error } = await admin
      .from("investment_transactions")
      .upsert(payload, { onConflict: "user_id,plaid_investment_transaction_id" });
    if (error) throw error;
  }
  return payload.length;
}

async function syncTransactionHistory(
  admin: SupabaseClient,
  item: InvestmentItemRow,
  accessToken: string,
  accountMap: InvestmentAccountMap,
) {
  const now = new Date();
  const initial = !item.investment_transactions_start_date;
  const startDate = initial
    ? dateKey(monthsBefore(now, 24))
    : dateKey(daysBefore(new Date(item.investments_last_synced_at ?? now), 7));
  const endDate = dateKey(now);
  const plaid = createPlaidClient();
  const transactions: InvestmentTransaction[] = [];
  const securities = new Map<string, Security>();
  let offset = 0;
  let total = 0;

  do {
    const response = await plaid.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset, async_update: initial },
    });
    const page = response.data.investment_transactions;
    transactions.push(...page);
    for (const security of response.data.securities) securities.set(security.security_id, security);
    total = response.data.total_investment_transactions;
    offset += page.length;
    if (!page.length) break;
  } while (offset < total && offset > 0);

  const securityMap = await upsertSecurities(admin, item, [...securities.values()]);
  const upserted = await upsertInvestmentTransactions(admin, item, transactions, accountMap, securityMap);
  return { upserted, startDate };
}

export async function syncPlaidInvestments(
  admin: SupabaseClient,
  item: InvestmentItemRow,
  accessToken: string,
  accountMap: InvestmentAccountMap,
  options: InvestmentSyncOptions = {},
): Promise<InvestmentSyncSummary> {
  const investmentAccountIds = [...accountMap.keys()];
  if (!investmentAccountIds.length) {
    await admin
      .from("plaid_items")
      .update({ investments_status: "unavailable", investment_accounts_count: 0 })
      .eq("id", item.id)
      .eq("user_id", item.user_id);
    logInvestmentSync("unavailable", { item_uuid: item.id, reason: "no_investment_accounts" });
    return { status: investmentCapabilityStatus(0, "unsupported"), holdings: 0, investment_transactions: 0, transaction_start_date: null };
  }

  await setInvestmentStatus(admin, item, "pending", "pending", investmentAccountIds);
  const syncHoldings = options.holdings !== false;
  const syncTransactions = options.transactions !== false;
  let holdingsCount = 0;
  let transactionCount = 0;
  let transactionStartDate = item.investment_transactions_start_date;

  try {
    if (syncHoldings) {
      const response = await createPlaidClient().investmentsHoldingsGet({ access_token: accessToken });
      const securityMap = await upsertSecurities(admin, item, response.data.securities);
      holdingsCount = await replaceHoldings(admin, item, response.data.holdings, accountMap, securityMap);
    }

    if (syncTransactions) {
      try {
        const transactionResult = await syncTransactionHistory(admin, item, accessToken, accountMap);
        transactionCount = transactionResult.upserted;
        transactionStartDate = transactionResult.startDate;
      } catch (error) {
        const code = plaidError(error)?.error_code;
        if (code !== "PRODUCT_NOT_READY") throw error;
        logInvestmentSync("transactions_pending", { item_uuid: item.id, error_code: code });
      }
    }

    const syncedAt = new Date().toISOString();
    const { error } = await admin
      .from("plaid_items")
      .update({
        investments_status: "available",
        investment_accounts_count: investmentAccountIds.length,
        investments_last_synced_at: syncedAt,
        investment_transactions_start_date: transactionStartDate,
      })
      .eq("id", item.id)
      .eq("user_id", item.user_id);
    if (error) throw error;
    await admin
      .from("accounts")
      .update({ investment_sync_status: "available" })
      .eq("user_id", item.user_id)
      .eq("plaid_item_uuid", item.id)
      .in("plaid_account_id", investmentAccountIds);

    logInvestmentSync("complete", {
      item_uuid: item.id,
      investment_accounts: investmentAccountIds.length,
      holdings: holdingsCount,
      investment_transactions: transactionCount,
      initial_history: !item.investment_transactions_start_date,
      start_date: transactionStartDate,
    });
    return {
      status: "available",
      holdings: holdingsCount,
      investment_transactions: transactionCount,
      transaction_start_date: transactionStartDate,
    };
  } catch (error) {
    const parsed = plaidError(error);
    const status = investmentCapabilityStatus(
      investmentAccountIds.length,
      parsed?.error_code === "PRODUCT_NOT_READY"
        ? "pending"
        : BALANCE_ONLY_ERROR_CODES.has(parsed?.error_code ?? "")
        ? "unsupported"
        : "error",
    );
    const accountStatus = status === "balance_only" ? "balance_only" : status === "pending" ? "pending" : "error";
    await setInvestmentStatus(admin, item, status, accountStatus, investmentAccountIds);
    logInvestmentSync("degraded", {
      item_uuid: item.id,
      status,
      error_code: parsed?.error_code ?? "INVESTMENTS_SYNC_ERROR",
      investment_accounts: investmentAccountIds.length,
    });
    return { status, holdings: 0, investment_transactions: 0, transaction_start_date: transactionStartDate };
  }
}
