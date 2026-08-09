import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export async function upsertPlaidCredential(
  admin: SupabaseClient,
  userId: string,
  plaidItemUuid: string,
  accessToken: string,
) {
  const { error } = await admin.rpc("upsert_plaid_credential", {
    target_user_id: userId,
    target_plaid_item_uuid: plaidItemUuid,
    target_access_token: accessToken,
  });

  if (error) throw new HttpError(500, "Unable to save bank credentials.");
}

export async function getPlaidAccessToken(admin: SupabaseClient, plaidItemUuid: string) {
  const { data, error } = await admin.rpc("get_plaid_access_token", {
    target_plaid_item_uuid: plaidItemUuid,
  });

  if (error || !data) throw new HttpError(404, "Bank credentials were not found for this connection.");
  return data as string;
}

export async function deletePlaidCredential(admin: SupabaseClient, plaidItemUuid: string) {
  const { error } = await admin.rpc("delete_plaid_credential", {
    target_plaid_item_uuid: plaidItemUuid,
  });

  if (error) throw new HttpError(500, "Unable to remove bank credentials.");
}
