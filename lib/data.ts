import { endOfMonth, format, startOfMonth } from "date-fns";
import {
  addDaysToDateKey,
  calendarDateKey,
  dateTimeLocalToIso,
  DEFAULT_CALENDAR_TIME_ZONE,
  expandRecurringItems,
} from "@/lib/calendar-recurrence";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { buildUpcomingItems, calculateMonthlySpending, calculateNetWorth, calculateSavingsRate, getBudgetProgress } from "@/lib/calculations";
import type {
  Account,
  Bill,
  CalendarItem,
  Budget,
  BudgetCategory,
  CalendarEvent,
  Chore,
  Goal,
  GoalUpdate,
  PlaidItem,
  Profile,
  Subscription,
  Task,
  Transaction,
} from "@/types/domain";
import { money } from "@/lib/utils";

export type MoneyFilters = {
  q?: string;
  type?: string;
  category?: string;
};

export type CalendarItemOptions = {
  timeZone?: string;
  activeChoresOnly?: boolean;
};

export async function getUserScopedClient() {
  const user = await requireUser();
  const supabase = await createClient();
  return { supabase, user };
}

export async function getProfileData() {
  const { supabase, user } = await getUserScopedClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data as Profile | null;
}

export async function getAccounts(includeArchived = false) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("accounts").select("*").order("archived").order("name");
  if (!includeArchived) query = query.eq("archived", false);
  const { data } = await query;
  return (data ?? []) as Account[];
}

export async function getBudgetCategories(includeArchived = false) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("budget_categories").select("*").order("group_name").order("name");
  if (!includeArchived) query = query.eq("archived", false);
  const { data } = await query;
  return (data ?? []) as BudgetCategory[];
}

export async function getPlaidItems() {
  const { supabase } = await getUserScopedClient();
  const { data } = await supabase.from("plaid_items").select("*").order("created_at", { ascending: false });
  return (data ?? []) as PlaidItem[];
}

export async function getCurrentBudgets(date = new Date()) {
  const { supabase } = await getUserScopedClient();
  const monthStart = format(startOfMonth(date), "yyyy-MM-dd");
  const { data } = await supabase
    .from("budgets")
    .select("*, budget_categories!budgets_category_owned_fk(name, group_name, icon)")
    .eq("month_start", monthStart)
    .order("created_at", { ascending: false });
  return (data ?? []) as Budget[];
}

export async function getTransactions(filters: MoneyFilters = {}, dateRange?: { from: string; to: string }) {
  const { supabase } = await getUserScopedClient();
  let query = supabase
    .from("transactions")
    .select(
      "*, accounts!transactions_account_owned_fk(name, type), destination_accounts:accounts!transactions_destination_account_owned_fk(name, type), budget_categories!transactions_category_owned_fk(name, group_name)",
    )
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.type && ["income", "expense", "transfer"].includes(filters.type)) {
    query = query.eq("type", filters.type);
  }
  if (filters.category) {
    query = query.eq("category_id", filters.category);
  }
  if (filters.q) {
    const escaped = filters.q.replaceAll("%", "").replaceAll("_", "");
    query = query.or(
      `merchant.ilike.%${escaped}%,merchant_name.ilike.%${escaped}%,description.ilike.%${escaped}%,original_description.ilike.%${escaped}%,notes.ilike.%${escaped}%`,
    );
  }
  if (dateRange) {
    query = query.gte("transaction_date", dateRange.from).lte("transaction_date", dateRange.to);
  }

  query = query.is("removed_at", null);

  const { data } = await query;
  return (data ?? []) as Transaction[];
}

export async function getMonthlyTransactions(date = new Date()) {
  return getTransactions(
    {},
    {
      from: format(startOfMonth(date), "yyyy-MM-dd"),
      to: format(endOfMonth(date), "yyyy-MM-dd"),
    },
  );
}

export async function getBills(includeInactive = true) {
  const { supabase } = await getUserScopedClient();
  let query = supabase
    .from("bills")
    .select("*, budget_categories!bills_category_owned_fk(name, group_name), accounts!bills_account_owned_fk(name)")
    .order("next_due_date", { ascending: true });
  if (!includeInactive) query = query.eq("active", true);
  const { data } = await query;
  return (data ?? []) as Bill[];
}

