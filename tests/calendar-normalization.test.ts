import { describe, expect, it } from "vitest";
import {
  buildCalendarItemsFromSources,
  normalizeBillForCalendar,
  normalizeChoreForCalendar,
  normalizeEventForCalendar,
  normalizeTaskForCalendar,
} from "@/lib/data";
import { calendarDateKey, dateTimeLocalToIso, DEFAULT_CALENDAR_TIME_ZONE } from "@/lib/calendar-recurrence";
import type { Bill, CalendarEvent, Chore, Task } from "@/types/domain";

const userId = "user-1";
const createdAt = "2026-01-01T00:00:00.000Z";

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-1",
    user_id: userId,
    title: "Dentist",
    description: null,
    start_at: "2026-01-02T15:00:00.000Z",
    end_at: null,
    all_day: false,
    location: "Clinic",
    category: "Health",
    recurrence: "none",
    recurrence_interval: 1,
    recurrence_days_of_week: null,
    recurrence_end_date: null,
    recurrence_count: null,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1",
    user_id: userId,
    category_id: null,
    account_id: null,
    name: "Rent",
    amount: 1500,
    next_due_date: "2026-01-01",
    recurring: true,
    recurrence: "monthly",
    recurrence_interval: 1,
    recurrence_days_of_week: null,
    recurrence_end_date: null,
    recurrence_count: null,
    autopay: false,
    active: true,
    notes: null,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    user_id: userId,
    title: "Submit form",
    description: null,
    status: "open",
    priority: "high",
    due_date: "2026-01-03",
    due_time: null,
    recurrence: "none",
    recurrence_interval: 1,
    recurrence_days_of_week: null,
    recurrence_end_date: null,
    recurrence_count: null,
    completed_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

function chore(overrides: Partial<Chore> = {}): Chore {
  return {
    id: "chore-1",
    user_id: userId,
    title: "Vacuum",
    description: null,
    frequency: "weekly",
    recurrence_interval: 1,
    recurrence_days_of_week: [0],
    recurrence_end_date: null,
    recurrence_count: null,
    next_due_date: "2026-01-04",
    last_completed_date: null,
    status: "active",
    room: "Living room",
    created_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

describe("calendar source normalization", () => {
  it("maps calendar events to CalendarItem metadata", () => {
    const item = normalizeEventForCalendar(event());

    expect(item).toMatchObject({
      id: "event_event-1",
      sourceId: "event-1",
      sourceType: "event",
      title: "Dentist",
      startAt: "2026-01-02T15:00:00.000Z",
      detail: "Clinic",
      recurrence: "none",
    });
  });

  it("maps bills from next_due_date and produces recurring virtual metadata", () => {
    const sourceBill = bill();
    const normalized = normalizeBillForCalendar(sourceBill, DEFAULT_CALENDAR_TIME_ZONE);
    const occurrences = buildCalendarItemsFromSources(
      { events: [], bills: [sourceBill], tasks: [], chores: [] },
      { from: "2026-01-01", to: "2026-01-01" },
      { timeZone: DEFAULT_CALENDAR_TIME_ZONE },
    );

    expect(normalized.sourceType).toBe("bill");
    expect(normalized.sourceId).toBe("bill-1");
    expect(calendarDateKey(normalized.startAt, DEFAULT_CALENDAR_TIME_ZONE)).toBe("2026-01-01");
    expect(occurrences[0]).toMatchObject({
      id: "bill_bill-1_2026-01-01",
      sourceType: "bill",
      sourceId: "bill-1",
      seriesId: "bill-1",
      occurrenceDate: "2026-01-01",
      isVirtualOccurrence: true,
    });
  });

  it("maps task due dates and due times correctly", () => {
    const allDayTask = normalizeTaskForCalendar(task(), DEFAULT_CALENDAR_TIME_ZONE);
    const timedTask = normalizeTaskForCalendar(
      task({ due_time: "14:30" }),
      DEFAULT_CALENDAR_TIME_ZONE,
    );

    expect(allDayTask).toMatchObject({
      sourceType: "task",
      allDay: true,
      detail: "high priority",
    });
    expect(allDayTask?.occurrenceDate).toBeUndefined();
    expect(timedTask).toMatchObject({
      sourceType: "task",
      allDay: false,
      startAt: dateTimeLocalToIso("2026-01-03T14:30", DEFAULT_CALENDAR_TIME_ZONE),
    });
  });

  it("maps chores from next_due_date and recurrence metadata", () => {
    const item = normalizeChoreForCalendar(chore(), DEFAULT_CALENDAR_TIME_ZONE);

    expect(item).toMatchObject({
      id: "chore_chore-1",
      sourceType: "chore",
      sourceId: "chore-1",
      title: "Vacuum",
      allDay: true,
      detail: "Living room",
      recurrence: "weekly",
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: [0],
    });
    expect(calendarDateKey(item?.startAt ?? "", DEFAULT_CALENDAR_TIME_ZONE)).toBe("2026-01-04");
  });

  it("marks paused chores as visible schedule details rather than movable items", () => {
    const item = normalizeChoreForCalendar(chore({ status: "paused" }), DEFAULT_CALENDAR_TIME_ZONE);

    expect(item).toMatchObject({
      sourceType: "chore",
      scheduleEditable: false,
    });
  });
});

describe("buildCalendarItemsFromSources", () => {
  it("normalizes, expands, sorts, and keeps source information for mixed sources", () => {
    const items = buildCalendarItemsFromSources(
      {
        events: [event({ id: "event-2", start_at: "2026-01-02T15:00:00.000Z" })],
        bills: [bill({ id: "bill-2", next_due_date: "2026-01-01", recurrence: "weekly" })],
        tasks: [task({ id: "task-2", due_date: "2026-01-03" })],
        chores: [chore({ id: "chore-2", next_due_date: "2026-01-04" })],
      },
      { from: "2026-01-01", to: "2026-01-08" },
      { timeZone: DEFAULT_CALENDAR_TIME_ZONE, activeChoresOnly: true },
    );

    expect(items.map((item) => item.sourceType)).toEqual(["bill", "event", "task", "chore", "bill"]);
    expect(items.map((item) => item.occurrenceDate)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-08",
    ]);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(items.every((item) => item.sourceId.length > 0)).toBe(true);
  });

  it("supports dashboard Today and Upcoming filtering from already-loaded sources", () => {
    const today = "2026-01-05";
    const items = buildCalendarItemsFromSources(
      {
        events: [event({ id: "past-event", start_at: "2026-01-04T15:00:00.000Z" })],
        bills: [bill({ id: "future-bill", next_due_date: "2026-01-07", recurrence: "none", recurring: false })],
        tasks: [task({ id: "today-task", due_date: today })],
        chores: [chore({ id: "recurring-chore", next_due_date: "2026-01-05", frequency: "daily" })],
      },
      { from: today, to: "2026-01-08" },
      { timeZone: DEFAULT_CALENDAR_TIME_ZONE, activeChoresOnly: true },
    );
    const todayItems = items.filter((item) => item.occurrenceDate === today);

    expect(items.map((item) => item.sourceId)).not.toContain("past-event");
    expect(todayItems.map((item) => item.sourceId).sort()).toEqual(["recurring-chore", "today-task"]);
    expect(items.map((item) => item.sourceId)).toContain("future-bill");
    expect(items.filter((item) => item.sourceId === "recurring-chore")).toHaveLength(4);
  });
});
