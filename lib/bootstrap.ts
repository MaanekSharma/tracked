import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function ensureUserBootstrap(user: User) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();

  if (!profile) {
    await supabase.from("profiles").insert({
      id: user.id,
      display_name: user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? null,
      preferred_currency: "CAD",
      timezone: "America/Toronto",
      theme: "dark",
    });
  }

  const { count } = await supabase
    .from("budget_categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (!count) {
    await supabase.rpc("seed_default_budget_categories");
  }
}
