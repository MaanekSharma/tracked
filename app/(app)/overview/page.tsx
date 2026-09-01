import { getLifeRpgDashboard } from "@/lib/life-rpg/dashboard";
import { CharacterDashboard } from "@/features/life-rpg/character-dashboard";
import { PageNotice } from "@/components/ui/page-notice";

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const dashboard = await getLifeRpgDashboard();
  return (
    <>
      <PageNotice notice={params.notice} error={params.error} />
      <CharacterDashboard dashboard={dashboard} />
    </>
  );
}
