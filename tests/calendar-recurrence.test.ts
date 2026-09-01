import { describe, expect, it } from "vitest";
import {
  calendarDateKey,
  dateTimeLocalToIso,
  DEFAULT_CALENDAR_TIME_ZONE,
  expandRecurringItems,
} from "@/lib/calendar-recurrence";
import type { CalendarItem } from "@/types/domain";

const userId = "user-1";

function calendarItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "event_source-1",
    user_id: userId,
    sourceId: "source-1",
    sourceType: "event",
    title: "Test item",
    startAt: "2026-01-01T15:00:00.000Z",
    endAt: null,
    allDay: false,
    recurrence: "none",
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: null,
    recurrenceEndDate: null,
    recurrenceCount: null,
    ...overrides,
  };
}

function occurrenceDates(items: CalendarItem[]) {
  return items.map((item) => item.occurrenceDate);
}

describe("expandRecurringItems", () => {
  it("generates daily occurrences inside an inclusive date range", () => {
    const items = expandRecurringItems(
      [calendarItem({ recurrence: "daily" })],
      "2026-01-02",
      "2026-01-04",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-02", "2026-01-03", "2026-01-04"]);
  });

  it("generates weekly occurrences on the anchor weekday", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
        }),
      ],
      "2026-01-01",
      "2026-01-20",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
  });

  it("generates weekly occurrences only on selected weekdays after the anchor date", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 3, 5],
        }),
      ],
      "2026-01-05",
      "2026-01-12",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-05", "2026-01-07", "2026-01-09", "2026-01-12"]);
  });

  it("generates weekly Tuesday and Thursday occurrences without forcing an unselected anchor day", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [2, 4],
        }),
      ],
      "2026-01-05",
      "2026-01-15",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-06", "2026-01-08", "2026-01-13", "2026-01-15"]);
  });

  it("generates weekly Monday and Thursday occurrences", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 4],
        }),
      ],
      "2026-01-05",
      "2026-01-15",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-05", "2026-01-08", "2026-01-12", "2026-01-15"]);
  });

  it("generates Monday through Friday occurrences from the weekday preset shape", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-01T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 2, 3, 4, 5],
        }),
      ],
      "2026-01-01",
      "2026-01-09",
    );

    expect(occurrenceDates(items)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
    ]);
  });

  it("generates every two weeks with multiple selected weekdays", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceInterval: 2,
          recurrenceDaysOfWeek: [1, 3],
        }),
      ],
      "2026-01-05",
      "2026-02-05",
    );

    expect(occurrenceDates(items)).toEqual([
      "2026-01-05",
      "2026-01-07",
      "2026-01-19",
      "2026-01-21",
      "2026-02-02",
      "2026-02-04",
    ]);
  });

  it("falls back to the start weekday for legacy weekly records without selected weekdays", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-06T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: null,
        }),
      ],
      "2026-01-06",
      "2026-01-20",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-06", "2026-01-13", "2026-01-20"]);
  });

  it("honors recurrence end dates and counts with multiple weekdays", () => {
    const ending = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 4],
          recurrenceEndDate: "2026-01-12",
        }),
      ],
      "2026-01-01",
      "2026-01-20",
    );
    const counted = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 4],
          recurrenceCount: 3,
        }),
      ],
      "2026-01-01",
      "2026-01-20",
    );

    expect(occurrenceDates(ending)).toEqual(["2026-01-05", "2026-01-08", "2026-01-12"]);
    expect(occurrenceDates(counted)).toEqual(["2026-01-05", "2026-01-08", "2026-01-12"]);
  });

  it("does not generate duplicate occurrences from duplicate selected weekdays", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 1, 4, 4],
        }),
      ],
      "2026-01-05",
      "2026-01-12",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-05", "2026-01-08", "2026-01-12"]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("generates selected weekdays across month and year boundaries", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2025-12-29T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceDaysOfWeek: [1, 3],
        }),
      ],
      "2025-12-29",
      "2026-01-07",
    );

    expect(occurrenceDates(items)).toEqual(["2025-12-29", "2025-12-31", "2026-01-05", "2026-01-07"]);
  });

  it("generates occurrences every two weeks for a biweekly recurrence", () => {
    const biweekly = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "biweekly",
        }),
      ],
      "2026-01-01",
      "2026-02-10",
    );

    const weeklyIntervalTwo = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-05T15:00:00.000Z",
          recurrence: "weekly",
          recurrenceInterval: 2,
        }),
      ],
      "2026-01-01",
      "2026-02-10",
    );

    expect(occurrenceDates(biweekly)).toEqual(["2026-01-05", "2026-01-19", "2026-02-02"]);
    expect(occurrenceDates(weeklyIntervalTwo)).toEqual(occurrenceDates(biweekly));
  });

  it("preserves current January 31 monthly behavior across shorter and leap-year months", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2024-01-31T15:00:00.000Z",
          recurrence: "monthly",
        }),
      ],
      "2024-01-01",
      "2024-04-30",
    );

    expect(occurrenceDates(items)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
  });

  it("generates quarterly occurrences with three-month spacing", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-01-31T15:00:00.000Z",
          recurrence: "quarterly",
        }),
      ],
      "2026-01-01",
      "2026-10-31",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-31", "2026-04-30", "2026-07-31", "2026-10-31"]);
  });

  it("generates yearly occurrences and keeps leap-day behavior anchored to February", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2024-02-29T15:00:00.000Z",
          recurrence: "yearly",
        }),
      ],
      "2024-01-01",
      "2028-12-31",
    );

    expect(occurrenceDates(items)).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("honors recurrence intervals other than one", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          recurrence: "daily",
          recurrenceInterval: 2,
        }),
      ],
      "2026-01-01",
      "2026-01-07",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-01", "2026-01-03", "2026-01-05", "2026-01-07"]);
  });

  it("treats recurrence end dates as inclusive", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          recurrence: "daily",
          recurrenceEndDate: "2026-01-03",
        }),
      ],
      "2026-01-01",
      "2026-01-05",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("limits recurrence count from the master start date", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          recurrence: "daily",
          recurrenceCount: 3,
        }),
      ],
      "2026-01-02",
      "2026-01-10",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-02", "2026-01-03"]);
  });

  it("includes occurrences exactly on from and to boundaries", () => {
    const items = expandRecurringItems(
      [calendarItem({ recurrence: "daily" })],
      "2026-01-01",
      "2026-01-03",
    );

    expect(occurrenceDates(items)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  it("includes a multi-day item that starts before the visible range", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-08-10T04:00:00.000Z",
          endAt: "2026-08-12T04:00:00.000Z",
          allDay: true,
        }),
      ],
      "2026-08-11",
      "2026-08-11",
      DEFAULT_CALENDAR_TIME_ZONE,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.occurrenceDate).toBe("2026-08-10");
  });

  it("includes a recurring multi-day occurrence that overlaps the range boundary", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          startAt: "2026-08-03T04:00:00.000Z",
          endAt: "2026-08-05T04:00:00.000Z",
          allDay: true,
          recurrence: "weekly",
        }),
      ],
      "2026-08-11",
      "2026-08-11",
      DEFAULT_CALENDAR_TIME_ZONE,
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.occurrenceDate).toBe("2026-08-10");
  });

  it("uses stable unique virtual occurrence IDs for recurring items", () => {
    const items = expandRecurringItems(
      [
        calendarItem({
          sourceId: "calendar-123",
          sourceType: "event",
          recurrence: "daily",
        }),
      ],
      "2026-01-01",
      "2026-01-03",
    );

    expect(items.map((item) => item.id)).toEqual([
      "event_calendar-123_2026-01-01",
      "event_calendar-123_2026-01-02",
      "event_calendar-123_2026-01-03",
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.every((item) => item.seriesStartAt === "2026-01-01T15:00:00.000Z")).toBe(true);
  });

  it("keeps near-midnight local times on the intended Toronto calendar day", () => {
    const startAt = dateTimeLocalToIso("2026-08-10T23:30", DEFAULT_CALENDAR_TIME_ZONE);
    const items = expandRecurringItems(
      [calendarItem({ startAt })],
      "2026-08-10",
      "2026-08-10",
      DEFAULT_CALENDAR_TIME_ZONE,
    );

    expect(calendarDateKey(startAt, DEFAULT_CALENDAR_TIME_ZONE)).toBe("2026-08-10");
    expect(items).toHaveLength(1);
    expect(items[0]?.occurrenceDate).toBe("2026-08-10");
  });
});
