# Relax&Bite

Customer website plus vendor, rider and admin panels, built with Astro + Tailwind CSS v4.
Runs on sample data for now. The backend (Supabase) replaces `src/data/store.ts`.

## Install into your project

1. Extract this zip.
2. Copy `src`, `public` and `astro.config.mjs` into your `relax-and-bite` folder
   and choose **Replace** when Windows asks. Keep your `.env`, `node_modules`
   and your `src/lib/supabase*.ts` files.
3. Make sure these are installed (run once):
   npm install @tailwindcss/forms @fontsource-variable/plus-jakarta-sans
4. Restart: Ctrl + C, then `npm run dev`.

## Pages

| Page | What it does |
|---|---|
| `/` | Home: categories, open restaurants, opening later |
| `/search` | Search dishes and restaurants, browse by category |
| `/vendors/[slug]` | Restaurant menu, item options, add to cart |
| Cart drawer | Opens over any page from the cart button; `/cart` is the full-page version |
| `/checkout` | Delivery details, payment method, place order |
| `/orders` | Orders in progress and past orders |
| `/orders/[code]` | Live order status, cancel, rate, reorder |
| Delivery area popup | Opens from "Deliver to"; `/location` is the full-page version |
| Sign-in popup | Continue with Google, or email address then a 6-digit code |
| `/account` | Account, delivery area, sign out |
| `/help` | FAQs, call and WhatsApp support, vendor and rider sign-up |

## Where things live

- `src/styles/global.css` design tokens and shared classes (btn, card, field-input, chip)
- `src/data/types.ts` data shapes (match the Supabase tables)
- `src/data/mock.ts` sample restaurants, menus and zones
- `src/data/store.ts` all data access; the only file the backend step rewrites
- `src/data/site.ts` support phone, WhatsApp and email (fill in before launch)
- `src/lib/cart.ts` cart saved in the browser
- `src/lib/confirm.ts` "Are you sure?" dialog for harmful actions
- `src/lib/session.ts` cookies for delivery area and sign-in
- `src/lib/overlays.ts` opens popups from any `data-open="cart|auth|location"` link
- `src/components/overlays/` the cart drawer, sign-in and delivery area popups
- `src/pages/api/` small endpoints the popups call

## Sign-in (email code or Google) and order emails

Customers sign in with Google, or with a 6-digit code sent to their email.
Vendors and riders get an email when a new order comes in and when food is
ready for pickup (if they added an email in sign-up or Account settings).
Emails go through Resend (resend.com).

Run `supabase/10_email_accounts.sql` once in Supabase > SQL Editor.

Add to `.env` (never on GitHub, never in the app, never pasted in a chat),
then restart `npm run dev`:

    RESEND_API_KEY=re_...
    EMAIL_FROM=Relax&Bite <orders@yourdomain.com>
    GOOGLE_CLIENT_ID=....apps.googleusercontent.com
    GOOGLE_CLIENT_SECRET=...
    PUBLIC_SITE_URL=https://your-live-site.netlify.app

Resend
- Sign up at resend.com > API Keys > Create API key (Sending access). Copy it into `.env`.
- Until you add your own domain (Resend > Domains, then the DNS records it shows),
  Resend only delivers to the email you signed up with. Fine for testing; add a
  domain before launch and use it in EMAIL_FROM.
- Without a key, while developing: sign-in codes show on screen ("Test mode") and
  order emails are only written to the `npm run dev` window (lines starting `[email]`).
  On the live site, email sign-in waits until a key is set.
- A code works once, for 10 minutes, with 5 tries. A new code at most once a
  minute, 5 an hour per email, 20 an hour per device.

Google
- console.cloud.google.com > create a project > APIs & Services > OAuth consent
  screen (External, app name Relax&Bite, your support email) > Credentials >
  Create credentials > OAuth client ID > Web application.
- Authorised redirect URIs: `https://<your live site>/api/auth/google/callback`
  and `http://localhost:4321/api/auth/google/callback`.
- Copy the client ID and secret into `.env`. The Google button only shows once both are set.
- Google doesn't accept your Wi-Fi address (192.168...) as a redirect, so on a
  phone during development use email sign-in; Google works on localhost and the live site.
- In the Android app, Google opens in the phone's browser and then returns to the
  app. That needs the intent-filter in `android/AndroidManifest-signin-snippet.xml`
  pasted into `android/app/src/main/AndroidManifest.xml`.

On Netlify, add the same values under Site configuration > Environment variables.

