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
  assert.equal(first.upgraded, 3);
  const fahita = state.menu.find(i => i.id === 'web-sandwiches-fahita');
  assert.deepEqual([fahita.category, fahita.subcategory, fahita.station, fahita.name_ar, fahita.price_cents], ['Food', 'Sandwiches', 'kitchen', 'فاهيتا', 700]);
  assert.equal(state.menu.find(i => i.id === 'web-burgers-cocktaillo-bruger').name_en, 'Cocktaillo Burger');
  assert.equal(state.menu.find(i => i.id === 'web-appetizers-onions-rings').deleted, true);
  // The dessert named "Crispy" is never taken over; the Crispy sandwich is added separately.
  assert.equal(state.menu.find(i => i.id === 'dessert-crispy').category, 'Dessert');
  assert.ok(state.menu.some(i => i.id === 'food-sandwiches-crispy'));
  assert.equal(state.menu.filter(i => /fahita/i.test(i.name_en) && !/spicy/i.test(i.name_en)).length, 1);
  const count = state.menu.length;
  assert.deepEqual(ensureFoodMenu(state), { added: 0, upgraded: 0 });
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
