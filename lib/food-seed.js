// Kitchen food menu (Cocktaillo digital menu, alqaima.com). Prices in USD cents.
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const out = [];
// [English, Arabic, price_cents, aliases used by the old website sync]
function group(category, subcategory, rows) {
  for (const [name_en, name_ar, price_cents, aliases = []] of rows)
    out.push({ id: `food-${slug(subcategory)}-${slug(name_en)}`, name_en, name_ar, category, subcategory, price_cents, station: 'kitchen', allow_addons: false, available: true, aliases });
}

group('Food', 'Sandwiches', [
  ['Fahita', 'فاهيتا', 722],
  ['Spicy Fahita', 'فاهيتا حارّة', 750],
  ['Chicken Sub', 'تشيكن ساب', 611],
  ['Crispy', 'كريسبي', 611],
  ['Twister', 'تويستر', 722],
]);
group('Food', 'Beef Burgers', [
  ['Lebanese Burger', 'برغر لبناني', 556],
  ['Swiss Mushroom Burger', 'برغر سويس مشروم', 777, ['Swiss mushroom burgers']],
  ['Smashed Burger', 'سماشد برغر', 755, ['Smashed burgers']],
  ['Beef Mozzarella', 'برغر لحمة موزاريلا', 833],
]);
group('Food', 'Chicken Burgers', [
  ['Zinger', 'زنجر', 755],
  ['Chicken Mozzarella', 'برغر دجاج موزاريلا', 855],
  ['Cocktaillo Burger', 'برغر كوكتيلو', 855, ['Cocktaillo bruger']],
]);
group('Food', 'Pasta', [
  ['Fettuccine Alfredo Chicken', 'فيتوتشيني ألفريدو دجاج', 1000],
  ['Cocktaillo Pasta', 'باستا كوكتيلو', 1000],
  ['Fettuccine Alfredo', 'فيتوتشيني ألفريدو', 800],
]);
group('Food', 'Platters', [
  ['Chicken Breast Plate', 'طبق صدر دجاج', 1000, ['Plate chicken breast']],
  ['Chicken Mushroom Plate', 'طبق دجاج بالمشروم', 1200, ['Plate chicken mushroom']],
  ['Crispy Plate', 'طبق كريسبي', 1055, ['Plate crispy']],
]);
group('Food', 'Appetizers', [
  ['French Fries', 'بطاطا مقلية', 255],
  ['Curly Fries', 'كيرلي فرايز', 388],
  ['Wedges', 'ودجز', 388],
  ['Mozzarella Sticks (4 pcs)', 'أصابع موزاريلا (4 قطع)', 333, ['Mozzarella Sticks']],
  ['Cheese Balls (6 pcs)', 'كرات جبنة (6 قطع)', 445, ['Cheese balls']],
  ['Jalapeño Bites (4 pcs)', 'جالابينو بايتس (4 قطع)', 445, ['Jalapeño bites', 'Jalapeno bites']],
  ['Onion Rings (8 pcs)', 'حلقات بصل (8 قطع)', 333, ['Onions rings', 'Onion rings']],
]);
group('Salads', 'Signature Salad', [
  ['Caesar Salad', 'سلطة سيزر', 600],
  ['Chicken Caesar Salad', 'سلطة سيزر بالدجاج', 800],
  ['Crab Salad', 'سلطة كراب', 800],
]);

export const foodMenu = out.map(({ aliases, ...item }, i) => ({ ...item, sort_order: 300 + i }));
export const foodCategories = ['Food'];
export const foodSubcategories = ['Sandwiches', 'Beef Burgers', 'Chicken Burgers', 'Pasta', 'Platters', 'Appetizers', 'Signature Salad'];

// Adds the food menu once. Items the old website sync already created (English-only, loose categories)
// are upgraded in place instead of duplicated; manager-deleted items stay deleted; prices a manager set stay.
export function ensureFoodMenu(state) {
  state.menu = Array.isArray(state.menu) ? state.menu : [];
  const byId = new Map();
  for (const i of state.menu) { byId.set(i.id, i); if (i.food_seed_id) byId.set(i.food_seed_id, i); }
  const byName = new Map();
  const drinkOrSweet = /^(dessert|cold beverage|hot beverage|cocktail|hookah)$/i;
  for (const item of state.menu) { const k = key(item.name_en); if (k && !byName.has(k) && !drinkOrSweet.test(String(item.category || '').trim())) byName.set(k, item); }
  let added = 0, upgraded = 0;
  out.forEach(({ aliases, ...seed }, i) => {
    const existing = byId.get(seed.id) || [seed.name_en, ...aliases].map((n) => byName.get(key(n))).find(Boolean);
    if (!existing) {
      const item = { ...seed, sort_order: 300 + i };
      state.menu.push(item);
      byId.set(item.id, item);
      added++;
      return;
    }
    if (existing.id === seed.id || existing.food_seed_id === seed.id) return;
    Object.assign(existing, {
      name_en: seed.name_en,
      name_ar: existing.name_ar && existing.name_ar !== existing.name_en && /[؀-ۿ]/.test(existing.name_ar) ? existing.name_ar : seed.name_ar,
      category: seed.category,
      subcategory: seed.subcategory,
      station: 'kitchen',
      food_seed_id: seed.id,
      price_cents: Number.isFinite(Number(existing.price_cents)) ? existing.price_cents : seed.price_cents,
    });
    upgraded++;
  });
  return { added, upgraded };
}
