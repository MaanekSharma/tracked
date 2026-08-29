export type AccountType =
  | "chequing"
  | "savings"
  | "credit_card"
  | "tfsa"
  | "fhsa"
  | "rrsp"
  | "non_registered_investment"
  | "cash"
  | "other";

export type TransactionType = "income" | "expense" | "transfer";
export type TransactionSource = "manual" | "plaid";
export type CategorySource = "plaid" | "rule" | "manual";
export type Recurrence = "none" | "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type CalendarEventRecurrence = Recurrence;
export type CalendarSourceType = "event" | "bill" | "task" | "chore";
export type Priority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "open" | "completed" | "archived";
export type GoalStatus = "active" | "completed" | "archived";
export type BillingFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type PlaidConnectionStatus = "connected" | "disconnected" | "login_required" | "error";
export type PlaidInvestmentsStatus = "unknown" | "available" | "balance_only" | "unavailable" | "pending" | "error";
export type AccountInvestmentSyncStatus = "not_applicable" | "pending" | "available" | "balance_only" | "error";

export type Profile = {
  id: string;
  display_name: string | null;
  preferred_currency: string;
  timezone: string;
  theme: "dark" | "light" | "system";
  savings_rate_target: number | null;
  created_at: string;
  updated_at: string;
};

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  current_balance: number | string;
  balance_as_of: string;
  credit_limit: number | string | null;
  notes: string | null;
  include_in_net_worth: boolean;
  archived: boolean;
  plaid_item_uuid: string | null;
  plaid_account_id: string | null;
  official_name: string | null;
  mask: string | null;
  account_subtype: string | null;
  institution_name: string | null;
  institution_id: string | null;
  plaid_account_type: string | null;
  available_balance: number | string | null;
  currency_code: string;
  is_plaid_connected: boolean;
  plaid_connection_status: "manual" | PlaidConnectionStatus;
  last_synced_at: string | null;
  investment_sync_status: AccountInvestmentSyncStatus;
  reconciliation_status: "not_needed" | "needs_review" | "linked";
  created_at: string;
  updated_at: string;
};

