import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_XP,
  RPG_OVERALL_BASELINE_XP,
  achievementUnlocks,
  allocateQuestXp,
  allocateTaskXp,
  categoryLevelProgress,
  currentEffects,
  dateKeyInTimeZone,
  disciplineStat,
  effectMultiplier,
  initialCategoryBaselineXp,
  initialCategoryLevel,
  levelProgress,
  measuredActivityStat,
  overallLevelProgress,
  overallXpForLevel,
  productiveStreak,
  questRecommendations,
  selectCalendarAwards,
  sundayWeekBounds,
  taskEventKey,
  validateQuestDifficulty,
  wealthStat,
  weeklyGrade,
} from "@/lib/life-rpg";

describe("LIFE RPG progression", () => {
  it("starts at level 24 with exactly zero in-level progress", () => {
    expect(RPG_OVERALL_BASELINE_XP).toBe(48_300);
    expect(overallLevelProgress(0)).toMatchObject({ level: 24, xpIntoLevel: 0, percent: 0 });
  });

  it("handles exact level boundaries", () => {
    expect(levelProgress(999, overallXpForLevel)).toMatchObject({ level: 1, xpIntoLevel: 999 });
    expect(levelProgress(1_000, overallXpForLevel)).toMatchObject({ level: 2, xpIntoLevel: 0 });
    expect(overallLevelProgress(3_299)).toMatchObject({ level: 24, xpIntoLevel: 3_299 });
    expect(overallLevelProgress(3_300)).toMatchObject({ level: 25, xpIntoLevel: 0 });
  });

  it("derives category baselines from initial stats", () => {
    expect(initialCategoryLevel(50)).toBe(5);
    expect(initialCategoryLevel(1)).toBe(1);
    expect(initialCategoryBaselineXp(50)).toBe(1_100);
    expect(categoryLevelProgress(50, 0)).toMatchObject({ level: 5, xpIntoLevel: 0 });
  });
});

describe("XP allocation and effects", () => {
  it("allocates classified, unclassified, and Discipline-primary task XP", () => {
    expect(allocateTaskXp("career", "medium")).toEqual([
      { category: "career", slot: "primary", baseXp: 25, share: 1 },
      { category: "discipline", slot: "discipline", baseXp: 25, share: 0.25 },
    ]);
    expect(allocateTaskXp(null, "medium")).toEqual([
      { category: "discipline", slot: "discipline", baseXp: 25, share: 0.25 },
    ]);
    expect(allocateTaskXp("discipline", "medium")).toHaveLength(1);
  });

  it("collapses duplicate quest categories", () => {
    expect(allocateQuestXp("discipline", "discipline", "hard")).toEqual([
      { category: "discipline", baseXp: 50, share: 1.5, slot: "primary" },
    ]);
  });

  it("activates and clamps effect deltas", () => {
    const effects = currentEffects(5, 10);
    expect(effects.map((effect) => effect.active)).toEqual([true, true, false]);
    expect(effectMultiplier(effects)).toBe(1);
    expect(effectMultiplier([{ active: true, delta: 0.4 }])).toBe(1.25);
  });

  it("keeps event keys stable across category edits", () => {
    expect(taskEventKey("ABC", "2026-08-29", "primary")).toBe("task:abc:2026-08-29:primary");
  });
});

describe("stats and streaks", () => {
  it("returns a neutral baseline with no genuine activity signal", () => {
    expect(measuredActivityStat({ category: "health", activityDates: [], from: "2026-08-01", to: "2026-08-28" }))
      .toMatchObject({ value: 50, quality: "baseline" });
  });

  it("weights activity days and active weeks and clamps the result", () => {
    const result = measuredActivityStat({
      category: "social",
      activityDates: ["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27"],
      from: "2026-08-01",
      to: "2026-08-28",
    });
    expect(result.value).toBe(100);
    expect(result.activeWeeks).toBe(4);
  });

  it("reweights missing Wealth signals and clamps Discipline", () => {
    expect(wealthStat({ savingsPerformance: 80, budgetAdherence: null, billTimeliness: 40 }).value).toBe(69);
    expect(disciplineStat({ completionRatio: 2, overduePressure: -1, productiveDays: 99 }).value).toBe(100);
  });

  it("keeps a streak alive through yesterday", () => {
    expect(productiveStreak(["2026-08-27", "2026-08-28"], "2026-08-29")).toBe(2);
  });
});

