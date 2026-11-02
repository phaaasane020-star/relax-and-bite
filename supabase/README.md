# Relax&Bite database (Supabase)

Run in Supabase > SQL Editor, each file in a New query, in this order. Each file runs once.

0. `00_remove_old_schema.sql`: only if you ran the very first schema (profiles, delivery_zones). Already done.
1. `01_schema.sql`: tables. Already done.
2. `02_seed.sql`: Breman Asikuma, localities, admin account. Already done.
3. `03_app_bridge.sql`: lets the app's server talk to the database. Required.
4. `04_demo_data.sql`: optional sample restaurants, menus and riders for testing.
5. `05_remove_demo_data.sql`: run before launch to remove the demo data.
6. `06_promo_codes.sql`: promo codes for promoters (money off a customer's first order). Required.
7. `07_payments.sql`: Paystack payment records. Safe to run now; used once Paystack is connected.
8. `08_towns.sql`: adds Tarkwa and Takoradi, switches localities off. Required.
9. `09_vendor_delivery_fee.sql`: each restaurant sets its own delivery fee. Required.
10. `10_email_accounts.sql`: customers sign in with email or Google; vendor and rider emails for order alerts. Required.

`.env` in the project folder (never on GitHub, never in the app):

    SUPABASE_URL=https://your-project-id.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=your-secret-key
    PAYSTACK_SECRET_KEY=sk_test_...

The Paystack secret key is under Paystack > Settings > API Keys & Webhooks. Use the test key (sk_test_) while testing:
no real money moves. Without it, online orders are marked paid straight away (for testing only).
Also set the Webhook URL there to https://your-site/api/paystack/webhook once the site is online.

On Netlify, add the same two values under Site configuration > Environment variables.

