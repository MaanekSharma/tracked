import { describe, expect, it } from "vitest";
import { ALL_TRANSACTION_MONTHS, filterTransactions } from "@/lib/calculations";
import {
  TRANSACTION_CSV_HEADERS,
  analyzeTransactions,
  calculateComparablePeriodComparison,
  calculateMonthOverMonthComparison,
  groupTransactionsByMonth,
  transactionExportFilename,
  transactionsToCsv,
} from "@/lib/transaction-analysis";
import type { Account, BudgetCategory, Transaction } from "@/types/domain";

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "account",
    user_id: "user",
    name: "Account",
    type: "chequing",
    institution: null,
    current_balance: 0,
    balance_as_of: "2026-08-21",
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
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
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
    transaction_date: "2026-08-21",
    posted_date: "2026-08-21",
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
    created_at: "2026-08-21T00:00:00Z",
    updated_at: "2026-08-21T00:00:00Z",
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

describe("transaction analysis summary", () => {
  it("uses effective types while handling normalized refunds, transfers, exclusions, pending, and removed rows", () => {
    const result = analyzeTransactions([
      transaction({ id: "expense", amount: 120, merchant: "Bistro", transaction_date: "2026-07-20" }),
      transaction({ id: "salary", type: "income", amount: 1_000 }),
      transaction({ id: "normalized-refund", type: "income", amount: 25, merchant: "Refund" }),
      transaction({ id: "transfer", type: "transfer", amount: 300 }),
      transaction({ id: "excluded", amount: 40, excluded_from_spending: true }),
      transaction({ id: "pending", amount: 30, pending: true }),
      transaction({ id: "removed", amount: 900, removed_at: "2026-08-22T00:00:00Z" }),
      transaction({ id: "override-transfer", amount: 55, type_override: "transfer" }),
      transaction({ id: "override-expense", type: "income", amount: 20, type_override: "expense" }),
      transaction({ id: "override-income", type: "expense", amount: 15, type_override: "income" }),
    ], categories);

    expect(result.summary).toMatchObject({
      totalSpending: 170,
      totalIncome: 1_040,
      netCashFlow: 870,
      averageMonthlySpending: 85,
      transactionCount: 9,
      largestExpense: {
        id: "expense",
        name: "Bistro",
        amount: 120,
        transactionDate: "2026-07-20",
      },
    });
    expect(result.summary.averageTransactionSize).toBeCloseTo(1_210 / 6);
  });

  it("returns neutral, non-misleading values for an empty dataset", () => {
    expect(analyzeTransactions([], categories)).toEqual({
      summary: {
        totalSpending: 0,
        totalIncome: 0,
        netCashFlow: 0,
        averageTransactionSize: 0,
        averageMonthlySpending: 0,
        largestExpense: null,
        transactionCount: 0,
      },
      categories: [],
      merchants: [],
      months: [],
      comparison: null,
      frequentMerchants: [],
    });
  });
});

