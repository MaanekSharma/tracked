import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { HttpError, safeErrorResponse } from "../_shared/http.ts";
import { CountryCode, createPlaidClient, Products } from "../_shared/plaid.ts";
import { requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

    const { user } = await requireUser(req);
    const plaid = createPlaidClient();
    const webhook = Deno.env.get("PLAID_WEBHOOK_URL");
    if (!webhook) throw new HttpError(500, "PLAID_WEBHOOK_URL is not configured.");

    const response = await plaid.linkTokenCreate({
      client_name: "TRACKED",
      country_codes: [CountryCode.Ca],
      language: "en",
      products: [Products.Transactions],
      user: {
        client_user_id: user.id,
      },
      webhook,
      transactions: {
        days_requested: 90,
      },
    });

    return jsonResponse({ link_token: response.data.link_token });
  } catch (error) {
    return safeErrorResponse(error);
  }
});
