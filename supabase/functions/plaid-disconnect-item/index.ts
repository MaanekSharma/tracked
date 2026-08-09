import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, readJson, safeErrorResponse } from "../_shared/http.ts";
import { deletePlaidCredential, getPlaidAccessToken } from "../_shared/plaid-credentials.ts";
import { createPlaidClient, plaidError } from "../_shared/plaid.ts";
import { requireUser } from "../_shared/supabase.ts";

type DisconnectBody = {
  plaid_item_id?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const { user, admin } = await requireUser(req);
    const body = await readJson<DisconnectBody>(req);
    if (!body.plaid_item_id) throw new HttpError(400, "Missing bank connection id.");

    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .select("id, user_id")
      .eq("id", body.plaid_item_id)
      .eq("user_id", user.id)
      .single();

    if (itemError || !item) throw new HttpError(404, "Bank connection was not found.");

    let accessToken: string | null = null;
    try {
      accessToken = await getPlaidAccessToken(admin, item.id);
    } catch {
      accessToken = null;
    }

    if (accessToken) {
      try {
        await createPlaidClient().itemRemove({ access_token: accessToken });
      } catch (error) {
        const parsed = plaidError(error);
        if (!["INVALID_ACCESS_TOKEN", "ITEM_NOT_FOUND"].includes(parsed?.error_code ?? "")) {
          throw new HttpError(502, "Plaid could not remove this bank connection. Please try again.");
        }
      }
    }

    await deletePlaidCredential(admin, item.id);

    const disconnectedAt = new Date().toISOString();
    const { error: updateItemError } = await admin
      .from("plaid_items")
      .update({
        status: "disconnected",
        disconnected_at: disconnectedAt,
        error_code: null,
        error_message: null,
      })
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (updateItemError) throw new HttpError(500, "Unable to disconnect this bank.");

    await admin
      .from("accounts")
      .update({
        is_plaid_connected: false,
        plaid_connection_status: "disconnected",
      })
      .eq("user_id", user.id)
      .eq("plaid_item_uuid", item.id);

    return jsonResponse({ ok: true });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
