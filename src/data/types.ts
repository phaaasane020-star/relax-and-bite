// Shapes match the Supabase tables (snake_case). Ids are UUID strings,
// towns and localities use numbers.

/** A town we deliver in. Grouped by region as Relax&Bite spreads across Ghana. */
export type Zone = {
  id: number;
  name: string;
  region: string;
  delivery_fee: number;
  is_active: boolean;
  /** Town centre and delivery radius, for the "Use my location" check */
  lat: number | null;
  lng: number | null;
  radius_km: number;
};

/** A neighbourhood inside a town, for example Zongo in Breman Asikuma. */
export type Locality = {
  id: number;
  zone_id: number;
  name: string;
  is_active: boolean;
};

export type OptionChoice = { name: string; price: number };

export type OptionGroup = {
  name: string;
  required: boolean;
  max: number; // 1 = pick one (radio), more = pick several (checkbox)
  choices: OptionChoice[];
};

export type VendorStatus = 'pending' | 'approved' | 'suspended';

export type Vendor = {
  id: string;
  owner_account_id: string | null;
  slug: string;
  name: string;
  description: string;
  cuisine_tags: string[];
  address: string;
  zone_id: number;
  locality_id: number | null;
  phone: string;
  cover_url: string | null;
  prep_time_min: number;
  prep_time_max: number;
  min_order: number;
  /** Set by the restaurant; the rider earns it */
  delivery_fee: number;
  /** Open right now: switched on and within opening hours */
  is_open: boolean;
  /** The vendor's own open/closed switch */
  accepting: boolean;
  /** null until the owner sets their hours in Store settings */
  opens_at: string | null; // "07:00"
  closes_at: string | null; // "21:00"
  business_type?: string;
  rating: number;
  rating_count: number;
  status: VendorStatus;
  created_at: string;
  /** When the store was first approved (starts the free first month) */
  approved_at?: string | null;
};

export type MenuCategory = {
  id: number;
  vendor_id: string;
  name: string;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  vendor_id: string;
  category_id: number | null;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  options: OptionGroup[];
  is_available: boolean;
  is_popular: boolean;
};

export type OrderStatus =
  | 'pending_payment'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export type PaymentMethod = 'momo' | 'card' | 'cash';

export type SelectedOption = { group: string; choice: string; price: number };

export type OrderItem = {
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  options: SelectedOption[];
  line_total: number;
};

export type OrderEvent = { status: OrderStatus; at: string; note?: string; by?: string };

export type Order = {
  id: string;
  code: string;
  vendor_id: string;
  vendor_name: string;
  vendor_slug: string;
  vendor_phone: string;
  vendor_address: string;
  rider_id: string | null;
  rider_name: string;
  rider_phone: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: 'unpaid' | 'paid' | 'failed' | 'refunded';
  subtotal: number;
  /** Relax&Bite's share of the food total for this order (0 in a store's free first month) */
  commission_rate?: number;
  delivery_fee: number;
  /** Promo code used for the customer's first order, and the GH₵ it took off (paid by Relax&Bite) */
  promo_code: string | null;
  discount: number;
  /** The latest Paystack payment try (online orders) */
  paystack_reference?: string | null;
  total: number;
  zone_id: number;
  zone_name: string;
  locality_name: string;
  delivery_landmark: string;
  delivery_address: string;
  customer_phone: string;
  note: string;
  cancel_reason: string;
  /** The signed-in customer who placed it (for their notifications) */
  customer_id?: string | null;
  /** 4-digit code the customer gives the rider at the door. Never shown to vendor or rider. */
  delivery_code: string;
  delivery_code_attempts: number;
  /** The rider's face photo and plate, for the vendor to check at handover */
  rider_photo?: string | null;
  rider_plate?: string;
  /** When the current rider took the delivery */
  rider_assigned_at?: string | null;
  rating: number | null;
  created_at: string;
  items: OrderItem[];
  events: OrderEvent[];
};

// What the checkout form sends
export type CartInputLine = {
  itemId: string;
  qty: number;
  options: { group: string; choice: string }[];
};

export type CheckoutInput = {
  vendorId: string;
  lines: CartInputLine[];
  zoneId: number;
  localityId: number | null;
  /** The customer's own name for their area when it isn't on the list */
  area?: string;
  landmark: string;
  details: string;
  phone: string;
  note: string;
  paymentMethod: PaymentMethod;
  /** The signed-in customer's account (email or Google). Ordering needs one. */
  customerId: string | null;
  /** Promo code typed at checkout */
  promoCode?: string;
};

// ---------- Promo codes ----------
export type PromoCode = {
  id: number;
  code: string;
  promoter_name: string;
  promoter_phone: string | null;
  discount: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  /** Orders that used it and weren't cancelled */
  uses: number;
  /** Of those, how many were delivered */
  delivered: number;
  /** GH₵ taken off delivered orders */
  given: number;
  last_used: string | null;
};

// ---------- Partners (vendors, riders, admins) ----------
export type PartnerRole = 'vendor' | 'rider' | 'admin';
export type AccountStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export type PartnerAccount = {
  id: string;
  password_hash: string; // "salt:hash" (scrypt). Supabase Auth replaces this.
  role: PartnerRole;
  full_name: string;
  phone: string; // also the sign-in name, unique
  /** Where new-order emails go (vendors and riders), if they added one */
  email?: string | null;
  status: AccountStatus;
  status_reason: string;
  failed_logins: number;
  locked_until: number; // ms timestamp, 0 = not locked
  vendor_id: string | null;
  rider_id: string | null;
  created_at: string;
};

export type VehicleType = 'motorbike' | 'bicycle';

export type Rider = {
  id: string;
  account_id: string;
  full_name: string;
  phone: string;
  zone_id: number;
  vehicle: VehicleType;
  plate_number: string;
  licence_number: string;
  ghana_card: string;
  photo_url: string | null; // passport-sized photo, shown to customers and vendors
  ghana_card_photo_url: string | null; // admin only
  emergency_name: string;
  emergency_phone: string;
  is_online: boolean;
  rating: number;
  created_at: string;
};

// ---------- Visits (for vendor insights) ----------
export type TrafficDay = {
  views: number; // store page views
  unique: number; // different visitors that day
  add_to_cart: number;
  item_views: Record<string, number>; // dish id -> times opened
};

// ---------- Safety ----------
export type ReporterRole = 'customer' | 'vendor' | 'rider';

export type Issue = {
  id: string;
  order_code: string | null;
  reporter_role: ReporterRole;
  reporter_name: string;
  reporter_phone: string;
  category: string;
  message: string;
  status: 'open' | 'resolved';
  resolution: string;
  created_at: string;
  resolved_at: string | null;
};

export type ActivityKind =
  | 'signin' // signed in
  | 'signin_failed' // wrong password or code
  | 'lockout' // too many wrong passwords
  | 'signout'
  | 'register' // new vendor or rider application, new customer
  | 'order' // customer orders, cancels, rates
  | 'store' // vendor: orders, menu, settings, open/close
  | 'delivery' // rider actions
  | 'report' // problem reports
  | 'admin'; // anything an admin does

export type AuditEntry = {
  at: string;
  actor: string; // "Esi Mensah (vendor)"
  action: string; // "Accepted RB-1042"
  kind: ActivityKind;
  severity: 'info' | 'warning' | 'danger';
  ip?: string | null;
  device?: string | null; // "Chrome on Android"
};
