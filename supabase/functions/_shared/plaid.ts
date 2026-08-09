import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from "npm:plaid@45.0.0";
import { HttpError } from "./http.ts";

export { CountryCode, Products };

export type PlaidApiError = {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
};

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `${name} is not configured.`);
  return value;
}

export function plaidEnv() {
  const env = Deno.env.get("PLAID_ENV") ?? "sandbox";
  if (!["sandbox", "development", "production"].includes(env)) {
    throw new HttpError(500, "PLAID_ENV must be sandbox, development, or production.");
  }
  return env;
}

export function createPlaidClient() {
  const env = plaidEnv();
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": requiredSecret("PLAID_CLIENT_ID"),
          "PLAID-SECRET": requiredSecret("PLAID_SECRET"),
          "Plaid-Version": "2020-09-14",
        },
      },
    }),
  );
}

export function plaidError(error: unknown): PlaidApiError | null {
  const response = (error as { response?: { data?: PlaidApiError } }).response;
  return response?.data ?? null;
}

export function safePlaidMessage(error: unknown) {
  const parsed = plaidError(error);
  if (parsed?.error_code === "ITEM_LOGIN_REQUIRED") {
    return "Your bank connection needs to be refreshed.";
  }
  if (parsed?.display_message) return parsed.display_message;
  return "Plaid could not complete that request. Please try again.";
}
