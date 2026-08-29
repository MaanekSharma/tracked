"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckSquare2,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  ReceiptText,
  Repeat2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createInteractiveCalendarEventAction,
  deleteInteractiveCalendarEventAction,
  updateInteractiveCalendarEventAction,
} from "@/features/calendar/actions";
import type { CalendarCreateDraft, CalendarUiEventExtendedProps } from "@/lib/calendar-ui";
import {
  calendarDateKey,
  dateTimeLocalInputValue,
  DEFAULT_CALENDAR_TIME_ZONE,
} from "@/lib/calendar-recurrence";
import type { CalendarEventEditorInput } from "@/lib/calendar-interactions";
import { CALENDAR_CATEGORY_OPTIONS } from "@/lib/life-rpg";
import { cn, money } from "@/lib/utils";
import type { Bill, CalendarEvent, Chore, Task } from "@/types/domain";

const recurrenceOptions = [
  { value: "none", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
] as const;

const weekdayOptions = [
  { value: 0, label: "S" },
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
];

type EventDialogState =
  | { mode: "create"; draft: CalendarCreateDraft }
  | { mode: "edit"; event: CalendarEvent }
  | null;

export type { EventDialogState };

function splitLocalDateTime(value: string | null, timeZone: string) {
  const local = dateTimeLocalInputValue(value, timeZone);
  const [date = "", time = ""] = local.split("T");
  return { date, time };
}

function mutationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The calendar could not reach the server.";
}

function initialEditorInput(state: Exclude<EventDialogState, null>, timeZone: string): CalendarEventEditorInput {
  if (state.mode === "create") {
    return {
      title: "",
      startDate: state.draft.startDate,
      endDate: state.draft.endDate,
      startTime: state.draft.startTime || "09:00",
      endTime: state.draft.endTime || "09:30",
      allDay: state.draft.allDay,
      category: "",
      location: "",
      description: "",
      recurrence: "none",
      recurrenceInterval: 1,
      recurrenceDaysOfWeek: [],
      recurrenceEndDate: "",
      recurrenceCount: null,
    };
  }

  const start = splitLocalDateTime(state.event.start_at, timeZone);
  const end = splitLocalDateTime(state.event.end_at, timeZone);
  return {
    title: state.event.title,
    startDate: start.date,
    endDate: state.event.all_day
      ? calendarDateKey(state.event.end_at ?? state.event.start_at, timeZone)
      : end.date || start.date,
    startTime: start.time || "09:00",
    endTime: end.time || "",
    allDay: state.event.all_day,
    category: state.event.category ?? "",
    location: state.event.location ?? "",
    description: state.event.description ?? "",
    recurrence: state.event.recurrence,
    recurrenceInterval: state.event.recurrence_interval,
    recurrenceDaysOfWeek: state.event.recurrence_days_of_week ?? [],
    recurrenceEndDate: state.event.recurrence_end_date ?? "",
    recurrenceCount: state.event.recurrence_count,
  };
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </label>
  );
}

