-- =====================================================================
-- OPTIONAL, for testing: fills every approved restaurant with dishes so the
-- home page, search and menus are full of food. Each restaurant gets the
-- same 10 dishes (with photos where we have them), in three sections.
-- Dishes a restaurant already has (same name) are skipped, nothing is
-- deleted, and it's safe to run again.
-- Also opens every approved restaurant from 6:00 am to 11:00 pm, so the
-- food can be ordered while you test.
-- =====================================================================

-- Open for testing (restaurants without hours can't open)
update vendors set opens_at = '06:00', closes_at = '23:00', is_open = true
where status = 'approved';

-- Menu sections
insert into menu_categories (vendor_id, name, sort_order)
select v.id, c.name, c.sort
from vendors v
cross join (values ('Rice dishes', 1), ('Local dishes', 2), ('Noodles', 3)) as c (name, sort)
where v.status = 'approved'
  and not exists (select 1 from menu_categories m where m.vendor_id = v.id and lower(m.name) = lower(c.name));

-- Dishes
with dishes (section, name, description, price, image, popular, sort, opts) as (values
  ('Rice dishes', 'Jollof rice with chicken', 'Smoky party jollof with grilled chicken, fried plantain and shito.', 55, '/images/food/jollof-chicken.jpg', true, 1, 'protein'),
  ('Rice dishes', 'Jollof rice with fish', 'Party jollof with fried fish, salad and shito.', 50, '/images/food/jollof-plate.jpg', false, 2, 'extras'),
  ('Rice dishes', 'Assorted fried rice', 'Fried rice with chicken, shrimp, sausage and vegetables.', 60, '/images/food/fried-rice.jpg', true, 3, 'extras'),
  ('Rice dishes', 'Fried rice with chicken', 'Vegetable fried rice with fried chicken and shito.', 50, '/images/food/fried-rice.jpg', false, 4, 'protein'),
  ('Local dishes', 'Waakye special', 'Waakye with gari, spaghetti, egg, beans, stew and wele.', 45, '/images/food/waakye-plate.jpg', true, 5, 'extras'),
  ('Local dishes', 'Waakye with fish', 'Waakye with fried fish, gari, stew and shito.', 35, '/images/food/waakye-plate.jpg', false, 6, 'extras'),
  ('Local dishes', 'Banku and grilled tilapia', 'Whole grilled tilapia with pepper sauce and two balls of banku.', 80, '/images/food/banku-tilapia.jpg', true, 7, 'none'),
  ('Local dishes', 'Fufu with light soup', 'Pounded fufu in light soup with goat meat.', 60, null, false, 8, 'protein'),
  ('Local dishes', 'Kenkey with fried fish', 'Two balls of kenkey, fried fish, pepper and onions.', 30, null, false, 9, 'none'),
  ('Noodles', 'Stir-fried Indomie', 'Indomie stir-fried with egg, sausage, vegetables and pepper.', 35, '/images/food/indomie.jpg', true, 10, 'extras')
),
options (kind, value) as (values
  ('protein', '[{"name":"Choose your protein","required":true,"max":1,"choices":[{"name":"Chicken","price":0},{"name":"Fish","price":5},{"name":"Beef","price":5}]},{"name":"Extras","required":false,"max":3,"choices":[{"name":"Boiled egg","price":3},{"name":"Extra shito","price":2},{"name":"Fried plantain","price":6}]}]'::jsonb),
  ('extras', '[{"name":"Extras","required":false,"max":3,"choices":[{"name":"Boiled egg","price":3},{"name":"Extra shito","price":2},{"name":"Fried plantain","price":6}]}]'::jsonb),
  ('none', '[]'::jsonb)
)
insert into menu_items (vendor_id, category_id, name, description, price, image_url, options, is_available, is_popular, sort_order)
select v.id,
       (select m.id from menu_categories m where m.vendor_id = v.id and lower(m.name) = lower(d.section) limit 1),
       d.name, d.description, d.price, d.image, o.value, true, d.popular, 100 + d.sort
from vendors v
cross join dishes d
join options o on o.kind = d.opts
where v.status = 'approved'
  and not exists (select 1 from menu_items i where i.vendor_id = v.id and lower(i.name) = lower(d.name));

-- Restaurants with no cover photo get one
update vendors set cover_url = '/images/food/jollof-chicken.jpg'
where status = 'approved' and (cover_url is null or cover_url = '');

-- What you have now, per restaurant
select v.name as restaurant, z.name as town, count(i.id) as dishes, v.is_open as open
from vendors v join zones z on z.id = v.zone_id left join menu_items i on i.vendor_id = v.id
where v.status = 'approved'
group by v.name, z.name, v.is_open
order by z.name, v.name;
