-- Simpler restaurant sign-up:
-- - business_type: what kind of food business it is (restaurant, chop bar...)
-- - opening hours are no longer asked at sign-up, so a new store has none
--   until the owner sets them in Store settings (it stays closed until then)
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

alter table vendors add column if not exists business_type text not null default '';
alter table vendors alter column opens_at drop not null;
alter table vendors alter column opens_at drop default;
alter table vendors alter column closes_at drop not null;
alter table vendors alter column closes_at drop default;

notify pgrst, 'reload schema';
