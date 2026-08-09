import { getBills, getCalendarEvents, getChores, getTasks } from "@/lib/data";
import { CalendarMonth, EventManager } from "@/features/calendar/calendar-components";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const [events, tasks, bills, chores] = await Promise.all([getCalendarEvents(), getTasks("open"), getBills(false), getChores()]);

  return (
    <>
      <PageHeader title="Calendar" description="Internal TRACKED calendar plus dated tasks, bills, and chores." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Events" value={String(events.length)} detail="Native calendar records" />
        <StatCard label="Dated tasks" value={String(tasks.filter((task) => task.due_date).length)} detail="From Tasks" />
        <StatCard label="Active bills" value={String(bills.length)} detail="From Money" />
        <StatCard label="Due chores" value={String(chores.filter((chore) => chore.next_due_date).length)} detail="From Home" />
      </section>
      <section className="mt-6 grid gap-6">
        <CalendarMonth month={month} events={events} tasks={tasks} bills={bills} chores={chores} />
        <EventManager events={events} />
      </section>
    </>
  );
}
