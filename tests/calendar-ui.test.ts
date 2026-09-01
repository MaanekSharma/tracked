import { describe, expect, it } from "vitest";
import {
  CALENDAR_SOURCE_PRESENTATION,
  calendarItemDisplayRange,
  calendarItemsToEventInputs,
  calendarItemToEventInput,
  calendarSelectionToDraft,
  canMoveCalendarItemToSlot,
  exclusiveAllDayEndToInclusive,
  inclusiveAllDayEndToExclusive,
  isCalendarItemResizable,
} from "@/lib/calendar-ui";
import { dateTimeLocalToIso, DEFAULT_CALENDAR_TIME_ZONE } from "@/lib/calendar-recurrence";
import type { CalendarItem, CalendarSourceType } from "@/types/domain";

function calendarItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "event_event-1",
    user_id: "user-1",
    sourceId: "event-1",
    sourceType: "event",
    title: "Planning session",
    startAt: "2026-08-10T14:00:00.000Z",
    endAt: "2026-08-10T15:30:00.000Z",
    allDay: false,
    detail: "Office",
    recurrence: "weekly",
    recurrenceInterval: 2,
    recurrenceDaysOfWeek: [1, 3],
    recurrenceEndDate: "2026-12-31",
    recurrenceCount: 8,
    seriesId: "event-1",
    seriesStartAt: "2026-08-03T14:00:00.000Z",
    seriesEndAt: "2026-08-03T15:30:00.000Z",
    occurrenceDate: "2026-08-10",
    isVirtualOccurrence: true,
    ...overrides,
  };
}

describe("calendarItemToEventInput", () => {
  it("maps a timed native event and preserves source and recurrence metadata", () => {
    const item = calendarItem();
    const result = calendarItemToEventInput(item, DEFAULT_CALENDAR_TIME_ZONE);

    expect(result).toMatchObject({
      id: item.id,
      title: item.title,
      start: item.startAt,
      end: item.endAt,
      allDay: false,
      interactive: true,
      startEditable: true,
      durationEditable: true,
      color: CALENDAR_SOURCE_PRESENTATION.event.color,
      contrastColor: CALENDAR_SOURCE_PRESENTATION.event.contrastColor,
      extendedProps: {
        sourceId: "event-1",
        sourceType: "event",
        detail: "Office",
        originalStartAt: item.startAt,
        originalEndAt: item.endAt,
        originalAllDay: false,
        recurrence: "weekly",
        recurrenceInterval: 2,
        recurrenceDaysOfWeek: [1, 3],
        recurrenceEndDate: "2026-12-31",
        recurrenceCount: 8,
        seriesId: "event-1",
        seriesStartAt: "2026-08-03T14:00:00.000Z",
        seriesEndAt: "2026-08-03T15:30:00.000Z",
        occurrenceDate: "2026-08-10",
        isVirtualOccurrence: true,
        canMove: true,
        canResize: true,
        acceptsTimedDrop: true,
      },
    });
    expect(result.className).toContain("tracked-calendar-item--event");
  });

  it("converts a native all-day event's inclusive local end to FullCalendar's exclusive end", () => {
    const result = calendarItemToEventInput(calendarItem({
      startAt: dateTimeLocalToIso("2026-08-10T00:00", DEFAULT_CALENDAR_TIME_ZONE),
      endAt: dateTimeLocalToIso("2026-08-12T00:00", DEFAULT_CALENDAR_TIME_ZONE),
      allDay: true,
      recurrence: "none",
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: null,
      recurrenceEndDate: null,
      recurrenceCount: null,
      seriesId: null,
      seriesStartAt: undefined,
      seriesEndAt: undefined,
      occurrenceDate: undefined,
      isVirtualOccurrence: undefined,
    }));

    expect(result).toMatchObject({
      start: "2026-08-10",
      end: "2026-08-13",
      allDay: true,
      startEditable: true,
      durationEditable: false,
    });
    expect(result.extendedProps.originalEndAt).toBe("2026-08-12T04:00:00.000Z");
  });

  it.each(["bill", "chore"] as const)("forces date-only %s items into the all-day lane", (sourceType) => {
    const result = calendarItemToEventInput(calendarItem({
      id: `${sourceType}_${sourceType}-1`,
      sourceId: `${sourceType}-1`,
      sourceType,
      startAt: dateTimeLocalToIso("2026-08-14T00:00", DEFAULT_CALENDAR_TIME_ZONE),
      endAt: "2026-08-10T17:00:00.000Z",
      allDay: false,
      seriesStartAt: dateTimeLocalToIso("2026-08-14T00:00", DEFAULT_CALENDAR_TIME_ZONE),
      occurrenceDate: "2026-08-14",
    }));

    expect(result.start).toBe("2026-08-14");
    expect(result.end).toBeUndefined();
    expect(result.allDay).toBe(true);
    expect(result.startEditable).toBe(true);
    expect(result.durationEditable).toBe(false);
    expect(result.extendedProps.acceptsTimedDrop).toBe(false);
    const allow = result.allow as (span: { allDay: boolean }) => boolean;
    expect(allow({ allDay: true })).toBe(true);
    expect(allow({ allDay: false })).toBe(false);
  });

  it("maps all sources and gives each one a restrained, distinct presentation", () => {
    const sourceTypes: CalendarSourceType[] = ["event", "task", "bill", "chore"];
    const results = calendarItemsToEventInputs(
      sourceTypes.map((sourceType, index) => calendarItem({
        id: `${sourceType}-${index}`,
        sourceId: `${sourceType}-${index}`,
        sourceType,
        recurrence: "none",
        isVirtualOccurrence: false,
        seriesId: null,
        seriesStartAt: undefined,
        seriesEndAt: undefined,
      })),
    );

    expect(results).toHaveLength(4);
    expect(new Set(results.map((result) => result.color)).size).toBe(4);
    expect(results.every((result) => result.startEditable === true)).toBe(true);
    expect(results.filter((result) => result.durationEditable)).toHaveLength(1);
  });
});

