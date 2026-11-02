-- =====================================================================
-- Relax&Bite: connection between the app's server and the database.
-- Run after 01_schema.sql and 02_seed.sql. Safe to run again.
--
-- The app's server sends its queries through this one function. It can
-- only be called with the secret service key (never with the public key),
-- and it only runs SELECT, INSERT, UPDATE and DELETE statements, one at a
-- time, with values passed separately from the query text.
-- =====================================================================

create or replace function public.app_sql(q text, p jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  head text := lower(substring(ltrim(q) from 1 for 6));
  rec record;
  out_rows jsonb := '[]'::jsonb;
begin
  if head not in ('select', 'insert', 'update', 'delete') and left(head, 4) <> 'with' then
    raise exception 'app_sql only runs select, insert, update and delete statements';
  end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'app_sql values must be a list';
  end if;
  -- Every statement must return rows (writes use RETURNING)
  for rec in execute q using p loop
    out_rows := out_rows || jsonb_build_array(to_jsonb(rec));
  end loop;
  return out_rows;
end $$;

revoke execute on function public.app_sql(text, jsonb) from public, anon, authenticated;
grant execute on function public.app_sql(text, jsonb) to service_role;

-- Ratings are recalculated by the orders_rating_changed trigger; this keeps
-- the per-order rating to one per order.
alter table public.orders drop constraint if exists orders_rating_once;
alter table public.orders add constraint orders_rating_once check (rating is null or status = 'delivered');

-- On Supabase the random-number add-on lives in the "extensions" schema
alter function public.new_delivery_code() set search_path = public, extensions;

-- Tell Supabase's API about the new function straight away
notify pgrst, 'reload schema';