## Notifications for vendors, riders and admins

The panels show "Turn on notifications". When they tap Allow, the phone or
browser asks its own question; once allowed they get a notification for:
- Vendors: every new order (paid orders as soon as they're paid)
- Riders (while online): a new delivery in their town, and food ready for pickup
- Admins: every new order, and new restaurant or rider applications
Account settings has the same switch, plus "Send a test".

Run `supabase/11_push_notifications.sql` once in Supabase > SQL Editor.

Browsers (Chrome, Edge, Firefox; on phones too):
1. In PowerShell, in the project folder:  `node scripts/vapid-keys.mjs`
2. Paste the two lines it prints into `.env` (and Netlify):
   `VAPID_PUBLIC_KEY=...` and `VAPID_PRIVATE_KEY=...`  (keep the private one secret)
3. Restart `npm run dev`. Works on localhost and the live https site. On your
   Wi-Fi address (http://192.168...) browsers don't allow notifications.

The Android app (Firebase Cloud Messaging):
1. console.firebase.google.com > Add project (Relax&Bite).
2. Add app > Android > package name `com.relaxandbite.app` > download
   `google-services.json` and put it in `android/app/`.
3. Project settings > Service accounts > Generate new private key. Open the
   downloaded file, copy everything, and paste it into `.env` on ONE line:
   `FCM_SERVICE_ACCOUNT={"type":"service_account",...}`  (never on GitHub, never in chat)
4. In PowerShell:  `npm install @capacitor/push-notifications`  then  `npx cap sync android`
5. Build and install the app again from Android Studio.

Email alerts (above) keep working as well.

## Demo behaviour

- New orders move through the steps on a timer (accepted after 20 s, delivered
  after 5 min) so tracking can be tested. Orders reset when the dev server restarts.
- MoMo and card orders are marked paid straight away; Paystack comes with the backend.
- Food photos in `public/images/food` are temporary placeholders.

## Partner panels

| Page | Who | What it does |
|---|---|---|
| `/partner` | Anyone | Choose to register as a vendor or rider |
| `/partner/register/vendor` | New vendors | Business, owner and sign-in details |
| `/partner/register/rider` | New riders | Ghana Card, vehicle and sign-in details |
| `/partner/login` | Partners | Email and password sign-in, sends each role to its panel |
| `/partner/pending` | Partners | "Under review", "declined" or "paused" status |
| `/vendor` | Vendors | Orders board (New, Preparing, Ready), open or close store |
| `/vendor/menu` | Vendors | Add, edit, remove dishes, photos, sold out, sections |
| `/vendor/settings` | Vendors | Store profile, hours, prep time, minimum order, cover photo |
| `/rider` | Riders | Go online, accept requests, pickup and delivery steps |
| `/rider/history` | Riders | Past deliveries and earnings |
| `/admin` | Admin | Today's numbers and what needs attention |
| `/admin/orders` | Admin | All orders, assign riders, cancel |
| `/admin/applications` | Admin | Approve or decline vendors and riders |
| `/admin/vendors`, `/admin/riders` | Admin | Suspend or reactivate |
| `/admin/zones` | Admin | Delivery areas and fees |

### Test accounts (development only)

| Role | Email | Password |
|---|---|---|
| Admin | admin@relaxandbite.com | Admin@1234 |
| Vendor | esi@relaxandbite.com | Vendor@1234 |
| Rider | kofi@relaxandbite.com | Rider@1234 |

There's also a pending vendor (Ama's Fried Rice) and a pending rider (Yaw Mensah) to approve.

### Test the full flow

Use two browser windows (one normal, one private) to be two people at once.

1. Customer: order from Auntie Esi's Kitchen.
2. Vendor (esi@...): Accept, then Mark as ready.
3. Rider (kofi@...): Accept delivery, I've picked up the food, Mark as delivered.
4. Customer: the order page updates every 15 seconds and shows the rider.

All data lives in memory and resets when the dev server restarts. Supabase replaces
`src/data/db.ts`, `store.ts` and `partners.ts` in the backend step.

## Safety features

| Feature | Who it protects | Where |
|---|---|---|
| 4-digit delivery code per order, rider must enter it to finish (5 tries, then support) | Customer, rider | Order page, rider panel |
| Admin can confirm a delivery without the code, only with a logged reason | Everyone | Admin, Orders |
| Order details and code visible only to the person who ordered (same browser or signed-in phone) | Customer | Order page |
| Rider face photo, Ghana Card photo and emergency contact required to register | Everyone | Rider registration, admin approval |
| Rider photo, vehicle and plate shown to the customer and the restaurant | Customer, vendor | Order page, vendor board |
| Cash on delivery only for phone-verified customers, up to GH₵ 300 (`SITE.cashLimit`) | Vendor, rider | Checkout |
| Report a problem from every side, urgent ones highlighted for admin | Everyone | Order page, vendor board, rider panel, admin Reports |
| Sign-in paused for 15 minutes after 5 wrong passwords | Partners | Partner sign-in |
| Activity log of who did what | Admin | Admin overview |

## Towns and localities

Each town (delivery fee) has localities, for example Zongo and Ahenema in Breman Asikuma.

- Vendors choose town and locality when registering and in Store settings.
- Customers choose town and locality in the delivery area popup and at checkout.
- The home page shows locality chips and a row of restaurants for each locality.
- Riders and vendors see the locality on every order.
- Admin adds, renames or hides localities under Delivery areas.

The sample list only has a few localities. Add the real ones from the admin panel.

## Sales and earnings

- Vendors: **Sales and visits** (`/vendor/insights`). Food sales, orders, store visitors, how many visitors
  ordered, sales chart, busiest hours, visit-to-order funnel, dishes by views and sales, and the
  payout after the Relax&Bite fee (`SITE.commissionRate`, 10% for now).
- Riders: **Earnings** (`/rider/history`). Earnings, deliveries, cash collected, average delivery time,
  earnings chart and every delivery.
- Each has Today, Last 7 days and Last 30 days, compared with the period before.
- Visits are counted when someone opens a store page (once per visitor per day for "visitors"),
  plus dish opens and add-to-cart. The owner viewing their own page isn't counted.
- 60 days of sample history is generated so the charts have data while testing.

## Screen sizes

- Phones from 320px: header is two rows (delivery area + cart, then search).
- Tablets and laptops: one-row header (logo, delivery area, search, account, cart).
- Large monitors and TVs: the base font size rises at 1800px, 2400px and 3200px wide, and every size
  is in rem, so the whole layout scales up evenly. Focus outlines get thicker for TV remotes.
- Admin menu: Overview, Orders, Partners (Applications, Vendors, Riders tabs), Reports, Delivery areas.

## Launch area and growth

- Live in Breman Asikuma only. Odoben and Brakwa are in the data but switched off.
- Towns belong to a region (for example Central). Add a new town switched off in admin,
  set up its localities, then tick "Delivering here" to open it.
- While only one town is live, customers and partners see it as fixed text instead of a dropdown.
- Commission: 10% of the food total (`SITE.commissionRate`).

## Instant checks

- Phone boxes (every `type="tel"` input) are checked as you type: MTN, Telecel or AirtelTigo
  numbers show a green tick with the network; wrong length, letters or other prefixes show the reason.
  The server applies the same rules (`src/lib/format.ts`).
- "Use my location" (delivery area popup, checkout, vendor registration) checks the person's position
  against each live town's centre and radius, and warns straight away if they're outside.
  Set a town's map position in admin, Delivery areas.

## Favourites

- Heart on every restaurant card, on the restaurant page, and on each dish (inside the dish popup).
  Saved dishes show a small heart on the menu.
- `/favourites` lists saved dishes and restaurants; empty state sends people back to the store.
- Phone bottom bar: Home, Search, Favourites, Orders, Account. Bigger screens: Account page and footer.
- Saved on the device for now (`src/lib/favourites.ts`); the backend step can sync them to the account.

## v11: welcome screens, legal pages

- Light theme only. All colours live in `src/styles/global.css` under `@theme`.
- First launch on a phone (or when opened as an installed app), people who aren't signed in see:
  1. `/welcome`: phone number, 6-digit SMS code with a resend timer, or Skip
  2. `/welcome/location`: allow location (checks they're inside Breman Asikuma), then choose a locality
  3. Home
  It shows once per device. To see it again, clear site data or delete the `rb_onboarded` cookie.
- `/privacy` and `/terms`, linked from sign-in, welcome screens, footer, account, help and partner sign-up.
  Fill in `legalName`, `address` and support contacts in `src/data/site.ts`, and have a lawyer review both pages before launch.
- `public/manifest.webmanifest` and `public/icons/` let phones install the site as an app (Add to Home screen).
- Fixed: saving the delivery area and checkout broke when only one town is active.
