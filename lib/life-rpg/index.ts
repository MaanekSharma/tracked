export const RPG_RULESET_VERSION = 1;
export const RPG_OVERALL_BASELINE_XP = 48_300;

export const RPG_CATEGORIES = [
  "strength",
  "health",
  "wealth",
  "career",
  "knowledge",
  "discipline",
  "social",
] as const;

export const RPG_DIFFICULTIES = ["trivial", "easy", "medium", "hard", "epic", "boss"] as const;
export const QUEST_TYPES = ["daily", "weekly", "main"] as const;
export const ACHIEVEMENT_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;

export type RpgCategory = (typeof RPG_CATEGORIES)[number];
export type RpgDifficulty = (typeof RPG_DIFFICULTIES)[number];
export type QuestType = (typeof QUEST_TYPES)[number];
export type AchievementRarity = (typeof ACHIEVEMENT_RARITIES)[number];
export type RpgDataQuality = "measured" | "limited" | "baseline";

export const CATEGORY_LABELS: Record<RpgCategory, string> = {
  strength: "Strength",
  health: "Health",
  wealth: "Wealth",
  career: "Career",
  knowledge: "Knowledge",
  discipline: "Discipline",
  social: "Social",
};

export const RPG_CATEGORY_OPTIONS = RPG_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
export const OPTIONAL_RPG_CATEGORY_OPTIONS = [
  { value: "", label: "Unclassified" },
  ...RPG_CATEGORY_OPTIONS,
];
export const GOAL_CATEGORY_OPTIONS = [
  ...OPTIONAL_RPG_CATEGORY_OPTIONS,
  { value: "education", label: "Education (Knowledge)" },
];
export const CALENDAR_CATEGORY_OPTIONS = [
  { value: "", label: "Unclassified" },
  { value: "personal", label: "Personal" },
  { value: "social", label: "Social" },
  { value: "friends", label: "Friends" },
  { value: "family", label: "Family" },
  { value: "date", label: "Date" },
  { value: "networking", label: "Networking" },
  { value: "work", label: "Work" },
];
export const DIFFICULTY_XP: Record<RpgDifficulty, number> = {
  trivial: 5,
  easy: 10,
  medium: 25,
  hard: 50,
  epic: 100,
  boss: 250,
};

export const RPG_DIFFICULTY_OPTIONS = RPG_DIFFICULTIES.map((value) => ({
  value,
  label: `${value[0].toUpperCase()}${value.slice(1)} · ${DIFFICULTY_XP[value]} XP`,
}));

export const ACHIEVEMENT_XP: Record<AchievementRarity, number> = {
  common: 10,
  uncommon: 25,
  rare: 50,
  epic: 100,
  legendary: 250,
};

export const ACTIVITY_DAY_TARGETS: Record<Exclude<RpgCategory, "wealth" | "discipline">, number> = {
  strength: 12,
  health: 20,
  career: 16,
  knowledge: 12,
  social: 8,
};

export type LevelProgress = {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  percent: number;
};

export type RpgStat = {
  category: RpgCategory;
  label: string;
  value: number;
  delta: number | null;
  quality: RpgDataQuality;
  detail: string;
  progress: LevelProgress;
};

export type RpgEffect = {
  key: "momentum" | "backlog" | "locked-in";
  name: string;
  description: string;
  delta: number;
  active: boolean;
};

export type RpgQuestObjectiveView = {
  id: string;
  text: string;
  current: number;
  target: number;
  complete: boolean;
  manual: boolean;
};

export type RpgQuestView = {
  id: string;
  title: string;
  type: QuestType;
  primaryCategory: RpgCategory;
  secondaryCategory: RpgCategory | null;
  difficulty: RpgDifficulty;
  status: "active" | "completed" | "abandoned" | "expired";
  progress: number;
  endsOn: string | null;
  objectives: RpgQuestObjectiveView[];
};

