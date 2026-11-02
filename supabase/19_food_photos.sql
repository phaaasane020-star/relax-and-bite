-- =====================================================================
-- Food photos for dishes on your existing restaurants.
-- The pictures live in the project (public/images/food/), so they work on
-- your computer and once the site is online.
-- Only fills dishes with no photo yet, or with an old demo photo; photos a
-- vendor uploaded themselves are never replaced. Safe to run again.
-- =====================================================================

-- Indomie and noodles
update menu_items set image_url = '/images/food/indomie.jpg'
where (name ilike '%indomie%' or name ilike '%noodle%')
  and (image_url is null or image_url = '' or image_url like '/images/food/%');

-- Jollof
update menu_items set image_url = '/images/food/jollof-chicken.jpg'
where name ilike '%jollof%'
  and (image_url is null or image_url = '' or image_url like '/images/food/%');

-- Fried rice
update menu_items set image_url = '/images/food/fried-rice.jpg'
where name ilike '%fried rice%'
  and (image_url is null or image_url = '' or image_url like '/images/food/%');

-- Waakye
update menu_items set image_url = '/images/food/waakye-plate.jpg'
where name ilike '%waakye%'
  and (image_url is null or image_url = '' or image_url like '/images/food/%');

-- Restaurant cover photos that are missing: pick one from what they sell
update vendors v set cover_url = case
    when v.name ilike '%fried rice%' or exists (select 1 from unnest(v.cuisine_tags) t where t ilike 'fried rice') then '/images/food/fried-rice.jpg'
    when v.name ilike '%jollof%' or exists (select 1 from unnest(v.cuisine_tags) t where t ilike 'jollof') then '/images/food/jollof-chicken.jpg'
    when v.name ilike '%indomie%' or exists (select 1 from unnest(v.cuisine_tags) t where t ilike 'indomie') then '/images/food/indomie.jpg'
    when v.name ilike '%waakye%' or exists (select 1 from unnest(v.cuisine_tags) t where t ilike 'waakye') then '/images/food/waakye-plate.jpg'
  end
where (v.cover_url is null or v.cover_url = '' or v.cover_url = '/images/food/waakye.jpg')
  and (v.name ~* '(fried rice|jollof|indomie|waakye)'
       or exists (select 1 from unnest(v.cuisine_tags) t where t ~* '^(fried rice|jollof|indomie|waakye)$'));

-- What changed
select 'dishes with the new photos' as what, count(*) from menu_items where image_url in ('/images/food/indomie.jpg', '/images/food/jollof-chicken.jpg', '/images/food/fried-rice.jpg', '/images/food/waakye-plate.jpg')
union all
select 'restaurant covers', count(*) from vendors where cover_url in ('/images/food/indomie.jpg', '/images/food/jollof-chicken.jpg', '/images/food/fried-rice.jpg', '/images/food/waakye-plate.jpg');
