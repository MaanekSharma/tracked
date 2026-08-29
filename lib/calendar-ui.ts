import type { EventInput } from "@fullcalendar/react";
import {
  addDaysToDateKey,
  calendarDateKey,
  calendarItemDateKey,
  dateTimeLocalInputValue,
  DEFAULT_CALENDAR_TIME_ZONE,
} from "@/lib/calendar-recurrence";
import type { CalendarItem, CalendarSourceType } from "@/types/domain";

export type CalendarSourcePresentation = {
  label: string;
  color: string;
  contrastColor: string;
  className: string;
};

export const CALENDAR_SOURCE_PRESENTATION: Record<CalendarSourceType, CalendarSourcePresentation> = {
  event: {
    label: "Event",
    color: "#294766",
    contrastColor: "#e5f1ff",
    className: "tracked-calendar-item--event",
  },
  task: {
    label: "Task",
    color: "#413a63",
    contrastColor: "#f1edff",
    className: "tracked-calendar-item--task",
  },
  bill: {
    label: "Bill",
    color: "#5a4324",
    contrastColor: "#fff2cf",
    className: "tracked-calendar-item--bill",
  },
  chore: {
    label: "Chore",
    color: "#244b45",
    contrastColor: "#dcfff8",
    className: "tracked-calendar-item--chore",
  },
};

export type CalendarUiEventExtendedProps = {
  sourceId: string;
  sourceType: CalendarSourceType;
  detail: string | null;
  originalStartAt: string;
  originalEndAt: string | null;
  originalAllDay: boolean;
  recurrence: CalendarItem["recurrence"];
  recurrenceInterval: number;
  recurrenceDaysOfWeek: number[] | null;
  recurrenceEndDate: string | null;
  recurrenceCount: number | null;
  seriesId: string | null;
  seriesStartAt: string | null;
  seriesEndAt: string | null;
  occurrenceDate: string | null;
  isVirtualOccurrence: boolean;
  canMove: boolean;
  canResize: boolean;
  acceptsTimedDrop: boolean;
};

export type CalendarUiEventInput = EventInput & {
  extendedProps: CalendarUiEventExtendedProps;
};

export type CalendarItemDisplayRange = {
  start: string;
  end?: string;
  allDay: boolean;
};

export type CalendarSelectionInput = {
  start: string | Date;
  end: string | Date;
  allDay: boolean;
};

export type CalendarCreateDraft = {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
};

export function isDateOnlyCalendarSource(sourceType: CalendarSourceType) {
  return sourceType === "bill" || sourceType === "chore";
}

export function isCalendarItemAllDay(item: Pick<CalendarItem, "sourceType" | "allDay">) {
  return isDateOnlyCalendarSource(item.sourceType) || item.allDay;
}

export function isCalendarItemMovable(
  item: Pick<CalendarItem, "sourceType" | "scheduleEditable" | "isVirtualOccurrence" | "occurrenceDate" | "seriesStartAt">,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  if (item.scheduleEditable === false) return false;
  if (item.sourceType === "event" || !item.isVirtualOccurrence) return true;
  if (!item.occurrenceDate || !item.seriesStartAt) return false;
  return item.occurrenceDate === calendarDateKey(item.seriesStartAt, timeZone);
}

export function isCalendarItemResizable(item: Pick<CalendarItem, "sourceType" | "allDay">) {
  return item.sourceType === "event" && !isCalendarItemAllDay(item);
}

export function canMoveCalendarSourceToSlot(sourceType: CalendarSourceType, targetAllDay: boolean) {
  return targetAllDay || !isDateOnlyCalendarSource(sourceType);
}

export function canMoveCalendarItemToSlot(
  item: Pick<CalendarItem, "sourceType" | "scheduleEditable" | "isVirtualOccurrence" | "occurrenceDate" | "seriesStartAt">,
  targetAllDay: boolean,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  return isCalendarItemMovable(item, timeZone)
    && canMoveCalendarSourceToSlot(item.sourceType, targetAllDay);
}