describe("transaction analysis breakdowns", () => {
  it("groups included spending by category with counts, shares, and an Uncategorized fallback", () => {
    const result = analyzeTransactions([
      transaction({ id: "dining-one", category_id: "dining", amount: 60 }),
      transaction({ id: "dining-two", category_id: "dining", amount: 40 }),
      transaction({ id: "groceries", category_id: "groceries", amount: 50 }),
      transaction({ id: "uncategorized", category_id: null, amount: 25 }),
      transaction({ id: "transfer", category_id: "dining", type: "transfer", amount: 500 }),
      transaction({ id: "excluded", category_id: "dining", amount: 100, excluded_from_spending: true }),
      transaction({ id: "income", category_id: "groceries", type: "income", amount: 800 }),
      transaction({ id: "removed", category_id: "dining", amount: 1_000, removed_at: "2026-08-22T00:00:00Z" }),
    ], categories);

    expect(result.categories.map(({ name, amount, transactionCount }) => ({ name, amount, transactionCount }))).toEqual([
      { name: "Dining", amount: 100, transactionCount: 2 },
      { name: "Groceries", amount: 50, transactionCount: 1 },
      { name: "Uncategorized", amount: 25, transactionCount: 1 },
    ]);
    expect(result.categories[0].share).toBeCloseTo((100 / 175) * 100);
    expect(result.categories[1].share).toBeCloseTo((50 / 175) * 100);
    expect(result.categories[2].share).toBeCloseTo((25 / 175) * 100);
  });

  it("normalizes names and counts every active transaction type in frequent-merchant signals", () => {
    const result = analyzeTransactions([
      transaction({ id: "cafe-one", merchant_name: "  Café & Co. ", amount: 20 }),
      transaction({ id: "cafe-two", merchant_name: "CAFÉ—CO", amount: 30 }),
      transaction({ id: "solo", merchant_name: "Solo Shop", amount: 15 }),
      transaction({ id: "unknown-one", merchant: null, merchant_name: null, amount: 5 }),
      transaction({ id: "unknown-two", merchant: null, merchant_name: null, amount: 7 }),
      transaction({ id: "excluded", merchant_name: "Café & Co.", amount: 100, excluded_from_spending: true }),
      transaction({ id: "income", merchant_name: "Café & Co.", type: "income", amount: 200 }),
      transaction({ id: "transfer", merchant_name: "Café & Co.", type: "transfer", amount: 300 }),
      transaction({ id: "removed", merchant_name: "Café & Co.", amount: 400, removed_at: "2026-08-22T00:00:00Z" }),
    ], categories);

    expect(result.merchants.map(({ key, name, amount, transactionCount }) => ({ key, name, amount, transactionCount }))).toEqual([
      { key: "café co", name: "Café & Co.", amount: 50, transactionCount: 2 },
      { key: "solo shop", name: "Solo Shop", amount: 15, transactionCount: 1 },
      { key: "unknown merchant", name: "Unknown Merchant", amount: 12, transactionCount: 2 },
    ]);
    expect(result.merchants.reduce((sum, merchant) => sum + merchant.share, 0)).toBeCloseTo(100);
    expect(result.frequentMerchants.map(({ name, totalAmount, transactionCount }) => ({ name, totalAmount, transactionCount }))).toEqual([
      { name: "Café & Co.", totalAmount: 650, transactionCount: 5 },
    ]);
  });

  it("groups months chronologically and calculates a valid adjacent month-over-month comparison", () => {
    const months = groupTransactionsByMonth([
      transaction({ id: "june-expense", amount: 50, transaction_date: "2026-06-04" }),
      transaction({ id: "june-income", type: "income", amount: 300, transaction_date: "2026-06-20" }),
      transaction({ id: "july-expense", amount: 100, transaction_date: "2026-07-10" }),
      transaction({ id: "july-transfer", type: "transfer", amount: 900, transaction_date: "2026-07-15" }),
      transaction({ id: "july-excluded", amount: 20, excluded_from_spending: true, transaction_date: "2026-07-16" }),
      transaction({ id: "august-expense", amount: 60, transaction_date: "2026-08-01" }),
      transaction({ id: "august-income", type: "income", amount: 200, transaction_date: "2026-08-02" }),
      transaction({ id: "august-pending", amount: 20, pending: true, transaction_date: "2026-08-03" }),
      transaction({ id: "removed", amount: 1_000, transaction_date: "2026-08-04", removed_at: "2026-08-05T00:00:00Z" }),
    ]);

    expect(months.map(({ month, spending, income, netCashFlow, transactionCount }) => ({
      month,
      spending,
      income,
      netCashFlow,
      transactionCount,
    }))).toEqual([
      { month: "2026-06", spending: 50, income: 300, netCashFlow: 250, transactionCount: 2 },
      { month: "2026-07", spending: 100, income: 0, netCashFlow: -100, transactionCount: 3 },
      { month: "2026-08", spending: 80, income: 200, netCashFlow: 120, transactionCount: 3 },
    ]);
    expect(calculateMonthOverMonthComparison(months)).toMatchObject({
      currentMonth: "2026-08",
      currentSpending: 80,
      previousMonth: "2026-07",
      previousSpending: 100,
      percentChange: -20,
      direction: "down",
    });
  });

  it("does not calculate month-over-month percentages without a comparable prior spending month", () => {
    const oneMonth = groupTransactionsByMonth([
      transaction({ id: "august", amount: 80, transaction_date: "2026-08-01" }),
    ]);
    const monthGap = groupTransactionsByMonth([
      transaction({ id: "june", amount: 100, transaction_date: "2026-06-01" }),
      transaction({ id: "august", amount: 80, transaction_date: "2026-08-01" }),
    ]);
    const noPreviousSpending = groupTransactionsByMonth([
      transaction({ id: "july-income", type: "income", amount: 100, transaction_date: "2026-07-01" }),
      transaction({ id: "august", amount: 80, transaction_date: "2026-08-01" }),
    ]);

    expect(calculateMonthOverMonthComparison(oneMonth)).toBeNull();
    expect(calculateMonthOverMonthComparison(monthGap)).toBeNull();
    expect(calculateMonthOverMonthComparison(noPreviousSpending)).toBeNull();
  });

  it("compares a selected month with the prior month after applying the same non-month filters", () => {
    const loadedTransactions = [
      transaction({
        id: "current-match",
        account_id: "account",
        category_id: "dining",
        merchant_name: "Cafe Match",
        amount: 80,
        transaction_date: "2026-08-10",
      }),
      transaction({
        id: "previous-match",
        account_id: "account",
        category_id: "dining",
        merchant_name: "Cafe Match",
        amount: 100,
        transaction_date: "2026-07-10",
      }),
      transaction({
        id: "wrong-account",
        account_id: "other-account",
        category_id: "dining",
        merchant_name: "Cafe Match",
        amount: 900,
        transaction_date: "2026-07-11",
      }),
      transaction({
        id: "wrong-search",
        account_id: "account",
        category_id: "dining",
        merchant_name: "Restaurant",
        amount: 700,
        transaction_date: "2026-07-12",
      }),
    ];
    const sharedFilters = { search: "cafe", accountId: "account", categoryId: "dining" };
    const current = filterTransactions(loadedTransactions, { ...sharedFilters, month: "2026-08" });
    const previous = filterTransactions(loadedTransactions, { ...sharedFilters, month: "2026-07" });

    expect(current.map((row) => row.id)).toEqual(["current-match"]);
    expect(previous.map((row) => row.id)).toEqual(["previous-match"]);
    expect(calculateComparablePeriodComparison(current, previous, "2026-08", "2026-07")).toMatchObject({
      currentMonth: "2026-08",
      currentSpending: 80,
      previousMonth: "2026-07",
      previousSpending: 100,
      percentChange: -20,
      direction: "down",
    });
    expect(calculateComparablePeriodComparison(current, [], "2026-08", "2026-07")).toBeNull();
  });
});