export type PlaidItem = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: PlaidConnectionStatus;
  error_code: string | null;
  error_message: string | null;
  sync_cursor: string | null;
  available_products: string[];
  billed_products: string[];
  consented_products: string[];
  transactions_status: "unknown" | "available" | "unavailable" | "pending" | "error";
  investments_status: PlaidInvestmentsStatus;
  investment_accounts_count: number;
  investments_last_synced_at: string | null;
  investment_transactions_start_date: string | null;
  last_synced_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentSecurity = {
  id: string;
  user_id: string;
  plaid_item_uuid: string;
  plaid_security_id: string;
  name: string | null;
  ticker_symbol: string | null;
  security_type: string | null;
  security_subtype: string | null;
  close_price: number | string | null;
  close_price_as_of: string | null;
  currency_code: string | null;
  institution_security_id: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InvestmentHolding = {
  id: string;
  user_id: string;
  plaid_item_uuid: string;
  account_id: string;
  plaid_account_id: string;
  security_id: string;
  plaid_security_id: string;
  quantity: number | string;
  institution_value: number | string;
  institution_price: number | string;
  institution_price_as_of: string | null;
  cost_basis: number | string | null;
  currency_code: string | null;
  created_at: string;
  updated_at: string;
  investment_securities?: InvestmentSecurity | null;
};

export type InvestmentTransaction = {
  id: string;
  user_id: string;
  plaid_item_uuid: string;
  account_id: string;
  plaid_account_id: string;
  security_id: string | null;
  plaid_security_id: string | null;
  plaid_investment_transaction_id: string;
  cancel_transaction_id: string | null;
  transaction_date: string;
  transaction_datetime: string | null;
  name: string;
  quantity: number | string;
  amount: number | string;
  price: number | string;
  fees: number | string | null;
  transaction_type: string;
  transaction_subtype: string;
  currency_code: string | null;
  created_at: string;
  updated_at: string;
  investment_securities?: InvestmentSecurity | null;
};

export type BudgetCategory = {
  id: string;
  user_id: string;
  name: string;
  group_name: string;
  icon: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type Budget = {
  id: string;
  user_id: string;
  category_id: string;
  month_start: string;
  amount: number | string;
  created_at: string;
  updated_at: string;
  budget_categories?: BudgetCategory | null;
};

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  type: TransactionType;
  type_override: TransactionType | null;
  excluded_from_spending: boolean;
  amount: number | string;
  merchant: string | null;
  description: string | null;
  transaction_date: string;
  posted_date: string | null;
  notes: string | null;
  pending: boolean;
  external_id: string | null;
  provider: string | null;
  external_account_id: string | null;
  imported_at: string | null;
  plaid_transaction_id: string | null;
  plaid_account_id: string | null;
  plaid_pending_transaction_id: string | null;
  merchant_name: string | null;
  original_description: string | null;
  authorized_date: string | null;
  payment_channel: string | null;
  source: TransactionSource;
  logo_url: string | null;
  website: string | null;
  category_source: CategorySource | null;
  plaid_category_primary: string | null;
  plaid_category_detailed: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
  accounts?: Pick<Account, "name" | "type"> | null;
  destination_accounts?: Pick<Account, "name" | "type"> | null;
  budget_categories?: Pick<BudgetCategory, "name" | "group_name"> | null;
};

export type Bill = {
  id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  name: string;
  amount: number | string;
  next_due_date: string;
  recurring: boolean;
  recurrence: Recurrence;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  autopay: boolean;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  budget_categories?: Pick<BudgetCategory, "name" | "group_name"> | null;
  accounts?: Pick<Account, "name"> | null;
};

export type BillPayment = {
  id: string;
  user_id: string;
  bill_id: string;
  due_date: string;
  amount: number | string;
  paid_at: string;
  paid_from_account_id: string | null;
  transaction_id: string | null;
  notes: string | null;
  created_at: string;
  bills?: Pick<Bill, "name" | "recurrence"> | null;
  accounts?: Pick<Account, "name"> | null;
};

export type Subscription = {
  id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  name: string;
  amount: number | string;
  billing_frequency: BillingFrequency;
  next_billing_date: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  budget_categories?: Pick<BudgetCategory, "name" | "group_name"> | null;
  accounts?: Pick<Account, "name"> | null;
};

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  due_time: string | null;
  recurrence: Recurrence;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  rpg_category: import("@/lib/life-rpg").RpgCategory | null;
  rpg_difficulty: import("@/lib/life-rpg").RpgDifficulty;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  target_value: number | string;
  initial_value: number | string;
  current_value: number | string;
  unit: string;
  start_date: string | null;
  target_date: string | null;
  status: GoalStatus;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalUpdate = {
  id: string;
  user_id: string;
  goal_id: string;
  delta: number | string;
  note: string | null;
  recorded_at: string;
  created_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  category: string | null;
  recurrence: CalendarEventRecurrence;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  timezone: string;
  created_at: string;
  updated_at: string;
  seriesId?: string | null;
  occurrenceDate?: string;
  isVirtualOccurrence?: boolean;
};

export type RpgProfileRecord = {
  user_id: string;
  initialized_at: string;
  initialization_cutoff: string;
  reconciliation_cursor: string;
  last_reconciled_at: string | null;
  ruleset_version: number;
  overall_baseline_xp: number | string;
  initial_stats: Record<import("@/lib/life-rpg").RpgCategory, number>;
  category_baseline_xp: Record<import("@/lib/life-rpg").RpgCategory, number>;
  created_at: string;
  updated_at: string;
};

export type RpgXpEvent = {
  id: string;
  user_id: string;
  event_key: string;
  source_type: "task" | "calendar" | "wealth_month" | "quest" | "achievement";
  source_record_id: string | null;
  qualifying_event: string;
  category: import("@/lib/life-rpg").RpgCategory;
  difficulty: import("@/lib/life-rpg").RpgDifficulty;
  base_xp: number | string;
  multiplier: number | string;
  awarded_xp: number | string;
  reason: string;
  occurred_at: string;
  ruleset_version: number;
  audit_metadata: Record<string, unknown>;
  created_at: string;
};

export type TaskCompletion = {
  id: string;
  user_id: string;
  task_id: string;
  occurrence_date: string;
  completed_at: string;
  title_snapshot: string;
  category_snapshot: import("@/lib/life-rpg").RpgCategory | null;
  difficulty_snapshot: import("@/lib/life-rpg").RpgDifficulty;
  recurrence_snapshot: string;
  is_recurring: boolean;
  created_at: string;
};

export type RpgQuest = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  quest_type: import("@/lib/life-rpg").QuestType;
  primary_category: import("@/lib/life-rpg").RpgCategory;
  secondary_category: import("@/lib/life-rpg").RpgCategory | null;
  difficulty: import("@/lib/life-rpg").RpgDifficulty;
  starts_on: string;
  ends_on: string | null;
  generated_key: string | null;
  status: "active" | "completed" | "abandoned" | "expired";
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  rpg_quest_objectives?: RpgQuestObjective[];
};

