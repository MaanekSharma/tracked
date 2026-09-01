import {
  ALL_TRANSACTION_MONTHS,
  calculateSpendingComparison,
  countsAsIncome,
  countsAsSpending,
  effectiveTransactionType,
  groupSpendingByCategory,
  type SpendingCategory,
} from "@/lib/calculations";
import { toNumber } from "@/lib/utils";
import type { Account, BudgetCategory, Transaction } from "@/types/domain";

const UNKNOWN_MERCHANT = "Unknown Merchant";
const UNCATEGORIZED = "Uncategorized";

export type TransactionSummary = {
  totalSpending: number;
  totalIncome: number;
  netCashFlow: number;
  averageTransactionSize: number;
  averageMonthlySpending: number;
  largestExpense: {
    id: string;
    name: string;
    amount: number;
    transactionDate: string;
  } | null;
  transactionCount: number;
};

export type MerchantBreakdown = {
  key: string;
  name: string;
  amount: number;
  transactionCount: number;
  share: number;
};

export type FrequentMerchantSignal = {
  key: string;
  name: string;
  totalAmount: number;
  transactionCount: number;
};

export type MonthlyTransactionBreakdown = {
  month: string;
  label: string;
  spending: number;
  income: number;
  netCashFlow: number;
  transactionCount: number;
};

export type MonthOverMonthComparison = {
  currentMonth: string;
  currentLabel: string;
  currentSpending: number;
  previousMonth: string;
  previousLabel: string;
  previousSpending: number;
  percentChange: number;
  direction: "up" | "down" | "flat";
};

export type TransactionAnalysis = {
  summary: TransactionSummary;
  categories: SpendingCategory[];
  merchants: MerchantBreakdown[];
  months: MonthlyTransactionBreakdown[];
  comparison: MonthOverMonthComparison | null;
  frequentMerchants: FrequentMerchantSignal[];
};

export const TRANSACTION_CSV_HEADERS = [
  "Date",
  "Merchant",
  "Description",
  "Category",
  "Amount",
  "Type",
  "Account",
  "Institution",
  "Pending",
  "Plaid Transaction ID",
] as const;

function activeTransactions(transactions: Transaction[]) {
  return transactions.filter((transaction) => !transaction.removed_at);
}

function transactionMerchant(transaction: Transaction) {
  return transaction.merchant_name?.trim() || transaction.merchant?.trim() || UNKNOWN_MERCHANT;
}

