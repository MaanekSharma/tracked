import { describe, expect, it } from "vitest";
import {
  recurrenceFieldsFromPreset,
  recurrencePresetFromFields,
  weekdayFromDateInput,
} from "@/lib/calendar-recurrence-controls";

describe("calendar recurrence controls", () => {
  it("maps the Every weekday preset to weekly Monday through Friday fields", () => {
    expect(recurrenceFieldsFromPreset("weekdays")).toEqual({
      recurrence: "weekly",
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: [1, 2, 3, 4, 5],
    });
    expect(recurrencePresetFromFields("weekly", 1, [1, 2, 3, 4, 5])).toBe("weekdays");
  });

  it("maps every two weeks to weekly recurrence interval two", () => {
    expect(recurrenceFieldsFromPreset("biweekly", {
      anchorDate: "2026-01-05",
    })).toEqual({
      recurrence: "weekly",
      recurrenceInterval: 2,
      recurrenceDaysOfWeek: [1],
    });
    expect(recurrencePresetFromFields("weekly", 2, [1, 3])).toBe("biweekly");
  });

  it("uses the anchor date weekday until explicit weekdays are supplied", () => {
    expect(weekdayFromDateInput("2026-01-06")).toBe(2);
    expect(weekdayFromDateInput("2026-01-08T09:00")).toBe(4);
    expect(recurrenceFieldsFromPreset("weekly", {
      anchorDate: "2026-01-06",
    }).recurrenceDaysOfWeek).toEqual([2]);
    expect(recurrenceFieldsFromPreset("weekly", {
      anchorDate: "2026-01-06",
      currentWeekdays: [1, 4],
    }).recurrenceDaysOfWeek).toEqual([1, 4]);
  });
});
