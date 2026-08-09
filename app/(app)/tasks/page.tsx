import { getTasks } from "@/lib/data";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";
import { TaskManager, TaskViewNav } from "@/features/tasks/task-components";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : "inbox";
  const [tasks, allOpen, today, completed] = await Promise.all([getTasks(view), getTasks("open"), getTasks("today"), getTasks("completed")]);

  return (
    <>
      <PageHeader title="Tasks" description="A focused personal task manager for inbox, today, upcoming, and completed work." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Open tasks" value={String(allOpen.length)} detail="Incomplete and unarchived" />
        <StatCard label="Due today" value={String(today.length)} detail="Shown on Overview" />
        <StatCard label="Completed" value={String(completed.length)} detail="Historical task record" />
      </section>
      <section className="mt-6">
        <TaskViewNav active={view} />
        <TaskManager tasks={tasks} view={view} />
      </section>
    </>
  );
}
