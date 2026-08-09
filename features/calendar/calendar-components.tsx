import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { createCalendarEventAction, deleteCalendarEventAction, updateCalendarEventAction } from "@/features/actions";
import { formatDate, money, todayISO } from "@/lib/utils";
import type { Bill, CalendarEvent, Chore, Task } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckboxField, FormGrid, HiddenRedirect, TextField, TextareaField } from "@/components/ui/form";

type CalendarItem = {
  id: string;
  date: string;
  title: string;
  type: "event" | "task" | "bill" | "chore";
  detail?: string;
};

function eventInputValue(value: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function monthFromParam(month: string | undefined) {
  if (!month) return startOfMonth(new Date());
  return startOfMonth(parse(month, "yyyy-MM", new Date()));
}

export function CalendarMonth({
  month,
  events,
  tasks,
  bills,
  chores,
}: {
  month: string | undefined;
  events: CalendarEvent[];
  tasks: Task[];
  bills: Bill[];
  chores: Chore[];
}) {
  const current = monthFromParam(month);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(current), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(current), { weekStartsOn: 0 }),
  });

  const items: CalendarItem[] = [
    ...events.map((event) => ({
      id: event.id,
      date: event.start_at.slice(0, 10),
      title: event.title,
      type: "event" as const,
      detail: event.location ?? event.category ?? undefined,
    })),
    ...tasks
      .filter((task) => task.due_date)
      .map((task) => ({
        id: task.id,
        date: task.due_date ?? "",
        title: task.title,
        type: "task" as const,
        detail: task.priority,
      })),
    ...bills.map((bill) => ({
      id: bill.id,
      date: bill.next_due_date,
      title: bill.name,
      type: "bill" as const,
      detail: money(bill.amount, true),
    })),
    ...chores
      .filter((chore) => chore.next_due_date)
      .map((chore) => ({
        id: chore.id,
        date: chore.next_due_date ?? "",
        title: chore.title,
        type: "chore" as const,
        detail: chore.room ?? undefined,
      })),
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>{format(current, "MMMM yyyy")}</CardTitle>
          <CardDescription>TRACKED items in one month view.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="icon">
            <Link href={`/calendar?month=${format(subMonths(current, 1), "yyyy-MM")}`} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="icon">
            <Link href={`/calendar?month=${format(addMonths(current, 1), "yyyy-MM")}`} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="bg-muted p-2 text-center font-bold uppercase tracking-wide text-muted-foreground">
              {day}
            </div>
          ))}
          {days.map((day) => {
            const dayItems = items.filter((item) => isSameDay(new Date(`${item.date}T00:00:00`), day)).slice(0, 4);
            return (
              <div key={day.toISOString()} className={`min-h-28 bg-background p-2 ${isSameMonth(day, current) ? "" : "opacity-45"}`}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`font-bold ${format(day, "yyyy-MM-dd") === todayISO() ? "text-primary" : ""}`}>{format(day, "d")}</span>
                </div>
                <div className="space-y-1">
                  {dayItems.map((item) => (
                    <div key={`${item.type}-${item.id}`} className="truncate rounded-sm bg-accent px-2 py-1 text-[0.68rem] text-accent-foreground">
                      <span className="font-bold">{item.type}</span> - {item.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function EventManager({ events }: { events: CalendarEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarPlus className="size-4 text-primary" />
          Calendar events
        </CardTitle>
        <CardDescription>Native TRACKED events. Bills, tasks, and chores appear from their source modules.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form action={createCalendarEventAction} className="rounded-lg border bg-background p-4">
          <HiddenRedirect to="/calendar" />
          <FormGrid>
            <TextField label="Title" name="title" required />
            <TextField label="Start" name="start_at" type="datetime-local" required />
            <TextField label="End" name="end_at" type="datetime-local" />
            <TextField label="Location" name="location" />
            <TextField label="Category" name="category" />
          </FormGrid>
          <CheckboxField label="All day" name="all_day" />
          <TextareaField label="Description" name="description" className="mt-4" />
          <Button type="submit" className="mt-4">Add event</Button>
        </form>

        {events.length ? (
          <div className="space-y-3">
            {events.map((event) => (
              <details key={event.id} className="rounded-lg border bg-background p-4">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{event.title}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(event.start_at)}{event.location ? ` - ${event.location}` : ""}</p>
                    </div>
                    {event.all_day ? <Badge variant="secondary">All day</Badge> : null}
                  </div>
                </summary>
                <form action={updateCalendarEventAction} className="mt-4 border-t pt-4">
                  <HiddenRedirect to="/calendar" />
                  <input type="hidden" name="id" value={event.id} />
                  <FormGrid>
                    <TextField label="Title" name="title" defaultValue={event.title} required />
                    <TextField label="Start" name="start_at" type="datetime-local" defaultValue={eventInputValue(event.start_at)} required />
                    <TextField label="End" name="end_at" type="datetime-local" defaultValue={eventInputValue(event.end_at)} />
                    <TextField label="Location" name="location" defaultValue={event.location} />
                    <TextField label="Category" name="category" defaultValue={event.category} />
                  </FormGrid>
                  <div className="mt-4">
                    <CheckboxField label="All day" name="all_day" defaultChecked={event.all_day} />
                  </div>
                  <TextareaField label="Description" name="description" defaultValue={event.description} className="mt-4" />
                  <Button type="submit" className="mt-4">Save event</Button>
                </form>
                <form action={deleteCalendarEventAction} className="mt-2">
                  <HiddenRedirect to="/calendar" />
                  <input type="hidden" name="id" value={event.id} />
                  <Button type="submit" variant="outline" size="sm">
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </form>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title="No calendar events" description="Create an event here, or add due dates to tasks, bills, and chores." />
        )}
      </CardContent>
    </Card>
  );
}
