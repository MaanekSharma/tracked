import { getGoalPercent } from "@/lib/calculations";
import { getGoals, getGoalUpdates } from "@/lib/data";
import { GoalManager } from "@/features/goals/goal-components";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [goals, updates] = await Promise.all([getGoals(true), getGoalUpdates()]);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const averageProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((total, goal) => total + getGoalPercent(goal), 0) / activeGoals.length)
    : 0;

  return (
    <>
      <PageHeader title="Goals" description="Measurable personal progress with current values and update history." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active goals" value={String(activeGoals.length)} detail="Shown on Overview" />
        <StatCard label="Average progress" value={`${averageProgress}%`} detail="Across active goals" />
        <StatCard label="Updates logged" value={String(updates.length)} detail="Historical records" />
      </section>
      <section className="mt-6">
        <GoalManager goals={goals} updates={updates} />
      </section>
    </>
  );
}
