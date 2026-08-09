import { endOfMonth, format, startOfMonth } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { buildUpcomingItems, calculateMonthlySpending, calculateNetWorth, calculateSavingsRate, getBudgetProgress } from "@/lib/calculations";
import type {
  Account,
  Bill,
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

export type MoneyFilters = {
  q?: string;
  type?: string;
  category?: string;
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

export async function getDashboardData() {
  const [profile, accounts, categories, budgets, monthlyTransactions, tasks, bills, subscriptions, goals, events, chores] = await Promise.all([
    getProfileData(),
    getAccounts(),
    getBudgetCategories(),
    getCurrentBudgets(),
    getMonthlyTransactions(),
    getTasks("today"),
    getBills(false),
    getSubscriptions(),
    getGoals(),
    getCalendarEvents(),
    getChores(),
  ]);

  const netWorth = calculateNetWorth(accounts);
  const monthlySpending = calculateMonthlySpending(monthlyTransactions);
  const savingsRate = calculateSavingsRate(monthlyTransactions);
  const budgetProgress = getBudgetProgress(budgets, monthlyTransactions);
  const upcoming = buildUpcomingItems({ bills, events, chores, tasks }).slice(0, 8);

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
    events,
    chores,
    netWorth,
    monthlySpending,
    savingsRate,
    budgetProgress,
    upcoming,
  };
}