export function inclusiveAllDayEndToExclusive(
  inclusiveEnd: string | Date | null | undefined,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  if (!inclusiveEnd) return undefined;
  return addDaysToDateKey(calendarDateKey(inclusiveEnd, timeZone), 1);
}

export function exclusiveAllDayEndToInclusive(
  exclusiveEnd: string | Date,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  return addDaysToDateKey(calendarDateKey(exclusiveEnd, timeZone), -1);
}

export function calendarItemDisplayStart(
  item: CalendarItem,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  return isCalendarItemAllDay(item) ? calendarItemDateKey(item, timeZone) : item.startAt;
}

export function calendarItemDisplayEnd(
  item: CalendarItem,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  if (!isCalendarItemAllDay(item)) return item.endAt ?? undefined;
  if (item.sourceType !== "event") return undefined;
  return inclusiveAllDayEndToExclusive(item.endAt, timeZone);
}

export function calendarItemDisplayRange(
  item: CalendarItem,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
): CalendarItemDisplayRange {
  const end = calendarItemDisplayEnd(item, timeZone);
  return {
    start: calendarItemDisplayStart(item, timeZone),
    ...(end ? { end } : {}),
    allDay: isCalendarItemAllDay(item),
  };
}

export function calendarItemToEventInput(
  item: CalendarItem,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
): CalendarUiEventInput {
  const display = calendarItemDisplayRange(item, timeZone);
  const presentation = CALENDAR_SOURCE_PRESENTATION[item.sourceType];
  const canMove = isCalendarItemMovable(item, timeZone);
  const canResize = isCalendarItemResizable(item);
  const acceptsTimedDrop = canMoveCalendarItemToSlot(item, false, timeZone);

  return {
    id: item.id,
    title: item.title,
    start: display.start,
    ...(display.end ? { end: display.end } : {}),
    allDay: display.allDay,
    interactive: true,
    startEditable: canMove,
    durationEditable: canResize,
    allow: (span) => canMoveCalendarItemToSlot(item, span.allDay, timeZone),
    color: presentation.color,
    contrastColor: presentation.contrastColor,
    className: `tracked-calendar-item ${presentation.className}`,
    extendedProps: {
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      detail: item.detail ?? null,
      originalStartAt: item.startAt,
      originalEndAt: item.endAt,
      originalAllDay: item.allDay,
      recurrence: item.recurrence,
      recurrenceInterval: item.recurrenceInterval,
      recurrenceDaysOfWeek: item.recurrenceDaysOfWeek ? [...item.recurrenceDaysOfWeek] : null,
      recurrenceEndDate: item.recurrenceEndDate,
      recurrenceCount: item.recurrenceCount,
      seriesId: item.seriesId ?? null,
      seriesStartAt: item.seriesStartAt ?? null,
      seriesEndAt: item.seriesEndAt ?? null,
      occurrenceDate: item.occurrenceDate ?? null,
      isVirtualOccurrence: item.isVirtualOccurrence ?? false,
      canMove,
      canResize,
      acceptsTimedDrop,
    },
  };
}

export function calendarItemsToEventInputs(
  items: CalendarItem[],
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
) {
  return items.map((item) => calendarItemToEventInput(item, timeZone));
}

function selectionValue(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function localDateAndTime(value: string | Date, timeZone: string) {
  const [date, time] = dateTimeLocalInputValue(selectionValue(value), timeZone).split("T");
  return { date, time };
}

export function calendarSelectionToDraft(
  selection: CalendarSelectionInput,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
): CalendarCreateDraft {
  if (selection.allDay) {
    const startDate = calendarDateKey(selection.start, timeZone);
    const inclusiveEnd = exclusiveAllDayEndToInclusive(selection.end, timeZone);

    return {
      allDay: true,
      startDate,
      endDate: inclusiveEnd < startDate ? startDate : inclusiveEnd,
      startTime: "",
      endTime: "",
    };
  }

  const start = localDateAndTime(selection.start, timeZone);
  const end = localDateAndTime(selection.end, timeZone);
  return {
    allDay: false,
    startDate: start.date,
    endDate: end.date,
    startTime: start.time,
    endTime: end.time,
  };
}
