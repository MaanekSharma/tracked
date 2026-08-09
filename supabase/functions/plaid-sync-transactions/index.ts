import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, readJson, safeErrorResponse } from "../_shared/http.ts";
import { requireUser } from "../_shared/supabase.ts";
import { syncPlaidItemByUuid } from "../_shared/plaid-sync.ts";

type SyncBody = {
  plaid_item_id?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const { user, admin } = await requireUser(req);
    const body = await readJson<SyncBody>(req);

    if (body.plaid_item_id) {
      const sync = await syncPlaidItemByUuid(admin, body.plaid_item_id, user.id);
      return jsonResponse({ sync });
    }

    const { data, error } = await admin
      .from("plaid_items")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["connected", "login_required"]);

    if (error) throw new HttpError(500, "Unable to load bank connections.");

    const summaries = [];
    for (const item of data ?? []) {
      summaries.push({
        plaid_item_id: item.id,
        sync: await syncPlaidItemByUuid(admin, item.id, user.id),
      });
    }

    return jsonResponse({ summaries });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
