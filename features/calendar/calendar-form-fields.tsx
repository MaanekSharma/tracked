"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  RECURRENCE_PRESET_OPTIONS,
  WEEKDAY_SELECTOR_OPTIONS,
  recurrenceFieldsFromPreset,
  recurrencePresetFromFields,
  recurrenceUnitLabel,
  weekdayFromDateInput,
  type RecurrencePresetValue,
} from "@/lib/calendar-recurrence-controls";
import { normalizeRecurrenceAlias, normalizeRecurrenceWeekdays } from "@/lib/calendar-recurrence";
import { cn } from "@/lib/utils";
import type { CalendarEventRecurrence } from "@/types/domain";

function namedElementValue(element: Element | RadioNodeList | null) {
  if (!element) return null;
  if (element instanceof RadioNodeList) return typeof element.value === "string" ? element.value : null;
  return "value" in element && typeof element.value === "string" ? element.value : null;
}

function eventTargetElements(element: Element | RadioNodeList | null) {
  if (!element) return [];
  if (element instanceof RadioNodeList) {
    const elements: Element[] = [];
    for (const item of Array.from(element)) {
      if (item instanceof Element) elements.push(item);
    }
    return elements;
  }
  return [element];
}

export function WeekdaySelector({
  selected,
  onChange,
  inputName,
  showValidation = false,
}: {
  selected: readonly number[];
  onChange: (weekdays: number[]) => void;
  inputName?: string;
  showValidation?: boolean;
}) {
  const normalized = normalizeRecurrenceWeekdays(selected);
  const selectedWeekdays = useMemo(() => new Set(normalized), [normalized]);

  function toggleWeekday(day: number) {
    onChange(
      selectedWeekdays.has(day)
        ? normalized.filter((value) => value !== day)
        : normalizeRecurrenceWeekdays([...normalized, day]),
    );
  }

  return (
    <fieldset className="rounded-md border bg-background px-3 py-2 sm:col-span-2">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Weekdays
      </legend>
      <div className="grid grid-cols-4 gap-2 pt-1 sm:grid-cols-7">
        {WEEKDAY_SELECTOR_OPTIONS.map((day) => {
          const isSelected = selectedWeekdays.has(day.value);
          return (
            <button
              key={day.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggleWeekday(day.value)}
              className={cn(
                "h-9 rounded-md border px-2 text-xs font-bold transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-foreground hover:bg-accent",
              )}
            >
              {day.label}
            </button>
          );
        })}
      </div>
      {inputName
        ? normalized.map((day) => (
            <input key={day} type="hidden" name={inputName} value={day} />
          ))
        : null}
      {showValidation && normalized.length === 0 ? (
        <p role="alert" className="mt-2 text-xs font-medium text-destructive">
          Choose at least one weekday.
        </p>
      ) : null}
    </fieldset>
  );
}

