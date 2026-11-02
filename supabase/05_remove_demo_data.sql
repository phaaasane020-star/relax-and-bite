-- =====================================================================
-- Removes the demo restaurants, menus, riders and their test orders
-- (everything 04_demo_data.sql added). Run before launch.
-- Your admin account, towns, localities and real partners are not touched.
-- The activity log keeps its history (it can never be deleted).
-- =====================================================================
with demo_vendors as (
  select v.id from vendors v
  join partner_accounts a on a.id = v.owner_account_id
  where a.phone in ('0240000001', '0240000002', '0240000003', '0240000004', '0240000005')
)
delete from orders where vendor_id in (select id from demo_vendors);

delete from vendors where owner_account_id in (
  select id from partner_accounts where phone in ('0240000001', '0240000002', '0240000003', '0240000004', '0240000005')
);

delete from partner_accounts
where role <> 'admin'
  and phone in ('0240000001', '0240000002', '0240000003', '0240000004', '0240000005', '0550000001', '0550000002');

insert into activity_log (actor, action, kind) values ('System', 'Demo data removed', 'admin');
