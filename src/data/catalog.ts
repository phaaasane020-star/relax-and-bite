// Food types shown as quick filters on the home and search pages.
export const foodCategories = ['Jollof', 'Waakye', 'Banku', 'Fufu', 'Grills', 'Fried rice', 'Breakfast', 'Soups'];

// Kinds of food business (restaurant sign-up)
export const businessTypes = ['Restaurant', 'Chop bar', 'Fast food', 'Café or snacks', 'Home kitchen', 'Drinks and juice'];

// What vendors tap to say what they sell (sign-up and Store settings).
// Starts with the home page filters so those always find them.
export const vendorFoodTypes = [
  ...foodCategories,
  'Kenkey',
  'Kelewele',
  'Rice and stew',
  'Red red',
  'Tuo zaafi',
  'Indomie',
  'Chicken',
  'Fish',
  'Shawarma',
  'Pizza',
  'Burgers',
  'Pastries',
  'Drinks',
  'Fruit',
];

/** Food types from a form: the chips tapped plus anything typed in "Something else" (max 6). */
export function foodTypesFromForm(form: FormData): string[] {
  const picked = form.getAll('cuisine').map((v) => String(v));
  const typed = String(form.get('cuisine_other') ?? '').split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...picked, ...typed]) {
    const t = raw.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, 6);
}