describe("transaction CSV export", () => {
  const accounts = [
    account({
      id: "daily",
      name: "Daily Account",
      institution_name: "Maple Bank",
      institution: "Fallback Bank",
    }),
    account({
      id: "legacy",
      name: "Legacy Account",
      institution_name: null,
      institution: "Legacy Credit Union",
    }),
  ];

  it("writes exact headers, raw amounts, effective types, mapped account data, and escaped CSV cells", () => {
    const csv = transactionsToCsv([
      transaction({
        id: "escaped",
        account_id: "daily",
        category_id: "dining",
        transaction_date: "2026-08-21",
        merchant_name: "North, \"Star\"\nCafe",
        description: "First line\r\nSecond, \"quoted\"",
        amount: "84.27",
        type: "expense",
        type_override: "transfer",
        pending: true,
        plaid_transaction_id: "plaid-1",
      }),
    ], accounts, categories);
    const expectedRow = [
      "2026-08-21",
      "\"North, \"\"Star\"\"\nCafe\"",
      "\"First line\r\nSecond, \"\"quoted\"\"\"",
      "Dining",
      "84.27",
      "transfer",
      "Daily Account",
      "Maple Bank",
      "Yes",
      "plaid-1",
    ].join(",");

    expect(csv).toBe(`${TRANSACTION_CSV_HEADERS.join(",")}\r\n${expectedRow}`);
    expect(csv).not.toContain("$84.27");
  });

  it("uses institution and joined-record fallbacks without inventing missing values", () => {
    const csv = transactionsToCsv([
      transaction({
        id: "legacy",
        account_id: "legacy",
        merchant: null,
        merchant_name: null,
        description: null,
        original_description: "Original description",
        amount: "10.50",
        type: "income",
      }),
      transaction({
        id: "joined-fallback",
        account_id: "missing-account",
        category_id: "missing-category",
        merchant: null,
        accounts: { name: "Imported Snapshot", type: "chequing" },
        budget_categories: { name: "Archived Category", group_name: "History" },
      }),
      transaction({
        id: "unknown-fallbacks",
        account_id: "missing-account",
        merchant: null,
        merchant_name: null,
      }),
    ], accounts, categories);
    const lines = csv.split("\r\n");

    expect(lines[1]).toBe("2026-08-21,Unknown Merchant,Original description,Uncategorized,10.5,income,Legacy Account,Legacy Credit Union,No,");
    expect(lines[2]).toBe("2026-08-21,Unknown Merchant,,Archived Category,10,expense,Imported Snapshot,,No,");
    expect(lines[3]).toBe("2026-08-21,Unknown Merchant,,Uncategorized,10,expense,Unknown Account,,No,");
  });

  it("returns a header-only file for zero matching transactions", () => {
    expect(transactionsToCsv([], accounts, categories)).toBe(TRANSACTION_CSV_HEADERS.join(","));
  });

  it("neutralizes formula-leading text fields without changing dates or numeric amounts", () => {
    const csv = transactionsToCsv([
      transaction({
        merchant_name: "=2+2",
        description: "-2+3",
        category_id: "dangerous-category",
        amount: "84.27",
        plaid_transaction_id: "+plaid-id",
      }),
    ], [account({ name: "=Account", institution_name: "+Bank" })], [
      { ...categories[0], id: "dangerous-category", name: "@Category" },
    ]);

    expect(csv.split("\r\n")[1]).toBe(
      "2026-08-21,'=2+2,'-2+3,'@Category,84.27,expense,'=Account,'+Bank,No,'+plaid-id",
    );
  });

  it.each([
    [ALL_TRANSACTION_MONTHS, "tracked-transactions-all.csv"],
    ["2026-08", "tracked-transactions-2026-08.csv"],
    ["", "tracked-transactions-filtered.csv"],
    ["not-a-month", "tracked-transactions-filtered.csv"],
  ])("builds a useful export filename for %s", (month, expected) => {
    expect(transactionExportFilename(month)).toBe(expected);
  });
});

