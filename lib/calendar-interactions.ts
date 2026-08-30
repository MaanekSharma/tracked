import {
  addDaysToDateKey,
  calendarDateKey,
  dateTimeLocalToIso,
  expandRecurringItems,
  normalizeRecurrenceWeekdays,
  normalizeRecurrenceAlias,
} from "@/lib/calendar-recurrence";
import type { CalendarEventRecurrence, CalendarItem, CalendarSourceType } from "@/types/domain";

export type CalendarRecurrenceScope = "occurrence" | "future" | "series";

export type CalendarMutationResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CalendarMutationData = {
  sourceId: string;
  sourceType: CalendarSourceType;
  record: Record<string, unknown> | null;
};

export type CalendarEventEditorInput = {
  title: string;
  startDate: string;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  allDay: boolean;
  category?: string | null;
  location?: string | null;
  description?: string | null;
  recurrence?: CalendarEventRecurrence | "every_2_weeks" | "annually";
  recurrenceInterval?: number;
  recurrenceDaysOfWeek?: number[] | null;
  recurrenceEndDate?: string | null;
  recurrenceCount?: number | null;
};

export type CreateInteractiveCalendarEventInput = CalendarEventEditorInput;

export type UpdateInteractiveCalendarEventInput = CalendarEventEditorInput & {
  sourceId: string;
  scope?: CalendarRecurrenceScope;
};

export type DeleteInteractiveCalendarEventInput = {
  sourceId: string;
  scope?: CalendarRecurrenceScope;
};

export type MoveCalendarItemInput = {
  sourceId: string;
  sourceType: CalendarSourceType;
  /** FullCalendar's original occurrence startStr. */
  originalStartStr: string;
  /** Stable local date supplied by the shared occurrence pipeline, when available. */
  originalOccurrenceDate?: string;
  /** FullCalendar's new startStr. */
  startStr: string;
  /** FullCalendar's new endStr. All-day values are exclusive. */
  endStr?: string | null;
  allDay: boolean;
  scope?: CalendarRecurrenceScope;
};

export type ResizeCalendarEventInput = {
  sourceId: string;
  /** FullCalendar's occurrence startStr after the resize. */
  startStr: string;
  /** FullCalendar's exclusive/timed endStr after the resize. */
  endStr: string;
  scope?: CalendarRecurrenceScope;
};

export type NativeEventScheduleRecord = {
  id: string;
  user_id?: string;
  title?: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  recurrence: CalendarEventRecurrence;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
};

export type TaskScheduleRecord = {
  id: string;
  due_date: string | null;
  due_time: string | null;
  recurrence: CalendarEventRecurrence;
  status: string;
};

export type BillScheduleRecord = {
  id: string;
  next_due_date: string;
  recurring: boolean;
  recurrence: CalendarEventRecurrence;
  active: boolean;
};

export type ChoreScheduleRecord = {
  id: string;
  next_due_date: string | null;
  frequency: CalendarEventRecurrence;
  status: string;
};

export type CalendarMoveSource =
  | { sourceType: "event"; record: NativeEventScheduleRecord }
  | { sourceType: "task"; record: TaskScheduleRecord }
  | { sourceType: "bill"; record: BillScheduleRecord }
  | { sourceType: "chore"; record: ChoreScheduleRecord };

export type CalendarMovePlan =
  | {
      sourceType: "event";
      table: "calendar_events";
      patch: { start_at: string; end_at: string | null; all_day: boolean };
      reconciliationScope: "calendar";
      reconcileBefore: true;
    }
  | {
      sourceType: "task";
      table: "tasks";
      patch: { due_date: string; due_time: string | null };
      reconciliationScope: "task";
      reconcileBefore: false;
    }
  | {
      sourceType: "bill";
      table: "bills";
      patch: { next_due_date: string };
      reconciliationScope: "wealth";
      reconcileBefore: false;
    }
  | {
      sourceType: "chore";
      table: "chores";
      patch: { next_due_date: string };
      reconciliationScope: "home";
      reconcileBefore: false;
    };

