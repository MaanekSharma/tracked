import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { ConfigMissing } from "@/components/shell/config-missing";
import { ensureUserBootstrap } from "@/lib/bootstrap";
import { getAccounts, getBudgetCategories, getProfileData } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <ConfigMissing />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await ensureUserBootstrap(user);
  const [profile, accounts, categories] = await Promise.all([getProfileData(), getAccounts(), getBudgetCategories()]);

  return (
    <AppShell profile={profile} email={user.email ?? null} accounts={accounts} categories={categories}>
      {children}
    </AppShell>
  );
}
