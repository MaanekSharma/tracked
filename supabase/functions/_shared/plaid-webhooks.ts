import { decodeProtectedHeader, importJWK, jwtVerify, type JWK, type JWTPayload } from "npm:jose@5.9.6";
import { HttpError } from "./http.ts";
import { createPlaidClient } from "./plaid.ts";

type PlaidWebhookClaims = JWTPayload & {
  request_body_sha256?: string;
};

const keyCache = new Map<string, JWK>();

function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return diff === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cachedKey(kid: string) {
  const key = keyCache.get(kid) as (JWK & { expired_at?: number | null }) | undefined;
  if (!key) return null;
  if (typeof key.expired_at === "number" && key.expired_at * 1000 <= Date.now()) {
    keyCache.delete(kid);
    return null;
  }
  return key;
}

async function verificationKey(kid: string) {
  const existing = cachedKey(kid);
  if (existing) return existing;

  const response = await createPlaidClient().webhookVerificationKeyGet({ key_id: kid });
  const key = response.data.key as JWK & { expired_at?: number | null };
  keyCache.set(kid, key);
  return key;
}

export async function verifyPlaidWebhook(req: Request, rawBody: string) {
  const signedJwt = req.headers.get("Plaid-Verification");
  if (!signedJwt) throw new HttpError(401, "Missing Plaid webhook verification header.");

  const header = decodeProtectedHeader(signedJwt);
  if (header.alg !== "ES256") throw new HttpError(401, "Invalid Plaid webhook algorithm.");
  if (typeof header.kid !== "string" || !header.kid) throw new HttpError(401, "Missing Plaid webhook key id.");

  const jwk = await verificationKey(header.kid);
  const key = await importJWK(jwk, "ES256");
  const { payload } = await jwtVerify<PlaidWebhookClaims>(signedJwt, key, {
    algorithms: ["ES256"],
    maxTokenAge: "5 min",
  });

  if (!payload.request_body_sha256) throw new HttpError(401, "Missing Plaid webhook body hash.");

  const actualHash = await sha256Hex(rawBody);
  if (!timingSafeEqual(actualHash, payload.request_body_sha256)) {
    throw new HttpError(401, "Invalid Plaid webhook body hash.");
  }
}