describe("shared filtered transaction pipeline regressions", () => {
  const accounts = [account()];

  it("includes historical All Months rows in both analysis and CSV export", () => {
    const loadedTransactions = [
      transaction({ id: "august-expense", amount: 20, transaction_date: "2026-08-10", merchant: "August Shop" }),
      transaction({ id: "historical-income", type: "income", amount: 50, transaction_date: "2025-12-15", merchant: "Old Market" }),
      transaction({ id: "removed-history", amount: 500, transaction_date: "2025-01-01", removed_at: "2025-01-02T00:00:00Z" }),
    ];
    const filteredTransactions = filterTransactions(loadedTransactions, { month: ALL_TRANSACTION_MONTHS });
    const analysis = analyzeTransactions(filteredTransactions, categories);
    const csv = transactionsToCsv(filteredTransactions, accounts, categories);

    expect(filteredTransactions.map((row) => row.id)).toEqual(["august-expense", "historical-income"]);
    expect(analysis.summary).toMatchObject({ transactionCount: 2, totalSpending: 20, totalIncome: 50 });
    expect(csv).toContain("2025-12-15,Old Market");
    expect(csv).toContain("2026-08-10,August Shop");
  });

  it("analyzes and exports every filtered match rather than only the first visible page", () => {
    const loadedTransactions = Array.from({ length: 75 }, (_, index) => transaction({
      id: `transaction-${index}`,
      amount: 1,
      merchant: `Merchant ${index}`,
    }));
    const filteredTransactions = filterTransactions(loadedTransactions, { month: ALL_TRANSACTION_MONTHS });
    const analysis = analyzeTransactions(filteredTransactions, categories);
    const csv = transactionsToCsv(filteredTransactions, accounts, categories);

    expect(filteredTransactions).toHaveLength(75);
    expect(analysis.summary).toMatchObject({ transactionCount: 75, totalSpending: 75 });
    expect(csv.split("\r\n")).toHaveLength(76);
    expect(csv).toContain("Merchant 74");
  });
});