export function CalendarRecurrenceFields({
  name = "recurrence",
  label = "Repeats",
  recurrence = "none",
  interval = 1,
  weekdays,
  endDate,
  count,
  anchorDate,
  anchorFieldName,
}: {
  name?: "recurrence" | "frequency";
  label?: string;
  recurrence?: CalendarEventRecurrence | null;
  interval?: number | null;
  weekdays?: number[] | null;
  endDate?: string | null;
  count?: number | null;
  anchorDate?: string | null;
  anchorFieldName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialRecurrence = normalizeRecurrenceAlias(recurrence, interval ?? 1);
  const initialWeekdays = normalizeRecurrenceWeekdays(weekdays);
  const initialAnchorWeekday = weekdayFromDateInput(anchorDate);
  const [activeRecurrence, setActiveRecurrence] = useState(initialRecurrence.recurrence);
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    initialRecurrence.recurrence === "none" ? 1 : initialRecurrence.recurrenceInterval,
  );
  const [selectedWeekdays, setSelectedWeekdays] = useState(
    initialRecurrence.recurrence === "weekly"
      ? initialWeekdays.length ? initialWeekdays : initialAnchorWeekday === null ? [] : [initialAnchorWeekday]
      : [],
  );
  const [weekdaysManuallyChanged, setWeekdaysManuallyChanged] = useState(Boolean(weekdays?.length));
  const selectedPreset = recurrencePresetFromFields(activeRecurrence, recurrenceInterval, selectedWeekdays);
  const isRecurring = activeRecurrence !== "none";
  const isWeekly = activeRecurrence === "weekly";

  function choosePreset(preset: RecurrencePresetValue) {
    const next = recurrenceFieldsFromPreset(preset, {
      anchorDate: namedElementValue(rootRef.current?.closest("form")?.elements.namedItem(anchorFieldName ?? "") ?? null) ?? anchorDate,
      currentWeekdays: selectedWeekdays,
    });
    setActiveRecurrence(next.recurrence);
    setRecurrenceInterval(next.recurrenceInterval);
    setSelectedWeekdays(next.recurrenceDaysOfWeek);
    setWeekdaysManuallyChanged(preset === "weekdays");
  }

  function changeWeekdays(nextWeekdays: number[]) {
    setSelectedWeekdays(nextWeekdays);
    setWeekdaysManuallyChanged(true);
  }

  useEffect(() => {
    if (!anchorFieldName) return;
    const form = rootRef.current?.closest("form");
    const element = form?.elements.namedItem(anchorFieldName) ?? null;
    const targets = eventTargetElements(element);
    if (!targets.length) return;

    const sync = () => {
      if (activeRecurrence !== "weekly" || weekdaysManuallyChanged) return;
      const anchorWeekday = weekdayFromDateInput(namedElementValue(element)) ?? weekdayFromDateInput(anchorDate);
      if (anchorWeekday === null) return;
      setSelectedWeekdays((current) => {
        if (current.length === 1 && current[0] === anchorWeekday) return current;
        return [anchorWeekday];
      });
    };

    sync();
    for (const target of targets) {
      target.addEventListener("input", sync);
      target.addEventListener("change", sync);
    }

    return () => {
      for (const target of targets) {
        target.removeEventListener("input", sync);
        target.removeEventListener("change", sync);
      }
    };
  }, [activeRecurrence, anchorDate, anchorFieldName, weekdaysManuallyChanged]);

  return (
    <div ref={rootRef} className="contents">
      <input type="hidden" name={name} value={activeRecurrence} />
      <Field label={label}>
        <select
          value={selectedPreset}
          onChange={(event) => choosePreset(event.target.value as RecurrencePresetValue)}
          className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {RECURRENCE_PRESET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      {isRecurring ? (
        <>
          <Field label="Every">
            <div className="flex items-center gap-2">
              <Input
                name="recurrence_interval"
                type="number"
                min="1"
                value={recurrenceInterval}
                onChange={(event) => setRecurrenceInterval(Number(event.target.value))}
              />
              <span className="text-xs text-muted-foreground">{recurrenceUnitLabel(activeRecurrence)}</span>
            </div>
          </Field>
          <Field label="Ends on">
            <Input name="recurrence_end_date" type="date" min={anchorDate ?? undefined} defaultValue={endDate ?? ""} />
          </Field>
          <Field label="Occurrences">
            <Input name="recurrence_count" type="number" min="1" defaultValue={count ?? ""} />
          </Field>
          {isWeekly ? (
            <WeekdaySelector
              inputName="recurrence_days_of_week"
              selected={selectedWeekdays}
              onChange={changeWeekdays}
              showValidation
            />
          ) : null}
        </>
      ) : (
        <>
          <input type="hidden" name="recurrence_interval" value="1" />
          <input type="hidden" name="recurrence_end_date" value="" />
          <input type="hidden" name="recurrence_count" value="" />
        </>
      )}
    </div>
  );
}
