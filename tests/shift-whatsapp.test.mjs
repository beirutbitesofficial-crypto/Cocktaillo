import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappNumber, shiftWhatsAppText, shiftWhatsAppUrl } from '../lib/shift-whatsapp.js';

test('manager WhatsApp number is normalised for wa.me', () => {
  assert.equal(whatsappNumber('+96103384026'), '9613384026');
  assert.equal(whatsappNumber('00961 3 384026'), '9613384026');
  assert.equal(whatsappNumber('03384026'), '9613384026');
  assert.equal(whatsappNumber(), '9613384026');
});

test('shift WhatsApp message carries the saved summary and report link', () => {
  const shift = { id: 's1', user_name: 'Rana', opened_at: '2026-09-26T15:00:00Z', closed_at: '2026-09-26T23:00:00Z', report_id: 'report-s1' };
  const report = { cashier: 'Rana', opened_at: shift.opened_at, closed_at: shift.closed_at, order_count: 12, gross_total_cents: 15000, discount_total_cents: 500, refund_total_cents: 200, net_total_cents: 14300,
    cash: { expected_usd_cents: 19300, expected_lbp: 0, counted_usd_cents: 19000, counted_lbp: 0, variance_usd_cents: -300, variance_lbp: 0 },
    item_counts: [{ item_id: 'crepe', name_en: 'Crepe', name_ar: 'كريب', sold: 5, refunded: 1 }], expenses: [], warnings: [] };
  const text = shiftWhatsAppText(shift, report, { origin: 'https://pos.example' });
  assert.match(text, /Orders: 12/); assert.match(text, /Net sales: \$143\.00/); assert.match(text, /Variance: \$-3\.00/);
  assert.match(text, /4× Crepe/); assert.match(text, /https:\/\/pos\.example\/shift-report\?shift_id=s1/);
  assert.match(shiftWhatsAppText(shift, report, { ar: true }), /صافي المبيعات/);
  const url = shiftWhatsAppUrl(shift, report, { number: '+96103384026' });
  assert.ok(url.startsWith('https://wa.me/9613384026?text='));
  assert.equal(decodeURIComponent(url.split('text=')[1]), shiftWhatsAppText(shift, report));
  // Older shifts without a saved snapshot still produce cash figures.
  assert.match(shiftWhatsAppText({ ...shift, report_id: null, expected_usd: 50, closing_usd: 49, variance_usd: -1 }, null), /Variance: \$-1\.00/);
});
