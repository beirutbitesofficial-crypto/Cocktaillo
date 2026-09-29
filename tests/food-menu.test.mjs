import test from 'node:test';
import assert from 'node:assert/strict';
import { foodMenu, ensureFoodMenu } from '../lib/food-seed.js';
import { normalizeMenuLocation } from '../lib/menu-taxonomy.js';
import { arabicCategory } from '../lib/menu-labels.js';

test('food menu covers the digital menu with Arabic names, kitchen station and unique ids', () => {
  assert.equal(foodMenu.length, 28);
  assert.equal(new Set(foodMenu.map(i => i.id)).size, foodMenu.length);
  for (const item of foodMenu) {
    assert.match(item.name_ar, /[؀-ۿ]/);
    assert.equal(item.station, 'kitchen');
    assert.ok(Number.isSafeInteger(item.price_cents) && item.price_cents > 0);
  }
  const sandwiches = foodMenu.filter(i => i.subcategory === 'Sandwiches').map(i => [i.name_en, i.price_cents]);
  assert.deepEqual(sandwiches, [['Fahita', 722], ['Spicy Fahita', 750], ['Chicken Sub', 611], ['Crispy', 611], ['Twister', 722]]);
  assert.deepEqual(normalizeMenuLocation('Food', 'Sandwiches'), { category: 'Food', subcategory: 'Sandwiches' });
  assert.equal(arabicCategory({ category: 'Food', subcategory: 'Sandwiches' }), 'سندويشات');
});

test('existing website items are upgraded instead of duplicated, deleted ones stay deleted, and it is idempotent', () => {
  const state = { menu: [
    { id: 'web-sandwiches-fahita', name_en: 'Fahita', name_ar: 'Fahita', category: 'Sandwiches', subcategory: '', price_cents: 700, station: 'bar' },
    { id: 'web-burgers-cocktaillo-bruger', name_en: 'Cocktaillo bruger', name_ar: 'Cocktaillo bruger', category: 'Burgers (chicken)', price_cents: 855 },
    { id: 'web-appetizers-onions-rings', name_en: 'Onions rings', category: 'Appetizers', price_cents: 333, deleted: true },
    { id: 'dessert-crispy', name_en: 'Crispy', category: 'Dessert', subcategory: 'Crepe', price_cents: 500 },
  ] };
  const first = ensureFoodMenu(state);
  assert.equal(first.upgraded, 2);
  const fahita = state.menu.find(i => i.id === 'web-sandwiches-fahita');
  assert.deepEqual([fahita.category, fahita.subcategory, fahita.station, fahita.name_ar, fahita.price_cents], ['Food', 'Sandwiches', 'kitchen', 'فاهيتا', 700]);
  assert.equal(state.menu.find(i => i.id === 'web-burgers-cocktaillo-bruger').name_en, 'Cocktaillo Burger');
  assert.equal(state.menu.find(i => i.id === 'web-appetizers-onions-rings').deleted, true);
  // The dessert named "Crispy" is never taken over; the Crispy sandwich is added separately.
  assert.equal(state.menu.find(i => i.id === 'dessert-crispy').category, 'Dessert');
  assert.ok(state.menu.some(i => i.id === 'food-sandwiches-crispy'));
  assert.equal(state.menu.filter(i => /fahita/i.test(i.name_en) && !/spicy/i.test(i.name_en)).length, 1);
  const count = state.menu.length;
  assert.deepEqual(ensureFoodMenu(state), { added: 0, upgraded: 0, merged: 0 });
  assert.equal(state.menu.length, count);
});

test('food sections come first, keeping each group in its original order', async () => {
  const { foodFirst } = await import('../lib/food-seed.js');
  const items = [
    { id: 'wings', category: 'Food', subcategory: 'Appetizers' },
    { id: 'crepe', category: 'Dessert', subcategory: 'Crepe' },
    { id: 'fahita', category: 'Food', subcategory: 'Sandwiches' },
    { id: 'orange', category: 'Cold Beverage', subcategory: 'Fresh Juices' },
    { id: 'caesar', category: 'Salads', subcategory: 'Signature Salad' },
    { id: 'zinger', category: 'Food', subcategory: 'Chicken Burgers' },
  ];
  assert.deepEqual(foodFirst(items).map(i => i.id), ['fahita', 'zinger', 'wings', 'caesar', 'crepe', 'orange']);
});

