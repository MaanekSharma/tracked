import { getGoalPercent } from "@/lib/calculations";
import { getGoals, getGoalUpdates, getRpgQuests } from "@/lib/data";
import { GoalsQuestsTabs } from "@/features/life-rpg/goals-quests-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [goals, updates, quests] = await Promise.all([getGoals(true), getGoalUpdates(), getRpgQuests(true)]);
  const activeGoals = goals.filter((goal) => goal.status === "active");
  const averageProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((total, goal) => total + getGoalPercent(goal), 0) / activeGoals.length)
    : 0;

  return (
    <>
      <PageHeader title="Goals & Quests" description="Long-range progress and focused missions, grounded in your real TRACKED activity." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active goals" value={String(activeGoals.length)} detail="Shown on Overview" />
        <StatCard label="Average progress" value={`${averageProgress}%`} detail="Across active goals" />
        <StatCard label="Active quests" value={String(quests.filter((quest) => quest.status === "active").length)} detail="Daily, Weekly, and Main" />
      </section>
      <section className="mt-6">
        <GoalsQuestsTabs goals={goals} updates={updates} quests={quests} defaultTab={params.tab === "quests" ? "quests" : "goals"} />
      </section>
    </>
  );
}
