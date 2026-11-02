-- =====================================================================
-- Removes the OLD Relax&Bite database design (profiles, delivery_zones,
-- addresses...) so the new one can be installed.
--
-- Run this ONCE, before 01_schema.sql, only if you already ran the old file.
-- It deletes the old tables and everything in them. In a new project they
-- only hold the 3 starter towns, which 02_seed.sql adds back.
-- It does not touch Supabase's own sign-in users or storage.
-- =====================================================================

-- Stop the old "create a profile on sign-up" hook on Supabase's users table
drop trigger if exists on_auth_user_created on auth.users;

-- Old tables (cascade also removes their triggers and policies)
drop table if exists public.order_events cascade;
drop table if exists public.order_items cascade;
drop table if exists public.orders cascade;
drop table if exists public.addresses cascade;
drop table if exists public.menu_items cascade;
drop table if exists public.menu_categories cascade;
drop table if exists public.vendors cascade;
drop table if exists public.delivery_zones cascade;
drop table if exists public.profiles cascade;

drop sequence if exists public.order_code_seq;

-- Old functions
drop function if exists public.handle_new_user() cascade;
drop function if exists public.protect_profile_fields() cascade;
drop function if exists public.protect_vendor_fields() cascade;
drop function if exists public.protect_order_fields() cascade;
drop function if exists public.log_order_status() cascade;
drop function if exists public.can_view_order(uuid) cascade;
drop function if exists public.owns_vendor(uuid) cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.current_role_is(public.user_role) cascade;
drop function if exists public.set_updated_at() cascade;

-- Old types
drop type if exists public.user_role cascade;
drop type if exists public.vendor_status cascade;
drop type if exists public.order_status cascade;
drop type if exists public.payment_method cascade;
drop type if exists public.payment_status cascade;
