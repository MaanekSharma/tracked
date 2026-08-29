import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

export function requestWealthReconciliation(admin: SupabaseClient, userId: string) {
  const work = admin.functions.invoke("life-rpg-reconcile", {
    body: { scopes: ["wealth"], user_id: userId },
  }).then(({ error }) => {
    if (error) console.warn(JSON.stringify({ scope: "life-rpg", event: "wealth_reconciliation_failed", user_id: userId, message: error.message }));
  }).catch((error) => {
    console.warn(JSON.stringify({ scope: "life-rpg", event: "wealth_reconciliation_failed", user_id: userId, message: error instanceof Error ? error.message : "Unknown failure" }));
  });
  EdgeRuntime.waitUntil(work);
}