function normalizedMerchantKey(name: string) {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en-CA")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

export function previousTransactionMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calculateTransactionSummary(transactions: Transaction[]): TransactionSummary {
  const active = activeTransactions(transactions);
  const expenses = active.filter(countsAsSpending);
  const income = active.filter(countsAsIncome);
  const totalSpending = expenses.reduce((total, transaction) => total + toNumber(transaction.amount), 0);
  const totalIncome = income.reduce((total, transaction) => total + toNumber(transaction.amount), 0);
  const includedCashFlowTransactions = [...expenses, ...income];
  const averageTransactionSize = includedCashFlowTransactions.length
    ? includedCashFlowTransactions.reduce((total, transaction) => total + Math.abs(toNumber(transaction.amount)), 0)
      / includedCashFlowTransactions.length
    : 0;
  const months = new Set(active.map((transaction) => transaction.transaction_date.slice(0, 7)));
  const largestExpenseTransaction = expenses.reduce<Transaction | null>((largest, transaction) => {
    if (toNumber(transaction.amount) <= 0) return largest;
    if (!largest || toNumber(transaction.amount) > toNumber(largest.amount)) return transaction;
    return largest;
  }, null);

  return {
    totalSpending,
    totalIncome,
    netCashFlow: totalIncome - totalSpending,
    averageTransactionSize,
    averageMonthlySpending: months.size ? totalSpending / months.size : 0,
    largestExpense: largestExpenseTransaction
      ? {
          id: largestExpenseTransaction.id,
          name: transactionMerchant(largestExpenseTransaction),
          amount: toNumber(largestExpenseTransaction.amount),
          transactionDate: largestExpenseTransaction.transaction_date,
        }
      : null,
    transactionCount: active.length,
  };
}

export function groupTransactionsByMerchant(transactions: Transaction[]): MerchantBreakdown[] {
  const groups = new Map<string, Omit<MerchantBreakdown, "share">>();

  for (const transaction of activeTransactions(transactions)) {
    if (!countsAsSpending(transaction)) continue;
    const name = transactionMerchant(transaction);
    const key = normalizedMerchantKey(name) || UNKNOWN_MERCHANT.toLocaleLowerCase("en-CA");
    const existing = groups.get(key);

    groups.set(key, {
      key,
      name: existing?.name ?? name,
      amount: (existing?.amount ?? 0) + toNumber(transaction.amount),
      transactionCount: (existing?.transactionCount ?? 0) + 1,
    });
  }

  const totalSpending = [...groups.values()].reduce((total, merchant) => total + merchant.amount, 0);
  return [...groups.values()]
    .map((merchant) => ({
      ...merchant,
      share: totalSpending > 0 ? (merchant.amount / totalSpending) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount || b.transactionCount - a.transactionCount || a.name.localeCompare(b.name));
}

export function findFrequentMerchants(
  transactions: Transaction[],
  minimumFrequency = 2,
): FrequentMerchantSignal[] {
  const groups = new Map<string, FrequentMerchantSignal>();

  for (const transaction of activeTransactions(transactions)) {
    const name = transactionMerchant(transaction);
    if (name === UNKNOWN_MERCHANT) continue;
    const key = normalizedMerchantKey(name);
    if (!key) continue;
    const existing = groups.get(key);

    groups.set(key, {
      key,
      name: existing?.name ?? name,
      totalAmount: (existing?.totalAmount ?? 0) + Math.abs(toNumber(transaction.amount)),
      transactionCount: (existing?.transactionCount ?? 0) + 1,
    });
  }

  return [...groups.values()]
    .filter((merchant) => merchant.transactionCount >= minimumFrequency)
    .sort((a, b) => b.transactionCount - a.transactionCount || b.totalAmount - a.totalAmount || a.name.localeCompare(b.name));
}

export function groupTransactionsByMonth(transactions: Transaction[]): MonthlyTransactionBreakdown[] {
  const groups = new Map<string, Omit<MonthlyTransactionBreakdown, "label" | "netCashFlow">>();

  for (const transaction of activeTransactions(transactions)) {
    const month = transaction.transaction_date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const existing = groups.get(month) ?? {
      month,
      spending: 0,
      income: 0,
      transactionCount: 0,
    };

    if (countsAsSpending(transaction)) existing.spending += toNumber(transaction.amount);
    if (countsAsIncome(transaction)) existing.income += toNumber(transaction.amount);
    existing.transactionCount += 1;
    groups.set(month, existing);
  }

  return [...groups.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((group) => ({
      ...group,
      label: monthLabel(group.month),
      netCashFlow: group.income - group.spending,
    }));
}

export function calculateMonthOverMonthComparison(
  months: MonthlyTransactionBreakdown[],
): MonthOverMonthComparison | null {
  const current = months.at(-1);
  if (!current) return null;

  const expectedPreviousMonth = previousTransactionMonth(current.month);
  const previous = months.find((month) => month.month === expectedPreviousMonth);
  if (!previous) return null;

  const comparison = calculateSpendingComparison(current.spending, previous.spending);
  if (!comparison) return null;

  return {
    currentMonth: current.month,
    currentLabel: current.label,
    currentSpending: current.spending,
    previousMonth: previous.month,
    previousLabel: previous.label,
    previousSpending: previous.spending,
    ...comparison,
  };
}

export function calculateComparablePeriodComparison(
  currentTransactions: Transaction[],
  previousTransactions: Transaction[],
  currentMonth: string,
  previousMonth: string,
): MonthOverMonthComparison | null {
  const currentSpending = calculateTransactionSummary(currentTransactions).totalSpending;
  const previousSpending = calculateTransactionSummary(previousTransactions).totalSpending;
  const comparison = calculateSpendingComparison(currentSpending, previousSpending);
  if (!comparison) return null;

  return {
    currentMonth,
    currentLabel: monthLabel(currentMonth),
    currentSpending,
    previousMonth,
    previousLabel: monthLabel(previousMonth),
    previousSpending,
    ...comparison,
  };
}

export function analyzeTransactions(
  transactions: Transaction[],
  categories: BudgetCategory[],
): TransactionAnalysis {
  const merchants = groupTransactionsByMerchant(transactions);
  const months = groupTransactionsByMonth(transactions);

  return {
    summary: calculateTransactionSummary(transactions),
    categories: groupSpendingByCategory(activeTransactions(transactions), categories),
    merchants,
    months,
    comparison: calculateMonthOverMonthComparison(months),
    frequentMerchants: findFrequentMerchants(transactions),
  };
}

function safeCsvText(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function transactionsToCsv(
  transactions: Transaction[],
  accounts: Account[],
  categories: BudgetCategory[],
) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const rows = transactions.map((transaction) => {
    const account = accountsById.get(transaction.account_id);
    const category = transaction.category_id ? categoriesById.get(transaction.category_id) : null;

    return [
      transaction.transaction_date.slice(0, 10),
      safeCsvText(transactionMerchant(transaction)),
      safeCsvText(transaction.description ?? transaction.original_description ?? ""),
      safeCsvText(category?.name ?? transaction.budget_categories?.name ?? UNCATEGORIZED),
      String(toNumber(transaction.amount)),
      effectiveTransactionType(transaction),
      safeCsvText(account?.name ?? transaction.accounts?.name ?? "Unknown Account"),
      safeCsvText(account?.institution_name ?? account?.institution ?? ""),
      transaction.pending ? "Yes" : "No",
      safeCsvText(transaction.plaid_transaction_id ?? ""),
    ];
  });

  return [TRANSACTION_CSV_HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

export function transactionExportFilename(month: string) {
  const suffix = month === ALL_TRANSACTION_MONTHS
    ? "all"
    : /^\d{4}-\d{2}$/.test(month)
      ? month
      : "filtered";
  return `tracked-transactions-${suffix}.csv`;
}
