-- Each restaurant sets its own delivery fee (the rider earns it), instead of
-- one fee per town. Restaurants start with their town's old fee and can
-- change it in Store settings.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'vendors' and column_name = 'delivery_fee') then
    alter table vendors add column delivery_fee numeric(10, 2) not null default 10 check (delivery_fee >= 0 and delivery_fee <= 100);
    update vendors v set delivery_fee = least(z.delivery_fee, 100) from zones z where z.id = v.zone_id;
  end if;
end $$;

notify pgrst, 'reload schema';