export type RpgQuestObjective = {
  id: string;
  user_id: string;
  quest_id: string;
  position: number;
  objective: string;
  tracking_type: "manual" | "task_completion" | "chore_completion" | "goal_progress";
  target_value: number | string;
  manual_value: number | string;
  source_record_id: string | null;
  category_filter: import("@/lib/life-rpg").RpgCategory | null;
  created_at: string;
  updated_at: string;
};

export type RpgAchievementUnlock = {
  id: string;
  user_id: string;
  achievement_key: string;
  source_type: string;
  source_record_id: string | null;
  unlocked_at: string;
  baseline_unlock: boolean;
  ruleset_version: number;
  audit_metadata: Record<string, unknown>;
  created_at: string;
};

export type RpgWeeklySnapshot = {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  finalized: boolean;
  finalized_at: string | null;
  xp: number | string;
  stats: Partial<Record<import("@/lib/life-rpg").RpgCategory, number>>;
  stat_deltas: Partial<Record<import("@/lib/life-rpg").RpgCategory, number>>;
  category_levels: Partial<Record<import("@/lib/life-rpg").RpgCategory, number>>;
  quests_completed: number;
  quests_total: number;
  achievements: unknown[];
  productive_days: number;
  streak: number;
  grade: string;
  grade_score: number;
  ruleset_version: number;
  created_at: string;
  updated_at: string;
};

export type ChoreCompletion = {
  id: string;
  user_id: string;
  chore_id: string;
  completed_on: string;
  completed_at: string;
  notes: string | null;
  created_at: string;
  chores?: Pick<Chore, "title" | "frequency"> | null;
};

export type Chore = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  frequency: Recurrence;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  next_due_date: string | null;
  last_completed_date: string | null;
  status: "active" | "paused" | "completed" | "archived";
  room: string | null;
  created_at: string;
  updated_at: string;
};

export type UpcomingItem = {
  id: string;
  sourceId: string;
  sourceType: CalendarSourceType;
  title: string;
  date: string;
  type: CalendarSourceType;
  detail?: string;
};

export type CalendarItem = {
  id: string;
  user_id: string;
  sourceId: string;
  sourceType: CalendarSourceType;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  detail?: string;
  recurrence: CalendarEventRecurrence;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: number[] | null;
  recurrenceEndDate: string | null;
  recurrenceCount: number | null;
  seriesId?: string | null;
  occurrenceDate?: string;
  isVirtualOccurrence?: boolean;
};

export const accountTypeLabels: Record<AccountType, string> = {
  chequing: "Chequing",
  savings: "Savings",
  credit_card: "Credit Card",
  tfsa: "TFSA",
  fhsa: "FHSA",
  rrsp: "RRSP",
  non_registered_investment: "Non-Registered Investment",
  cash: "Cash",
  other: "Other",
};

export const recurrenceLabels: Record<Recurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const calendarEventRecurrenceLabels: Record<CalendarEventRecurrence, string> = {
  none: "One-time",
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export const billingFrequencyLabels: Record<BillingFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};
