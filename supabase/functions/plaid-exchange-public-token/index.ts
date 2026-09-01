import type { AccountBase } from "npm:plaid@45.0.0";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, readJson, safeErrorResponse } from "../_shared/http.ts";
import { upsertPlaidCredential } from "../_shared/plaid-credentials.ts";
import { CountryCode, createPlaidClient, plaidApiRequest } from "../_shared/plaid.ts";
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
    const exchanged = await plaidApiRequest("public_token_exchange", () => (
      plaid.itemPublicTokenExchange({ public_token: body.public_token! })
    ));
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

    const itemResponse = await plaidApiRequest("item_get_after_exchange", () => (
      plaid.itemGet({ access_token: accessToken })
    ));
    const institutionId = itemResponse.data.item.institution_id ?? body.institution?.institution_id ?? null;
    let institutionName = itemResponse.data.item.institution_name ?? body.institution?.name ?? null;

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

    if (institutionId) {
      const { data: duplicateItem, error: duplicateError } = await admin
        .from("plaid_items")
        .select("id, plaid_item_id, institution_name")
        .eq("user_id", user.id)
        .eq("institution_id", institutionId)
        .neq("status", "disconnected")
        .neq("plaid_item_id", plaidItemId)
        .limit(1)
        .maybeSingle();
      if (duplicateError) throw new HttpError(500, "Unable to check for an existing institution connection.");
      if (duplicateItem) {
        try {
          await plaid.itemRemove({ access_token: accessToken });
        } catch {
          console.warn(JSON.stringify({
            scope: "plaid-link",
            event: "duplicate_item_cleanup_failed",
            institution: institutionName,
          }));
        }
        console.warn(JSON.stringify({
          scope: "plaid-link",
          event: "duplicate_institution_blocked",
          institution: institutionName,
          existing_item_uuid: duplicateItem.id,
        }));
        throw new HttpError(409, `${duplicateItem.institution_name ?? institutionName ?? "This institution"} is already connected. Use Sync or Refresh connection on the existing Item.`);
      }
    }

    const itemProducts = new Set([
      ...(itemResponse.data.item.products ?? []),
      ...itemResponse.data.item.billed_products,
    ].map(String));

    const { data: item, error: itemError } = await admin
      .from("plaid_items")
      .upsert(
        {
          user_id: user.id,
          plaid_item_id: plaidItemId,
          institution_id: institutionId,
          institution_name: institutionName,
          available_products: itemResponse.data.item.available_products,
          billed_products: itemResponse.data.item.billed_products,
          consented_products: itemResponse.data.item.consented_products ?? [],
          transactions_status: itemProducts.has("transactions") ? "available" : "unknown",
          investments_status: "unknown",
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

    const accounts = await plaidApiRequest("accounts_get_after_exchange", () => (
      plaid.accountsGet({ access_token: accessToken })
    ));
    const accountSummary = await upsertPlaidAccounts(
      admin,
      user.id,
      item.id,
      institutionId,
      institutionName,
      accounts.data.accounts as AccountBase[],
    );
    console.info(JSON.stringify({
      scope: "plaid-link",
      event: "institution_connected",
      institution: institutionName,
      institution_id: institutionId,
      returned_accounts: accountSummary.returned,
      investment_accounts: accountSummary.investments,
      transactions_available: itemProducts.has("transactions"),
      investments_consented: (itemResponse.data.item.consented_products ?? []).map(String).includes("investments"),
    }));
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
