import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, safeErrorResponse } from "../_shared/http.ts";
import { verifyPlaidWebhook } from "../_shared/plaid-webhooks.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { syncPlaidItemByPlaidId } from "../_shared/plaid-sync.ts";

type PlaidWebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const rawBody = await req.text();
    await verifyPlaidWebhook(req, rawBody);

    let body: PlaidWebhookBody;
    try {
      body = JSON.parse(rawBody) as PlaidWebhookBody;
    } catch {
      throw new HttpError(400, "Invalid JSON body.");
    }

    if (body.webhook_type !== "TRANSACTIONS" || body.webhook_code !== "SYNC_UPDATES_AVAILABLE" || !body.item_id) {
      return jsonResponse({ ok: true, handled: false });
    }

    const sync = await syncPlaidItemByPlaidId(createAdminClient(), body.item_id);
    return jsonResponse({ ok: true, handled: Boolean(sync) });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
