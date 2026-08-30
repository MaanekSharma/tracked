import {
  normalizeRecurrenceAlias,
  normalizeRecurrenceWeekdays,
  weekdayForDateKey,
} from "@/lib/calendar-recurrence";
import type { CalendarEventRecurrence } from "@/types/domain";

export const EVERY_WEEKDAY_DAYS = [1, 2, 3, 4, 5] as const;

export const WEEKDAY_SELECTOR_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

export const RECURRENCE_PRESET_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

export type RecurrencePresetValue = (typeof RECURRENCE_PRESET_OPTIONS)[number]["value"];

export type RecurrenceControlFields = {
  recurrence: Exclude<CalendarEventRecurrence, "biweekly">;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: number[];
};

function sameWeekdays(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length) return false;
  return left.every((day, index) => day === right[index]);
}

export function dateKeyFromDateInput(value: string | null | undefined) {
  const match = value?.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function weekdayFromDateInput(value: string | null | undefined) {
  const dateKey = dateKeyFromDateInput(value);
  return dateKey ? weekdayForDateKey(dateKey) : null;
}

export function recurrencePresetFromFields(
  recurrence: CalendarEventRecurrence | "every_2_weeks" | "annually" | null | undefined,
  interval = 1,
  weekdays: readonly number[] | null | undefined = null,
): RecurrencePresetValue {
  const normalized = normalizeRecurrenceAlias(recurrence, interval);
  const selected = normalizeRecurrenceWeekdays(weekdays);

  if (normalized.recurrence === "weekly") {
    if (normalized.recurrenceInterval === 1 && sameWeekdays(selected, EVERY_WEEKDAY_DAYS)) {
      return "weekdays";
    }
    if (normalized.recurrenceInterval === 2) return "biweekly";
  }

  return normalized.recurrence;
}

export function recurrenceFieldsFromPreset(
  preset: RecurrencePresetValue,
  {
    anchorDate,
    currentWeekdays,
  }: {
    anchorDate?: string | null;
    currentWeekdays?: readonly number[] | null;
  } = {},
): RecurrenceControlFields {
  const selected = normalizeRecurrenceWeekdays(currentWeekdays);
  const anchorWeekday = weekdayFromDateInput(anchorDate);
  const weeklyDays = selected.length ? selected : anchorWeekday === null ? [] : [anchorWeekday];

  switch (preset) {
    case "weekdays":
      return { recurrence: "weekly", recurrenceInterval: 1, recurrenceDaysOfWeek: [...EVERY_WEEKDAY_DAYS] };
    case "weekly":
      return { recurrence: "weekly", recurrenceInterval: 1, recurrenceDaysOfWeek: weeklyDays };
    case "biweekly":
      return { recurrence: "weekly", recurrenceInterval: 2, recurrenceDaysOfWeek: weeklyDays };
    case "daily":
    case "monthly":
    case "quarterly":
    case "yearly":
      return { recurrence: preset, recurrenceInterval: 1, recurrenceDaysOfWeek: [] };
    case "none":
      return { recurrence: "none", recurrenceInterval: 1, recurrenceDaysOfWeek: [] };
  }
}

export function recurrenceUnitLabel(
  recurrence: CalendarEventRecurrence | "every_2_weeks" | "annually" | null | undefined,
) {
  switch (normalizeRecurrenceAlias(recurrence).recurrence) {
    case "daily":
      return "day(s)";
    case "weekly":
    case "biweekly":
      return "week(s)";
    case "monthly":
      return "month(s)";
    case "quarterly":
      return "quarter(s)";
    case "yearly":
      return "year(s)";
    default:
      return "interval(s)";
  }
}