export async function getSubscriptions() {
  const { supabase } = await getUserScopedClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*, budget_categories!subscriptions_category_owned_fk(name, group_name), accounts!subscriptions_account_owned_fk(name)")
    .order("next_billing_date", { ascending: true });
  return (data ?? []) as Subscription[];
}

export async function getTasks(view?: string) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).order("created_at", {
    ascending: false,
  });

  if (view === "completed") {
    query = query.eq("status", "completed");
  } else if (view === "today") {
    query = query.eq("status", "open").eq("due_date", format(new Date(), "yyyy-MM-dd"));
  } else if (view === "upcoming") {
    query = query.eq("status", "open").gt("due_date", format(new Date(), "yyyy-MM-dd"));
  } else if (view === "open") {
    query = query.eq("status", "open");
  } else {
    query = query.eq("status", "open").is("due_date", null);
  }

  const { data } = await query;
  return (data ?? []) as Task[];
}

export async function getGoals(includeArchived = false) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("goals").select("*").order("target_date", { ascending: true, nullsFirst: false }).order("created_at");
  if (!includeArchived) query = query.neq("status", "archived");
  const { data } = await query;
  return (data ?? []) as Goal[];
}

export async function getGoalUpdates(goalId?: string) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("goal_updates").select("*").order("recorded_at", { ascending: false }).order("created_at", { ascending: false });
  if (goalId) query = query.eq("goal_id", goalId);
  const { data } = await query;
  return (data ?? []) as GoalUpdate[];
}

export async function getCalendarEvents(range?: { from: string; to: string }) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("calendar_events").select("*").order("start_at", { ascending: true });
  if (range) {
    query = query.gte("start_at", range.from).lte("start_at", range.to);
  }
  const { data } = await query;
  return (data ?? []) as CalendarEvent[];
}

export async function getChores(includeArchived = false) {
  const { supabase } = await getUserScopedClient();
  let query = supabase.from("chores").select("*").order("next_due_date", { ascending: true, nullsFirst: false }).order("created_at");
  if (!includeArchived) query = query.neq("status", "archived");
  const { data } = await query;
  return (data ?? []) as Chore[];
}

function dayStartAt(date: string, timeZone: string) {
  return dateTimeLocalToIso(`${date}T00:00:00`, timeZone);
}

function recurrenceInterval(value: number | null | undefined) {
  return Math.max(1, Number(value ?? 1));
}

export function normalizeEventForCalendar(event: CalendarEvent): CalendarItem {
  return {
    id: `event_${event.id}`,
    user_id: event.user_id,
    sourceId: event.id,
    sourceType: "event",
    title: event.title,
    startAt: event.start_at,
    endAt: event.end_at,
    allDay: event.all_day,
    detail: event.location ?? event.category ?? undefined,
    recurrence: event.recurrence ?? "none",
    recurrenceInterval: recurrenceInterval(event.recurrence_interval),
    recurrenceDaysOfWeek: event.recurrence_days_of_week,
    recurrenceEndDate: event.recurrence_end_date,
    recurrenceCount: event.recurrence_count,
  };
}

export function normalizeBillForCalendar(bill: Bill, timeZone = DEFAULT_CALENDAR_TIME_ZONE): CalendarItem {
  return {
    id: `bill_${bill.id}`,
    user_id: bill.user_id,
    sourceId: bill.id,
    sourceType: "bill",
    title: bill.name,
    startAt: dayStartAt(bill.next_due_date, timeZone),
    endAt: null,
    allDay: true,
    detail: money(bill.amount, true),
    recurrence: bill.recurring ? bill.recurrence : "none",
    recurrenceInterval: recurrenceInterval(bill.recurrence_interval),
    recurrenceDaysOfWeek: bill.recurrence_days_of_week,
    recurrenceEndDate: bill.recurrence_end_date,
    recurrenceCount: bill.recurrence_count,
  };
}