export type RpgAchievementView = {
  key: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  category: RpgCategory;
  unlockedAt: string;
  baseline: boolean;
};

export type RpgWeeklySnapshotView = {
  weekStart: string;
  weekEnd: string;
  finalized: boolean;
  xp: number;
  grade: string;
  gradeScore: number;
  productiveDays: number;
  streak: number;
  questCompleted: number;
  questTotal: number;
  achievements: RpgAchievementView[];
  stats: Partial<Record<RpgCategory, number>>;
  statDeltas: Partial<Record<RpgCategory, number>>;
  categoryLevels: Partial<Record<RpgCategory, number>>;
};

export type RpgTodayItem = {
  id: string;
  sourceId: string;
  sourceType: "task" | "event" | "bill" | "chore";
  title: string;
  detail: string;
  date: string;
};

export type RpgDashboardViewModel = {
  initialized: boolean;
  profile: {
    displayName: string;
    timeZone: string;
    level: LevelProgress;
    totalAwardedXp: number;
    rulesetVersion: number;
  };
  stats: RpgStat[];
  quests: RpgQuestView[];
  goals: Array<{ id: string; title: string; category: RpgCategory | null; progress: number }>;
  today: RpgTodayItem[];
  effects: RpgEffect[];
  week: RpgWeeklySnapshotView;
  money: {
    netWorth: number;
    spending: number;
    savingsRate: number | null;
    savingsTarget: number | null;
    budgetUsedPercent: number | null;
  };
  achievements: RpgAchievementView[];
  history: RpgWeeklySnapshotView[];
  presentation: {
    levelUp: boolean;
    rareAchievement: RpgAchievementView | null;
    bossComplete: RpgQuestView | null;
    acknowledgementKey: string | null;
  };
};

export type XpAllocation = {
  category: RpgCategory;
  slot: "primary" | "secondary" | "discipline" | "achievement";
  baseXp: number;
  share: number;
};

export type ActivityStatInput = {
  category: Exclude<RpgCategory, "wealth" | "discipline">;
  activityDates: string[];
  from: string;
  to: string;
};

export type WeightedSignal = {
  value: number | null;
  weight: number;
};

export type AchievementContext = {
  completedQuestCount: number;
  currentStreak: number;
  investmentAccountCount: number;
  investedBalance: number;
  netWorth: number;
  completedMainDifficulties: RpgDifficulty[];
};

export type AchievementDefinition = {
  key: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  category: RpgCategory;
  qualifies: (context: AchievementContext) => boolean;
};

export type QuestRecommendationInput = {
  dueTodayByCategory: Partial<Record<RpgCategory, number>>;
  plannedThisWeekByCategory: Partial<Record<RpgCategory, number>>;
  scheduledChores: number;
};

export type QuestRecommendation = {
  generatedKey: string;
  type: Exclude<QuestType, "main">;
  title: string;
  category: RpgCategory;
  difficulty: RpgDifficulty;
  objectiveTarget: number;
  source: "tasks" | "chores";
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    key: "first-quest",
    name: "First Quest",
    description: "Complete your first quest.",
    rarity: "common",
    category: "discipline",
    qualifies: (context) => context.completedQuestCount >= 1,
  },
  {
    key: "seven-day-streak",
    name: "Seven Days Strong",
    description: "Maintain a seven-day productive streak.",
    rarity: "uncommon",
    category: "discipline",
    qualifies: (context) => context.currentStreak >= 7,
  },
  {
    key: "first-investment",
    name: "First Investment",
    description: "Connect or create your first investment account.",
    rarity: "common",
    category: "wealth",
    qualifies: (context) => context.investmentAccountCount >= 1,
  },
  {
    key: "invested-25k",
    name: "$25k Invested",
    description: "Reach $25,000 across included investment accounts.",
    rarity: "rare",
    category: "wealth",
    qualifies: (context) => context.investedBalance >= 25_000,
  },
  {
    key: "net-worth-100k",
    name: "$100k Net Worth",
    description: "Reach a reconciled net worth of $100,000.",
    rarity: "legendary",
    category: "wealth",
    qualifies: (context) => context.netWorth >= 100_000,
  },
  {
    key: "epic-main-quest",
    name: "Epic Undertaking",
    description: "Complete an Epic Main quest.",
    rarity: "epic",
    category: "discipline",
    qualifies: (context) => context.completedMainDifficulties.includes("epic"),
  },
  {
    key: "boss-main-quest",
    name: "Boss Cleared",
    description: "Complete a Boss Main quest.",
    rarity: "legendary",
    category: "discipline",
    qualifies: (context) => context.completedMainDifficulties.includes("boss"),
  },
];

