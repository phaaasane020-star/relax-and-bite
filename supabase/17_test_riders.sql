-- =====================================================================
-- OPTIONAL: 20 test riders, approved and spread across your towns.
-- For testing only. Remove before launch with 18_remove_test_riders.sql.
-- Sign in: phone 055 000 0101 to 055 000 0120, password Rider@1234
-- (the same test password as the demo rider).
-- All their phone numbers start 0550000 1, which is how removal finds them.
-- Ghana Card numbers are made up (GHA-0000001xx-x), not real people.
-- =====================================================================
with t (n, full_name, phone, vehicle, plate, licence, card, ename, ephone, online, rating) as (values
  (1, 'Kwabena Asare', '0550000101', 'motorbike', 'CR 1137-21', 'DL-0100001', 'GHA-000000101-1', 'Akosua Asare', '0240000101', true, 4.8),
  (2, 'Yaw Boateng', '0550000102', 'motorbike', 'CR 1274-22', 'DL-0100002', 'GHA-000000102-2', 'Efua Boateng', '0240000102', true, 4.7),
  (3, 'Kofi Mensah', '0550000103', 'motorbike', 'CR 1411-23', 'DL-0100003', 'GHA-000000103-3', 'Ama Mensah', '0240000103', false, 4.6),
  (4, 'Kwame Owusu', '0550000104', 'motorbike', 'CR 1548-24', 'DL-0100004', 'GHA-000000104-4', 'Adwoa Owusu', '0240000104', true, 4.5),
  (5, 'Isaac Adjei', '0550000105', 'motorbike', 'CR 1685-25', 'DL-0100005', 'GHA-000000105-5', 'Esi Adjei', '0240000105', true, 4.9),
  (6, 'Emmanuel Tetteh', '0550000106', 'motorbike', 'CR 1822-20', 'DL-0100006', 'GHA-000000106-6', 'Yaa Tetteh', '0240000106', false, 4.8),
  (7, 'Samuel Ofori', '0550000107', 'bicycle', '', '', 'GHA-000000107-7', 'Afua Ofori', '0240000107', true, 4.7),
  (8, 'Daniel Amoah', '0550000108', 'motorbike', 'CR 2096-22', 'DL-0100008', 'GHA-000000108-8', 'Akua Amoah', '0240000108', true, 4.6),
  (9, 'Michael Quaye', '0550000109', 'motorbike', 'CR 2233-23', 'DL-0100009', 'GHA-000000109-9', 'Araba Quaye', '0240000109', false, 4.5),
  (10, 'Joseph Antwi', '0550000110', 'motorbike', 'CR 2370-24', 'DL-0100010', 'GHA-000000110-0', 'Abena Antwi', '0240000110', true, 4.9),
  (11, 'Ebo Arthur', '0550000111', 'motorbike', 'CR 2507-25', 'DL-0100011', 'GHA-000000111-1', 'Akosua Arthur', '0240000111', true, 4.8),
  (12, 'Kojo Eshun', '0550000112', 'motorbike', 'CR 2644-20', 'DL-0100012', 'GHA-000000112-2', 'Efua Eshun', '0240000112', false, 4.7),
  (13, 'Richard Addo', '0550000113', 'motorbike', 'CR 2781-21', 'DL-0100013', 'GHA-000000113-3', 'Ama Addo', '0240000113', true, 4.6),
  (14, 'Prince Agyeman', '0550000114', 'motorbike', 'CR 2918-22', 'DL-0100014', 'GHA-000000114-4', 'Adwoa Agyeman', '0240000114', true, 4.5),
  (15, 'Eric Nkansah', '0550000115', 'bicycle', '', '', 'GHA-000000115-5', 'Esi Nkansah', '0240000115', false, 4.9),
  (16, 'Francis Darko', '0550000116', 'motorbike', 'CR 3192-24', 'DL-0100016', 'GHA-000000116-6', 'Yaa Darko', '0240000116', true, 4.8),
  (17, 'Stephen Ampofo', '0550000117', 'motorbike', 'CR 3329-25', 'DL-0100017', 'GHA-000000117-7', 'Afua Ampofo', '0240000117', true, 4.7),
  (18, 'Benjamin Osei', '0550000118', 'motorbike', 'CR 3466-20', 'DL-0100018', 'GHA-000000118-8', 'Akua Osei', '0240000118', false, 4.6),
  (19, 'Felix Acheampong', '0550000119', 'motorbike', 'CR 3603-21', 'DL-0100019', 'GHA-000000119-9', 'Araba Acheampong', '0240000119', true, 4.5),
  (20, 'Godfred Sarpong', '0550000120', 'motorbike', 'CR 3740-22', 'DL-0100020', 'GHA-000000120-0', 'Abena Sarpong', '0240000120', true, 4.9)
),
towns as (
  select id, row_number() over (order by id) - 1 as k, count(*) over () as total from zones
  where is_active or not exists (select 1 from zones where is_active)
),
accounts as (
  insert into partner_accounts (role, full_name, phone, password_hash, status)
  select 'rider', t.full_name, t.phone, '7436e57c727c1b5a18aafd106570ddc1:c7113dc241457a2b07c68726a6c612d3c93e600ea13b7b36cd8e04f55a9e64ed', 'approved' from t
  on conflict (phone) do nothing
  returning id, phone
)
insert into riders (account_id, full_name, phone, zone_id, vehicle, plate_number, licence_number, ghana_card, emergency_name, emergency_phone, is_online, rating)
select a.id, t.full_name, t.phone, (select id from towns where k = (t.n - 1) % total), t.vehicle::vehicle_type, t.plate, t.licence, t.card, t.ename, t.ephone, t.online, t.rating
from t join accounts a on a.phone = t.phone;

insert into activity_log (actor, action, kind) values ('System', '20 test riders added', 'admin');
