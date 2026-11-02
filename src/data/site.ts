// Business details shown across the site. Fill these in before launch.
export const SITE = {
  name: 'Relax&Bite',
  area: 'Breman Asikuma',
  // Under the name in the app's intro
  slogan: 'Bite the town from your comfort zone',
  // Legal pages: the business that runs Relax&Bite.
  legalName: 'Paa Asane Technologies',
  address: 'Breman Asikuma, Central Region, Ghana',
  legalUpdated: '15 October 2026',
  supportPhone: '0508934500',
  supportWhatsApp: '233508934500', // same number, international format without +
  supportEmail: 'relaxnbite@gmail.com',
  // Relax&Bite's share (10%): taken off when a vendor or rider withdraws from their wallet.
  commissionRate: 0.1,
  // New restaurants pay no fee for this many days after they're approved.
  freeDays: 30,
  // Cash on delivery is off: every order is paid in the app (Mobile Money or card),
  // so vendor and rider wallets always add up. Set to true to bring it back.
  cashOnDelivery: false,
  cashLimit: 100, // GH₵. Largest order that can be paid in cash on delivery (when it's on).
  minWithdrawal: 10, // GH₵. Smallest amount a vendor or rider can withdraw.
  promoDiscount: 10, // GH₵. Usual discount on a new promo code (first order only). Paid by Relax&Bite.
  builtBy: { name: 'Paa Asane Technologies', url: 'https://paatech.vercel.app' },
  // Shown with the credit line on the Account page in the app
  appVersion: '1.0.0',
  // Added to the browser name by the Android app (capacitor.config.ts), so pages know they're in the app
  appUserAgent: 'RelaxBiteApp',
};

const DAY_MS = 864e5;

/** When a store's free first month ends, or null if it isn't approved yet. */
export function freeUntil(approvedAt: string | null | undefined): Date | null {
  if (!approvedAt) return null;
  return new Date(new Date(approvedAt).getTime() + SITE.freeDays * DAY_MS);
}

/** Relax&Bite's share for an order placed now: nothing in the store's free first month. */
export function commissionFor(approvedAt: string | null | undefined, now = Date.now()): number {
  const end = freeUntil(approvedAt);
  return end && now < end.getTime() ? 0 : SITE.commissionRate;
}