const SOCIAL_EVENT_ALIASES = new Set(["social", "friends", "family", "date"]);
const CAREER_GOAL_ALIASES = new Set(["career"]);
const KNOWLEDGE_GOAL_ALIASES = new Set(["knowledge", "education"]);

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function overallXpForLevel(level: number) {
  return 1_000 + (Math.max(1, Math.trunc(level)) - 1) * 100;
}

export function categoryXpForLevel(level: number) {
  return 200 + (Math.max(1, Math.trunc(level)) - 1) * 50;
}

export function cumulativeXpAtLevel(level: number, curve: (level: number) => number) {
  const normalized = Math.max(1, Math.trunc(level));
  let total = 0;
  for (let current = 1; current < normalized; current += 1) total += curve(current);
  return total;
}

export function levelProgress(totalXp: number, curve: (level: number) => number): LevelProgress {
  const normalizedXp = Math.max(0, totalXp);
  let level = 1;
  let levelStartXp = 0;
  let xpForNextLevel = curve(level);

  while (normalizedXp >= levelStartXp + xpForNextLevel) {
    levelStartXp += xpForNextLevel;
    level += 1;
    xpForNextLevel = curve(level);
  }

  const xpIntoLevel = normalizedXp - levelStartXp;
  return {
    level,
    totalXp: normalizedXp,
    levelStartXp,
    nextLevelXp: levelStartXp + xpForNextLevel,
    xpIntoLevel,
    xpForNextLevel,
    percent: clamp((xpIntoLevel / xpForNextLevel) * 100, 0, 100),
  };
}

export function overallLevelProgress(ledgerXp: number) {
  return levelProgress(RPG_OVERALL_BASELINE_XP + Math.max(0, ledgerXp), overallXpForLevel);
}

export function initialCategoryLevel(initialStat: number) {
  return Math.max(1, Math.ceil(clamp(initialStat, 0, 100) / 10));
}

export function initialCategoryBaselineXp(initialStat: number) {
  return cumulativeXpAtLevel(initialCategoryLevel(initialStat), categoryXpForLevel);
}

export function categoryLevelProgress(initialStat: number, awardedXp: number) {
  return levelProgress(initialCategoryBaselineXp(initialStat) + Math.max(0, awardedXp), categoryXpForLevel);
}

export function normalizeCategory(value: string | null | undefined): RpgCategory | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && (RPG_CATEGORIES as readonly string[]).includes(normalized) ? (normalized as RpgCategory) : null;
}

export function classifyGoalCategory(value: string | null | undefined): RpgCategory | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (CAREER_GOAL_ALIASES.has(normalized)) return "career";
  if (KNOWLEDGE_GOAL_ALIASES.has(normalized)) return "knowledge";
  return normalizeCategory(normalized);
}

export function classifyCalendarCategory(value: string | null | undefined): {
  social: boolean;
  career: boolean;
} {
  const normalized = value?.trim().toLowerCase() ?? "";
  return {
    social: SOCIAL_EVENT_ALIASES.has(normalized) || normalized === "networking",
    career: normalized === "work" || normalized === "networking",
  };
}

