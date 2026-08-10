import { addDays, addMonths, addWeeks, addYears, compareAsc, isBefore, parseISO } from "date-fns";
import { calendarItemDateKey, normalizeRecurrenceAlias } from "@/lib/calendar-recurrence";
import type {
  Account,
  BillingFrequency,
  Budget,
  CalendarItem,
  Goal,
  Recurrence,
  Subscription,
  Transaction,
  UpcomingItem,
} from "@/types/domain";
import { toNumber } from "@/lib/utils";

const liabilityAccountTypes = new Set(["credit_card"]);

export function calculateNetWorth(accounts: Account[]) {
  return accounts
    .filter((account) => account.include_in_net_worth && !account.archived)
    .reduce((total, account) => {
      const balance = toNumber(account.current_balance);
      return liabilityAccountTypes.has(account.type) ? total - Math.abs(balance) : total + balance;
    }, 0);
}

export function calculateMonthlySpending(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
}

export function calculateMonthlyIncome(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.type === "income")
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
      .filter((transaction) => transaction.type === "expense" && transaction.category_id === budget.category_id)
      .reduce((total, transaction) => total + toNumber(transaction.amount), 0);
    const amount = toNumber(budget.amount);
    return {
      ...budget,
      spent,
      percent: amount > 0 ? Math.min(100, (spent / amount) * 100) : 0,
    };
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

export function getNextRecurrenceDate(fromDate: Date, recurrence: Recurrence, interval = 1) {
  const rule = normalizeRecurrenceAlias(recurrence, interval);

  switch (rule.recurrence) {
    case "daily":
      return addDays(fromDate, rule.recurrenceInterval);
    case "weekly":
      return addWeeks(fromDate, rule.recurrenceInterval);
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
