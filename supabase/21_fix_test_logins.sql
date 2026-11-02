-- =====================================================================
-- Test sign-ins not working? Run this. It resets every test account to its
-- test password, unlocks it (5 wrong tries lock an account for 15 minutes)
-- and shows which test accounts exist. It doesn't touch real accounts.
--   Restaurants 024 000 0001-0005: Vendor@1234
--   Riders 055 000 0001-0002 and 055 000 0101-0120: Rider@1234
-- If the table at the end is empty or short, the test accounts were never
-- added: run 04_demo_data.sql (restaurants) and 17_test_riders.sql (riders).
-- =====================================================================
update partner_accounts set
  password_hash = 'adb5088e3e518d03dbdddfa06bdebe10:378080dc1567f19dac5688af3cd1b958a10deaa83e0be957d4e60da9868bbbb6',
  failed_logins = 0, locked_until = null
where role = 'vendor' and phone between '0240000001' and '0240000005';

update partner_accounts set
  password_hash = '7436e57c727c1b5a18aafd106570ddc1:c7113dc241457a2b07c68726a6c612d3c93e600ea13b7b36cd8e04f55a9e64ed',
  failed_logins = 0, locked_until = null
where role = 'rider' and (phone in ('0550000001', '0550000002') or phone between '0550000101' and '0550000120');

select role, full_name, phone, status,
  case role when 'vendor' then 'Vendor@1234' else 'Rider@1234' end as password
from partner_accounts
where (role = 'vendor' and phone between '0240000001' and '0240000005')
   or (role = 'rider' and (phone in ('0550000001', '0550000002') or phone between '0550000101' and '0550000120'))
order by role desc, phone;
