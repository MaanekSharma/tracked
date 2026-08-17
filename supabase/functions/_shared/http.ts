import { jsonResponse } from "./cors.ts";

export type SafeErrorDiagnostic = Record<string, string | number | boolean | null>;

export class HttpError extends Error {
  status: number;
  diagnostic?: SafeErrorDiagnostic;

  constructor(status: number, message: string, diagnostic?: SafeErrorDiagnostic) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.diagnostic = diagnostic;
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

export function safeErrorResponse(error: unknown) {
  if (error instanceof HttpError) {
    console.error(JSON.stringify({
      scope: "plaid-edge-function",
      event: "request_failed",
      status: error.status,
      error_type: error.name,
      message: error.message,
      diagnostic: error.diagnostic,
    }));
    return jsonResponse({ error: error.message, diagnostic: error.diagnostic }, error.status);
  }

  console.error(JSON.stringify({
    scope: "plaid-edge-function",
    event: "request_failed",
    status: 500,
    error_type: error instanceof Error ? error.name : "UnknownError",
  }));
  return jsonResponse({ error: "Unable to complete the bank connection request." }, 500);
}
