-- =====================================================================
-- Removes the 20 test riders from 17_test_riders.sql (phones 0550000101-0550000120).
-- Orders they delivered stay; the rider on them is just cleared.
-- =====================================================================
delete from partner_accounts
where role = 'rider' and phone between '0550000101' and '0550000120';

insert into activity_log (actor, action, kind) values ('System', 'Test riders removed', 'admin');