export function CalendarEventDialog({
  state,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
  onOpenChange,
}: {
  state: Exclude<EventDialogState, null>;
  timeZone?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CalendarEventEditorInput>(() => initialEditorInput(state, timeZone));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categoryOptions = useMemo(() => {
    const category = values.category?.trim();
    if (!category || CALENDAR_CATEGORY_OPTIONS.some((option) => option.value === category.toLowerCase())) {
      return CALENDAR_CATEGORY_OPTIONS;
    }
    return [...CALENDAR_CATEGORY_OPTIONS, { value: category, label: `${category} (existing)` }];
  }, [values.category]);

  const currentState = state;

  const storedRecurring = currentState.mode === "edit" && currentState.event.recurrence !== "none";
  const selectedWeekdays = new Set(values.recurrenceDaysOfWeek ?? []);

  function update<K extends keyof CalendarEventEditorInput>(key: K, value: CalendarEventEditorInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function toggleAllDay(checked: boolean) {
    setValues((current) => ({
      ...current,
      allDay: checked,
      startTime: current.startTime || "09:00",
      endTime: current.endTime || "09:30",
      endDate: current.endDate || current.startDate,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = currentState.mode === "create"
        ? await createInteractiveCalendarEventAction(values)
        : await updateInteractiveCalendarEventAction({
            ...values,
            sourceId: currentState.event.id,
            ...(storedRecurring ? { scope: "series" as const } : {}),
          });

      if (!result.ok) {
        setError(result.error);
        toast.error("Calendar change failed", { description: result.error });
        return;
      }

      toast.success(currentState.mode === "create" ? "Event scheduled" : "Event updated");
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      const message = mutationErrorMessage(caught);
      setError(message);
      toast.error("Calendar change failed", { description: message });
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (currentState.mode !== "edit") return;
    setPending(true);
    setError(null);
    try {
      const result = await deleteInteractiveCalendarEventAction({
        sourceId: currentState.event.id,
        ...(storedRecurring ? { scope: "series" as const } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        toast.error("Could not delete event", { description: result.error });
        return;
      }
      toast.success(storedRecurring ? "Event series deleted" : "Event deleted");
      onOpenChange(false);
      router.refresh();
    } catch (caught) {
      const message = mutationErrorMessage(caught);
      setError(message);
      toast.error("Could not delete event", { description: message });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <form onSubmit={submit}>
          <DialogHeader className="border-b bg-muted/35 px-5 py-4 pr-12">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <CalendarClock className="size-3.5" />
              {state.mode === "create" ? "New schedule" : storedRecurring ? "Event series" : "Calendar event"}
            </div>
            <DialogTitle>{state.mode === "create" ? "Schedule an event" : "Edit event"}</DialogTitle>
            <DialogDescription>
              {storedRecurring
                ? "Changes here apply to the entire recurring series."
                : "Keep the common details quick; advanced options stay one step away."}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[calc(90vh-9rem)] space-y-5 overflow-y-auto px-5 py-5">
            <Field label="Title">
              <Input
                autoFocus
                required
                value={values.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="What are you making time for?"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <Field label="Type">
                <select disabled className="h-10 rounded-md border bg-muted/45 px-3 text-sm text-muted-foreground">
                  <option>Calendar event</option>
                </select>
              </Field>
              <Field label="Category">
                <select
                  value={values.category ?? ""}
                  onChange={(event) => update("category", event.target.value)}
                  className="h-10 rounded-md border bg-background px-3 text-sm"
                >
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>

            <label className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2.5">
              <span>
                <span className="block text-sm font-semibold">All day</span>
                <span className="block text-xs text-muted-foreground">Place this in the all-day lane.</span>
              </span>
              <input
                type="checkbox"
                checked={values.allDay}
                onChange={(event) => toggleAllDay(event.target.checked)}
                className="size-4 accent-primary"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date">
                <Input type="date" required value={values.startDate} onChange={(event) => update("startDate", event.target.value)} />
              </Field>
              <Field label="End date">
                <Input
                  type="date"
                  required={values.allDay}
                  min={values.startDate}
                  value={values.endDate ?? ""}
                  onChange={(event) => update("endDate", event.target.value)}
                />
              </Field>
              {!values.allDay ? (
                <>
                  <Field label="Start time">
                    <Input type="time" step="900" required value={values.startTime ?? ""} onChange={(event) => update("startTime", event.target.value)} />
                  </Field>
                  <Field label="End time">
                    <Input type="time" step="900" value={values.endTime ?? ""} onChange={(event) => update("endTime", event.target.value)} />
                  </Field>
                </>
              ) : null}
            </div>

            <details className="group rounded-lg border bg-muted/20" open={state.mode === "edit" && storedRecurring}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
                Advanced details
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
                <Field label="Location">
                  <Input value={values.location ?? ""} onChange={(event) => update("location", event.target.value)} placeholder="Optional" />
                </Field>
                <Field label="Repeats">
                  <select
                    value={values.recurrence ?? "none"}
                    onChange={(event) => update("recurrence", event.target.value as CalendarEventEditorInput["recurrence"])}
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                  >
                    {recurrenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
                {(values.recurrence ?? "none") !== "none" ? (
                  <>
                    <Field label="Every">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          value={values.recurrenceInterval ?? 1}
                          onChange={(event) => update("recurrenceInterval", Number(event.target.value))}
                        />
                        <span className="text-xs text-muted-foreground">interval(s)</span>
                      </div>
                    </Field>
                    <Field label="Ends on">
                      <Input
                        type="date"
                        min={values.startDate}
                        value={values.recurrenceEndDate ?? ""}
                        onChange={(event) => update("recurrenceEndDate", event.target.value)}
                      />
                    </Field>
                    <Field label="Maximum occurrences">
                      <Input
                        type="number"
                        min="1"
                        value={values.recurrenceCount ?? ""}
                        onChange={(event) => update("recurrenceCount", event.target.value ? Number(event.target.value) : null)}
                      />
                    </Field>
                    {(values.recurrence === "weekly" || values.recurrence === "biweekly") ? (
                      <fieldset className="sm:col-span-2">
                        <Label>Weekdays</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {weekdayOptions.map((day) => {
                            const selected = selectedWeekdays.has(day.value);
                            return (
                              <button
                                key={day.value}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => update(
                                  "recurrenceDaysOfWeek",
                                  selected
                                    ? [...selectedWeekdays].filter((value) => value !== day.value)
                                    : [...selectedWeekdays, day.value].sort(),
                                )}
                                className={cn(
                                  "size-9 rounded-full border text-xs font-bold transition-colors",
                                  selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                                )}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    ) : null}
                  </>
                ) : null}
                <Field label="Description" className="sm:col-span-2">
                  <Textarea
                    value={values.description ?? ""}
                    onChange={(event) => update("description", event.target.value)}
                    placeholder="Notes, preparation, or context"
                    className="min-h-24"
                  />
                </Field>
              </div>
            </details>

            {error ? <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

            {confirmDelete ? (
              <div className="flex flex-col gap-3 rounded-lg border border-destructive/35 bg-destructive/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  {storedRecurring ? "Delete the entire recurring series?" : "Delete this event?"} This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                  <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={remove}>Delete</Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-muted/25 px-5 py-4">
            <div>
              {state.mode === "edit" && !confirmDelete ? (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? "Saving…" : state.mode === "create" ? "Add to calendar" : "Save changes"}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type CalendarDetailSelection = {
  title: string;
  startStr: string;
  endStr: string;
  allDay: boolean;
  props: CalendarUiEventExtendedProps;
};

function recurrenceText(value: string, interval = 1) {
  if (value === "none") return "One-time";
  if (value === "weekly" && interval === 2) return "Every 2 weeks";
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function CalendarSourceDetailDialog({
  selection,
  tasks,
  bills,
  chores,
  timeZone = DEFAULT_CALENDAR_TIME_ZONE,
  onOpenChange,
}: {
  selection: CalendarDetailSelection | null;
  tasks: Task[];
  bills: Bill[];
  chores: Chore[];
  timeZone?: string;
  onOpenChange: (open: boolean) => void;
}) {
  if (!selection) return null;
  const { sourceId, sourceType } = selection.props;
  const task = sourceType === "task" ? tasks.find((item) => item.id === sourceId) : undefined;
  const bill = sourceType === "bill" ? bills.find((item) => item.id === sourceId) : undefined;
  const chore = sourceType === "chore" ? chores.find((item) => item.id === sourceId) : undefined;
  const Icon = sourceType === "task" ? CheckSquare2 : sourceType === "bill" ? ReceiptText : Home;
  const href = sourceType === "task" ? "/tasks" : sourceType === "bill" ? "/money" : "/home";
  const sourceLabel = sourceType === "task" ? "Task" : sourceType === "bill" ? "Bill" : "Chore";
  const localStart = dateTimeLocalInputValue(selection.startStr, timeZone).replace("T", " · ");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-5" />
          </div>
          <DialogTitle>{selection.title}</DialogTitle>
          <DialogDescription>{sourceLabel} from its TRACKED source module.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 text-sm">
          <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
            <Clock3 className="size-4 text-muted-foreground" />
            <span>{selection.allDay ? calendarDateKey(selection.startStr, timeZone) : localStart}</span>
          </div>
          {selection.props.isVirtualOccurrence ? (
            <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
              <Repeat2 className="size-4 text-muted-foreground" />
              <span>Recurring occurrence · {selection.props.canMove ? "current schedule can move" : "future occurrence is read-only"}</span>
            </div>
          ) : null}
          {task ? (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/25 p-3">
              <div><dt className="text-xs text-muted-foreground">Priority</dt><dd className="mt-1 font-semibold capitalize">{task.priority}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Repeats</dt><dd className="mt-1 font-semibold">{recurrenceText(task.recurrence, task.recurrence_interval)}</dd></div>
              {task.description ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-1">{task.description}</dd></div> : null}
            </dl>
          ) : null}
          {bill ? (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/25 p-3">
              <div><dt className="text-xs text-muted-foreground">Amount</dt><dd className="mt-1 font-semibold">{money(bill.amount, true)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Payment</dt><dd className="mt-1 font-semibold">{bill.autopay ? "Autopay" : "Manual"}</dd></div>
              {bill.notes ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-1">{bill.notes}</dd></div> : null}
            </dl>
          ) : null}
          {chore ? (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/25 p-3">
              <div><dt className="text-xs text-muted-foreground">Room</dt><dd className="mt-1 font-semibold">{chore.room ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Repeats</dt><dd className="mt-1 font-semibold">{recurrenceText(chore.frequency, chore.recurrence_interval)}</dd></div>
              {chore.description ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Notes</dt><dd className="mt-1">{chore.description}</dd></div> : null}
            </dl>
          ) : null}
          {selection.props.detail ? (
            <div className="flex items-center gap-3 text-muted-foreground">
              <MapPin className="size-4" /> {selection.props.detail}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button asChild>
            <Link href={href}>Open {sourceLabel} <ChevronRight className="size-4" /></Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type PendingSeriesChange = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
  revert: () => void;
};

export function CalendarSeriesDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingSeriesChange | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pending) return null;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Repeat2 className="size-5" />
          </div>
          <DialogTitle>{pending.title}</DialogTitle>
          <DialogDescription>{pending.description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <button type="button" disabled className="rounded-lg border px-3 py-2 text-left opacity-45">
            <span className="block text-sm font-semibold">This event</span>
            <span className="block text-xs text-muted-foreground">Occurrence exceptions are not available yet.</span>
          </button>
          <button type="button" disabled className="rounded-lg border px-3 py-2 text-left opacity-45">
            <span className="block text-sm font-semibold">This and future events</span>
            <span className="block text-xs text-muted-foreground">Splitting a series is not available yet.</span>
          </button>
          <div className="rounded-lg border border-primary/45 bg-primary/10 px-3 py-2 text-left">
            <span className="block text-sm font-semibold text-primary">Entire series</span>
            <span className="block text-xs text-muted-foreground">Moves the stored schedule without creating a duplicate occurrence.</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>{busy ? "Saving…" : pending.confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
