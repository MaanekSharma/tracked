import type { AccountBase } from "npm:plaid@45.0.0";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, readJson, safeErrorResponse } from "../_shared/http.ts";
import { upsertPlaidCredential } from "../_shared/plaid-credentials.ts";
import { CountryCode, createPlaidClient } from "../_shared/plaid.ts";
import { requireUser } from "../_shared/supabase.ts";
import { syncPlaidItemByUuid, upsertPlaidAccounts } from "../_shared/plaid-sync.ts";

type ExchangeBody = {
  public_token?: string;
  institution?: {
    institution_id?: string;
    name?: string;
  } | null;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const { user, admin } = await requireUser(req);
    const body = await readJson<ExchangeBody>(req);
    if (!body.public_token) throw new HttpError(400, "Missing Plaid public token.");

    const plaid = createPlaidClient();
    const exchanged = await plaid.itemPublicTokenExchange({ public_token: body.public_token });
    const accessToken = exchanged.data.access_token;
    const plaidItemId = exchanged.data.item_id;

    const { data: existingItem, error: existingItemError } = await admin
      .from("plaid_items")
      .select("id, user_id")
      .eq("plaid_item_id", plaidItemId)
      .maybeSingle();

    if (existingItemError) throw new HttpError(500, "Unable to check bank connection.");
    if (existingItem && existingItem.user_id !== user.id) {
      throw new HttpError(409, "This bank connection is already linked to another TRACKED user.");
    }

    const itemResponse = await plaid.itemGet({ access_token: accessToken });
    const institutionId = itemResponse.data.item.institution_id ?? body.institution?.institution_id ?? null;
    let institutionName = body.institution?.name ?? null;

    if (institutionId && !institutionName) {
      try {
        const institution = await plaid.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Ca],
        });
        institutionName = institution.data.institution.name;
      } catch {
        institutionName = null;
      }
    }

    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .upsert(
        {
          user_id: user.id,
          plaid_item_id: plaidItemId,
          institution_id: institutionId,
          institution_name: institutionName,
          status: "connected",
          error_code: null,
          error_message: null,
          disconnected_at: null,
        },
        { onConflict: "plaid_item_id" },
      )
      .select("id")
      .single();

    if (itemError || !item) throw new HttpError(500, "Unable to save bank connection.");

    await upsertPlaidCredential(admin, user.id, item.id, accessToken);

    const accounts = await plaid.accountsGet({ access_token: accessToken });
    await upsertPlaidAccounts(admin, user.id, item.id, institutionName, accounts.data.accounts as AccountBase[]);
    const sync = await syncPlaidItemByUuid(admin, item.id, user.id);

    return jsonResponse({
      plaid_item_id: item.id,
      institution_name: institutionName,
      sync,
    });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
