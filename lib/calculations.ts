import { addDays, addMonths, addWeeks, addYears, compareAsc, isBefore, parseISO } from "date-fns";
import {
  calendarItemDateKey,
  normalizeRecurrenceAlias,
  normalizeRecurrenceWeekdays,
} from "@/lib/calendar-recurrence";
import type {
  Account,
  BillingFrequency,
  Budget,
  BudgetCategory,
  CalendarItem,
  Goal,
  Recurrence,
  Subscription,
  Transaction,
  TransactionType,
  UpcomingItem,
} from "@/types/domain";
import { toNumber } from "@/lib/utils";

export const MONEY_TIME_ZONE = "America/Toronto";

export type AccountGroup = "cash" | "investments" | "credit" | "other";

const investmentAccountTypes = new Set(["tfsa", "fhsa", "rrsp", "non_registered_investment"]);
const cashAccountTypes = new Set(["chequing", "savings", "cash"]);

function normalizedAccountSubtype(account: Account) {
  return (account.account_subtype ?? "").toLowerCase().replaceAll("_", " ");
}

function subtypeIncludes(account: Account, matches: string[]) {
  const subtype = normalizedAccountSubtype(account);
  return matches.some((match) => subtype.includes(match));
}

export function isCreditCardAccount(account: Account) {
  const subtype = normalizedAccountSubtype(account);
  return account.type === "credit_card" || account.plaid_account_type === "credit" || subtype.includes("credit card");
}

export function isLiabilityAccount(account: Account) {
  return isCreditCardAccount(account)
    || account.plaid_account_type === "loan"
    || subtypeIncludes(account, ["line of credit", "loan", "mortgage", "student", "auto"]);
}

export function isInvestmentAccount(account: Account) {
  return investmentAccountTypes.has(account.type)
    || account.plaid_account_type === "investment"
    || subtypeIncludes(account, [
      "investment",
      "brokerage",
      "tfsa",
      "fhsa",
      "rrsp",
      "rrif",
      "retirement",
      "pension",
      "401",
      "403",
      "ira",
      "roth",
      "stock plan",
      "mutual fund",
      "non registered",
    ]);
}

export function isCashAccount(account: Account) {
  return cashAccountTypes.has(account.type)
    || account.plaid_account_type === "depository"
    || subtypeIncludes(account, ["checking", "chequing", "savings", "cash management", "money market", "prepaid"]);
}

export function classifyAccount(account: Account): AccountGroup {
  if (isLiabilityAccount(account)) return "credit";
  if (isInvestmentAccount(account)) return "investments";
  if (isCashAccount(account)) return "cash";
  return "other";
}

export function summarizeAccounts(accounts: Account[]) {
  const included = accounts.filter((account) => account.include_in_net_worth && !account.archived);
  let cash = 0;
  let investments = 0;
  let otherAssets = 0;
  let liabilities = 0;
  let creditCardDebt = 0;

  for (const account of included) {
    const balance = toNumber(account.current_balance);
    const group = classifyAccount(account);

    if (isLiabilityAccount(account)) {
      const debt = Math.abs(balance);
      liabilities += debt;
      if (isCreditCardAccount(account)) creditCardDebt += debt;
    } else if (group === "cash") {
      cash += balance;
    } else if (group === "investments") {
      investments += balance;
    } else {
      otherAssets += balance;
    }
  }

  const assets = cash + investments + otherAssets;
  return {
    assets,
    cash,
    investments,
    otherAssets,
    liabilities,
    creditCardDebt,
    netWorth: assets - liabilities,
  };
}

export function calculateNetWorth(accounts: Account[]) {
  return summarizeAccounts(accounts).netWorth;
}

export function effectiveTransactionType(transaction: Pick<Transaction, "type" | "type_override">): TransactionType {
  return transaction.type_override ?? transaction.type;
}

export function countsAsSpending(
  transaction: Pick<Transaction, "type" | "type_override" | "excluded_from_spending" | "removed_at">,
) {
  return !transaction.removed_at && !transaction.excluded_from_spending && effectiveTransactionType(transaction) === "expense";
}

export function countsAsIncome(transaction: Pick<Transaction, "type" | "type_override" | "removed_at">) {
  return !transaction.removed_at && effectiveTransactionType(transaction) === "income";
}

