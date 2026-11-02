-- Tarkwa and Takoradi join Breman Asikuma, and localities are switched off:
-- customers just choose their town and describe where they are (landmark).
-- Delivery fees and map positions can be changed in Admin > Delivery areas.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

insert into zones (name, region, delivery_fee, is_active, lat, lng, radius_km)
select 'Tarkwa', 'Western', 10, true, 5.3018, -1.9930, 7
where not exists (select 1 from zones where lower(name) = 'tarkwa');

insert into zones (name, region, delivery_fee, is_active, lat, lng, radius_km)
select 'Takoradi', 'Western', 10, true, 4.8982, -1.7602, 10
where not exists (select 1 from zones where lower(name) = 'takoradi');

-- Make sure all three are open for orders
update zones set is_active = true where lower(name) in ('breman asikuma', 'tarkwa', 'takoradi');

-- Localities are no longer used. They're switched off rather than deleted,
-- so past orders and stores keep their area names.
update localities set is_active = false where is_active;
