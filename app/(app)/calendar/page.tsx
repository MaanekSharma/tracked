import { endOfMonth, endOfWeek, format, parse, startOfMonth, startOfWeek } from "date-fns";
import { getBills, getCalendarEvents, getCalendarItems, getChores, getProfileData, getTasks } from "@/lib/data";
import { CalendarMonth, EventManager } from "@/features/calendar/calendar-components";
import { calendarDateKey, DEFAULT_CALENDAR_TIME_ZONE } from "@/lib/calendar-recurrence";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

function visibleMonthRange(month: string | undefined, timeZone: string) {
  const currentMonth = month ?? calendarDateKey(new Date(), timeZone).slice(0, 7);
  const current = startOfMonth(parse(currentMonth, "yyyy-MM", new Date()));
  return {
    from: format(startOfWeek(startOfMonth(current), { weekStartsOn: 0 }), "yyyy-MM-dd"),
    to: format(endOfWeek(endOfMonth(current), { weekStartsOn: 0 }), "yyyy-MM-dd"),
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const profile = await getProfileData();
  const timeZone = profile?.timezone ?? DEFAULT_CALENDAR_TIME_ZONE;
  const range = visibleMonthRange(month, timeZone);
  const [calendarItems, eventMasters, tasks, bills, chores] = await Promise.all([
    getCalendarItems(range, { timeZone }),
    getCalendarEvents(),
    getTasks("open"),
    getBills(false),
    getChores(),
  ]);

  return (
    <>
      <PageHeader title="Calendar" description="Internal TRACKED calendar plus dated tasks, bills, and chores." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Events" value={String(eventMasters.length)} detail="Native calendar records" />
        <StatCard label="Dated tasks" value={String(tasks.filter((task) => task.due_date).length)} detail="From Tasks" />
        <StatCard label="Active bills" value={String(bills.length)} detail="From Money" />
        <StatCard label="Due chores" value={String(chores.filter((chore) => chore.next_due_date).length)} detail="From Home" />
      </section>
      <section className="mt-6 grid gap-6">
        <CalendarMonth month={month} items={calendarItems} timeZone={timeZone} />
        <EventManager events={eventMasters} timeZone={timeZone} />
      </section>
    </>
  );
}
