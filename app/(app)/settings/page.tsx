import { seedDefaultCategoriesAction, updateProfileAction } from "@/features/actions";
import { ThemeSwitcher } from "@/features/settings/theme-switcher";
import { getBudgetCategories, getProfileData } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HiddenRedirect, SelectField, TextField } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { PageNotice } from "@/components/ui/page-notice";
import { StatCard } from "@/components/ui/stat-card";

const themeOptions = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [profile, categories] = await Promise.all([getProfileData(), getBudgetCategories(true)]);

  return (
    <>
      <PageHeader title="Settings" description="Profile, theme, currency, and financial preferences." />
      <PageNotice notice={params.notice} error={params.error} />
      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Currency" value={profile?.preferred_currency ?? "CAD"} detail="V1 supports Canadian dollars" />
        <StatCard label="Timezone" value={profile?.timezone ?? "America/Toronto"} detail="Initial display assumption" />
        <StatCard label="Categories" value={String(categories.length)} detail="Budget configuration" />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Profile preferences</CardTitle>
            <CardDescription>These values can expand later as TRACKED grows into more modules.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateProfileAction} className="space-y-4">
              <HiddenRedirect to="/settings" />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Display name" name="display_name" defaultValue={profile?.display_name} />
                <SelectField label="Preferred currency" name="preferred_currency" defaultValue="CAD" options={[{ value: "CAD", label: "CAD" }]} />
                <TextField label="Timezone" name="timezone" defaultValue={profile?.timezone ?? "America/Toronto"} required />
                <SelectField label="Saved theme preference" name="theme" defaultValue={profile?.theme ?? "dark"} options={themeOptions} />
                <TextField
                  label="Savings rate target"
                  name="savings_rate_target"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={profile?.savings_rate_target}
                />
              </div>
              <Button type="submit">Save settings</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Applies immediately in this browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeSwitcher />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Budget defaults</CardTitle>
              <CardDescription>Restore missing default categories without overwriting existing ones.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={seedDefaultCategoriesAction}>
                <Button type="submit" variant="outline">Seed default categories</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}
