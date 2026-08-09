import type { CalendarEvent, CalendarEventRecurrence, CalendarItem } from "@/types/domain";

export const DEFAULT_CALENDAR_TIME_ZONE = "America/Toronto";

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

const explicitTimeZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const dateKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const localDateTimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function dateKey(parts: DateParts) {
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

function normalizeTimeZone(timeZone?: string | null) {
  return timeZone || DEFAULT_CALENDAR_TIME_ZONE;
}

function parseDateKey(value: string): DateParts {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function utcDateFromKey(value: string) {
  const { year, month, day } = parseDateKey(value);
  return new Date(Date.UTC(year, month - 1, day));
}

function daysBetween(start: string, end: string) {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utcDateFromKey(end).getTime() - utcDateFromKey(start).getTime()) / millisecondsPerDay);
}

export function addDaysToDateKey(value: string, amount: number) {
  const date = utcDateFromKey(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsFromAnchor(anchor: DateParts, amount: number) {
  const monthIndex = anchor.month - 1 + amount;
  const year = anchor.year + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  return dateKey({
    year,
    month,
    day: Math.min(anchor.day, lastDayOfMonth(year, month)),
  });
}

function addYearsFromAnchor(anchor: DateParts, amount: number) {
  const year = anchor.year + amount;
  return dateKey({
    year,
    month: anchor.month,
    day: Math.min(anchor.day, lastDayOfMonth(year, anchor.month)),
  });
}

function weekday(value: string) {
  return utcDateFromKey(value).getUTCDay();
}

function startOfWeek(value: string) {
  return addDaysToDateKey(value, -weekday(value));
}

function getFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

function partsInTimeZone(date: Date, timeZone: string): DateTimeParts {
  const values = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
    millisecond: date.getUTCMilliseconds(),
  };
}

function timeZoneOffsetMilliseconds(date: Date, timeZone: string) {
  const parts = partsInTimeZone(date, timeZone);
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  return localAsUtc - date.getTime();
}

function zonedDateTimeToDate(parts: DateTimeParts, timeZone: string) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond);
  let offset = timeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset);
  const correctedOffset = timeZoneOffsetMilliseconds(result, timeZone);

  if (correctedOffset !== offset) {
    offset = correctedOffset;
    result = new Date(utcGuess - offset);
  }

  return result;
}

function parseLocalDateTime(value: string): DateTimeParts {
  const match = value.match(localDateTimePattern);
  if (!match) throw new Error("Invalid date/time.");

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? "0").padEnd(3, "0")),
  };
}

function parseInstant(value: string | Date, timeZone: string) {
  if (value instanceof Date) return value;
  if (dateKeyPattern.test(value)) return utcDateFromKey(value);
  if (explicitTimeZonePattern.test(value)) return new Date(value);
  if (value.includes("T")) return zonedDateTimeToDate(parseLocalDateTime(value), timeZone);
  return new Date(value);
}

export function dateTimeLocalToIso(value: string, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  return parseInstant(value, normalizeTimeZone(timeZone)).toISOString();
}