export function normalizeTaskForCalendar(task: Task, timeZone = DEFAULT_CALENDAR_TIME_ZONE): CalendarItem | null {
  if (!task.due_date) return null;

  return {
    id: `task_${task.id}`,
    user_id: task.user_id,
    sourceId: task.id,
    sourceType: "task",
    title: task.title,
    startAt: dateTimeLocalToIso(`${task.due_date}T${task.due_time ?? "00:00"}`, timeZone),
    endAt: null,
    allDay: !task.due_time,
    detail: `${task.priority} priority`,
    recurrence: task.recurrence ?? "none",
    recurrenceInterval: recurrenceInterval(task.recurrence_interval),
    recurrenceDaysOfWeek: task.recurrence_days_of_week,
    recurrenceEndDate: task.recurrence_end_date,
    recurrenceCount: task.recurrence_count,
  };
}

export function normalizeChoreForCalendar(chore: Chore, timeZone = DEFAULT_CALENDAR_TIME_ZONE): CalendarItem | null {
  if (!chore.next_due_date) return null;

  return {
    id: `chore_${chore.id}`,
    user_id: chore.user_id,
    sourceId: chore.id,
    sourceType: "chore",
    title: chore.title,
    startAt: dayStartAt(chore.next_due_date, timeZone),
    endAt: null,
    allDay: true,
    detail: chore.room ?? "Chore due",
    recurrence: chore.frequency ?? "none",
    recurrenceInterval: recurrenceInterval(chore.recurrence_interval),
    recurrenceDaysOfWeek: chore.recurrence_days_of_week,
    recurrenceEndDate: chore.recurrence_end_date,
    recurrenceCount: chore.recurrence_count,
  };
}

export function normalizeCalendarItems(
  {
    events,
    bills,
    tasks,
    chores,
  }: {
    events: CalendarEvent[];
    bills: Bill[];
    tasks: Task[];
    chores: Chore[];
  },
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  return [
    ...events.map(normalizeEventForCalendar),
    ...bills.map((bill) => normalizeBillForCalendar(bill, timeZone)),
    ...tasks.map((task) => normalizeTaskForCalendar(task, timeZone)).filter((item): item is CalendarItem => Boolean(item)),
    ...chores.map((chore) => normalizeChoreForCalendar(chore, timeZone)).filter((item): item is CalendarItem => Boolean(item)),
  ];
}

export async function getCalendarItems(range: { from: string; to: string }, options: CalendarItemOptions = {}) {
  const timeZone = options.timeZone ?? DEFAULT_CALENDAR_TIME_ZONE;
  const [events, tasks, bills, chores] = await Promise.all([
    getCalendarEvents(),
    getTasks("open"),
    getBills(false),
    getChores(),
  ]);
  const calendarChores = options.activeChoresOnly ? chores.filter((chore) => chore.status === "active") : chores;
  return expandRecurringItems(normalizeCalendarItems({ events, bills, tasks, chores: calendarChores }, timeZone), range.from, range.to, timeZone);
}

export async function getDashboardData() {
  const profile = await getProfileData();
  const timeZone = profile?.timezone ?? DEFAULT_CALENDAR_TIME_ZONE;
  const today = calendarDateKey(new Date(), timeZone);
  const upcomingRange = { from: today, to: addDaysToDateKey(today, 365) };
  const [accounts, categories, budgets, monthlyTransactions, bills, subscriptions, goals, chores, upcomingCalendarItems, todayCalendarItems] = await Promise.all([
    getAccounts(),
    getBudgetCategories(),
    getCurrentBudgets(),
    getMonthlyTransactions(),
    getBills(false),
    getSubscriptions(),
    getGoals(),
    getChores(),
    getCalendarItems(upcomingRange, { timeZone, activeChoresOnly: true }),
    getCalendarItems({ from: today, to: today }, { timeZone, activeChoresOnly: true }),
  ]);
  const tasks = todayCalendarItems.filter((item) => item.sourceType === "task");

  const netWorth = calculateNetWorth(accounts);
  const monthlySpending = calculateMonthlySpending(monthlyTransactions);
  const savingsRate = calculateSavingsRate(monthlyTransactions);
  const budgetProgress = getBudgetProgress(budgets, monthlyTransactions);
  const upcoming = buildUpcomingItems(upcomingCalendarItems).slice(0, 8);

  return {
    profile,
    accounts,
    categories,
    budgets,
    monthlyTransactions,
    tasks,
    bills,
    subscriptions,
    goals,
    events: upcomingCalendarItems.filter((item) => item.sourceType === "event"),
    chores,
    netWorth,
    monthlySpending,
    savingsRate,
    budgetProgress,
    upcoming,
  };
}
