import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `${name} is not configured.`);
  return value;
}

function keyFromJsonEnv(jsonEnvName: string, legacyEnvName: string) {
  const value = Deno.env.get(jsonEnvName);
  if (value) {
    try {
      const parsed = JSON.parse(value) as Record<string, string | undefined>;
      if (parsed.default) return parsed.default;
      const first = Object.values(parsed).find(Boolean);
      if (first) return first;
    } catch {
      throw new HttpError(500, `${jsonEnvName} is not valid JSON.`);
    }
  }

  return requiredEnv(legacyEnvName);
}

function publishableKey() {
  return keyFromJsonEnv("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
}

function secretKey() {
  return keyFromJsonEnv("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
}

export function createAdminClient(): SupabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), secretKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function requireUser(req: Request): Promise<{ user: User; admin: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Please sign in again before connecting a bank.");

  const authClient = createClient(requiredEnv("SUPABASE_URL"), publishableKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) throw new HttpError(401, "Please sign in again before connecting a bank.");

  return { user, admin: createAdminClient() };
}
