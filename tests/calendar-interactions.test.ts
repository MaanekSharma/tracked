import { describe, expect, it } from "vitest";
import {
  buildCalendarEventWrite,
  fullCalendarExclusiveEndToInclusiveDate,
  inclusiveDateToFullCalendarExclusiveEnd,
  planCalendarEventResize,
  planCalendarItemMove,
  type BillScheduleRecord,
  type ChoreScheduleRecord,
  type MoveCalendarItemInput,
  type NativeEventScheduleRecord,
  type TaskScheduleRecord,
} from "@/lib/calendar-interactions";
import { DEFAULT_CALENDAR_TIME_ZONE } from "@/lib/calendar-recurrence";

const timeZone = DEFAULT_CALENDAR_TIME_ZONE;

function event(overrides: Partial<NativeEventScheduleRecord> = {}): NativeEventScheduleRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "user-1",
    title: "Planning",
    start_at: "2026-08-10T14:00:00.000Z",
    end_at: "2026-08-10T15:00:00.000Z",
    all_day: false,
    recurrence: "none",
    recurrence_interval: 1,
    recurrence_days_of_week: null,
    recurrence_end_date: null,
    recurrence_count: null,
    ...overrides,
  };
}

function move(overrides: Partial<MoveCalendarItemInput> = {}): MoveCalendarItemInput {
  return {
    sourceId: "11111111-1111-4111-8111-111111111111",
    sourceType: "event",
    originalStartStr: "2026-08-10T10:00:00-04:00",
    originalOccurrenceDate: "2026-08-10",
    startStr: "2026-08-11T10:00:00-04:00",
    endStr: "2026-08-11T11:00:00-04:00",
    allDay: false,
    ...overrides,
  };
}

describe("calendar editor conversion", () => {
  it("converts timed editor fields through the profile timezone", () => {
    const write = buildCalendarEventWrite({
      title: " Focus block ",
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      startTime: "10:00",
      endTime: "11:30",
      allDay: false,
      category: " Career ",
    }, timeZone);

    expect(write).toMatchObject({
      title: "Focus block",
      start_at: "2026-08-10T14:00:00.000Z",
      end_at: "2026-08-10T15:30:00.000Z",
      all_day: false,
      category: "Career",
      recurrence: "none",
      recurrence_interval: 1,
    });
  });

  it("stores all-day end dates inclusively and converts FullCalendar's exclusive end", () => {
    const write = buildCalendarEventWrite({
      title: "Conference",
      startDate: "2026-08-10",
      endDate: "2026-08-12",
      allDay: true,
    }, timeZone);

    expect(write.start_at).toBe("2026-08-10T04:00:00.000Z");
    expect(write.end_at).toBe("2026-08-12T04:00:00.000Z");
    expect(fullCalendarExclusiveEndToInclusiveDate("2026-08-13", "2026-08-10", timeZone)).toBe("2026-08-12");
    expect(inclusiveDateToFullCalendarExclusiveEnd("2026-08-12")).toBe("2026-08-13");
  });

  it("normalizes biweekly recurrence and clears metadata for one-time events", () => {
    const recurring = buildCalendarEventWrite({
      title: "Review",
      startDate: "2026-08-10",
      startTime: "10:00",
      allDay: false,
      recurrence: "biweekly",
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: [3, 1, 3],
      recurrenceCount: 4,
    }, timeZone);
    const oneTime = buildCalendarEventWrite({
      title: "Review",
      startDate: "2026-08-10",
      allDay: true,
      recurrence: "none",
      recurrenceInterval: 9,
      recurrenceDaysOfWeek: [1],
      recurrenceEndDate: "2026-09-01",
      recurrenceCount: 4,
    }, timeZone);

    expect(recurring).toMatchObject({
      recurrence: "weekly",
      recurrence_interval: 2,
      recurrence_days_of_week: [1, 3],
      recurrence_count: 4,
    });
    expect(oneTime).toMatchObject({
      recurrence_interval: 1,
      recurrence_days_of_week: null,
      recurrence_end_date: null,
      recurrence_count: null,
    });
  });
});