export type CalendarEventWrite = {
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  category: string | null;
  recurrence: Exclude<CalendarEventRecurrence, "biweekly">;
  recurrence_interval: number;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_count: number | null;
  timezone: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

function requireDate(value: string, label: string) {
  if (!datePattern.test(value)) throw new Error(`${label} must be a calendar date.`);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${label} must be a valid calendar date.`);
  }
  return value;
}

function normalizeTime(value: string, label: string) {
  const match = value.match(timePattern);
  if (!match) throw new Error(`${label} must be a valid time.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`${label} must be a valid time.`);
  return `${match[1]}:${match[2]}:${String(second).padStart(2, "0")}`;
}

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function daysBetweenDateKeys(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function instant(value: string, timeZone: string) {
  if (datePattern.test(value)) return dateTimeLocalToIso(`${value}T00:00:00`, timeZone);
  return dateTimeLocalToIso(value, timeZone);
}

function localTime(value: string, timeZone: string) {
  const date = new Date(instant(value, timeZone));
  if (Number.isNaN(date.getTime())) throw new Error("Calendar time is invalid.");
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

function eventAsCalendarItem(event: NativeEventScheduleRecord): CalendarItem {
  return {
    id: `event_${event.id}`,
    user_id: event.user_id ?? "",
    sourceId: event.id,
    sourceType: "event",
    title: event.title ?? "Calendar event",
    startAt: event.start_at,
    endAt: event.end_at,
    allDay: event.all_day,
    recurrence: event.recurrence,
    recurrenceInterval: event.recurrence_interval,
    recurrenceDaysOfWeek: event.recurrence_days_of_week,
    recurrenceEndDate: event.recurrence_end_date,
    recurrenceCount: event.recurrence_count,
  };
}

function originalDate(input: MoveCalendarItemInput, timeZone: string) {
  return requireDate(
    input.originalOccurrenceDate ?? calendarDateKey(input.originalStartStr, timeZone),
    "Original occurrence date",
  );
}

function isRecurring(recurrence: CalendarEventRecurrence | null | undefined) {
  return normalizeRecurrenceAlias(recurrence).recurrence !== "none";
}

function requireSeriesScope(scope: CalendarRecurrenceScope | undefined) {
  if (scope !== "series") {
    throw new Error("Recurring items can only be changed for the entire series.");
  }
}

function verifyEventOccurrence(
  event: NativeEventScheduleRecord,
  occurrenceStart: string,
  occurrenceDate: string,
  timeZone: string,
) {
  const occurrences = expandRecurringItems([eventAsCalendarItem(event)], occurrenceDate, occurrenceDate, timeZone);
  const matches = occurrences.some((occurrence) => {
    if (event.all_day) return calendarDateKey(occurrence.startAt, timeZone) === occurrenceDate;
    return new Date(occurrence.startAt).getTime() === new Date(instant(occurrenceStart, timeZone)).getTime();
  });
  if (!matches) throw new Error("This occurrence is stale or is not part of the stored series.");
}

function verifyCurrentDueDate(persistedDate: string | null, input: MoveCalendarItemInput, timeZone: string) {
  if (!persistedDate) throw new Error("This item does not currently have a scheduled date.");
  if (originalDate(input, timeZone) !== persistedDate) {
    throw new Error("Only the currently persisted due occurrence can be moved. Refresh the calendar and try again.");
  }
}

function allDayEventMovePatch(
  event: NativeEventScheduleRecord,
  input: MoveCalendarItemInput,
  timeZone: string,
) {
  const priorOccurrenceDate = originalDate(input, timeZone);
  const targetOccurrenceDate = requireDate(calendarDateKey(input.startStr, timeZone), "New start date");
  const masterDate = calendarDateKey(event.start_at, timeZone);
  const dayDelta = daysBetweenDateKeys(priorOccurrenceDate, targetOccurrenceDate);
  const targetMasterDate = addDaysToDateKey(masterDate, dayDelta);

  let spanDays: number;
  if (input.endStr) {
    const inclusiveOccurrenceEnd = fullCalendarExclusiveEndToInclusiveDate(input.endStr, targetOccurrenceDate, timeZone);
    spanDays = daysBetweenDateKeys(targetOccurrenceDate, inclusiveOccurrenceEnd);
  } else if (event.end_at) {
    spanDays = Math.max(0, daysBetweenDateKeys(masterDate, calendarDateKey(event.end_at, timeZone)));
  } else {
    spanDays = 0;
  }

  return {
    start_at: dateTimeLocalToIso(`${targetMasterDate}T00:00:00`, timeZone),
    end_at: dateTimeLocalToIso(`${addDaysToDateKey(targetMasterDate, spanDays)}T00:00:00`, timeZone),
    all_day: true,
  };
}

function timedEventMovePatch(event: NativeEventScheduleRecord, input: MoveCalendarItemInput, timeZone: string) {
  const oldOccurrenceStart = new Date(instant(input.originalStartStr, timeZone));
  const newOccurrenceStart = new Date(instant(input.startStr, timeZone));
  if (Number.isNaN(oldOccurrenceStart.getTime()) || Number.isNaN(newOccurrenceStart.getTime())) {
    throw new Error("Calendar start is invalid.");
  }

  const delta = newOccurrenceStart.getTime() - oldOccurrenceStart.getTime();
  const masterStart = new Date(event.start_at);
  const nextMasterStart = new Date(masterStart.getTime() + delta);

  let duration: number | null = null;
  if (input.endStr) {
    duration = new Date(instant(input.endStr, timeZone)).getTime() - newOccurrenceStart.getTime();
    if (duration <= 0) throw new Error("Event end must be after its start.");
  } else if (event.end_at) {
    duration = new Date(event.end_at).getTime() - masterStart.getTime();
  }

  return {
    start_at: nextMasterStart.toISOString(),
    end_at: duration === null ? null : new Date(nextMasterStart.getTime() + duration).toISOString(),
    all_day: false,
  };
}

export function fullCalendarExclusiveEndToInclusiveDate(
  endStr: string | null | undefined,
  startDate: string,
  timeZone: string,
) {
  const normalizedStart = requireDate(startDate, "Start date");
  if (!endStr) return normalizedStart;
  const exclusiveEnd = requireDate(calendarDateKey(endStr, timeZone), "End date");
  if (exclusiveEnd <= normalizedStart) throw new Error("All-day end must be after its start.");
  return addDaysToDateKey(exclusiveEnd, -1);
}

export function inclusiveDateToFullCalendarExclusiveEnd(endDate: string) {
  return addDaysToDateKey(requireDate(endDate, "End date"), 1);
}

export function buildCalendarEventWrite(
  input: CalendarEventEditorInput,
  timeZone: string,
): CalendarEventWrite {
  const title = input.title.trim();
  if (!title) throw new Error("Event title is required.");

  const startDate = requireDate(input.startDate, "Start date");
  const providedEndDate = input.endDate ? requireDate(input.endDate, "End date") : null;
  let startAt: string;
  let endAt: string | null;

  if (input.allDay) {
    const endDate = providedEndDate ?? startDate;
    if (endDate < startDate) throw new Error("Event end must be on or after its start.");
    startAt = dateTimeLocalToIso(`${startDate}T00:00:00`, timeZone);
    endAt = dateTimeLocalToIso(`${endDate}T00:00:00`, timeZone);
  } else {
    if (!input.startTime) throw new Error("Timed events require a start time.");
    const startTime = normalizeTime(input.startTime, "Start time");
    startAt = dateTimeLocalToIso(`${startDate}T${startTime}`, timeZone);

    if (providedEndDate && !input.endTime) throw new Error("An end date requires an end time.");
    if (input.endTime) {
      const endDate = providedEndDate ?? startDate;
      const endTime = normalizeTime(input.endTime, "End time");
      endAt = dateTimeLocalToIso(`${endDate}T${endTime}`, timeZone);
      if (new Date(endAt) <= new Date(startAt)) throw new Error("Event end must be after its start.");
    } else {
      endAt = null;
    }
  }

  const normalized = normalizeRecurrenceAlias(input.recurrence ?? "none", input.recurrenceInterval ?? 1);
  const recurring = normalized.recurrence !== "none";
  const recurrenceEndDate = input.recurrenceEndDate
    ? requireDate(input.recurrenceEndDate, "Recurrence end date")
    : null;
  if (recurrenceEndDate && recurrenceEndDate < startDate) {
    throw new Error("Recurrence end date must be on or after the event start date.");
  }
  if (!Number.isInteger(normalized.recurrenceInterval) || normalized.recurrenceInterval < 1) {
    throw new Error("Recurrence interval must be a positive integer.");
  }
  if (input.recurrenceCount !== null && input.recurrenceCount !== undefined) {
    if (!Number.isInteger(input.recurrenceCount) || input.recurrenceCount < 1) {
      throw new Error("Recurrence count must be a positive integer.");
    }
  }

  const providedWeekdays = input.recurrenceDaysOfWeek ?? [];
  const weekdays = normalizeRecurrenceWeekdays(providedWeekdays);
  if (providedWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Recurrence weekdays must be between Sunday and Saturday.");
  }
  if (recurring && normalized.recurrence === "weekly" && weekdays.length === 0) {
    throw new Error("Choose at least one weekday for weekly events.");
  }

  return {
    title,
    description: nullableText(input.description),
    start_at: startAt,
    end_at: endAt,
    all_day: input.allDay,
    location: nullableText(input.location),
    category: nullableText(input.category),
    recurrence: normalized.recurrence as Exclude<CalendarEventRecurrence, "biweekly">,
    recurrence_interval: recurring ? normalized.recurrenceInterval : 1,
    recurrence_days_of_week: recurring && normalized.recurrence === "weekly" ? weekdays : null,
    recurrence_end_date: recurring ? recurrenceEndDate : null,
    recurrence_count: recurring ? (input.recurrenceCount ?? null) : null,
    timezone: timeZone,
  };
}

export function planCalendarItemMove(
  input: MoveCalendarItemInput,
  source: CalendarMoveSource,
  timeZone: string,
): CalendarMovePlan {
  if (input.sourceType !== source.sourceType || input.sourceId !== source.record.id) {
    throw new Error("Calendar source does not match the stored record.");
  }

  switch (source.sourceType) {
    case "event": {
      const occurrenceDate = originalDate(input, timeZone);
      verifyEventOccurrence(source.record, input.originalStartStr, occurrenceDate, timeZone);
      if (isRecurring(source.record.recurrence)) requireSeriesScope(input.scope);
      return {
        sourceType: "event",
        table: "calendar_events",
        patch: input.allDay
          ? allDayEventMovePatch(source.record, input, timeZone)
          : timedEventMovePatch(source.record, input, timeZone),
        reconciliationScope: "calendar",
        reconcileBefore: true,
      };
    }
    case "task": {
      if (source.record.status !== "open") throw new Error("Only open tasks can be moved from the calendar.");
      verifyCurrentDueDate(source.record.due_date, input, timeZone);
      if (isRecurring(source.record.recurrence)) requireSeriesScope(input.scope);
      return {
        sourceType: "task",
        table: "tasks",
        patch: {
          due_date: calendarDateKey(input.startStr, timeZone),
          due_time: input.allDay ? null : localTime(input.startStr, timeZone),
        },
        reconciliationScope: "task",
        reconcileBefore: false,
      };
    }
    case "bill": {
      if (!source.record.active) throw new Error("Only active bills can be moved from the calendar.");
      if (!input.allDay) throw new Error("Bills are date-only and cannot be moved into the time grid.");
      verifyCurrentDueDate(source.record.next_due_date, input, timeZone);
      if (source.record.recurring && isRecurring(source.record.recurrence)) requireSeriesScope(input.scope);
      return {
        sourceType: "bill",
        table: "bills",
        patch: { next_due_date: calendarDateKey(input.startStr, timeZone) },
        reconciliationScope: "wealth",
        reconcileBefore: false,
      };
    }
    case "chore": {
      if (source.record.status !== "active") throw new Error("Only active chores can be moved from the calendar.");
      if (!input.allDay) throw new Error("Chores are date-only and cannot be moved into the time grid.");
      verifyCurrentDueDate(source.record.next_due_date, input, timeZone);
      if (isRecurring(source.record.frequency)) requireSeriesScope(input.scope);
      return {
        sourceType: "chore",
        table: "chores",
        patch: { next_due_date: calendarDateKey(input.startStr, timeZone) },
        reconciliationScope: "home",
        reconcileBefore: false,
      };
    }
  }
}

export function planCalendarEventResize(
  input: ResizeCalendarEventInput,
  event: NativeEventScheduleRecord,
  timeZone: string,
) {
  if (input.sourceId !== event.id) throw new Error("Calendar source does not match the stored event.");
  if (event.all_day) throw new Error("Only timed calendar events can be resized.");

  const occurrenceDate = calendarDateKey(input.startStr, timeZone);
  verifyEventOccurrence(event, input.startStr, occurrenceDate, timeZone);
  if (isRecurring(event.recurrence)) requireSeriesScope(input.scope);

  const occurrenceStart = new Date(instant(input.startStr, timeZone));
  const occurrenceEnd = new Date(instant(input.endStr, timeZone));
  const duration = occurrenceEnd.getTime() - occurrenceStart.getTime();
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Event end must be after its start.");

  const masterStart = new Date(event.start_at);
  return {
    end_at: new Date(masterStart.getTime() + duration).toISOString(),
  };
}
