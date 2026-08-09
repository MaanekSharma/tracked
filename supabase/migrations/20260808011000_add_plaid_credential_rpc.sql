create or replace function public.upsert_plaid_credential(
  target_user_id uuid,
  target_plaid_item_uuid uuid,
  target_access_token text
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  insert into private.plaid_credentials (user_id, plaid_item_uuid, access_token)
  values (target_user_id, target_plaid_item_uuid, target_access_token)
  on conflict (plaid_item_uuid) do update
    set user_id = excluded.user_id,
        access_token = excluded.access_token,
        updated_at = now();
end;
$$;

create or replace function public.get_plaid_access_token(target_plaid_item_uuid uuid)
returns text
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  token text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  select access_token
    into token
  from private.plaid_credentials
  where plaid_item_uuid = target_plaid_item_uuid;

  return token;
end;
$$;

create or replace function public.delete_plaid_credential(target_plaid_item_uuid uuid)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;

  delete from private.plaid_credentials
  where plaid_item_uuid = target_plaid_item_uuid;
end;
$$;

revoke all on function public.upsert_plaid_credential(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_plaid_access_token(uuid) from public, anon, authenticated;
revoke all on function public.delete_plaid_credential(uuid) from public, anon, authenticated;

grant execute on function public.upsert_plaid_credential(uuid, uuid, text) to service_role;
grant execute on function public.get_plaid_access_token(uuid) to service_role;
grant execute on function public.delete_plaid_credential(uuid) to service_role;

comment on function public.upsert_plaid_credential(uuid, uuid, text) is
  'Service-role only RPC wrapper for writing Plaid access tokens into private.plaid_credentials.';
comment on function public.get_plaid_access_token(uuid) is
  'Service-role only RPC wrapper for reading a Plaid access token without exposing private.plaid_credentials to anon/authenticated roles.';
comment on function public.delete_plaid_credential(uuid) is
  'Service-role only RPC wrapper for deleting Plaid credentials during disconnect.';
