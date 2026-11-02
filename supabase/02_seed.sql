-- =====================================================================
-- Relax&Bite starting data. Run after 01_schema.sql.
-- =====================================================================

-- Towns. Only Breman Asikuma is open; the others are ready for later.
insert into zones (name, region, delivery_fee, is_active, lat, lng, radius_km) values
  ('Breman Asikuma', 'Central', 5, true, 5.5811, -0.9944, 6),
  ('Odoben', 'Central', 10, false, null, null, 5),
  ('Brakwa', 'Central', 12, false, null, null, 5);

-- Localities in Breman Asikuma. Add the rest in the admin panel (Delivery areas).
insert into localities (zone_id, name)
select z.id, l.name
from zones z
cross join (values ('Zongo'), ('Ahenema'), ('Hospital Junction')) as l(name)
where z.name = 'Breman Asikuma';

-- Admin account: phone 050 893 4500.
-- The temporary password was sent to you separately. Change it after the first sign-in.
insert into partner_accounts (role, full_name, phone, password_hash, status)
values ('admin', 'Relax&Bite Admin', '0508934500', '1bfd617dc58537a9422a30a8da3a2654:bf90705f5193c57800d67d4024eaa37fc7c43eabd191c830a38280257868cdce', 'approved');

insert into activity_log (actor, action, kind, severity)
values ('System', 'Database created', 'admin', 'info');
