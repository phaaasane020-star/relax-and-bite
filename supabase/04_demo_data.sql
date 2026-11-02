-- =====================================================================
-- OPTIONAL demo data for testing: 5 restaurants with menus, 2 riders.
-- Run after 03_app_bridge.sql. Remove before launch with 05_remove_demo_data.sql.
-- Sign-ins: vendors 024 000 0001 to 0005 / Vendor@1234 (Ama's is waiting for approval)
--           rider 055 000 0001 / Rider@1234 (approved), 055 000 0002 (waiting)
-- Every demo phone number is 024000000x or 055000000x, which is how the
-- removal script finds them.
-- =====================================================================

-- Vendor accounts
insert into partner_accounts (role, full_name, phone, password_hash, status) values ('vendor', 'Esi Mensah', '0240000001', 'adb5088e3e518d03dbdddfa06bdebe10:378080dc1567f19dac5688af3cd1b958a10deaa83e0be957d4e60da9868bbbb6', 'approved');
insert into partner_accounts (role, full_name, phone, password_hash, status) values ('vendor', 'Adwoa Boateng', '0240000002', 'adb5088e3e518d03dbdddfa06bdebe10:378080dc1567f19dac5688af3cd1b958a10deaa83e0be957d4e60da9868bbbb6', 'approved');
insert into partner_accounts (role, full_name, phone, password_hash, status) values ('vendor', 'Kojo Asante', '0240000003', 'adb5088e3e518d03dbdddfa06bdebe10:378080dc1567f19dac5688af3cd1b958a10deaa83e0be957d4e60da9868bbbb6', 'approved');
insert into partner_accounts (role, full_name, phone, password_hash, status) values ('vendor', 'Kwaku Owusu', '0240000004', 'adb5088e3e518d03dbdddfa06bdebe10:378080dc1567f19dac5688af3cd1b958a10deaa83e0be957d4e60da9868bbbb6', 'approved');
insert into partner_accounts (role, full_name, phone, password_hash, status) values ('vendor', 'Ama Darko', '0240000005', 'adb5088e3e518d03dbdddfa06bdebe10:378080dc1567f19dac5688af3cd1b958a10deaa83e0be957d4e60da9868bbbb6', 'pending');

-- Restaurants
insert into vendors (owner_account_id, slug, name, description, cuisine_tags, address, zone_id, locality_id, phone, cover_url, prep_time_min, prep_time_max, min_order, is_open, opens_at, closes_at, rating, rating_count, status)
select a.id, 'auntie-esis-kitchen', 'Auntie Esi''s Kitchen', 'Jollof, grills and local dishes', array['Jollof', 'Grills', 'Fried rice']::text[], 'Hospital Junction, Breman Asikuma', z.id, (select id from localities where zone_id = z.id and name = 'Hospital Junction'), '0240000001', '/images/food/kitchen.jpg', 20, 30, 0, true, '07:00', '21:00', 4.8, 212, 'approved'
from partner_accounts a, zones z where a.phone = '0240000001' and z.name = 'Breman Asikuma';
insert into vendors (owner_account_id, slug, name, description, cuisine_tags, address, zone_id, locality_id, phone, cover_url, prep_time_min, prep_time_max, min_order, is_open, opens_at, closes_at, rating, rating_count, status)
select a.id, 'mama-adwoa-waakye', 'Mama Adwoa Waakye', 'Waakye, breakfast and stews', array['Waakye', 'Breakfast']::text[], 'Lorry Station, Breman Asikuma', z.id, (select id from localities where zone_id = z.id and name = 'Ahenema'), '0240000002', '/images/food/waakye.jpg', 15, 25, 0, true, '06:00', '14:00', 4.6, 98, 'approved'
from partner_accounts a, zones z where a.phone = '0240000002' and z.name = 'Breman Asikuma';
insert into vendors (owner_account_id, slug, name, description, cuisine_tags, address, zone_id, locality_id, phone, cover_url, prep_time_min, prep_time_max, min_order, is_open, opens_at, closes_at, rating, rating_count, status)
select a.id, 'golden-pot-chop-bar', 'Golden Pot Chop Bar', 'Fufu, banku and soups', array['Fufu', 'Banku', 'Soups']::text[], 'Market Road, Breman Asikuma', z.id, (select id from localities where zone_id = z.id and name = 'Zongo'), '0240000003', null, 25, 40, 30, true, '10:00', '20:00', 4.5, 64, 'approved'
from partner_accounts a, zones z where a.phone = '0240000003' and z.name = 'Breman Asikuma';
insert into vendors (owner_account_id, slug, name, description, cuisine_tags, address, zone_id, locality_id, phone, cover_url, prep_time_min, prep_time_max, min_order, is_open, opens_at, closes_at, rating, rating_count, status)
select a.id, 'kwakus-grill-house', 'Kwaku''s Grill House', 'Tilapia, banku and kebabs', array['Grills', 'Banku']::text[], 'Odoben Road, Breman Asikuma', z.id, (select id from localities where zone_id = z.id and name = 'Hospital Junction'), '0240000004', '/images/food/banku-tilapia.jpg', 30, 45, 0, false, '17:00', '23:00', 4.7, 150, 'approved'
from partner_accounts a, zones z where a.phone = '0240000004' and z.name = 'Breman Asikuma';
insert into vendors (owner_account_id, slug, name, description, cuisine_tags, address, zone_id, locality_id, phone, cover_url, prep_time_min, prep_time_max, min_order, is_open, opens_at, closes_at, rating, rating_count, status)
select a.id, 'amas-fried-rice', 'Ama''s Fried Rice', 'Fried rice, noodles and chicken', array['Fried rice', 'Chicken']::text[], 'Behind the post office, Breman Asikuma', z.id, (select id from localities where zone_id = z.id and name = 'Zongo'), '0240000005', null, 20, 30, 0, false, '11:00', '22:00', 0, 0, 'pending'
from partner_accounts a, zones z where a.phone = '0240000005' and z.name = 'Breman Asikuma';

-- Menu sections
insert into menu_categories (vendor_id, name, sort_order) select id, 'Rice dishes', 1 from vendors where slug = 'auntie-esis-kitchen';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Grills', 2 from vendors where slug = 'auntie-esis-kitchen';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Sides', 3 from vendors where slug = 'auntie-esis-kitchen';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Drinks', 4 from vendors where slug = 'auntie-esis-kitchen';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Waakye', 1 from vendors where slug = 'mama-adwoa-waakye';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Breakfast', 2 from vendors where slug = 'mama-adwoa-waakye';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Drinks', 3 from vendors where slug = 'mama-adwoa-waakye';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Fufu', 1 from vendors where slug = 'golden-pot-chop-bar';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Banku and kenkey', 2 from vendors where slug = 'golden-pot-chop-bar';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Grills', 1 from vendors where slug = 'kwakus-grill-house';
insert into menu_categories (vendor_id, name, sort_order) select id, 'Sides', 2 from vendors where slug = 'kwakus-grill-house';

-- Dishes
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Rice dishes'), 'Jollof rice with chicken', 'Smoky party jollof, grilled chicken thigh, fried plantain and shito.', 60, '/images/food/jollof-plate.jpg', '[{"name":"Choose your protein","required":true,"max":1,"choices":[{"name":"Chicken","price":0},{"name":"Fish","price":5},{"name":"Beef","price":5}]},{"name":"Extras","required":false,"max":3,"choices":[{"name":"Boiled egg","price":3},{"name":"Extra shito","price":2},{"name":"Fried plantain","price":6}]}]'::jsonb, true, true, 0
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Rice dishes'), 'Assorted fried rice', 'Fried rice with chicken, beef, sausage and fresh vegetables.', 55, null, '[{"name":"Extras","required":false,"max":3,"choices":[{"name":"Boiled egg","price":3},{"name":"Extra shito","price":2},{"name":"Fried plantain","price":6}]}]'::jsonb, false, false, 1
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Rice dishes'), 'Plain rice and stew', 'White rice with tomato stew and your choice of protein.', 40, null, '[{"name":"Choose your protein","required":true,"max":1,"choices":[{"name":"Chicken","price":0},{"name":"Fish","price":5},{"name":"Beef","price":5}]}]'::jsonb, true, false, 2
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Grills'), 'Banku and grilled tilapia', 'Whole tilapia with pepper sauce, onions and two balls of banku.', 80, '/images/food/banku-tilapia.jpg', '[]'::jsonb, true, true, 3
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Sides'), 'Kelewele', 'Spiced fried ripe plantain with roasted peanuts.', 20, null, '[]'::jsonb, true, false, 4
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Drinks'), 'Sobolo, 500 ml', 'Chilled hibiscus drink with ginger.', 12, null, '[]'::jsonb, true, false, 5
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Drinks'), 'Bottled water, 750 ml', '', 5, null, '[]'::jsonb, true, false, 6
from vendors v where v.slug = 'auntie-esis-kitchen';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Waakye'), 'Waakye special', 'Waakye with stewed beef, boiled egg, spaghetti, gari and shito.', 45, '/images/food/waakye.jpg', '[{"name":"Extras","required":false,"max":3,"choices":[{"name":"Boiled egg","price":3},{"name":"Extra shito","price":2},{"name":"Fried plantain","price":6}]}]'::jsonb, true, true, 7
from vendors v where v.slug = 'mama-adwoa-waakye';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Waakye'), 'Waakye with fish', 'Waakye, fried fish, gari and stew.', 35, null, '[]'::jsonb, true, false, 8
from vendors v where v.slug = 'mama-adwoa-waakye';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Breakfast'), 'Hausa koko and koose', 'Spiced millet porridge with five koose.', 15, null, '[]'::jsonb, true, false, 9
from vendors v where v.slug = 'mama-adwoa-waakye';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Drinks'), 'Lipton tea with milk', '', 8, null, '[]'::jsonb, true, false, 10
from vendors v where v.slug = 'mama-adwoa-waakye';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Fufu'), 'Fufu with light soup', 'Pounded fufu with goat light soup.', 50, null, '[{"name":"Choose your meat","required":true,"max":1,"choices":[{"name":"Goat","price":0},{"name":"Chicken","price":0},{"name":"Fish","price":5}]}]'::jsonb, true, true, 11
from vendors v where v.slug = 'golden-pot-chop-bar';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Fufu'), 'Fufu with groundnut soup', 'Pounded fufu with chicken groundnut soup.', 55, null, '[]'::jsonb, true, false, 12
from vendors v where v.slug = 'golden-pot-chop-bar';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Banku and kenkey'), 'Banku with okro stew', 'Banku with okro stew, fish and wele.', 45, null, '[]'::jsonb, true, false, 13
from vendors v where v.slug = 'golden-pot-chop-bar';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Banku and kenkey'), 'Kenkey with fried fish', 'Two balls of Fante kenkey, fried fish, pepper and onions.', 30, null, '[]'::jsonb, true, false, 14
from vendors v where v.slug = 'golden-pot-chop-bar';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Grills'), 'Grilled tilapia, large', 'Charcoal-grilled tilapia with banku and pepper.', 95, '/images/food/banku-tilapia.jpg', '[]'::jsonb, true, true, 15
from vendors v where v.slug = 'kwakus-grill-house';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Grills'), 'Beef kebabs, 5 sticks', 'Suya-spiced beef kebabs with onions.', 40, null, '[]'::jsonb, true, false, 16
from vendors v where v.slug = 'kwakus-grill-house';
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id, (select id from menu_categories where vendor_id = v.id and name = 'Sides'), 'Fried yam', 'Crispy fried yam with pepper sauce.', 20, null, '[]'::jsonb, true, false, 17
from vendors v where v.slug = 'kwakus-grill-house';

-- Riders
insert into partner_accounts (role, full_name, phone, password_hash, status) values
  ('rider', 'Kofi Appiah', '0550000001', '7436e57c727c1b5a18aafd106570ddc1:c7113dc241457a2b07c68726a6c612d3c93e600ea13b7b36cd8e04f55a9e64ed', 'approved'),
  ('rider', 'Yaw Mensah', '0550000002', '7436e57c727c1b5a18aafd106570ddc1:c7113dc241457a2b07c68726a6c612d3c93e600ea13b7b36cd8e04f55a9e64ed', 'pending');
insert into riders (account_id, full_name, phone, zone_id, vehicle, plate_number, licence_number, ghana_card, emergency_name, emergency_phone, is_online, rating)
select a.id, a.full_name, a.phone, z.id, 'motorbike', 'CR 1234-21', 'DL-0098812', 'GHA-000000001-1', 'Ama Appiah', '0240000099', true, 4.9
from partner_accounts a, zones z where a.phone = '0550000001' and z.name = 'Breman Asikuma';
insert into riders (account_id, full_name, phone, zone_id, vehicle, plate_number, licence_number, ghana_card, emergency_name, emergency_phone, is_online, rating)
select a.id, a.full_name, a.phone, z.id, 'motorbike', 'CR 5678-23', 'DL-0100231', 'GHA-000000002-2', 'Kwame Mensah', '0240000098', false, 0
from partner_accounts a, zones z where a.phone = '0550000002' and z.name = 'Breman Asikuma';

insert into activity_log (actor, action, kind) values ('System', 'Demo data added', 'admin');
