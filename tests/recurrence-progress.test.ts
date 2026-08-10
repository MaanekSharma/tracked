import { format, parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import { getNextRecurrenceDate } from "@/lib/calculations";
import { hasFutureRecurrence } from "@/lib/recurrence-progress";
import type { Recurrence } from "@/types/domain";

function nextDate(from: string, recurrence: Recurrence, interval = 1) {
  const next = getNextRecurrenceDate(parseISO(from), recurrence, interval);
  return next ? format(next, "yyyy-MM-dd") : null;
}

describe("bill and chore recurrence progression", () => {
  it("advances normal recurring items to their next occurrence", () => {
    const next = nextDate("2026-01-01", "weekly");

    expect(next).toBe("2026-01-08");
    expect(hasFutureRecurrence({ nextDate: next, completedCount: 1, recurrenceCount: null, recurrenceEndDate: null })).toBe(true);
  });

  it("does not keep non-recurring items active", () => {
    const next = nextDate("2026-01-01", "none");

    expect(next).toBeNull();
    expect(hasFutureRecurrence({ nextDate: next, completedCount: 1, recurrenceCount: null, recurrenceEndDate: null })).toBe(false);
  });

  it("stops on the final counted occurrence", () => {
    expect(hasFutureRecurrence({ nextDate: "2026-01-08", completedCount: 2, recurrenceCount: 3, recurrenceEndDate: null })).toBe(true);
    expect(hasFutureRecurrence({ nextDate: "2026-01-15", completedCount: 3, recurrenceCount: 3, recurrenceEndDate: null })).toBe(false);
  });

  it("treats recurrence end dates as inclusive for advancement", () => {
    expect(hasFutureRecurrence({ nextDate: "2026-01-15", completedCount: 1, recurrenceCount: null, recurrenceEndDate: "2026-01-15" })).toBe(true);
    expect(hasFutureRecurrence({ nextDate: "2026-01-16", completedCount: 1, recurrenceCount: null, recurrenceEndDate: "2026-01-15" })).toBe(false);
  });

  it("calculates biweekly and monthly next dates for bills and chores", () => {
    expect(nextDate("2026-01-01", "biweekly")).toBe("2026-01-15");
    expect(nextDate("2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("honors recurrence intervals when calculating next dates", () => {
    expect(nextDate("2026-01-01", "weekly", 2)).toBe("2026-01-15");
    expect(nextDate("2026-01-01", "monthly", 2)).toBe("2026-03-01");
  });
});
