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

// Food sections are listed before drinks, desserts and shisha everywhere the menu is shown.
export const isFoodItem = (item) => item?.category === 'Food' || item?.subcategory === 'Signature Salad';
export function foodFirst(items = []) {
  const rank = (item) => { const i = foodSubcategories.indexOf(item.subcategory); return i < 0 ? foodSubcategories.length : i; };
  const food = items.filter(isFoodItem).map((item, i) => [item, i]).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j).map(([item]) => item);
  return [...food, ...items.filter((item) => !isFoodItem(item))];
}
export const foodSubcategories = ['Sandwiches', 'Beef Burgers', 'Chicken Burgers', 'Pasta', 'Platters', 'Appetizers', 'Signature Salad'];

// Name key that treats spelling variants of the same dish as one: case, accents, plurals,
// word order, "(4 pcs)" counts and known typos (bruger, fajita).
export function foodNameKey(name) {
  return String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/\b\d+\s*pcs?\b/g, ' ').replace(/bruger/g, 'burger').replace(/fajita/g, 'fahita')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).sort().join(' ');
}
const drinkOrSweet = /^(dessert|cold beverage|hot beverage|cocktail|hookah)$/i;
const isSeedItem = (item) => /^food-/.test(String(item?.id || '')) || Boolean(item?.food_seed_id);
export { isSeedItem as isFoodSeedItem };

// Adds the food menu and merges duplicates of the same dish (e.g. website "Plate chicken breast"
// and "Chicken Breast Plate") into one item. Merged copies are hidden, never removed, so order
// history stays intact; manager-deleted dishes stay deleted and prices a manager set are kept.
export function ensureFoodMenu(state) {
  state.menu = Array.isArray(state.menu) ? state.menu : [];
  state.recipes = Array.isArray(state.recipes) ? state.recipes : [];
  const foodLike = (item) => !drinkOrSweet.test(String(item.category || '').trim());
  let added = 0, upgraded = 0, merged = 0;
  out.forEach(({ aliases, ...seed }, i) => {
    const keys = new Set([seed.name_en, ...aliases].map(foodNameKey));
    const own = state.menu.find((item) => item.id === seed.id || item.food_seed_id === seed.id);
    if (own?.deleted) return;
    const matches = state.menu.filter((item) => !item.deleted && item !== own && foodLike(item) && keys.has(foodNameKey(item.name_en)));
    let canonical = own || matches.shift();
    if (!canonical) {
      if (state.menu.some((item) => item.deleted && foodLike(item) && keys.has(foodNameKey(item.name_en)))) return;
      state.menu.push({ ...seed, sort_order: 300 + i });
      added++;
      return;
    }
    if (canonical !== own) {
      Object.assign(canonical, {
        name_en: seed.name_en,
        name_ar: canonical.name_ar && canonical.name_ar !== canonical.name_en && /[؀-ۿ]/.test(canonical.name_ar) ? canonical.name_ar : seed.name_ar,
        category: seed.category,
        subcategory: seed.subcategory,
        station: 'kitchen',
        food_seed_id: seed.id,
        price_cents: Number.isFinite(Number(canonical.price_cents)) ? canonical.price_cents : seed.price_cents,
      });
      upgraded++;
    }
    for (const dup of matches) {
      Object.assign(dup, { deleted: true, available: false, merged_into: canonical.id });
      if (!state.recipes.some((r) => r.menu_item_id === canonical.id))
        for (const recipe of state.recipes) if (recipe.menu_item_id === dup.id) recipe.menu_item_id = canonical.id;
      merged++;
    }
  });
  return { added, upgraded, merged };
}