export function dateTimeLocalInputValue(value: string | null, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  if (!value) return "";
  const parts = partsInTimeZone(parseInstant(value, normalizeTimeZone(timeZone)), normalizeTimeZone(timeZone));
  return `${dateKey(parts)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function calendarDateKey(value: string | Date, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  if (typeof value === "string" && dateKeyPattern.test(value)) return value;
  return dateKey(partsInTimeZone(parseInstant(value, normalizeTimeZone(timeZone)), normalizeTimeZone(timeZone)));
}

export function calendarEventDateKey(event: CalendarEvent, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  return event.occurrenceDate ?? calendarDateKey(event.start_at, timeZone);
}

export function calendarItemDateKey(item: CalendarItem, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  return item.occurrenceDate ?? calendarDateKey(item.startAt, timeZone);
}

export function normalizeRecurrenceAlias(
  recurrence: CalendarEventRecurrence | "every_2_weeks" | "annually" | null | undefined,
  interval = 1,
) {
  const recurrenceInterval = Math.max(1, Number(interval || 1));

  if (recurrence === "biweekly" || recurrence === "every_2_weeks") {
    return {
      recurrence: "weekly" as const,
      recurrenceInterval: recurrenceInterval * 2,
    };
  }

  if (recurrence === "annually") {
    return {
      recurrence: "yearly" as const,
      recurrenceInterval,
    };
  }

  return {
    recurrence: (recurrence ?? "none") as CalendarEventRecurrence,
    recurrenceInterval,
  };
}

function occurrenceStartAt(item: CalendarItem, occurrenceDate: string, timeZone: string) {
  const start = partsInTimeZone(parseInstant(item.startAt, timeZone), timeZone);
  return zonedDateTimeToDate({ ...start, ...parseDateKey(occurrenceDate) }, timeZone).toISOString();
}

function occurrenceEndAt(item: CalendarItem, startAt: string) {
  if (!item.endAt) return null;
  const duration = new Date(item.endAt).getTime() - new Date(item.startAt).getTime();
  return new Date(new Date(startAt).getTime() + duration).toISOString();
}

function withOccurrence(item: CalendarItem, occurrenceDate: string, timeZone: string): CalendarItem {
  const recurring = normalizeRecurrence(item) !== "none";
  if (!recurring) {
    return {
      ...item,
      occurrenceDate,
    };
  }

  const startAt = occurrenceStartAt(item, occurrenceDate, timeZone);
  return {
    ...item,
    id: `${item.sourceType}_${item.sourceId}_${occurrenceDate}`,
    startAt,
    endAt: occurrenceEndAt(item, startAt),
    seriesId: item.sourceId,
    occurrenceDate,
    isVirtualOccurrence: true,
  };
}

function normalizeRecurrence(item: CalendarItem) {
  return normalizeRecurrenceAlias(item.recurrence, item.recurrenceInterval).recurrence;
}

function normalizeInterval(item: CalendarItem) {
  return normalizeRecurrenceAlias(item.recurrence, item.recurrenceInterval).recurrenceInterval;
}

function normalizeWeekdays(item: CalendarItem, anchorDate: string) {
  const selected = item.recurrenceDaysOfWeek?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) ?? [];
  return selected.length ? [...new Set(selected)].sort((a, b) => a - b) : [weekday(anchorDate)];
}

function effectiveEndDate(item: CalendarItem, rangeEnd: string) {
  return item.recurrenceEndDate && item.recurrenceEndDate < rangeEnd ? item.recurrenceEndDate : rangeEnd;
}

function pushIfInRange(
  occurrences: CalendarItem[],
  item: CalendarItem,
  occurrenceDate: string,
  rangeStart: string,
  rangeEnd: string,
  timeZone: string,
) {
  if (occurrenceDate >= rangeStart && occurrenceDate <= rangeEnd) {
    occurrences.push(withOccurrence(item, occurrenceDate, timeZone));
  }
}

function expandDaily(item: CalendarItem, anchorDate: string, rangeStart: string, rangeEnd: string, timeZone: string) {
  const occurrences: CalendarItem[] = [];
  const interval = normalizeInterval(item);
  const endDate = effectiveEndDate(item, rangeEnd);
  const count = item.recurrenceCount ?? null;

  for (let current = anchorDate, occurrenceIndex = 0; current <= endDate; current = addDaysToDateKey(current, interval), occurrenceIndex += 1) {
    if (count !== null && occurrenceIndex >= count) break;
    pushIfInRange(occurrences, item, current, rangeStart, rangeEnd, timeZone);
  }

  return occurrences;
}

function expandWeekly(item: CalendarItem, anchorDate: string, rangeStart: string, rangeEnd: string, timeZone: string) {
  const occurrences: CalendarItem[] = [];
  const intervalWeeks = normalizeInterval(item);
  const selectedWeekdays = normalizeWeekdays(item, anchorDate);
  const anchorWeekStart = startOfWeek(anchorDate);
  const endDate = effectiveEndDate(item, rangeEnd);
  const count = item.recurrenceCount ?? null;
  let occurrenceIndex = 0;

  for (let current = anchorDate; current <= endDate; current = addDaysToDateKey(current, 1)) {
    const isAnchorDate = current === anchorDate;
    const weekDistance = daysBetween(anchorWeekStart, startOfWeek(current)) / 7;
    const inInterval = weekDistance % intervalWeeks === 0;
    const onSelectedDay = selectedWeekdays.includes(weekday(current));

    if (isAnchorDate || (inInterval && onSelectedDay)) {
      if (count !== null && occurrenceIndex >= count) break;
      pushIfInRange(occurrences, item, current, rangeStart, rangeEnd, timeZone);
      occurrenceIndex += 1;
    }
  }

  return occurrences;
}

function expandMonthly(item: CalendarItem, anchorDate: string, rangeStart: string, rangeEnd: string, timeZone: string, quarterly: boolean) {
  const occurrences: CalendarItem[] = [];
  const anchor = parseDateKey(anchorDate);
  const monthInterval = normalizeInterval(item) * (quarterly ? 3 : 1);
  const endDate = effectiveEndDate(item, rangeEnd);
  const count = item.recurrenceCount ?? null;

  for (let occurrenceIndex = 0; ; occurrenceIndex += 1) {
    if (count !== null && occurrenceIndex >= count) break;
    const current = addMonthsFromAnchor(anchor, occurrenceIndex * monthInterval);
    if (current > endDate) break;
    pushIfInRange(occurrences, item, current, rangeStart, rangeEnd, timeZone);
  }

  return occurrences;
}

function expandYearly(item: CalendarItem, anchorDate: string, rangeStart: string, rangeEnd: string, timeZone: string) {
  const occurrences: CalendarItem[] = [];
  const anchor = parseDateKey(anchorDate);
  const yearInterval = normalizeInterval(item);
  const endDate = effectiveEndDate(item, rangeEnd);
  const count = item.recurrenceCount ?? null;

  for (let occurrenceIndex = 0; ; occurrenceIndex += 1) {
    if (count !== null && occurrenceIndex >= count) break;
    const current = addYearsFromAnchor(anchor, occurrenceIndex * yearInterval);
    if (current > endDate) break;
    pushIfInRange(occurrences, item, current, rangeStart, rangeEnd, timeZone);
  }

  return occurrences;
}

export function expandRecurringItems(
  items: CalendarItem[],
  rangeStart: string | Date,
  rangeEnd: string | Date,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const start = calendarDateKey(rangeStart, normalizedTimeZone);
  const end = calendarDateKey(rangeEnd, normalizedTimeZone);
  const [from, to] = start <= end ? [start, end] : [end, start];

  return items
    .flatMap((item) => {
      const recurrence = normalizeRecurrence(item);
      const anchorDate = calendarDateKey(item.startAt, normalizedTimeZone);

      if (recurrence === "none" || recurrence === null) {
        return anchorDate >= from && anchorDate <= to ? [withOccurrence(item, anchorDate, normalizedTimeZone)] : [];
      }

      if (anchorDate > to) return [];
      if (item.recurrenceEndDate && item.recurrenceEndDate < anchorDate) return [];

      switch (recurrence) {
        case "daily":
          return expandDaily(item, anchorDate, from, to, normalizedTimeZone);
        case "weekly":
          return expandWeekly(item, anchorDate, from, to, normalizedTimeZone);
        case "monthly":
          return expandMonthly(item, anchorDate, from, to, normalizedTimeZone, false);
        case "quarterly":
          return expandMonthly(item, anchorDate, from, to, normalizedTimeZone, true);
        case "yearly":
          return expandYearly(item, anchorDate, from, to, normalizedTimeZone);
        default:
          return [];
      }
    })
    .sort((a, b) => {
      const byDate = calendarItemDateKey(a, normalizedTimeZone).localeCompare(calendarItemDateKey(b, normalizedTimeZone));
      return byDate || a.startAt.localeCompare(b.startAt) || a.sourceType.localeCompare(b.sourceType) || a.sourceId.localeCompare(b.sourceId);
    });
}