test('duplicate burgers and platters from the website are merged into one item and one section', async () => {
  const { ensureFoodMenu, foodMenu } = await import('../lib/food-seed.js');
  const { cleanupMenuTaxonomy } = await import('../lib/menu-taxonomy.js');
  const state = { categories: [], recipes: [{ id: 'r1', menu_item_id: 'web-platters-plate-chicken-breast', lines: [] }], menu: [
    ...foodMenu.map(i => ({ ...i })),
    { id: 'web-burgers-beef-swiss-mushroom-burgers', name_en: 'Swiss mushroom burgers', name_ar: 'Swiss mushroom burgers', category: 'Burgers (beef)', subcategory: '', price_cents: 777, station: 'bar' },
    { id: 'web-platters-plate-chicken-breast', name_en: 'Plate chicken breast', category: 'platters', subcategory: '', price_cents: 1000 },
    { id: 'web-burgers-chicken-zinger', name_en: 'Zinger', category: 'Burgers (chicken)', subcategory: '', price_cents: 755 },
    { id: 'web-sandwiches-club', name_en: 'Club Sandwich', category: 'Sandwiches', subcategory: '', price_cents: 650, station: 'bar' },
  ] };
  const result = ensureFoodMenu(state);
  assert.equal(result.merged, 3);
  for (const id of ['web-burgers-beef-swiss-mushroom-burgers', 'web-platters-plate-chicken-breast', 'web-burgers-chicken-zinger']) {
    const dup = state.menu.find(i => i.id === id);
    assert.equal(dup.deleted, true); assert.match(dup.merged_into, /^food-/);
  }
  // The recipe follows the dish so stock deduction keeps working.
  assert.equal(state.recipes[0].menu_item_id, 'food-platters-chicken-breast-plate');
  cleanupMenuTaxonomy(state);
  const club = state.menu.find(i => i.id === 'web-sandwiches-club');
  assert.deepEqual([club.category, club.subcategory, club.station], ['Food', 'Sandwiches', 'kitchen']);
  const sections = new Set(state.menu.filter(i => !i.deleted).map(i => i.subcategory || i.category));
  for (const old of ['Burgers (beef)', 'Burgers (chicken)', 'platters']) assert.ok(!sections.has(old));
  assert.ok(!state.categories.some(c => /burgers \(|^platters$/i.test(c)));
  assert.deepEqual(ensureFoodMenu(state), { added: 0, upgraded: 0, merged: 0 });
});

test('pressing the website menu sync does not recreate the merged duplicates', async () => {
  const { ensureFoodMenu, foodMenu } = await import('../lib/food-seed.js');
  const { mergeCocktailloWebsiteMenu } = await import('../lib/alqaima-menu.js');
  const state = { categories: [], recipes: [], menu: foodMenu.map(i => ({ ...i })) };
  ensureFoodMenu(state);
  const before = state.menu.length;
  const out = mergeCocktailloWebsiteMenu(state, [
    { name: 'Swiss mushroom burgers', price: 7.77, category: 'Burgers (beef)' },
    { name: 'Plate chicken breast', price: 10, category: 'platters' },
    { name: 'Cocktaillo bruger', price: 8.55, category: 'Burgers (chicken)' },
    { name: 'Chicken Tawouk', price: 5, category: 'Sandwiches' },
  ]);
  assert.deepEqual([out.added, out.updated], [1, 3]);
  assert.equal(state.menu.length, before + 1);
  const swiss = state.menu.find(i => i.id === 'food-beef-burgers-swiss-mushroom-burger');
  assert.deepEqual([swiss.category, swiss.subcategory, swiss.station], ['Food', 'Beef Burgers', 'kitchen']);
  const tawouk = state.menu.find(i => i.name_en === 'Chicken Tawouk');
  assert.deepEqual([tawouk.category, tawouk.subcategory, tawouk.station], ['Food', 'Sandwiches', 'kitchen']);
});