export function calculateMonthlySpending(transactions: Transaction[]) {
  return transactions
    .filter(countsAsSpending)
    .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
}

export function calculateMonthlyIncome(transactions: Transaction[]) {
  return transactions
    .filter(countsAsIncome)
    .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
}

export function calculateSavingsRate(transactions: Transaction[]) {
  const income = calculateMonthlyIncome(transactions);
  if (income <= 0) return null;
  const spending = calculateMonthlySpending(transactions);
  return ((income - spending) / income) * 100;
}

export function getBudgetProgress(budgets: Budget[], transactions: Transaction[]) {
  return budgets.map((budget) => {
    const spent = transactions
      .filter((transaction) => countsAsSpending(transaction) && transaction.category_id === budget.category_id)
      .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
    const amount = toNumber(budget.amount);
    return {
      ...budget,
      spent,
      percent: amount > 0 ? Math.min(100, (spent / amount) * 100) : 0,
    };
  });
}

function zonedYearMonth(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    throw new Error(`Unable to determine the current month in ${timeZone}.`);
  }

  return { year, month };
}

function shiftedYearMonth(year: number, month: number, offset: number) {
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

function monthPart(value: number) {
  return String(value).padStart(2, "0");
}

export type FinancialMonthRange = {
  key: string;
  label: string;
  from: string;
  to: string;
};

export function financialMonthRange(date = new Date(), offset = 0, timeZone = MONEY_TIME_ZONE): FinancialMonthRange {
  const zoned = zonedYearMonth(date, timeZone);
  const shifted = shiftedYearMonth(zoned.year, zoned.month, offset);
  const key = `${shifted.year}-${monthPart(shifted.month)}`;
  const lastDay = new Date(Date.UTC(shifted.year, shifted.month, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(shifted.year, shifted.month - 1, 1)));

  return {
    key,
    label,
    from: `${key}-01`,
    to: `${key}-${monthPart(lastDay)}`,
  };
}

export function transactionsInRange(transactions: Transaction[], range: Pick<FinancialMonthRange, "from" | "to">) {
  return transactions.filter(
    (transaction) =>
      !transaction.removed_at && transaction.transaction_date >= range.from && transaction.transaction_date <= range.to,
  );
}

export function calculateMonthlyCashFlow(
  transactions: Transaction[],
  range?: Pick<FinancialMonthRange, "from" | "to">,
) {
  const included = range ? transactionsInRange(transactions, range) : transactions.filter((transaction) => !transaction.removed_at);
  const income = calculateMonthlyIncome(included);
  const spending = calculateMonthlySpending(included);
  return { income, spending, cashFlow: income - spending };
}

export function calculateSpendingComparison(currentSpending: number, previousSpending: number) {
  if (previousSpending <= 0) return null;
  const percentChange = ((currentSpending - previousSpending) / previousSpending) * 100;
  return {
    percentChange,
    direction: percentChange > 0 ? ("up" as const) : percentChange < 0 ? ("down" as const) : ("flat" as const),
  };
}

export type SpendingCategory = {
  categoryId: string | null;
  name: string;
  groupName: string | null;
  amount: number;
  transactionCount: number;
  share: number;
};

export function groupSpendingByCategory(
  transactions: Transaction[],
  categories: BudgetCategory[],
  range?: Pick<FinancialMonthRange, "from" | "to">,
): SpendingCategory[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const scoped = range ? transactionsInRange(transactions, range) : transactions;
  const groups = new Map<string, Omit<SpendingCategory, "share">>();

  for (const transaction of scoped) {
    if (!countsAsSpending(transaction)) continue;
    const category = transaction.category_id ? categoryById.get(transaction.category_id) : null;
    const key = transaction.category_id ?? "__uncategorized__";
    const existing = groups.get(key);
    const amount = toNumber(transaction.amount);

    groups.set(key, {
      categoryId: transaction.category_id,
      name: category?.name ?? transaction.budget_categories?.name ?? "Uncategorized",
      groupName: category?.group_name ?? transaction.budget_categories?.group_name ?? null,
      amount: (existing?.amount ?? 0) + amount,
      transactionCount: (existing?.transactionCount ?? 0) + 1,
    });
  }

  const total = [...groups.values()].reduce((sum, category) => sum + category.amount, 0);
  return [...groups.values()]
    .map((category) => ({ ...category, share: total > 0 ? (category.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export type TransactionFilters = {
  search?: string;
  accountId?: string;
  categoryId?: string;
  month?: string;
};

export const ALL_TRANSACTION_MONTHS = "all";

export function filterTransactions(transactions: Transaction[], filters: TransactionFilters) {
  const search = filters.search?.trim().toLocaleLowerCase("en-CA") ?? "";

  return transactions.filter((transaction) => {
    if (transaction.removed_at) return false;
    if (filters.accountId && transaction.account_id !== filters.accountId) return false;
    if (filters.month && filters.month !== ALL_TRANSACTION_MONTHS && transaction.transaction_date.slice(0, 7) !== filters.month) return false;
    if (filters.categoryId === "__uncategorized__" && transaction.category_id !== null) return false;
    if (filters.categoryId && filters.categoryId !== "__uncategorized__" && transaction.category_id !== filters.categoryId) return false;
    if (!search) return true;

    return [
      transaction.merchant_name,
      transaction.merchant,
      transaction.description,
      transaction.original_description,
      transaction.notes,
    ].some((value) => value?.toLocaleLowerCase("en-CA").includes(search));
  });
}

export function getGoalPercent(goal: Goal) {
  const target = toNumber(goal.target_value);
  if (target <= 0) return 0;
  return Math.min(100, (toNumber(goal.current_value) / target) * 100);
}

export function normalizeSubscriptionCost(subscription: Pick<Subscription, "amount" | "billing_frequency">) {
  const amount = toNumber(subscription.amount);
  const monthlyMultipliers: Record<BillingFrequency, number> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    yearly: 1 / 12,
  };
  const monthly = amount * monthlyMultipliers[subscription.billing_frequency];
  return {
    monthly,
    annual: monthly * 12,
  };
}

function startOfSundayWeekDate(date: Date) {
  const result = new Date(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function getNextWeeklyRecurrenceDate(fromDate: Date, intervalWeeks: number, recurrenceDaysOfWeek?: readonly number[] | null) {
  const selected = normalizeRecurrenceWeekdays(recurrenceDaysOfWeek);
  const weekdays = selected.length ? selected : [fromDate.getDay()];
  const currentWeekday = fromDate.getDay();
  const nextSameWeekday = weekdays.find((day) => day > currentWeekday);

  if (nextSameWeekday !== undefined) {
    return addDays(fromDate, nextSameWeekday - currentWeekday);
  }

  return addDays(addWeeks(startOfSundayWeekDate(fromDate), intervalWeeks), weekdays[0] ?? currentWeekday);
}

export function getNextRecurrenceDate(
  fromDate: Date,
  recurrence: Recurrence,
  interval = 1,
  recurrenceDaysOfWeek?: readonly number[] | null,
) {
  const rule = normalizeRecurrenceAlias(recurrence, interval);

  switch (rule.recurrence) {
    case "daily":
      return addDays(fromDate, rule.recurrenceInterval);
    case "weekly":
      return getNextWeeklyRecurrenceDate(fromDate, rule.recurrenceInterval, recurrenceDaysOfWeek);
    case "monthly":
      return addMonths(fromDate, rule.recurrenceInterval);
    case "quarterly":
      return addMonths(fromDate, rule.recurrenceInterval * 3);
    case "yearly":
      return addYears(fromDate, rule.recurrenceInterval);
    default:
      return null;
  }
}

function defaultCalendarItemDetail(item: CalendarItem) {
  if (item.detail) return item.detail;

  switch (item.sourceType) {
    case "bill":
      return "Bill due";
    case "event":
      return "Calendar event";
    case "chore":
      return "Chore due";
    case "task":
      return "Task due";
  }
}

export function buildUpcomingItems(calendarItems: CalendarItem[]) {
  const items: UpcomingItem[] = calendarItems.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    title: item.title,
    date: calendarItemDateKey(item),
    type: item.sourceType,
    detail: defaultCalendarItemDetail(item),
  }));

  return items.sort((a, b) => compareAsc(parseISO(a.date), parseISO(b.date)));
}

export function isOverdue(date: string | null | undefined, now = new Date()) {
  if (!date) return false;
  return isBefore(parseISO(date), new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}
