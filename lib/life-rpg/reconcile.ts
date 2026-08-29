import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RpgReconciliationScope = "full" | "task" | "calendar" | "wealth" | "goal" | "quest" | "home";

export async function requestLifeRpgReconciliation(
  supabase: SupabaseClient,
  scopes: RpgReconciliationScope[] = ["full"],
) {
  try {
    const { data, error } = await supabase.functions.invoke("life-rpg-reconcile", { body: { scopes } });
    return { data, error: error?.message ?? null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "LIFE RPG reconciliation is unavailable." };
  }
}
