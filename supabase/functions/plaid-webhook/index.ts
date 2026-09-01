import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, safeErrorResponse } from "../_shared/http.ts";
import { verifyPlaidWebhook } from "../_shared/plaid-webhooks.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { syncPlaidInvestmentsByPlaidId, syncPlaidItemByPlaidId } from "../_shared/plaid-sync.ts";

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

    if (!body.item_id) {
      return jsonResponse({ ok: true, handled: false });
    }

    const admin = createAdminClient();
    if (body.webhook_type === "TRANSACTIONS" && body.webhook_code === "SYNC_UPDATES_AVAILABLE") {
      const sync = await syncPlaidItemByPlaidId(admin, body.item_id);
      return jsonResponse({ ok: true, handled: Boolean(sync), type: "transactions" });
    }

    if (body.webhook_type === "HOLDINGS" && body.webhook_code === "DEFAULT_UPDATE") {
      const sync = await syncPlaidInvestmentsByPlaidId(admin, body.item_id, { holdings: true, transactions: false });
      return jsonResponse({ ok: true, handled: Boolean(sync), type: "holdings" });
    }

    if (
      body.webhook_type === "INVESTMENTS_TRANSACTIONS" &&
      ["DEFAULT_UPDATE", "HISTORICAL_UPDATE"].includes(body.webhook_code ?? "")
    ) {
      const sync = await syncPlaidInvestmentsByPlaidId(admin, body.item_id, { holdings: false, transactions: true });
      return jsonResponse({ ok: true, handled: Boolean(sync), type: "investment_transactions" });
    }

    console.info(JSON.stringify({
      scope: "plaid-webhook",
      event: "ignored",
      webhook_type: body.webhook_type,
      webhook_code: body.webhook_code,
    }));
    return jsonResponse({ ok: true, handled: false });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
