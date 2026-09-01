import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, readJson, safeErrorResponse } from "../_shared/http.ts";
import { requireServiceActor, requireUser } from "../_shared/supabase.ts";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_XP,
  CATEGORY_LABELS,
  DIFFICULTY_XP,
  RPG_CATEGORIES,
  RPG_RULESET_VERSION,
  achievementUnlocks,
  addDaysToRpgDate,
  allocateQuestXp,
  calendarEventKey,
  categoryLevelProgress,
  classifyCalendarCategory,
  currentEffects,
  dateKeyInTimeZone,
  disciplineStat,
  effectMultiplier,
  initialCategoryBaselineXp,
  measuredActivityStat,
  productiveStreak,
  questEventKey,
  questRecommendations,
  sundayWeekBounds,
  sundayWeekStart,
  wealthMonthEventKey,
  wealthStat,
  weeklyGrade,
  type AchievementContext,
  type CalendarAwardOccurrence,
  type RpgCategory,
  type RpgDifficulty,
  type RpgEffect,
} from "../_shared/life-rpg.ts";

type Scope = "full" | "task" | "calendar" | "wealth" | "goal" | "quest" | "home";
type Body = { scopes?: Scope[]; user_id?: string };
type Summary = { scanned: number; created: number; conflicts: number; updated: number; cursorLagSeconds: number };
type RpgProfile = {
  user_id: string;
  initialization_cutoff: string;
  reconciliation_cursor: string;
  last_reconciled_at: string | null;
  initial_stats: Record<RpgCategory, number>;
  category_baseline_xp: Record<RpgCategory, number>;
};
type XpRow = { event_key: string; category: RpgCategory; awarded_xp: number | string; base_xp: number | string; occurred_at: string; qualifying_event: string; audit_metadata: Record<string, unknown> };
type QuestRow = {
  id: string; title: string; quest_type: "daily" | "weekly" | "main"; primary_category: RpgCategory;
  secondary_category: RpgCategory | null; difficulty: RpgDifficulty; starts_on: string; ends_on: string | null;
  status: "active" | "completed" | "abandoned" | "expired"; completed_at: string | null; generated_key: string | null;
};
type ObjectiveRow = {
  id: string; quest_id: string; tracking_type: "manual" | "task_completion" | "chore_completion" | "goal_progress";
  target_value: number | string; manual_value: number | string; source_record_id: string | null; category_filter: RpgCategory | null;
};
type CalendarRow = {
  id: string; start_at: string; end_at: string | null; all_day: boolean; category: string | null; timezone: string;
  recurrence: string; recurrence_interval: number; recurrence_days_of_week: number[] | null; recurrence_end_date: string | null;
  recurrence_count: number | null;
};

const PAGE_SIZE = 500;
const MAX_RUNTIME_MS = 48_000;

function assertWithinDeadline(startedAt: number) {
  if (Date.now() - startedAt > MAX_RUNTIME_MS) throw new HttpError(503, "LIFE RPG reconciliation reached its bounded execution time.");
}

function toNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function dateFromKey(value: string) {
  const { year, month, day } = parseDateKey(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayDistance(from: string, to: string) {
  return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86_400_000);
}

function weekday(value: string) {
  return dateFromKey(value).getUTCDay();
}

function lastDay(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(anchor: string, months: number) {
  const parts = parseDateKey(anchor);
  const index = parts.month - 1 + months;
  const year = parts.year + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12 + 1;
  return `${year}-${pad(month)}-${pad(Math.min(parts.day, lastDay(year, month)))}`;
}

function localParts(instant: string | Date, timeZone: string) {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute, second: values.second };
}

function zoneOffset(date: Date, timeZone: string) {
  const parts = localParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

function localDateTimeToInstant(dateKey: string, time: { hour: number; minute: number; second: number }, timeZone: string) {
  const date = parseDateKey(dateKey);
  const guess = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute, time.second);
  let offset = zoneOffset(new Date(guess), timeZone);
  let result = new Date(guess - offset);
  const corrected = zoneOffset(result, timeZone);
  if (corrected !== offset) result = new Date(guess - corrected);
  return result;
}

function recurrenceDates(event: CalendarRow, from: string, to: string) {
  const timeZone = event.timezone || "America/Toronto";
  const anchor = dateKeyInTimeZone(event.start_at, timeZone);
  const end = event.recurrence_end_date && event.recurrence_end_date < to ? event.recurrence_end_date : to;
  if (anchor > end) return [];
  if (event.recurrence === "none") return anchor >= from && anchor <= to ? [anchor] : [];
  const interval = Math.max(1, Number(event.recurrence_interval || 1));
  const dates: string[] = [];
  const add = (date: string, ordinal: number) => {
    if (event.recurrence_count !== null && ordinal >= event.recurrence_count) return false;
    if (date >= from && date <= end) dates.push(date);
    return date <= end;
  };

  if (event.recurrence === "daily") {
    let index = Math.max(0, Math.ceil(dayDistance(anchor, from) / interval));
    for (;; index += 1) {
      const date = addDaysToRpgDate(anchor, index * interval);
      if (date > end || !add(date, index)) break;
    }
    return dates;
  }

  if (event.recurrence === "weekly" || event.recurrence === "biweekly") {
    const step = event.recurrence === "biweekly" ? interval * 2 : interval;
    const selected = [...new Set(event.recurrence_days_of_week?.length ? event.recurrence_days_of_week : [weekday(anchor)])].sort();
    const anchorWeek = sundayWeekStart(anchor);
    const firstWeekIndex = Math.max(0, Math.floor(dayDistance(anchorWeek, sundayWeekStart(from)) / 7 / step));
    let ordinal = 0;
    const beforeFirst = firstWeekIndex * step;
    if (beforeFirst > 0) {
      for (let week = 0; week < beforeFirst; week += step) {
        for (const day of selected) if (addDaysToRpgDate(anchorWeek, week * 7 + day) >= anchor) ordinal += 1;
      }
    }
    for (let week = beforeFirst; ; week += step) {
      const weekStart = addDaysToRpgDate(anchorWeek, week * 7);
      if (weekStart > end) break;
      for (const day of selected) {
        const date = addDaysToRpgDate(weekStart, day);
        if (date < anchor) continue;
        if (date > end || !add(date, ordinal)) return dates;
        ordinal += 1;
      }
    }
    return [...new Set(dates)].sort();
  }

  const monthStep = event.recurrence === "quarterly" ? interval * 3 : event.recurrence === "yearly" ? interval * 12 : interval;
  const anchorParts = parseDateKey(anchor);
  const fromParts = parseDateKey(from);
  const monthDistance = (fromParts.year - anchorParts.year) * 12 + fromParts.month - anchorParts.month;
  let index = Math.max(0, Math.floor(monthDistance / monthStep));
  for (;; index += 1) {
    const date = addMonths(anchor, index * monthStep);
    if (date > end || !add(date, index)) break;
  }
  return dates;
}

async function ensureProfile(admin: SupabaseClient, userId: string, now: string) {
  const { data: existing, error: readError } = await admin.from("rpg_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (readError) throw new HttpError(500, "Unable to load LIFE RPG profile.");
  if (existing) return { profile: existing as RpgProfile, initialized: false, baselinePass: existing.last_reconciled_at === null };
  const { data, error } = await admin.from("rpg_profiles").insert({
    user_id: userId, initialization_cutoff: now, reconciliation_cursor: now,
  }).select("*").single();
  if (error || !data) {
    const { data: raced } = await admin.from("rpg_profiles").select("*").eq("user_id", userId).single();
    if (!raced) throw new HttpError(500, "Unable to initialize LIFE RPG profile.");
    return { profile: raced as RpgProfile, initialized: false, baselinePass: raced.last_reconciled_at === null };
  }
  return { profile: data as RpgProfile, initialized: true, baselinePass: true };
}

async function awardXp(admin: SupabaseClient, row: Record<string, unknown>, summary: Summary) {
  const { data, error } = await admin.from("rpg_xp_events").upsert(row, { onConflict: "user_id,event_key", ignoreDuplicates: true }).select("id");
  if (error) throw new HttpError(500, `Unable to write LIFE RPG XP: ${error.message}`);
  if (data?.length) summary.created += 1;
  else summary.conflicts += 1;
}

async function loadActivity(admin: SupabaseClient, userId: string, from: string, to: string) {
  const [taskResult, choreResult, xpResult] = await Promise.all([
    admin.from("task_completions").select("task_id, occurrence_date, category_snapshot").eq("user_id", userId).gte("occurrence_date", from).lte("occurrence_date", to).limit(PAGE_SIZE),
    admin.from("chore_completions").select("chore_id, completed_on").eq("user_id", userId).gte("completed_on", from).lte("completed_on", to).limit(PAGE_SIZE),
    admin.from("rpg_xp_events").select("category, occurred_at, qualifying_event").eq("user_id", userId).gte("occurred_at", `${from}T00:00:00Z`).lte("occurred_at", `${to}T23:59:59Z`).limit(PAGE_SIZE),
  ]);
  if (taskResult.error || choreResult.error || xpResult.error) throw new HttpError(500, "Unable to load RPG activity windows.");
  return { tasks: taskResult.data ?? [], chores: choreResult.data ?? [], xp: xpResult.data ?? [] };
}

async function reconcileCalendar(admin: SupabaseClient, userId: string, profile: RpgProfile, now: Date, summary: Summary, startedAt: number) {
  const today = dateKeyInTimeZone(now, "America/Toronto");
  const cursorOverlap = new Date(new Date(profile.reconciliation_cursor).getTime() - 48 * 60 * 60 * 1000);
  const from = [
    addDaysToRpgDate(today, -90),
    dateKeyInTimeZone(profile.initialization_cutoff, "America/Toronto"),
    dateKeyInTimeZone(cursorOverlap, "America/Toronto"),
  ].sort().at(-1)!;
  const { data, error } = await admin.from("calendar_events").select("*").eq("user_id", userId).lte("start_at", now.toISOString()).order("start_at").limit(PAGE_SIZE);
  if (error) throw new HttpError(500, "Unable to reconcile calendar activity.");
  summary.scanned += data?.length ?? 0;
  const candidates: CalendarAwardOccurrence[] = [];
  for (const event of (data ?? []) as CalendarRow[]) {
    assertWithinDeadline(startedAt);
    const timeZone = event.timezone || "America/Toronto";
    const originalStart = new Date(event.start_at);
    const originalEnd = event.end_at ? new Date(event.end_at) : originalStart;
    const duration = Math.max(0, originalEnd.getTime() - originalStart.getTime());
    const wallTime = localParts(originalStart, timeZone);
    for (const occurrenceDate of recurrenceDates(event, from, today)) {
      const start = localDateTimeToInstant(occurrenceDate, wallTime, timeZone);
      const qualifiesAt = event.all_day
        ? localDateTimeToInstant(addDaysToRpgDate(occurrenceDate, 1), { hour: 0, minute: 0, second: 0 }, timeZone)
        : new Date(start.getTime() + duration);
      if (qualifiesAt > now || qualifiesAt.toISOString() <= profile.initialization_cutoff) continue;
      candidates.push({ seriesId: event.id, occurrenceDate, occurredAt: qualifiesAt.toISOString(), category: event.category, allDay: event.all_day });
    }
  }

  const byWeek = new Map<string, CalendarAwardOccurrence[]>();
  for (const occurrence of candidates) {
    const week = sundayWeekStart(occurrence.occurrenceDate);
    byWeek.set(week, [...(byWeek.get(week) ?? []), occurrence]);
  }
  for (const [weekStart, occurrences] of byWeek) {
    const weekEnd = addDaysToRpgDate(weekStart, 6);
    const { data: existing, error: ledgerError } = await admin.from("rpg_xp_events")
      .select("event_key, base_xp, audit_metadata").eq("user_id", userId).eq("category", "social")
      .gte("occurred_at", `${weekStart}T00:00:00Z`).lte("occurred_at", `${addDaysToRpgDate(weekEnd, 1)}T12:00:00Z`).limit(PAGE_SIZE);
    if (ledgerError) throw new HttpError(500, "Unable to enforce Social XP caps.");
    const existingKeys = new Set((existing ?? []).map((row) => row.event_key));
    const daily = new Map<string, number>();
    let weeklyBase = (existing ?? []).reduce((sum, row) => sum + toNumber(row.base_xp), 0);
    for (const row of existing ?? []) {
      const date = typeof row.audit_metadata?.occurrence_date === "string" ? row.audit_metadata.occurrence_date : null;
      if (date) daily.set(date, (daily.get(date) ?? 0) + 1);
    }
    for (const occurrence of occurrences.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      const classification = classifyCalendarCategory(occurrence.category);
      if (classification.social) {
        const key = calendarEventKey(occurrence.seriesId, occurrence.occurrenceDate, "social");
        if (!existingKeys.has(key) && (daily.get(occurrence.occurrenceDate) ?? 0) < 3 && weeklyBase + DIFFICULTY_XP.easy <= 100) {
          await awardXp(admin, {
            user_id: userId, event_key: key, source_type: "calendar", source_record_id: occurrence.seriesId,
            qualifying_event: "calendar_occurrence", category: "social", difficulty: "easy", base_xp: 10,
            multiplier: 1, awarded_xp: 10, reason: `Elapsed ${occurrence.category ?? "Social"} event`, occurred_at: occurrence.occurredAt,
            ruleset_version: RPG_RULESET_VERSION, audit_metadata: { occurrence_date: occurrence.occurrenceDate, all_day: occurrence.allDay },
          }, summary);
          daily.set(occurrence.occurrenceDate, (daily.get(occurrence.occurrenceDate) ?? 0) + 1);
          weeklyBase += 10;
        }
      }
      if (classification.career) {
        const networking = occurrence.category?.trim().toLowerCase() === "networking";
        const base = networking ? DIFFICULTY_XP.easy : DIFFICULTY_XP.trivial;
        const share = networking ? 0.3 : 1;
        await awardXp(admin, {
          user_id: userId, event_key: calendarEventKey(occurrence.seriesId, occurrence.occurrenceDate, "career"), source_type: "calendar",
          source_record_id: occurrence.seriesId, qualifying_event: "calendar_occurrence", category: "career",
          difficulty: networking ? "easy" : "trivial", base_xp: base * share, multiplier: 1, awarded_xp: base * share,
          reason: `Elapsed ${networking ? "Networking" : "Work"} event`, occurred_at: occurrence.occurredAt,
          ruleset_version: RPG_RULESET_VERSION, audit_metadata: { occurrence_date: occurrence.occurrenceDate, all_day: occurrence.allDay },
        }, summary);
      }
    }
  }
}

function accountNumbers(accounts: Array<Record<string, unknown>>) {
  const included = accounts.filter((account) => account.include_in_net_worth === true && account.archived !== true
    && String(account.currency_code ?? "CAD").toUpperCase() === "CAD" && account.reconciliation_status !== "needs_review");
  let netWorth = 0;
  let investedBalance = 0;
  let investmentAccountCount = 0;
  for (const account of included) {
    const balance = toNumber(account.current_balance as number | string);
    const type = String(account.type ?? "");
    const plaidType = String(account.plaid_account_type ?? "");
    const subtype = String(account.account_subtype ?? "").toLowerCase();
    const liability = type === "credit_card" || plaidType === "credit" || plaidType === "loan" || /loan|mortgage|line of credit/.test(subtype);
    const investment = ["tfsa", "fhsa", "rrsp", "non_registered_investment"].includes(type) || plaidType === "investment" || /investment|brokerage|tfsa|fhsa|rrsp/.test(subtype);
    netWorth += liability ? -Math.abs(balance) : balance;
    if (investment) { investedBalance += balance; investmentAccountCount += 1; }
  }
  return { netWorth, investedBalance, investmentAccountCount };
}

function previousMonth(today: string) {
  const parts = parseDateKey(today);
  const first = new Date(Date.UTC(parts.year, parts.month - 2, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  return { key: `${year}-${pad(month)}`, from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` };
}

async function reconcileWealth(admin: SupabaseClient, userId: string, profile: RpgProfile, today: string, summary: Summary) {
  const month = previousMonth(today);
  const [profileResult, transactionResult] = await Promise.all([
    admin.from("profiles").select("savings_rate_target").eq("id", userId).single(),
    admin.from("transactions").select("type,type_override,amount,pending,removed_at,plaid_category_primary,plaid_category_detailed,transaction_date")
      .eq("user_id", userId).gte("transaction_date", month.from).lte("transaction_date", month.to).limit(PAGE_SIZE),
  ]);
  if (profileResult.error || transactionResult.error) throw new HttpError(500, "Unable to reconcile Wealth XP.");
  const target = profileResult.data?.savings_rate_target === null ? null : toNumber(profileResult.data?.savings_rate_target);
  if (target === null || `${month.to}T23:59:59Z` <= profile.initialization_cutoff) return;
  let income = 0;
  let spending = 0;
  for (const transaction of transactionResult.data ?? []) {
    if (transaction.pending || transaction.removed_at) continue;
    const plaidTransfer = [transaction.plaid_category_primary, transaction.plaid_category_detailed]
      .some((value) => typeof value === "string" && (value === "TRANSFER_IN" || value === "TRANSFER_OUT" || value.startsWith("TRANSFER_")));
    const type = transaction.type_override ?? transaction.type;
    if (type === "transfer" || plaidTransfer) continue;
    if (type === "income") income += toNumber(transaction.amount);
    if (type === "expense") spending += toNumber(transaction.amount);
  }
  if (income <= 0) return;
  const rate = ((income - spending) / income) * 100;
  if (rate >= target) await awardXp(admin, {
    user_id: userId, event_key: wealthMonthEventKey(month.key), source_type: "wealth_month", source_record_id: month.key,
    qualifying_event: "finalized_savings_target", category: "wealth", difficulty: "hard", base_xp: 50, multiplier: 1,
    awarded_xp: 50, reason: `Met ${target}% savings target for ${month.key}`, occurred_at: `${month.to}T23:59:59Z`,
    ruleset_version: RPG_RULESET_VERSION, audit_metadata: { month: month.key, savings_rate: Math.round(rate * 100) / 100, target },
  }, summary);
}

async function reconcileQuests(admin: SupabaseClient, userId: string, today: string, timeZone: string, summary: Summary) {
  const week = sundayWeekBounds(today);
  await admin.from("rpg_quests").update({ status: "expired", completed_at: null }).eq("user_id", userId).eq("status", "active").in("quest_type", ["daily", "weekly"]).lt("ends_on", today);
  const [tasksResult, choresResult, questsResult, objectivesResult, completionsResult, choreCompletionsResult, goalsResult] = await Promise.all([
    admin.from("tasks").select("id,title,due_date,rpg_category,status").eq("user_id", userId).eq("status", "open").gte("due_date", today).lte("due_date", week.end).limit(PAGE_SIZE),
    admin.from("chores").select("id,title,next_due_date,status").eq("user_id", userId).eq("status", "active").gte("next_due_date", today).lte("next_due_date", week.end).limit(PAGE_SIZE),
    admin.from("rpg_quests").select("*").eq("user_id", userId).order("created_at").limit(PAGE_SIZE),
    admin.from("rpg_quest_objectives").select("*").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("task_completions").select("task_id,occurrence_date,category_snapshot").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("chore_completions").select("chore_id,completed_on").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("goals").select("id,current_value,target_value").eq("user_id", userId).limit(PAGE_SIZE),
  ]);
  const failed = [tasksResult, choresResult, questsResult, objectivesResult, completionsResult, choreCompletionsResult, goalsResult].find((result) => result.error);
  if (failed?.error) throw new HttpError(500, "Unable to reconcile quest progress.");
  summary.scanned += (questsResult.data?.length ?? 0) + (objectivesResult.data?.length ?? 0);

  const todayCounts: Partial<Record<RpgCategory, number>> = {};
  const weekCounts: Partial<Record<RpgCategory, number>> = {};
  for (const task of tasksResult.data ?? []) {
    if (!RPG_CATEGORIES.includes(task.rpg_category as RpgCategory)) continue;
    const category = task.rpg_category as RpgCategory;
    weekCounts[category] = (weekCounts[category] ?? 0) + 1;
    if (task.due_date === today) todayCounts[category] = (todayCounts[category] ?? 0) + 1;
  }
  const recommendations = questRecommendations({ dueTodayByCategory: todayCounts, plannedThisWeekByCategory: weekCounts, scheduledChores: choresResult.data?.length ?? 0 });
  for (const recommendation of recommendations) {
    const periodKey = recommendation.type === "daily" ? today : week.start;
    const generatedKey = `${recommendation.generatedKey}:${periodKey}`;
    const { data: quest, error } = await admin.from("rpg_quests").upsert({
      user_id: userId, title: recommendation.title, quest_type: recommendation.type, primary_category: recommendation.category,
      difficulty: recommendation.difficulty, starts_on: recommendation.type === "daily" ? today : week.start,
      ends_on: recommendation.type === "daily" ? today : week.end, generated_key: generatedKey,
    }, { onConflict: "user_id,generated_key", ignoreDuplicates: true }).select("id");
    if (error) throw new HttpError(500, "Unable to generate reliable quests.");
    if (quest?.[0]) {
      const tracking = recommendation.source === "chores" ? "chore_completion" : "task_completion";
      const { error: objectiveError } = await admin.from("rpg_quest_objectives").insert({
        user_id: userId, quest_id: quest[0].id, position: 0,
        objective: recommendation.source === "chores" ? `Complete ${recommendation.objectiveTarget} scheduled chores` : `Complete ${recommendation.objectiveTarget} ${CATEGORY_LABELS[recommendation.category]} tasks`,
        tracking_type: tracking, target_value: recommendation.objectiveTarget,
        category_filter: recommendation.source === "tasks" ? recommendation.category : null,
      });
      if (objectiveError) throw new HttpError(500, "Unable to generate quest objectives.");
      summary.created += 1;
    } else summary.conflicts += 1;
  }

  const quests = (questsResult.data ?? []) as QuestRow[];
  const objectives = (objectivesResult.data ?? []) as ObjectiveRow[];
  const goals = new Map((goalsResult.data ?? []).map((goal) => [goal.id, goal]));
  for (const quest of quests.filter((item) => item.status === "active")) {
    const questObjectives = objectives.filter((objective) => objective.quest_id === quest.id);
    for (const objective of questObjectives) {
      let value = toNumber(objective.manual_value);
      if (objective.tracking_type === "task_completion") value = (completionsResult.data ?? []).filter((completion) =>
        completion.occurrence_date >= quest.starts_on && (!quest.ends_on || completion.occurrence_date <= quest.ends_on)
        && (!objective.source_record_id || completion.task_id === objective.source_record_id)
        && (!objective.category_filter || completion.category_snapshot === objective.category_filter)).length;
      if (objective.tracking_type === "chore_completion") value = (choreCompletionsResult.data ?? []).filter((completion) =>
        completion.completed_on >= quest.starts_on && (!quest.ends_on || completion.completed_on <= quest.ends_on)
        && (!objective.source_record_id || completion.chore_id === objective.source_record_id)).length;
      if (objective.tracking_type === "goal_progress" && objective.source_record_id) value = toNumber(goals.get(objective.source_record_id)?.current_value);
      if (value !== toNumber(objective.manual_value)) {
        const { error } = await admin.from("rpg_quest_objectives").update({ manual_value: Math.max(0, value) }).eq("id", objective.id).eq("user_id", userId);
        if (error) throw new HttpError(500, "Unable to update derived quest progress.");
        objective.manual_value = value;
        summary.updated += 1;
      }
    }
    if (questObjectives.length && questObjectives.every((objective) => toNumber(objective.manual_value) >= toNumber(objective.target_value))) {
      const completedAt = new Date().toISOString();
      const { error } = await admin.from("rpg_quests").update({ status: "completed", completed_at: completedAt }).eq("id", quest.id).eq("user_id", userId).eq("status", "active");
      if (error) throw new HttpError(500, "Unable to complete a derived quest.");
      const activity = await loadActivity(admin, userId, addDaysToRpgDate(today, -7), addDaysToRpgDate(today, -1));
      const productive = new Set([...activity.tasks.map((item) => item.occurrence_date), ...activity.chores.map((item) => item.completed_on)]).size;
      const { count: overdue } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open").lt("due_date", today);
      const effects = currentEffects(productive, overdue ?? 0);
      for (const allocation of allocateQuestXp(quest.primary_category, quest.secondary_category, quest.difficulty)) {
        const multiplier = allocation.category === "discipline" ? effectMultiplier(effects) : 1;
        await awardXp(admin, {
          user_id: userId, event_key: questEventKey(quest.id, allocation.slot as "primary" | "secondary" | "discipline"), source_type: "quest",
          source_record_id: quest.id, qualifying_event: "quest_completion", category: allocation.category, difficulty: quest.difficulty,
          base_xp: allocation.baseXp * allocation.share, multiplier, awarded_xp: Math.round(allocation.baseXp * allocation.share * multiplier * 100) / 100,
          reason: `Completed quest ${quest.title}`, occurred_at: completedAt, ruleset_version: RPG_RULESET_VERSION,
          audit_metadata: { quest_type: quest.quest_type, objective_count: questObjectives.length, effects: effects.filter((effect) => effect.active).map((effect) => effect.key) },
        }, summary);
      }
    }
  }
  void timeZone;
}

async function reconcileAchievements(admin: SupabaseClient, userId: string, baseline: boolean, today: string, summary: Summary) {
  const [accountsResult, questsResult, unlocksResult, activity] = await Promise.all([
    admin.from("accounts").select("*").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("rpg_quests").select("id,quest_type,difficulty,status,completed_at").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("rpg_achievement_unlocks").select("achievement_key").eq("user_id", userId).limit(PAGE_SIZE),
    loadActivity(admin, userId, addDaysToRpgDate(today, -400), today),
  ]);
  if (accountsResult.error || questsResult.error || unlocksResult.error) throw new HttpError(500, "Unable to reconcile achievements.");
  const accounts = accountNumbers(accountsResult.data ?? []);
  const productiveDates = [...activity.tasks.map((item) => item.occurrence_date), ...activity.chores.map((item) => item.completed_on)];
  const completed = (questsResult.data ?? []).filter((quest) => quest.status === "completed");
  const context: AchievementContext = {
    completedQuestCount: completed.length,
    currentStreak: productiveStreak(productiveDates, today),
    investmentAccountCount: accounts.investmentAccountCount,
    investedBalance: accounts.investedBalance,
    netWorth: accounts.netWorth,
    completedMainDifficulties: completed.filter((quest) => quest.quest_type === "main").map((quest) => quest.difficulty as RpgDifficulty),
  };
  const existing = (unlocksResult.data ?? []).map((unlock) => unlock.achievement_key);
  for (const definition of achievementUnlocks(context, existing)) {
    const unlockedAt = new Date().toISOString();
    const { data, error } = await admin.from("rpg_achievement_unlocks").upsert({
      user_id: userId, achievement_key: definition.key, source_type: "reconciliation", unlocked_at: unlockedAt,
      baseline_unlock: baseline, ruleset_version: RPG_RULESET_VERSION,
    }, { onConflict: "user_id,achievement_key", ignoreDuplicates: true }).select("id");
    if (error) throw new HttpError(500, "Unable to unlock achievement.");
    if (!data?.length) { summary.conflicts += 1; continue; }
    summary.created += 1;
    if (!baseline) await awardXp(admin, {
      user_id: userId, event_key: `achievement:${definition.key}`, source_type: "achievement", source_record_id: definition.key,
      qualifying_event: "achievement_unlock", category: definition.category,
      difficulty: ({ common: "easy", uncommon: "medium", rare: "hard", epic: "epic", legendary: "boss" } as const)[definition.rarity],
      base_xp: ACHIEVEMENT_XP[definition.rarity], multiplier: 1, awarded_xp: ACHIEVEMENT_XP[definition.rarity],
      reason: `Unlocked ${definition.name}`, occurred_at: unlockedAt, ruleset_version: RPG_RULESET_VERSION,
      audit_metadata: { rarity: definition.rarity },
    }, summary);
  }
}

async function currentStatBundle(admin: SupabaseClient, userId: string, profile: RpgProfile, today: string, timeZone: string) {
  const currentFrom = addDaysToRpgDate(today, -27);
  const previousFrom = addDaysToRpgDate(today, -55);
  const previousTo = addDaysToRpgDate(today, -28);
  const activity = await loadActivity(admin, userId, previousFrom, today);
  const stats = {} as Record<RpgCategory, number>;
  const deltas = {} as Record<RpgCategory, number>;
  const activityCategories = ["strength", "health", "career", "knowledge", "social"] as const;
  for (const category of activityCategories) {
    const dates = activity.xp.filter((event) => event.category === category && ["task_completion", "quest_completion", "calendar_occurrence"].includes(event.qualifying_event))
      .map((event) => dateKeyInTimeZone(event.occurred_at, timeZone));
    const current = measuredActivityStat({ category, activityDates: dates, from: currentFrom, to: today });
    const previous = measuredActivityStat({ category, activityDates: dates, from: previousFrom, to: previousTo });
    stats[category] = current.value;
    deltas[category] = current.value - previous.value;
  }
  const productiveDates = [...activity.tasks.map((item) => item.occurrence_date), ...activity.chores.map((item) => item.completed_on)];
  const currentProductive = new Set(productiveDates.filter((date) => date >= currentFrom && date <= today)).size;
  const previousProductive = new Set(productiveDates.filter((date) => date >= previousFrom && date <= previousTo)).size;
  const [{ count: currentOverdue }, { count: currentOpen }, { count: previousCompleted }] = await Promise.all([
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open").lt("due_date", today),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "open"),
    admin.from("task_completions").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("occurrence_date", previousFrom).lte("occurrence_date", previousTo),
  ]);
  const currentCompleted = activity.tasks.filter((item) => item.occurrence_date >= currentFrom).length + activity.chores.filter((item) => item.completed_on >= currentFrom).length;
  const currentDiscipline = disciplineStat({
    completionRatio: currentCompleted + (currentOverdue ?? 0) > 0 ? currentCompleted / (currentCompleted + (currentOverdue ?? 0)) : null,
    overduePressure: (currentOpen ?? 0) + currentCompleted > 0 ? (currentOverdue ?? 0) / ((currentOpen ?? 0) + currentCompleted) : null,
    productiveDays: currentProductive || null,
  });
  const previousDiscipline = disciplineStat({ completionRatio: previousCompleted ? 1 : null, overduePressure: null, productiveDays: previousProductive || null });
  stats.discipline = currentDiscipline.value;
  deltas.discipline = currentDiscipline.value - previousDiscipline.value;
  stats.wealth = profile.initial_stats.wealth ?? 50;
  deltas.wealth = 0;
  return { stats, deltas, productiveDates };
}

async function refreshSnapshots(admin: SupabaseClient, userId: string, profile: RpgProfile, today: string, timeZone: string, summary: Summary) {
  const currentWeek = sundayWeekBounds(today);
  const { data: xpData, error: xpError } = await admin.from("rpg_xp_events").select("event_key,category,awarded_xp,base_xp,occurred_at,qualifying_event,audit_metadata").eq("user_id", userId).order("occurred_at").limit(PAGE_SIZE);
  if (xpError) throw new HttpError(500, "Unable to refresh weekly XP history.");
  const xp = (xpData ?? []) as XpRow[];
  const { stats, deltas } = await currentStatBundle(admin, userId, profile, today, timeZone);
  const durableActivity = await loadActivity(admin, userId, dateKeyInTimeZone(profile.initialization_cutoff, timeZone), today);
  const productiveDates = [...durableActivity.tasks.map((item) => item.occurrence_date), ...durableActivity.chores.map((item) => item.completed_on)];
  const [questsResult, achievementsResult, snapshotsResult] = await Promise.all([
    admin.from("rpg_quests").select("id,starts_on,ends_on,status,completed_at").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("rpg_achievement_unlocks").select("achievement_key,unlocked_at,baseline_unlock").eq("user_id", userId).limit(PAGE_SIZE),
    admin.from("rpg_weekly_snapshots").select("week_start,finalized").eq("user_id", userId).limit(PAGE_SIZE),
  ]);
  if (questsResult.error || achievementsResult.error || snapshotsResult.error) throw new HttpError(500, "Unable to refresh weekly snapshots.");
  const finalized = new Set((snapshotsResult.data ?? []).filter((row) => row.finalized).map((row) => row.week_start));
  const weekStarts = new Set<string>([currentWeek.start]);
  for (const event of xp) weekStarts.add(sundayWeekStart(dateKeyInTimeZone(event.occurred_at, timeZone)));
  for (const quest of questsResult.data ?? []) weekStarts.add(sundayWeekStart(quest.starts_on));
  for (const weekStart of [...weekStarts].sort().slice(-52)) {
    if (finalized.has(weekStart)) continue;
    const weekEnd = addDaysToRpgDate(weekStart, 6);
    if (weekEnd < dateKeyInTimeZone(profile.initialization_cutoff, timeZone)) continue;
    const weekXpRows = xp.filter((event) => {
      const date = dateKeyInTimeZone(event.occurred_at, timeZone);
      return date >= weekStart && date <= weekEnd;
    });
    const weekQuests = (questsResult.data ?? []).filter((quest) => quest.starts_on <= weekEnd && (!quest.ends_on || quest.ends_on >= weekStart));
    const completedQuests = weekQuests.filter((quest) => quest.completed_at && dateKeyInTimeZone(quest.completed_at, timeZone) >= weekStart && dateKeyInTimeZone(quest.completed_at, timeZone) <= weekEnd).length;
    const productiveDays = new Set(productiveDates.filter((date) => date >= weekStart && date <= weekEnd)).size;
    const weekXp = weekXpRows.reduce((sum, event) => sum + toNumber(event.awarded_xp), 0);
    const grade = weeklyGrade({ completedQuests, totalQuests: weekQuests.length, productiveDays, xp: weekXp });
    const historicalStats = {} as Record<RpgCategory, number>;
    const historicalDeltas = {} as Record<RpgCategory, number>;
    const windowFrom = addDaysToRpgDate(weekEnd, -27);
    const priorFrom = addDaysToRpgDate(weekEnd, -55);
    const priorTo = addDaysToRpgDate(weekEnd, -28);
    for (const category of ["strength", "health", "career", "knowledge", "social"] as const) {
      const dates = xp.filter((event) => event.category === category && ["task_completion", "quest_completion", "calendar_occurrence"].includes(event.qualifying_event))
        .map((event) => dateKeyInTimeZone(event.occurred_at, timeZone));
      const current = measuredActivityStat({ category, activityDates: dates, from: windowFrom, to: weekEnd });
      const previous = measuredActivityStat({ category, activityDates: dates, from: priorFrom, to: priorTo });
      historicalStats[category] = current.value;
      historicalDeltas[category] = current.value - previous.value;
    }
    const historicalProductive = new Set(productiveDates.filter((date) => date >= windowFrom && date <= weekEnd)).size;
    const priorProductive = new Set(productiveDates.filter((date) => date >= priorFrom && date <= priorTo)).size;
    const historicalDiscipline = disciplineStat({ completionRatio: null, overduePressure: null, productiveDays: historicalProductive || null });
    const priorDiscipline = disciplineStat({ completionRatio: null, overduePressure: null, productiveDays: priorProductive || null });
    historicalStats.discipline = historicalDiscipline.value;
    historicalDeltas.discipline = historicalDiscipline.value - priorDiscipline.value;
    historicalStats.wealth = profile.initial_stats.wealth ?? 50;
    historicalDeltas.wealth = 0;
    const levels = {} as Record<RpgCategory, number>;
    for (const category of RPG_CATEGORIES) {
      const categoryXp = xp.filter((event) => event.category === category && dateKeyInTimeZone(event.occurred_at, timeZone) <= weekEnd).reduce((sum, event) => sum + toNumber(event.awarded_xp), 0);
      levels[category] = categoryLevelProgress(profile.initial_stats[category] ?? 50, categoryXp).level;
    }
    const weekAchievements = (achievementsResult.data ?? []).filter((unlock) => {
      const date = dateKeyInTimeZone(unlock.unlocked_at, timeZone);
      return date >= weekStart && date <= weekEnd;
    });
    const isClosed = weekEnd < today;
    const row = {
      user_id: userId, week_start: weekStart, week_end: weekEnd, finalized: isClosed,
      finalized_at: isClosed ? new Date().toISOString() : null, xp: weekXp,
      stats: weekStart === currentWeek.start ? stats : historicalStats,
      stat_deltas: weekStart === currentWeek.start ? deltas : historicalDeltas,
      category_levels: levels, quests_completed: completedQuests, quests_total: weekQuests.length,
      achievements: weekAchievements, productive_days: productiveDays,
      streak: productiveStreak(productiveDates.filter((date) => date <= weekEnd), weekEnd), grade: grade.grade, grade_score: grade.score,
      ruleset_version: RPG_RULESET_VERSION,
    };
    const { error } = await admin.from("rpg_weekly_snapshots").upsert(row, { onConflict: "user_id,week_start" });
    if (error) throw new HttpError(500, `Unable to save weekly snapshot: ${error.message}`);
    summary.updated += 1;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const startedAt = Date.now();
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    const body = await readJson<Body>(req);
    let actor: Awaited<ReturnType<typeof requireUser>> | ReturnType<typeof requireServiceActor>;
    try {
      actor = await requireUser(req);
    } catch (error) {
      if (!body.user_id) throw error;
      actor = requireServiceActor(req, body.user_id);
    }
    const { user, admin } = actor;
    const scopes = new Set<Scope>(body.scopes?.length ? body.scopes : ["full"]);
    const runs = (scope: Scope) => scopes.has("full") || scopes.has(scope);
    const now = new Date();
    const nowIso = now.toISOString();
    const { profile, initialized, baselinePass } = await ensureProfile(admin, user.id, nowIso);
    const { data: appProfile, error: appProfileError } = await admin.from("profiles").select("timezone").eq("id", user.id).single();
    if (appProfileError) throw new HttpError(500, "Unable to load profile timezone.");
    const timeZone = appProfile?.timezone ?? "America/Toronto";
    const today = dateKeyInTimeZone(now, timeZone);
    const summary: Summary = { scanned: 0, created: 0, conflicts: 0, updated: 0, cursorLagSeconds: Math.max(0, (now.getTime() - new Date(profile.reconciliation_cursor).getTime()) / 1000) };

    if (runs("calendar")) await reconcileCalendar(admin, user.id, profile, now, summary, startedAt);
    if (runs("wealth")) await reconcileWealth(admin, user.id, profile, today, summary);
    if (runs("quest") || runs("task") || runs("goal") || runs("home")) await reconcileQuests(admin, user.id, today, timeZone, summary);
    if (initialized) {
      const baseline = await currentStatBundle(admin, user.id, profile, today, timeZone);
      profile.initial_stats = baseline.stats;
      profile.category_baseline_xp = Object.fromEntries(RPG_CATEGORIES.map((category) => [category, initialCategoryBaselineXp(baseline.stats[category])])) as Record<RpgCategory, number>;
      const { error: baselineError } = await admin.from("rpg_profiles").update({
        initial_stats: profile.initial_stats,
        category_baseline_xp: profile.category_baseline_xp,
      }).eq("user_id", user.id);
      if (baselineError) throw new HttpError(500, "Unable to save LIFE RPG initialization baselines.");
    }
    await reconcileAchievements(admin, user.id, baselinePass, today, summary);
    await refreshSnapshots(admin, user.id, profile, today, timeZone, summary);
    assertWithinDeadline(startedAt);

    const profileUpdate = scopes.has("full")
      ? { reconciliation_cursor: nowIso, last_reconciled_at: nowIso }
      : { last_reconciled_at: nowIso };
    const { error: cursorError } = await admin.from("rpg_profiles").update(profileUpdate).eq("user_id", user.id);
    if (cursorError) throw new HttpError(500, "Unable to advance LIFE RPG reconciliation cursor.");
    console.info(JSON.stringify({ event: "life_rpg_reconciled", user_id: user.id, duration_ms: Date.now() - startedAt, scopes: [...scopes], ...summary }));
    return jsonResponse({ initialized, duration_ms: Date.now() - startedAt, ...summary });
  } catch (error) {
    console.error(JSON.stringify({ event: "life_rpg_reconciliation_failed", duration_ms: Date.now() - startedAt, message: error instanceof Error ? error.message : "Unknown failure" }));
    return safeErrorResponse(error);
  }
});