export function allocateTaskXp(category: RpgCategory | null, difficulty: RpgDifficulty): XpAllocation[] {
  const baseXp = DIFFICULTY_XP[difficulty];
  if (category === "discipline") return [{ category, slot: "primary", baseXp, share: 1 }];
  if (!category) return [{ category: "discipline", slot: "discipline", baseXp, share: 0.25 }];
  return [
    { category, slot: "primary", baseXp, share: 1 },
    { category: "discipline", slot: "discipline", baseXp, share: 0.25 },
  ];
}

export function allocateQuestXp(
  primary: RpgCategory,
  secondary: RpgCategory | null,
  difficulty: RpgDifficulty,
): XpAllocation[] {
  const baseXp = DIFFICULTY_XP[difficulty];
  const shares = new Map<RpgCategory, { share: number; slot: XpAllocation["slot"] }>();
  const add = (category: RpgCategory, share: number, slot: XpAllocation["slot"]) => {
    const existing = shares.get(category);
    shares.set(category, { share: (existing?.share ?? 0) + share, slot: existing?.slot ?? slot });
  };
  add(primary, 1, "primary");
  if (secondary) add(secondary, 0.3, "secondary");
  add("discipline", 0.2, "discipline");
  return [...shares.entries()].map(([category, allocation]) => ({ category, baseXp, ...allocation }));
}

export function effectMultiplier(effects: Array<Pick<RpgEffect, "active" | "delta">>) {
  return clamp(1 + effects.filter((effect) => effect.active).reduce((total, effect) => total + effect.delta, 0), 0.75, 1.25);
}

export function currentEffects(productiveDaysInPriorSeven: number, overdueTasks: number): RpgEffect[] {
  return [
    {
      key: "momentum",
      name: "Momentum",
      description: "Five productive days in the prior seven. Discipline XP +10%.",
      delta: 0.1,
      active: productiveDaysInPriorSeven >= 5,
    },
    {
      key: "backlog",
      name: "Backlog",
      description: "Ten or more overdue tasks. Discipline XP -10%.",
      delta: -0.1,
      active: overdueTasks >= 10,
    },
    {
      key: "locked-in",
      name: "Locked In",
      description: "Defined for a future workout signal; inactive in V1.",
      delta: 0.1,
      active: false,
    },
  ];
}

function stablePart(value: string | number) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
}

export function taskEventKey(taskId: string, occurrenceDate: string | null, slot: "primary" | "discipline") {
  return `task:${stablePart(taskId)}:${occurrenceDate ? stablePart(occurrenceDate) : "single"}:${slot}`;
}

export function calendarEventKey(seriesId: string, occurrenceDate: string, slot: "social" | "career") {
  return `calendar:${stablePart(seriesId)}:${stablePart(occurrenceDate)}:${slot}`;
}

export function questEventKey(questId: string, slot: "primary" | "secondary" | "discipline") {
  return `quest:${stablePart(questId)}:${slot}`;
}

export function achievementEventKey(achievementKey: string) {
  return `achievement:${stablePart(achievementKey)}`;
}

export function wealthMonthEventKey(month: string) {
  return `wealth:savings:${stablePart(month)}`;
}

