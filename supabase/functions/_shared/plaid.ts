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
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
};

export type PlaidErrorDiagnostic = {
  operation: string;
  error_type: string | null;
  error_code: string | null;
  error_message: string | null;
  display_message: string | null;
  request_id: string | null;
  http_status: number | null;
};

function requiredSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `${name} is not configured.`);
  return value;
}

export function plaidEnv() {
  const env = requiredSecret("PLAID_ENV").trim().toLowerCase();
  if (!["sandbox", "development", "production"].includes(env)) {
    throw new HttpError(500, "PLAID_ENV must be sandbox, development, or production.");
  }
  return env as "sandbox" | "development" | "production";
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

export function plaidErrorDiagnostic(operation: string, error: unknown): PlaidErrorDiagnostic {
  const parsed = plaidError(error);
  const status = (error as { response?: { status?: number } }).response?.status;
  return {
    operation,
    error_type: parsed?.error_type ?? null,
    error_code: parsed?.error_code ?? null,
    error_message: parsed?.error_message ?? null,
    display_message: parsed?.display_message ?? null,
    request_id: parsed?.request_id ?? null,
    http_status: status ?? null,
  };
}

export function plaidRequestError(operation: string, error: unknown) {
  const diagnostic = plaidErrorDiagnostic(operation, error);
  console.error(JSON.stringify({
    scope: "plaid-api",
    event: "request_failed",
    ...diagnostic,
  }));
  return new HttpError(502, safePlaidMessage(error), diagnostic);
}

export async function plaidApiRequest<T>(operation: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw plaidRequestError(operation, error);
  }
}

export function safePlaidMessage(error: unknown) {
  const parsed = plaidError(error);
  if (parsed?.error_code === "ITEM_LOGIN_REQUIRED") {
    return "Your bank connection needs to be refreshed.";
  }
  if (parsed?.display_message) return parsed.display_message;
  return "Plaid could not complete that request. Please try again.";
}
