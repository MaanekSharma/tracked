import { calendarEventRecurrenceLabels, type CalendarEventRecurrence } from "@/types/domain";
import { SelectField, TextField } from "@/components/ui/form";

const calendarRecurrenceOptions = [
  { value: "none", label: calendarEventRecurrenceLabels.none },
  { value: "daily", label: calendarEventRecurrenceLabels.daily },
  { value: "weekly", label: calendarEventRecurrenceLabels.weekly },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: calendarEventRecurrenceLabels.monthly },
  { value: "quarterly", label: calendarEventRecurrenceLabels.quarterly },
  { value: "yearly", label: calendarEventRecurrenceLabels.yearly },
];

const weekdayOptions = [
  { value: "0", label: "Sun" },
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
];

export function CalendarRecurrenceFields({
  name = "recurrence",
  label = "Recurrence",
  recurrence = "none",
  interval = 1,
  weekdays,
  endDate,
  count,
}: {
  name?: "recurrence" | "frequency";
  label?: string;
  recurrence?: CalendarEventRecurrence | null;
  interval?: number | null;
  weekdays?: number[] | null;
  endDate?: string | null;
  count?: number | null;
}) {
  const selectedWeekdays = new Set((weekdays ?? []).map(String));

  return (
    <>
      <SelectField label={label} name={name} defaultValue={recurrence ?? "none"} options={calendarRecurrenceOptions} />
      <TextField label="Interval" name="recurrence_interval" type="number" min="1" defaultValue={interval ?? 1} />
      <TextField label="Ends on" name="recurrence_end_date" type="date" defaultValue={endDate} />
      <TextField label="Occurrences" name="recurrence_count" type="number" min="1" defaultValue={count ?? ""} />
      <fieldset className="rounded-md border bg-background px-3 py-2 sm:col-span-2">
        <legend className="px-1 text-sm font-medium">Weekly days</legend>
        <div className="grid grid-cols-4 gap-2 pt-1 sm:grid-cols-7">
          {weekdayOptions.map((day) => (
            <label key={day.value} className="flex items-center gap-1.5 text-sm">
              <input
                name="recurrence_days_of_week"
                type="checkbox"
                value={day.value}
                defaultChecked={selectedWeekdays.has(day.value)}
                className="size-4 accent-primary"
              />
              <span>{day.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}
