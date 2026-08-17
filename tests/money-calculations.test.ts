import { describe, expect, it } from "vitest";
import {
  calculateMonthlyCashFlow,
  calculateSpendingComparison,
  filterTransactions,
  financialMonthRange,
  groupSpendingByCategory,
  summarizeAccounts,
} from "../lib/calculations";
import type { Account, BudgetCategory, Transaction } from "../types/domain";

function account(overrides: Partial<Account>): Account {
  return {
    id: "account",
    user_id: "user",
    name: "Account",
    type: "chequing",
    institution: null,
    current_balance: 0,
    balance_as_of: "2026-08-16",
    credit_limit: null,
    notes: null,
    include_in_net_worth: true,
    archived: false,
    plaid_item_uuid: null,
    plaid_account_id: null,
    official_name: null,
    mask: null,
    account_subtype: null,
    institution_name: null,
    institution_id: null,
    plaid_account_type: null,
    available_balance: null,
    currency_code: "CAD",
    is_plaid_connected: false,
    plaid_connection_status: "manual",
    last_synced_at: null,
    investment_sync_status: "not_applicable",
    reconciliation_status: "not_needed",
    created_at: "2026-08-16T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "transaction",
    user_id: "user",
    account_id: "account",
    destination_account_id: null,
    category_id: null,
    type: "expense",
    type_override: null,
    excluded_from_spending: false,
    amount: 10,
    merchant: "Merchant",
    description: null,
    transaction_date: "2026-08-16",
    posted_date: "2026-08-16",
    notes: null,
    pending: false,
    external_id: null,
    provider: null,
    external_account_id: null,
    imported_at: null,
    plaid_transaction_id: null,
    plaid_account_id: null,
    plaid_pending_transaction_id: null,
    merchant_name: null,
    original_description: null,
    authorized_date: null,
    payment_channel: null,
    source: "manual",
    logo_url: null,
    website: null,
    category_source: null,
    plaid_category_primary: null,
    plaid_category_detailed: null,
    removed_at: null,
    created_at: "2026-08-16T00:00:00Z",
    updated_at: "2026-08-16T00:00:00Z",
    ...overrides,
  };
}

const categories: BudgetCategory[] = [
  {
    id: "dining",
    user_id: "user",
    name: "Dining",
    group_name: "Food",
    icon: null,
    archived: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "groceries",
    user_id: "user",
    name: "Groceries",
    group_name: "Food",
    icon: null,
    archived: false,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
];

describe("account summary", () => {
  it("separates assets and liabilities without counting excluded or archived accounts", () => {
    const summary = summarizeAccounts([
      account({ id: "chequing", current_balance: 4_000 }),
      account({ id: "tfsa", type: "tfsa", plaid_account_type: "investment", current_balance: 20_000 }),
      account({ id: "card", type: "credit_card", plaid_account_type: "credit", current_balance: 800 }),
      account({ id: "loan", type: "other", plaid_account_type: "loan", current_balance: 2_000 }),
      account({ id: "duplicate", current_balance: 4_000, include_in_net_worth: false }),
      account({ id: "archived", current_balance: 500, archived: true }),
    ]);

    expect(summary.cash).toBe(4_000);
    expect(summary.investments).toBe(20_000);
    expect(summary.creditCardDebt).toBe(800);
    expect(summary.liabilities).toBe(2_800);
    expect(summary.netWorth).toBe(21_200);
  });
});

describe("monthly cash flow", () => {
  it("uses effective classification, excludes transfers, and excludes opted-out expenses", () => {
    const result = calculateMonthlyCashFlow([
      transaction({ id: "income", type: "income", amount: 3_000 }),
      transaction({ id: "expense", amount: 500 }),
      transaction({ id: "transfer", amount: 800, type_override: "transfer" }),
      transaction({ id: "excluded", amount: 100, excluded_from_spending: true }),
      transaction({ id: "removed-pending", amount: 40, pending: true, removed_at: "2026-08-17T00:00:00Z" }),
      transaction({ id: "posted", amount: 40, plaid_pending_transaction_id: "removed-pending" }),
    ]);

    expect(result).toEqual({ income: 3_000, spending: 540, cashFlow: 2_460 });
  });

  it("keeps excluded income in income because the flag is spending-specific", () => {
    expect(calculateMonthlyCashFlow([
      transaction({ type: "income", amount: 1_000, excluded_from_spending: true }),
    ])).toEqual({ income: 1_000, spending: 0, cashFlow: 1_000 });
  });
});

describe("Toronto financial month", () => {
  it("uses America/Toronto rather than the server timezone at a UTC month boundary", () => {
    const range = financialMonthRange(new Date("2026-09-01T03:30:00.000Z"));

    expect(range).toMatchObject({ key: "2026-08", from: "2026-08-01", to: "2026-08-31" });
  });

  it("handles previous-month year rollover", () => {
    expect(financialMonthRange(new Date("2026-01-15T17:00:00.000Z"), -1)).toMatchObject({
      key: "2025-12",
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("category analytics and transaction filters", () => {
  const rows = [
    transaction({ id: "one", account_id: "amex", category_id: "dining", amount: 60, merchant_name: "Cafe One" }),
    transaction({ id: "two", account_id: "amex", category_id: "dining", amount: 40, merchant: "Bistro" }),
    transaction({ id: "three", account_id: "chequing", category_id: "groceries", amount: 50, merchant: "Costco" }),
    transaction({ id: "four", account_id: "amex", category_id: "dining", amount: 30, type_override: "transfer" }),
    transaction({ id: "five", account_id: "amex", category_id: "dining", amount: 20, excluded_from_spending: true }),
    transaction({ id: "july", account_id: "amex", category_id: "dining", amount: 10, transaction_date: "2026-07-31" }),
  ];

  it("ranks included expense categories only", () => {
    const result = groupSpendingByCategory(rows, categories, { from: "2026-08-01", to: "2026-08-31" });

    expect(result.map(({ categoryId, name, amount, transactionCount }) => ({ categoryId, name, amount, transactionCount }))).toEqual([
      { categoryId: "dining", name: "Dining", amount: 100, transactionCount: 2 },
      { categoryId: "groceries", name: "Groceries", amount: 50, transactionCount: 1 },
    ]);
    expect(result[0].share).toBeCloseTo(66.67, 2);
    expect(result[1].share).toBeCloseTo(33.33, 2);
  });

  it("combines month, account, category, and search filters", () => {
    expect(filterTransactions(rows, {
      month: "2026-08",
      accountId: "amex",
      categoryId: "dining",
      search: "cafe",
    }).map((row) => row.id)).toEqual(["one"]);
  });
});

describe("spending comparison", () => {
  it("does not manufacture a comparison without prior spending", () => {
    expect(calculateSpendingComparison(100, 0)).toBeNull();
  });

  it("reports lower spending as down", () => {
    expect(calculateSpendingComparison(80, 100)).toEqual({ percentChange: -20, direction: "down" });
  });
});