export function dateKeyInTimeZone(value: Date | string, timeZone = "America/Toronto") {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDaysToRpgDate(value: string, amount: number) {
  const date = parseDateKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function sundayWeekStart(value: Date | string, timeZone = "America/Toronto") {
  const key = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dateKeyInTimeZone(value, timeZone);
  return addDaysToRpgDate(key, -parseDateKey(key).getUTCDay());
}

export function sundayWeekBounds(value: Date | string, timeZone = "America/Toronto") {
  const start = sundayWeekStart(value, timeZone);
  return { start, end: addDaysToRpgDate(start, 6) };
}

function distinctDatesInRange(dates: string[], from: string, to: string) {
  return [...new Set(dates.filter((date) => date >= from && date <= to))].sort();
}

export function measuredActivityStat(input: ActivityStatInput) {
  const dates = distinctDatesInRange(input.activityDates, input.from, input.to);
  if (!dates.length) {
    return { value: 50, quality: "baseline" as const, detail: "No qualifying activity yet", activityDays: 0, activeWeeks: 0 };
  }

  const target = ACTIVITY_DAY_TARGETS[input.category];
  const activeWeeks = new Set(dates.map((date) => sundayWeekStart(date))).size;
  const targetProgress = clamp(dates.length / target, 0, 1);
  const activeWeekProgress = clamp(activeWeeks / 4, 0, 1);
  const value = Math.round(25 + 75 * (targetProgress * 0.7 + activeWeekProgress * 0.3));
  return {
    value: clamp(value, 0, 100),
    quality: dates.length < Math.min(4, target) ? ("limited" as const) : ("measured" as const),
    detail: `${dates.length}/${target} active days · ${activeWeeks}/4 active weeks`,
    activityDays: dates.length,
    activeWeeks,
  };
}

export function weightedScore(signals: WeightedSignal[], baseline = 50) {
  const available = signals.filter((signal): signal is { value: number; weight: number } => signal.value !== null && Number.isFinite(signal.value));
  if (!available.length) return { value: baseline, quality: "baseline" as const };
  const weight = available.reduce((total, signal) => total + signal.weight, 0);
  const value = Math.round(available.reduce((total, signal) => total + clamp(signal.value, 0, 100) * signal.weight, 0) / weight);
  return { value: clamp(value, 0, 100), quality: available.length < signals.length ? ("limited" as const) : ("measured" as const) };
}

export function wealthStat(input: {
  savingsPerformance: number | null;
  budgetAdherence: number | null;
  billTimeliness: number | null;
}) {
  return weightedScore([
    { value: input.savingsPerformance, weight: 0.5 },
    { value: input.budgetAdherence, weight: 0.3 },
    { value: input.billTimeliness, weight: 0.2 },
  ]);
}

export function disciplineStat(input: {
  completionRatio: number | null;
  overduePressure: number | null;
  productiveDays: number | null;
}) {
  return weightedScore([
    { value: input.completionRatio === null ? null : clamp(input.completionRatio * 100, 0, 100), weight: 0.5 },
    { value: input.overduePressure === null ? null : clamp((1 - input.overduePressure) * 100, 0, 100), weight: 0.3 },
    { value: input.productiveDays === null ? null : clamp((input.productiveDays / 20) * 100, 0, 100), weight: 0.2 },
  ]);
}

export function productiveStreak(productiveDates: string[], today: string) {
  const dates = new Set(productiveDates);
  let cursor = dates.has(today) ? today : addDaysToRpgDate(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDaysToRpgDate(cursor, -1);
  }
  return streak;
}

export function questRecommendations(input: QuestRecommendationInput): QuestRecommendation[] {
  const recommendations: QuestRecommendation[] = [];
  const today = RPG_CATEGORIES
    .map((category) => ({ category, count: input.dueTodayByCategory[category] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))[0];
  if (today) {
    recommendations.push({
      generatedKey: `daily-focus:${today.category}`,
      type: "daily",
      title: `${CATEGORY_LABELS[today.category]} Focus`,
      category: today.category,
      difficulty: today.count >= 3 ? "medium" : "easy",
      objectiveTarget: today.count,
      source: "tasks",
    });
  }

  const weekly = RPG_CATEGORIES
    .map((category) => ({ category, count: input.plannedThisWeekByCategory[category] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, input.scheduledChores > 0 ? 1 : 2);
  for (const entry of weekly) {
    recommendations.push({
      generatedKey: `weekly:${entry.category}`,
      type: "weekly",
      title: `${CATEGORY_LABELS[entry.category]} Campaign`,
      category: entry.category,
      difficulty: entry.count >= 5 ? "hard" : "medium",
      objectiveTarget: entry.count,
      source: "tasks",
    });
  }
  if (input.scheduledChores > 0 && recommendations.filter((item) => item.type === "weekly").length < 2) {
    recommendations.push({
      generatedKey: "weekly:home-reset",
      type: "weekly",
      title: "Home Reset",
      category: "discipline",
      difficulty: input.scheduledChores >= 5 ? "hard" : "medium",
      objectiveTarget: input.scheduledChores,
      source: "chores",
    });
  }
  return recommendations.slice(0, 3);
}

export function validateQuestDifficulty(type: QuestType, difficulty: RpgDifficulty, objectiveCount: number) {
  if (difficulty === "boss" && (type !== "main" || objectiveCount < 3)) {
    return { valid: false, message: "Boss difficulty requires a Main quest with at least three objectives." };
  }
  return { valid: true, message: null };
}

export function achievementUnlocks(context: AchievementContext, alreadyUnlocked: Iterable<string> = []) {
  const unlocked = new Set(alreadyUnlocked);
  return ACHIEVEMENTS.filter((definition) => !unlocked.has(definition.key) && definition.qualifies(context));
}

export function weeklyGrade(input: { completedQuests: number; totalQuests: number; productiveDays: number; xp: number }) {
  const components: Array<{ score: number; weight: number }> = [];
  if (input.totalQuests > 0) components.push({ score: clamp(input.completedQuests / input.totalQuests, 0, 1), weight: 0.5 });
  components.push({ score: clamp(input.productiveDays / 5, 0, 1), weight: 0.3 });
  components.push({ score: clamp(input.xp / 300, 0, 1), weight: 0.2 });
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const score = Math.round((components.reduce((sum, component) => sum + component.score * component.weight, 0) / totalWeight) * 100);
  const thresholds: Array<[number, string]> = [
    [97, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"],
    [77, "C+"], [73, "C"], [70, "C-"], [60, "D"], [0, "F"],
  ];
  return { score, grade: thresholds.find(([threshold]) => score >= threshold)?.[1] ?? "F" };
}

export type CalendarAwardOccurrence = {
  seriesId: string;
  occurrenceDate: string;
  occurredAt: string;
  category: string | null;
  allDay: boolean;
};

export function selectCalendarAwards(
  occurrences: CalendarAwardOccurrence[],
  options: { weekStart: string; weekEnd: string; socialBaseXpAlreadyAwarded?: number },
) {
  const socialPerDay = new Map<string, number>();
  let socialXp = options.socialBaseXpAlreadyAwarded ?? 0;
  const awards: Array<CalendarAwardOccurrence & { slot: "social" | "career"; categoryAward: RpgCategory; baseXp: number; share: number }> = [];
  const sorted = [...occurrences].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.seriesId.localeCompare(b.seriesId));

  for (const occurrence of sorted) {
    const classification = classifyCalendarCategory(occurrence.category);
    if (classification.social && occurrence.occurrenceDate >= options.weekStart && occurrence.occurrenceDate <= options.weekEnd) {
      const dailyCount = socialPerDay.get(occurrence.occurrenceDate) ?? 0;
      if (dailyCount < 3 && socialXp + DIFFICULTY_XP.easy <= 100) {
        awards.push({ ...occurrence, slot: "social", categoryAward: "social", baseXp: DIFFICULTY_XP.easy, share: 1 });
        socialPerDay.set(occurrence.occurrenceDate, dailyCount + 1);
        socialXp += DIFFICULTY_XP.easy;
      }
    }
    if (classification.career) {
      awards.push({
        ...occurrence,
        slot: "career",
        categoryAward: "career",
        baseXp: occurrence.category?.trim().toLowerCase() === "networking" ? DIFFICULTY_XP.easy : DIFFICULTY_XP.trivial,
        share: occurrence.category?.trim().toLowerCase() === "networking" ? 0.3 : 1,
      });
    }
  }
  return awards;
}
