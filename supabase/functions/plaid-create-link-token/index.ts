import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, readJson, safeErrorResponse } from "../_shared/http.ts";
import { getPlaidAccessToken } from "../_shared/plaid-credentials.ts";
import { CountryCode, createPlaidClient, plaidApiRequest, plaidEnv, Products } from "../_shared/plaid.ts";
import { requireUser } from "../_shared/supabase.ts";

type LinkTokenBody = {
  plaid_item_id?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const { user, admin } = await requireUser(req);
    const body = await readJson<LinkTokenBody>(req);
    const plaid = createPlaidClient();
    const webhook = Deno.env.get("PLAID_WEBHOOK_URL");
    if (!webhook) throw new HttpError(500, "PLAID_WEBHOOK_URL is not configured.");
    const redirectUri = Deno.env.get("PLAID_REDIRECT_URI")?.trim() || undefined;

    let accessToken: string | undefined;
    if (body.plaid_item_id) {
      const { data: item, error } = await admin
        .from("plaid_items")
        .select("id, status")
        .eq("id", body.plaid_item_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !item) throw new HttpError(404, "Bank connection was not found.");
      if (item.status === "disconnected") throw new HttpError(409, "This bank connection has been disconnected.");
      accessToken = await getPlaidAccessToken(admin, item.id);
    }

    const linkTokenRequest = {
      client_name: "TRACKED",
      country_codes: [CountryCode.Ca],
      language: "en",
      user: {
        client_user_id: user.id,
      },
      webhook,
      redirect_uri: redirectUri,
      ...(accessToken
        ? { access_token: accessToken }
        : {
            products: [Products.Transactions],
            additional_consented_products: [Products.Investments],
            // Request up to 24 months of history for newly created Plaid Items.
            transactions: { days_requested: 730 },
          }),
    };

    console.info(JSON.stringify({
      scope: "plaid-link",
      event: "link_token_create_request",
      plaid_environment: plaidEnv(),
      mode: accessToken ? "update" : "connect",
      client_name: linkTokenRequest.client_name,
      language: linkTokenRequest.language,
      country_codes: linkTokenRequest.country_codes,
      products: accessToken ? null : [Products.Transactions],
      additional_consented_products: accessToken ? null : [Products.Investments],
      optional_products: null,
      required_if_supported_products: null,
      redirect_uri: redirectUri ?? null,
      webhook,
      client_user_id: user.id,
    }));

    const response = await plaidApiRequest("link_token_create", () => plaid.linkTokenCreate(linkTokenRequest));

    console.info(JSON.stringify({
      scope: "plaid-link",
      event: "link_token_created",
      mode: accessToken ? "update" : "connect",
      redirect_configured: Boolean(redirectUri),
    }));
    return jsonResponse({ link_token: response.data.link_token, mode: accessToken ? "update" : "connect" });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
