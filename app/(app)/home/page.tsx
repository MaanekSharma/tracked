import { getBills, getChores } from "@/lib/data";
import { isOverdue } from "@/lib/calculations";
import { ChoreManager, HomeBills } from "@/features/home/home-components";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [bills, chores] = await Promise.all([getBills(false), getChores(true)]);
  const activeChores = chores.filter((chore) => chore.status === "active");
  const overdueChores = activeChores.filter((chore) => isOverdue(chore.next_due_date));

  return (
    <>
      <PageHeader title="Home" description="V1 household tracking for bills and recurring chores." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Active bills" value={String(bills.length)} detail="From Money" />
        <StatCard label="Active chores" value={String(activeChores.length)} detail="Recurring responsibilities" />
        <StatCard label="Overdue chores" value={String(overdueChores.length)} detail="Needs attention" />
      </section>
      <section className="mt-6 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <HomeBills bills={bills} />
        <ChoreManager chores={chores} />
      </section>
    </>
  );
}