describe("native event move and resize planning", () => {
  it("moves a nonrecurring timed event and accepts FullCalendar's new end", () => {
    const plan = planCalendarItemMove(move({ endStr: "2026-08-11T11:30:00-04:00" }), {
      sourceType: "event",
      record: event(),
    }, timeZone);

    expect(plan).toMatchObject({
      table: "calendar_events",
      patch: {
        start_at: "2026-08-11T14:00:00.000Z",
        end_at: "2026-08-11T15:30:00.000Z",
        all_day: false,
      },
      reconciliationScope: "calendar",
      reconcileBefore: true,
    });
  });

  it("moves all-day spans while translating the exclusive selection end", () => {
    const allDayEvent = event({
      start_at: "2026-08-10T04:00:00.000Z",
      end_at: "2026-08-12T04:00:00.000Z",
      all_day: true,
    });
    const plan = planCalendarItemMove(move({
      originalStartStr: "2026-08-10",
      startStr: "2026-08-15",
      endStr: "2026-08-18",
      allDay: true,
    }), { sourceType: "event", record: allDayEvent }, timeZone);

    expect(plan.patch).toEqual({
      start_at: "2026-08-15T04:00:00.000Z",
      end_at: "2026-08-17T04:00:00.000Z",
      all_day: true,
    });
  });

  it("requires whole-series scope and shifts a recurring master by occurrence delta", () => {
    const recurring = event({ recurrence: "daily" });
    const occurrenceMove = move({
      originalStartStr: "2026-08-12T10:00:00-04:00",
      originalOccurrenceDate: "2026-08-12",
      startStr: "2026-08-13T12:00:00-04:00",
      endStr: "2026-08-13T13:00:00-04:00",
    });

    expect(() => planCalendarItemMove(occurrenceMove, { sourceType: "event", record: recurring }, timeZone))
      .toThrow(/entire series/i);

    const plan = planCalendarItemMove(
      { ...occurrenceMove, scope: "series" },
      { sourceType: "event", record: recurring },
      timeZone,
    );
    expect(plan.patch).toEqual({
      start_at: "2026-08-11T16:00:00.000Z",
      end_at: "2026-08-11T17:00:00.000Z",
      all_day: false,
    });
  });

  it("applies a recurring occurrence's resized duration to the master", () => {
    const recurring = event({ recurrence: "daily" });
    expect(() => planCalendarEventResize({
      sourceId: recurring.id,
      startStr: "2026-08-12T10:00:00-04:00",
      endStr: "2026-08-12T12:30:00-04:00",
    }, recurring, timeZone)).toThrow(/entire series/i);

    expect(planCalendarEventResize({
      sourceId: recurring.id,
      startStr: "2026-08-12T10:00:00-04:00",
      endStr: "2026-08-12T12:30:00-04:00",
      scope: "series",
    }, recurring, timeZone)).toEqual({ end_at: "2026-08-10T16:30:00.000Z" });
  });

  it("rejects all-day resize", () => {
    expect(() => planCalendarEventResize({
      sourceId: event().id,
      startStr: "2026-08-10",
      endStr: "2026-08-12",
    }, event({ all_day: true }), timeZone)).toThrow(/timed calendar events/i);
  });
});

describe("source-aware move routing", () => {
  const task: TaskScheduleRecord = {
    id: "22222222-2222-4222-8222-222222222222",
    due_date: "2026-08-12",
    due_time: null,
    recurrence: "none",
    status: "open",
  };
  const bill: BillScheduleRecord = {
    id: "33333333-3333-4333-8333-333333333333",
    next_due_date: "2026-08-12",
    recurring: true,
    recurrence: "monthly",
    active: true,
  };
  const chore: ChoreScheduleRecord = {
    id: "44444444-4444-4444-8444-444444444444",
    next_due_date: "2026-08-12",
    frequency: "none",
    status: "active",
  };

  it("routes task moves to due_date and due_time only", () => {
    const plan = planCalendarItemMove({
      ...move(),
      sourceId: task.id,
      sourceType: "task",
      originalStartStr: "2026-08-12",
      originalOccurrenceDate: "2026-08-12",
      startStr: "2026-08-14T13:15:00-04:00",
      endStr: "2026-08-14T13:45:00-04:00",
      allDay: false,
    }, { sourceType: "task", record: task }, timeZone);

    expect(plan).toMatchObject({
      table: "tasks",
      patch: { due_date: "2026-08-14", due_time: "13:15:00" },
      reconciliationScope: "task",
    });
  });

  it("keeps bills date-only and requires series scope for a recurring cursor", () => {
    const input: MoveCalendarItemInput = {
      ...move(),
      sourceId: bill.id,
      sourceType: "bill",
      originalStartStr: "2026-08-12",
      originalOccurrenceDate: "2026-08-12",
      startStr: "2026-08-14",
      endStr: "2026-08-15",
      allDay: true,
    };

    expect(() => planCalendarItemMove(input, { sourceType: "bill", record: bill }, timeZone)).toThrow(/entire series/i);
    expect(planCalendarItemMove({ ...input, scope: "series" }, { sourceType: "bill", record: bill }, timeZone))
      .toMatchObject({ table: "bills", patch: { next_due_date: "2026-08-14" } });
    expect(() => planCalendarItemMove({ ...input, allDay: false }, { sourceType: "bill", record: bill }, timeZone))
      .toThrow(/date-only/i);
  });

  it("routes a one-time active chore to next_due_date", () => {
    const plan = planCalendarItemMove({
      ...move(),
      sourceId: chore.id,
      sourceType: "chore",
      originalStartStr: "2026-08-12",
      originalOccurrenceDate: "2026-08-12",
      startStr: "2026-08-16",
      endStr: "2026-08-17",
      allDay: true,
    }, { sourceType: "chore", record: chore }, timeZone);

    expect(plan).toMatchObject({
      table: "chores",
      patch: { next_due_date: "2026-08-16" },
      reconciliationScope: "home",
    });
  });

  it("rejects future virtual cursor occurrences and source mismatches", () => {
    expect(() => planCalendarItemMove({
      ...move(),
      sourceId: bill.id,
      sourceType: "bill",
      originalStartStr: "2026-09-12",
      originalOccurrenceDate: "2026-09-12",
      startStr: "2026-09-14",
      allDay: true,
      scope: "series",
    }, { sourceType: "bill", record: bill }, timeZone)).toThrow(/currently persisted due occurrence/i);

    expect(() => planCalendarItemMove({
      ...move(),
      sourceId: task.id,
      sourceType: "bill",
    }, { sourceType: "task", record: task }, timeZone)).toThrow(/does not match/i);
  });
});
