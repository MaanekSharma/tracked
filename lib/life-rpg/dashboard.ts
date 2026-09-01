import "server-only";
import {
  ACHIEVEMENTS,
  CATEGORY_LABELS,
  RPG_CATEGORIES,
  RPG_RULESET_VERSION,
  categoryLevelProgress,
  classifyGoalCategory,
  currentEffects,
  dateKeyInTimeZone,
  disciplineStat,
  measuredActivityStat,
  overallLevelProgress,
  productiveStreak,
  sundayWeekBounds,
  wealthStat,
  weeklyGrade,
  type RpgAchievementView,
  type RpgCategory,
  type RpgDashboardViewModel,
  type RpgQuestView,
  type RpgStat,
  type RpgWeeklySnapshotView,
} from "@/lib/life-rpg";
import { requestLifeRpgReconciliation } from "@/lib/life-rpg/reconcile";
import { getDashboardData, getUserScopedClient } from "@/lib/data";
import { addDaysToDateKey } from "@/lib/calendar-recurrence";
import { toNumber } from "@/lib/utils";
import type {
  RpgAchievementUnlock,
  RpgProfileRecord,
  RpgQuest,
  RpgWeeklySnapshot,
  RpgXpEvent,
} from "@/types/domain";

function monthBefore(dateKey: string, offset = 1) {
  const [year, month] = dateKey.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 - offset, 1));
  const targetYear = first.getUTCFullYear();
  const targetMonth = first.getUTCMonth() + 1;
  const prefix = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  return { from: `${prefix}-01`, to: `${prefix}-${String(new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()).padStart(2, "0")}` };
}

function strictTransactionType(transaction: Record<string, unknown>) {
  const plaidTransfer = [transaction.plaid_category_primary, transaction.plaid_category_detailed]
    .some((value) => typeof value === "string" && (value === "TRANSFER_IN" || value === "TRANSFER_OUT" || value.startsWith("TRANSFER_")));
  if (plaidTransfer) return "transfer";
  return transaction.type_override ?? transaction.type;
}

function achievementView(unlock: RpgAchievementUnlock): RpgAchievementView | null {
  const definition = ACHIEVEMENTS.find((item) => item.key === unlock.achievement_key);
  if (!definition) return null;
  return {
    key: definition.key,
    name: definition.name,
    description: definition.description,
    rarity: definition.rarity,
    category: definition.category,
    unlockedAt: unlock.unlocked_at,
    baseline: unlock.baseline_unlock,
  };
}

function questView(quest: RpgQuest): RpgQuestView {
  const objectives = [...(quest.rpg_quest_objectives ?? [])].sort((a, b) => a.position - b.position).map((objective) => {
    const current = toNumber(objective.manual_value);
    const target = toNumber(objective.target_value);
    return { id: objective.id, text: objective.objective, current, target, complete: current >= target, manual: objective.tracking_type === "manual" };
  });
  const progress = objectives.length
    ? Math.round(objectives.reduce((total, objective) => total + Math.min(1, objective.current / objective.target), 0) / objectives.length * 100)
    : 0;
  return {
    id: quest.id, title: quest.title, type: quest.quest_type, primaryCategory: quest.primary_category,
    secondaryCategory: quest.secondary_category, difficulty: quest.difficulty, status: quest.status,
    progress, endsOn: quest.ends_on, objectives,
  };
}

function snapshotView(snapshot: RpgWeeklySnapshot, unlocks: RpgAchievementView[]): RpgWeeklySnapshotView {
  return {
    weekStart: snapshot.week_start,
    weekEnd: snapshot.week_end,
    finalized: snapshot.finalized,
    xp: toNumber(snapshot.xp),
    grade: snapshot.grade,
    gradeScore: snapshot.grade_score,
    productiveDays: snapshot.productive_days,
    streak: snapshot.streak,
    questCompleted: snapshot.quests_completed,
    questTotal: snapshot.quests_total,
    achievements: unlocks.filter((unlock) => unlock.unlockedAt.slice(0, 10) >= snapshot.week_start && unlock.unlockedAt.slice(0, 10) <= snapshot.week_end),
    stats: snapshot.stats,
    statDeltas: snapshot.stat_deltas,
    categoryLevels: snapshot.category_levels,
  };
}

