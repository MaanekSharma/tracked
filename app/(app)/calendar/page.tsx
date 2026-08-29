import {
  endOfMonth,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { CalendarExperience } from "@/features/calendar/calendar-experience";
import { calendarDateKey, DEFAULT_CALENDAR_TIME_ZONE } from "@/lib/calendar-recurrence";
import {
  buildCalendarItemsFromSources,
  getBills,
  getCalendarEvents,
  getChores,
  getProfileData,
  getTasks,
} from "@/lib/data";

type CalendarView = "month" | "week" | "day";

function calendarView(value: string | string[] | undefined): CalendarView {
  return value === "month" || value === "day" || value === "week" ? value : "week";
}

function calendarDate(value: string | string[] | undefined, fallback: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function visibleCalendarRange(date: string, view: CalendarView) {
  const anchor = parse(date, "yyyy-MM-dd", new Date());

  if (view === "day") return { from: date, to: date };
  if (view === "week") {
    return {
      from: format(startOfWeek(anchor, { weekStartsOn: 0 }), "yyyy-MM-dd"),
      to: format(endOfWeek(anchor, { weekStartsOn: 0 }), "yyyy-MM-dd"),
    };
  }

  return {
    from: format(startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }), "yyyy-MM-dd"),
    to: format(endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }), "yyyy-MM-dd"),
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const profile = await getProfileData();
  const timeZone = profile?.timezone ?? DEFAULT_CALENDAR_TIME_ZONE;
  const today = calendarDateKey(new Date(), timeZone);
  const initialView = calendarView(params.view);
  const initialDate = calendarDate(params.date, today);
  const range = visibleCalendarRange(initialDate, initialView);
  const [events, tasks, bills, chores] = await Promise.all([
    getCalendarEvents(),
    getTasks("open"),
    getBills(false),
    getChores(),
  ]);
  const items = buildCalendarItemsFromSources(
    { events, tasks, bills, chores },
    range,
    { timeZone },
  );

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Plan the week, move what changes, and keep every TRACKED commitment in one place."
        className="mb-4"
      />
      <PageNotice notice={params.notice} error={params.error} />
      <CalendarExperience
        key={`${initialView}-${initialDate}`}
        initialDate={initialDate}
        initialView={initialView}
        items={items}
        events={events}
        tasks={tasks}
        bills={bills}
        chores={chores}
        timeZone={timeZone}
      />
    </>
  );
}