describe("calendar display and end semantics", () => {
  it("keeps timed values as instants and omits absent ends", () => {
    expect(calendarItemDisplayRange(calendarItem({ endAt: null }))).toEqual({
      start: "2026-08-10T14:00:00.000Z",
      allDay: false,
    });
  });

  it("converts inclusive and exclusive all-day ends in the configured timezone", () => {
    const inclusive = dateTimeLocalToIso("2026-08-12T23:30", DEFAULT_CALENDAR_TIME_ZONE);

    expect(inclusiveAllDayEndToExclusive(inclusive, DEFAULT_CALENDAR_TIME_ZONE)).toBe("2026-08-13");
    expect(exclusiveAllDayEndToInclusive("2026-08-13", DEFAULT_CALENDAR_TIME_ZONE)).toBe("2026-08-12");
  });

  it("allows every source to move, but prevents bills and chores from entering timed slots", () => {
    for (const sourceType of ["event", "task", "bill", "chore"] as const) {
      const item = calendarItem({ sourceType, recurrence: "none", isVirtualOccurrence: false });
      expect(canMoveCalendarItemToSlot(item, true)).toBe(true);
      expect(canMoveCalendarItemToSlot(item, false)).toBe(sourceType === "event" || sourceType === "task");
    }
  });

  it("keeps non-editable source schedules clickable but non-draggable", () => {
    const pausedChore = calendarItem({
      sourceType: "chore",
      scheduleEditable: false,
      recurrence: "none",
      isVirtualOccurrence: false,
    });
    const result = calendarItemToEventInput(pausedChore);

    expect(result.interactive).toBe(true);
    expect(result.startEditable).toBe(false);
    expect(result.extendedProps.canMove).toBe(false);
    expect(canMoveCalendarItemToSlot(pausedChore, true)).toBe(false);
  });

  it.each(["task", "bill", "chore"] as const)(
    "makes a future virtual %s occurrence read-only while leaving the master anchor movable",
    (sourceType) => {
      const seriesStartAt = dateTimeLocalToIso("2026-08-10T09:00", DEFAULT_CALENDAR_TIME_ZONE);
      const anchor = calendarItem({ sourceType, seriesStartAt, occurrenceDate: "2026-08-10" });
      const future = calendarItem({ sourceType, seriesStartAt, occurrenceDate: "2026-08-17" });

      expect(calendarItemToEventInput(anchor).startEditable).toBe(true);
      const futureInput = calendarItemToEventInput(future);
      expect(futureInput).toMatchObject({
        startEditable: false,
        extendedProps: {
          canMove: false,
          acceptsTimedDrop: false,
        },
      });
      const allow = futureInput.allow as (span: { allDay: boolean }) => boolean;
      expect(allow({ allDay: true })).toBe(false);
      expect(canMoveCalendarItemToSlot(future, true)).toBe(false);
    },
  );

  it("only permits timed native calendar events to resize", () => {
    expect(isCalendarItemResizable(calendarItem())).toBe(true);
    expect(isCalendarItemResizable(calendarItem({ allDay: true }))).toBe(false);
    expect(isCalendarItemResizable(calendarItem({ sourceType: "task" }))).toBe(false);
  });
});

describe("calendarSelectionToDraft", () => {
  it("converts an exclusive all-day selection end into an inclusive create draft", () => {
    expect(calendarSelectionToDraft({
      start: dateTimeLocalToIso("2026-08-10T00:00", DEFAULT_CALENDAR_TIME_ZONE),
      end: dateTimeLocalToIso("2026-08-13T00:00", DEFAULT_CALENDAR_TIME_ZONE),
      allDay: true,
    })).toEqual({
      allDay: true,
      startDate: "2026-08-10",
      endDate: "2026-08-12",
      startTime: "",
      endTime: "",
    });
  });

  it("uses local dates and times for a timed selection", () => {
    expect(calendarSelectionToDraft({
      start: new Date("2026-08-10T14:00:00.000Z"),
      end: new Date("2026-08-10T15:30:00.000Z"),
      allDay: false,
    }, DEFAULT_CALENDAR_TIME_ZONE)).toEqual({
      allDay: false,
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      startTime: "10:00",
      endTime: "11:30",
    });
  });

  it("preserves a cross-midnight timed selection's separate end date", () => {
    expect(calendarSelectionToDraft({
      start: dateTimeLocalToIso("2026-08-10T23:30", DEFAULT_CALENDAR_TIME_ZONE),
      end: dateTimeLocalToIso("2026-08-11T00:30", DEFAULT_CALENDAR_TIME_ZONE),
      allDay: false,
    })).toMatchObject({
      startDate: "2026-08-10",
      endDate: "2026-08-11",
      startTime: "23:30",
      endTime: "00:30",
    });
  });
});
