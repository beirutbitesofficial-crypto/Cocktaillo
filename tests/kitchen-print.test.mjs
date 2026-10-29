import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrder } from '../lib/create-order.js';
import { printsStation, productionPrinterName } from '../lib/production-print.js';

const waiter = { id: 'w1', name: 'Mira', role: 'waiter' };
function state(settings = {}) {
  return {
    settings: { exchange_rate: 89500, bar_printer_name: 'Bar Printer', ...settings },
    users: [{ id: 'c1', role: 'cashier', active: true }], shifts: [{ id: 's1', user_id: 'c1', status: 'open' }],
    tables: [{ id: 't1', name: 'Table 1' }], orders: [], tickets: [], print_jobs: [], addons: [], next_order_number: 1,
    menu: [
      { id: 'fahita', name_en: 'Fahita', name_ar: 'فاهيتا', category: 'Food', subcategory: 'Sandwiches', price_cents: 722, station: 'kitchen', available: true },
      { id: 'orange', name_en: 'Orange', name_ar: 'برتقال', category: 'Cold Beverage', subcategory: 'Fresh Juices', price_cents: 250, station: 'bar', available: true },
    ],
  };
}
const order = (id) => ({ request_id: id, type: 'table', table_id: 't1', lines: [{ menu_item_id: 'fahita', quantity: 2 }, { menu_item_id: 'orange', quantity: 1 }] });

test('food goes to its own Kitchen print job only once the manager enables kitchen printing', () => {
  const off = state();
  createOrder(off, waiter, order('r1'));
  assert.deepEqual(off.print_jobs.map(j => j.destination), ['bar']);
  assert.ok(off.tickets.some(t => t.station === 'kitchen'), 'food still shows on the Kitchen board');

  const on = state({ kitchen_printing_enabled: true, kitchen_printer_name: 'KITCHEN' });
  createOrder(on, waiter, order('r2'));
  const kitchen = on.print_jobs.find(j => j.destination === 'kitchen'), bar = on.print_jobs.find(j => j.destination === 'bar');
  assert.equal(kitchen.printer_name, 'KITCHEN');
  assert.equal(bar.printer_name, 'Bar Printer');
  const kitchenTicket = on.tickets.find(t => t.id === kitchen.ticket_id);
  assert.deepEqual(kitchenTicket.lines.map(l => [l.name_ar, l.quantity]), [['فاهيتا', 2]]);
  assert.ok(!kitchenTicket.lines.some(l => l.name_en === 'Orange'), 'drinks never print in the kitchen');
});

test('printer names and stations', () => {
  assert.equal(productionPrinterName({}, 'kitchen'), 'Kitchen Printer');
  assert.equal(productionPrinterName({}, 'hookah'), 'HOOKAH');
  assert.equal(productionPrinterName({}, 'bar'), 'Bar Printer');
  assert.equal(printsStation({}, 'kitchen'), false);
  assert.equal(printsStation({ kitchen_printing_enabled: true }, 'kitchen'), true);
  assert.equal(printsStation({}, 'service'), false);
});
