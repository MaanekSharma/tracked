"use client";

import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/browser";

export async function invokePlaidFunction<T>(name: string, body: Record<string, unknown> = {}) {
  const supabase = createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error("Please sign in again before managing bank connections.");
  }

  const response = await fetch(`${env.supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: env.supabaseAnonKey,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to complete the bank connection request.");
  }

  return payload as T;
}