describe("quests, achievements, and weekly rules", () => {
  it("recommends only from reliable task/chore sources", () => {
    expect(questRecommendations({ dueTodayByCategory: {}, plannedThisWeekByCategory: {}, scheduledChores: 0 })).toEqual([]);
    const recommendations = questRecommendations({
      dueTodayByCategory: { career: 3 },
      plannedThisWeekByCategory: { knowledge: 5, social: 2 },
      scheduledChores: 2,
    });
    expect(recommendations).toHaveLength(3);
    expect(recommendations[0]).toMatchObject({ type: "daily", difficulty: "medium", category: "career" });
  });

  it("restricts Boss to confirmed multi-objective Main quests", () => {
    expect(validateQuestDifficulty("weekly", "boss", 3).valid).toBe(false);
    expect(validateQuestDifficulty("main", "boss", 2).valid).toBe(false);
    expect(validateQuestDifficulty("main", "boss", 3).valid).toBe(true);
  });

  it("evaluates fixed achievement definitions and rarity rewards", () => {
    const unlocks = achievementUnlocks({
      completedQuestCount: 1,
      currentStreak: 7,
      investmentAccountCount: 1,
      investedBalance: 25_000,
      netWorth: 100_000,
      completedMainDifficulties: ["epic", "boss"],
    });
    expect(unlocks).toHaveLength(7);
    expect(ACHIEVEMENT_XP.legendary).toBe(250);
  });

  it("maps all grade boundaries and omits unavailable quests", () => {
    expect(weeklyGrade({ completedQuests: 10, totalQuests: 10, productiveDays: 5, xp: 300 })).toEqual({ score: 100, grade: "A+" });
    expect(weeklyGrade({ completedQuests: 0, totalQuests: 0, productiveDays: 5, xp: 300 })).toEqual({ score: 100, grade: "A+" });
    expect(weeklyGrade({ completedQuests: 0, totalQuests: 1, productiveDays: 0, xp: 0 }).grade).toBe("F");
  });

  it.each([
    [97, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"],
    [77, "C+"], [73, "C"], [70, "C-"], [60, "D"], [59, "F"],
  ])("maps a %i score to %s", (score, grade) => {
    expect(weeklyGrade({ completedQuests: 0, totalQuests: 0, productiveDays: score / 20, xp: score * 3 })).toEqual({ score, grade });
  });

  it("uses Sunday through Saturday, including Toronto DST instants", () => {
    expect(sundayWeekBounds("2026-08-29")).toEqual({ start: "2026-08-23", end: "2026-08-29" });
    expect(dateKeyInTimeZone("2026-03-08T04:30:00.000Z", "America/Toronto")).toBe("2026-03-07");
    expect(dateKeyInTimeZone("2026-03-08T07:30:00.000Z", "America/Toronto")).toBe("2026-03-08");
  });

  it("caps social awards while retaining Networking Career XP", () => {
    const occurrences = Array.from({ length: 10 }, (_, index) => ({
      seriesId: String(index),
      occurrenceDate: index < 4 ? "2026-08-23" : `2026-08-${String(20 + index).padStart(2, "0")}`,
      occurredAt: `2026-08-23T${String(index).padStart(2, "0")}:00:00Z`,
      category: index === 0 ? "Networking" : "Social",
      allDay: false,
    }));
    const awards = selectCalendarAwards(occurrences, { weekStart: "2026-08-23", weekEnd: "2026-08-29" });
    expect(awards.filter((award) => award.slot === "social")).toHaveLength(9);
    expect(awards.find((award) => award.slot === "career")).toMatchObject({ share: 0.3, categoryAward: "career" });
  });
});