export async function getLifeRpgDashboard(): Promise<RpgDashboardViewModel> {
  const { supabase, user } = await getUserScopedClient();
  await requestLifeRpgReconciliation(supabase, ["full"]);
  const dashboard = await getDashboardData();
  const timeZone = dashboard.profile?.timezone ?? "America/Toronto";
  const today = dateKeyInTimeZone(new Date(), timeZone);
  const currentFrom = addDaysToDateKey(today, -27);
  const previousFrom = addDaysToDateKey(today, -55);
  const previousTo = addDaysToDateKey(today, -28);
  const finalizedMonth = monthBefore(today);

  const [
    profileResult, xpResult, questResult, unlockResult, snapshotResult,
    taskCompletionResult, choreCompletionResult, openTaskResult,
    finalizedTransactionsResult, finalizedBudgetsResult, billPaymentsResult, unpaidBillsResult,
  ] = await Promise.all([
    supabase.from("rpg_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("rpg_xp_events").select("*").eq("user_id", user.id).order("occurred_at", { ascending: true }).limit(1000),
    supabase.from("rpg_quests").select("*, rpg_quest_objectives(*)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("rpg_achievement_unlocks").select("*").eq("user_id", user.id).order("unlocked_at", { ascending: false }).limit(100),
    supabase.from("rpg_weekly_snapshots").select("*").eq("user_id", user.id).order("week_start", { ascending: false }).limit(26),
    supabase.from("task_completions").select("occurrence_date,category_snapshot").eq("user_id", user.id).gte("occurrence_date", previousFrom).lte("occurrence_date", today).limit(500),
    supabase.from("chore_completions").select("completed_on").eq("user_id", user.id).gte("completed_on", previousFrom).lte("completed_on", today).limit(500),
    supabase.from("tasks").select("id,due_date,status").eq("user_id", user.id).eq("status", "open").limit(500),
    supabase.from("transactions").select("type,type_override,amount,pending,removed_at,plaid_category_primary,plaid_category_detailed,transaction_date,category_id")
      .eq("user_id", user.id).gte("transaction_date", finalizedMonth.from).lte("transaction_date", finalizedMonth.to).limit(500),
    supabase.from("budgets").select("amount,category_id").eq("user_id", user.id).eq("month_start", finalizedMonth.from).limit(500),
    supabase.from("bill_payments").select("due_date,paid_at").eq("user_id", user.id).gte("due_date", finalizedMonth.from).lte("due_date", finalizedMonth.to).limit(500),
    supabase.from("bills").select("id,next_due_date").eq("user_id", user.id).eq("active", true).gte("next_due_date", finalizedMonth.from).lte("next_due_date", finalizedMonth.to).limit(500),
  ]);

  const profile = profileResult.data as RpgProfileRecord | null;
  const xpEvents = (xpResult.data ?? []) as RpgXpEvent[];
  const quests = (questResult.data ?? []) as RpgQuest[];
  const achievementUnlocks = (unlockResult.data ?? []) as RpgAchievementUnlock[];
  const achievements = achievementUnlocks.map(achievementView).filter((item): item is RpgAchievementView => item !== null);
  const snapshots = (snapshotResult.data ?? []) as RpgWeeklySnapshot[];
  const taskCompletions = taskCompletionResult.data ?? [];
  const choreCompletions = choreCompletionResult.data ?? [];
  const openTasks = openTaskResult.data ?? [];
  const productiveDates = [
    ...taskCompletions.map((completion) => completion.occurrence_date),
    ...choreCompletions.map((completion) => completion.completed_on),
  ];

  const initialStats = Object.fromEntries(RPG_CATEGORIES.map((category) => [category, profile?.initial_stats?.[category] ?? 50])) as Record<RpgCategory, number>;
  const categoryAwarded = Object.fromEntries(RPG_CATEGORIES.map((category) => [
    category,
    xpEvents.filter((event) => event.category === category).reduce((sum, event) => sum + toNumber(event.awarded_xp), 0),
  ])) as Record<RpgCategory, number>;

  const statMap = {} as Record<RpgCategory, { value: number; delta: number; quality: RpgStat["quality"]; detail: string }>;
  for (const category of ["strength", "health", "career", "knowledge", "social"] as const) {
    const dates = xpEvents.filter((event) => event.category === category && ["task_completion", "quest_completion", "calendar_occurrence"].includes(event.qualifying_event))
      .map((event) => dateKeyInTimeZone(event.occurred_at, timeZone));
    const current = measuredActivityStat({ category, activityDates: dates, from: currentFrom, to: today });
    const previous = measuredActivityStat({ category, activityDates: dates, from: previousFrom, to: previousTo });
    statMap[category] = { value: current.value, delta: current.value - previous.value, quality: current.quality, detail: current.detail };
  }

  const currentProductive = new Set(productiveDates.filter((date) => date >= currentFrom && date <= today)).size;
  const previousProductive = new Set(productiveDates.filter((date) => date >= previousFrom && date <= previousTo)).size;
  const overdue = openTasks.filter((task) => task.due_date && task.due_date < today).length;
  const completedPlanned = taskCompletions.filter((item) => item.occurrence_date >= currentFrom).length + choreCompletions.filter((item) => item.completed_on >= currentFrom).length;
  const discipline = disciplineStat({
    completionRatio: completedPlanned + overdue > 0 ? completedPlanned / (completedPlanned + overdue) : null,
    overduePressure: openTasks.length + completedPlanned > 0 ? overdue / (openTasks.length + completedPlanned) : null,
    productiveDays: currentProductive || null,
  });
  const previousDiscipline = disciplineStat({ completionRatio: null, overduePressure: null, productiveDays: previousProductive || null });
  statMap.discipline = {
    value: discipline.value, delta: discipline.value - previousDiscipline.value, quality: discipline.quality,
    detail: completedPlanned || openTasks.length ? `${completedPlanned} completions · ${overdue} overdue · ${currentProductive}/20 productive days` : "No planned activity yet",
  };

  let income = 0;
  let spending = 0;
  const spendByCategory = new Map<string, number>();
  for (const transaction of finalizedTransactionsResult.data ?? []) {
    if (transaction.pending || transaction.removed_at) continue;
    const type = strictTransactionType(transaction);
    if (type === "income") income += toNumber(transaction.amount);
    if (type === "expense") {
      spending += toNumber(transaction.amount);
      if (transaction.category_id) spendByCategory.set(transaction.category_id, (spendByCategory.get(transaction.category_id) ?? 0) + toNumber(transaction.amount));
    }
  }
  const finalizedSavingsRate = income > 0 ? ((income - spending) / income) * 100 : null;
  const savingsTarget = dashboard.profile?.savings_rate_target === null || dashboard.profile?.savings_rate_target === undefined ? null : toNumber(dashboard.profile.savings_rate_target);
  const budgetRows = finalizedBudgetsResult.data ?? [];
  const totalBudget = budgetRows.reduce((sum, budget) => sum + toNumber(budget.amount), 0);
  const budgetSpending = budgetRows.reduce((sum, budget) => sum + (spendByCategory.get(budget.category_id) ?? 0), 0);
  const payments = billPaymentsResult.data ?? [];
  const timely = payments.filter((payment) => dateKeyInTimeZone(payment.paid_at, timeZone) <= payment.due_date).length;
  const unpaidBills = unpaidBillsResult.data?.length ?? 0;
  const billOccurrences = payments.length + unpaidBills;
  const wealth = wealthStat({
    savingsPerformance: finalizedSavingsRate === null || savingsTarget === null || savingsTarget <= 0 ? null : Math.min(100, Math.max(0, finalizedSavingsRate / savingsTarget * 100)),
    budgetAdherence: totalBudget <= 0 ? null : Math.min(100, Math.max(0, 100 - Math.max(0, budgetSpending - totalBudget) / totalBudget * 100)),
    billTimeliness: billOccurrences ? timely / billOccurrences * 100 : null,
  });
  statMap.wealth = {
    value: wealth.value, delta: 0, quality: wealth.quality,
    detail: wealth.quality === "baseline" ? "No finalized financial signals yet" : `Finalized savings, budgets, and ${billOccurrences} bill occurrences`,
  };

  const stats: RpgStat[] = RPG_CATEGORIES.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    value: statMap[category].value,
    delta: statMap[category].delta,
    quality: statMap[category].quality,
    detail: statMap[category].detail,
    progress: categoryLevelProgress(initialStats[category], categoryAwarded[category]),
  }));

  const ledgerXp = xpEvents.reduce((sum, event) => sum + toNumber(event.awarded_xp), 0);
  const level = overallLevelProgress(ledgerXp);
  const currentWeekBounds = sundayWeekBounds(today);
  const currentSnapshot = snapshots.find((snapshot) => snapshot.week_start === currentWeekBounds.start);
  const activeQuests = quests.filter((quest) => quest.status === "active").map(questView);
  const currentWeekXp = xpEvents.filter((event) => {
    const date = dateKeyInTimeZone(event.occurred_at, timeZone);
    return date >= currentWeekBounds.start && date <= currentWeekBounds.end;
  }).reduce((sum, event) => sum + toNumber(event.awarded_xp), 0);
  const weekQuests = quests.filter((quest) => quest.starts_on <= currentWeekBounds.end && (!quest.ends_on || quest.ends_on >= currentWeekBounds.start));
  const completedWeekQuests = weekQuests.filter((quest) => quest.completed_at && dateKeyInTimeZone(quest.completed_at, timeZone) >= currentWeekBounds.start && dateKeyInTimeZone(quest.completed_at, timeZone) <= currentWeekBounds.end).length;
  const weekProductive = new Set(productiveDates.filter((date) => date >= currentWeekBounds.start && date <= currentWeekBounds.end)).size;
  const liveGrade = weeklyGrade({ completedQuests: completedWeekQuests, totalQuests: weekQuests.length, productiveDays: weekProductive, xp: currentWeekXp });
  const liveWeek: RpgWeeklySnapshotView = currentSnapshot ? snapshotView(currentSnapshot, achievements) : {
    weekStart: currentWeekBounds.start, weekEnd: currentWeekBounds.end, finalized: false, xp: currentWeekXp,
    grade: liveGrade.grade, gradeScore: liveGrade.score, productiveDays: weekProductive,
    streak: productiveStreak(productiveDates, today), questCompleted: completedWeekQuests, questTotal: weekQuests.length,
    achievements: achievements.filter((achievement) => achievement.unlockedAt.slice(0, 10) >= currentWeekBounds.start),
    stats: Object.fromEntries(stats.map((stat) => [stat.category, stat.value])),
    statDeltas: Object.fromEntries(stats.map((stat) => [stat.category, stat.delta ?? 0])),
    categoryLevels: Object.fromEntries(stats.map((stat) => [stat.category, stat.progress.level])),
  };

  const rarityRank = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 } as const;
  const rareAchievement = achievements.find((achievement) => !achievement.baseline && rarityRank[achievement.rarity] >= rarityRank.rare && Date.now() - new Date(achievement.unlockedAt).getTime() < 7 * 86_400_000) ?? null;
  const bossComplete = quests.map(questView).find((quest) => quest.status === "completed" && quest.difficulty === "boss") ?? null;
  const lastEvent = xpEvents.at(-1);
  const beforeLastLevel = lastEvent ? overallLevelProgress(ledgerXp - toNumber(lastEvent.awarded_xp)).level : level.level;
  const acknowledgementKey = rareAchievement ? `achievement:${rareAchievement.key}:${rareAchievement.unlockedAt}`
    : bossComplete ? `boss:${bossComplete.id}`
    : level.level > beforeLastLevel ? `level:${level.level}` : null;

  return {
    initialized: Boolean(profile),
    profile: {
      displayName: dashboard.profile?.display_name || user.email?.split("@")[0] || "Character",
      timeZone,
      level,
      totalAwardedXp: ledgerXp,
      rulesetVersion: profile?.ruleset_version ?? RPG_RULESET_VERSION,
    },
    stats,
    quests: activeQuests.slice(0, 4),
    goals: dashboard.goals.filter((goal) => goal.status === "active").slice(0, 4).map((goal) => ({
      id: goal.id, title: goal.title, category: classifyGoalCategory(goal.category),
      progress: Math.min(100, toNumber(goal.target_value) > 0 ? toNumber(goal.current_value) / toNumber(goal.target_value) * 100 : 0),
    })),
    today: dashboard.upcoming.filter((item) => item.date === today).map((item) => ({
      id: item.id, sourceId: item.sourceId, sourceType: item.sourceType, title: item.title, detail: item.detail ?? item.sourceType, date: item.date,
    })),
    effects: currentEffects(new Set(productiveDates.filter((date) => date >= addDaysToDateKey(today, -7) && date < today)).size, overdue),
    week: liveWeek,
    money: {
      netWorth: dashboard.netWorth,
      spending: dashboard.monthlySpending,
      savingsRate: dashboard.savingsRate,
      savingsTarget,
      budgetUsedPercent: dashboard.budgets.reduce((sum, budget) => sum + toNumber(budget.amount), 0) > 0
        ? dashboard.monthlySpending / dashboard.budgets.reduce((sum, budget) => sum + toNumber(budget.amount), 0) * 100 : null,
    },
    achievements: achievements.slice(0, 5),
    history: snapshots.map((snapshot) => snapshotView(snapshot, achievements)),
    presentation: {
      levelUp: level.level > beforeLastLevel,
      rareAchievement,
      bossComplete,
      acknowledgementKey,
    },
  };
}
