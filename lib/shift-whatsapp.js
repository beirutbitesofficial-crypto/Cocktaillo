// Builds a wa.me link that opens WhatsApp with a shift-closing summary addressed to the manager.
export const DEFAULT_MANAGER_WHATSAPP = '9613384026';

// Accepts +961 03 384026, 0096103384026, 03384026 ... and returns digits for wa.me (Lebanese trunk 0 removed).
export function whatsappNumber(value = DEFAULT_MANAGER_WHATSAPP) {
  let n = String(value || DEFAULT_MANAGER_WHATSAPP).replace(/\D/g, '').replace(/^00/, '');
  if (n.startsWith('9610')) n = `961${n.slice(4)}`;
  else if (n.startsWith('0')) n = `961${n.slice(1)}`;
  else if (!n.startsWith('961') && n.length <= 8) n = `961${n}`;
  return n;
}

const money = cents => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const lbp = n => `${Math.round(Number(n || 0)).toLocaleString('en-US')} LBP`;
const when = iso => {
  const d = new Date(iso);
  return iso && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-GB', { timeZone: 'Asia/Beirut', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
};

export function shiftWhatsAppText(shift, report, { ar = false, origin = '' } = {}) {
  const t = (en, arabic) => (ar ? arabic : en), c = report?.cash;
  const expected = c ? `${money(c.expected_usd_cents)} / ${lbp(c.expected_lbp)}` : `${money(Math.round(Number(shift.expected_usd || 0) * 100))} / ${lbp(shift.expected_lbp)}`;
  const counted = c ? `${money(c.counted_usd_cents)} / ${lbp(c.counted_lbp)}` : `${money(Math.round(Number(shift.closing_usd || 0) * 100))} / ${lbp(shift.closing_lbp)}`;
  const variance = c ? `${money(c.variance_usd_cents)} / ${lbp(c.variance_lbp)}` : `${money(Math.round(Number(shift.variance_usd || 0) * 100))} / ${lbp(shift.variance_lbp)}`;
  const lines = [
    `*COCKTAILLO* — ${t('Shift closing report', 'تقرير إقفال الشيفت')}`,
    `${t('Cashier', 'الكاشير')}: ${report?.cashier || shift.user_name || '-'}`,
    `${t('From', 'من')}: ${when(report?.opened_at || shift.opened_at)}`,
    `${t('To', 'لـ')}: ${when(report?.closed_at || shift.closed_at)}`,
    '',
  ];
  if (report) {
    lines.push(
      `${t('Orders', 'الطلبات')}: ${report.order_count}`,
      `${t('Gross', 'الإجمالي')}: ${money(report.gross_total_cents)}`,
      `${t('Discounts', 'الحسومات')}: ${money(report.discount_total_cents)}`,
      `${t('Refunds', 'المرتجعات')}: ${money(report.refund_total_cents)}`,
      `*${t('Net sales', 'صافي المبيعات')}: ${money(report.net_total_cents)}*`,
      '',
    );
  }
  lines.push(
    `${t('Expected cash', 'الصندوق المتوقّع')}: ${expected}`,
    `${t('Counted cash', 'المعدود')}: ${counted}`,
    `*${t('Variance', 'الفرق')}: ${variance}*`,
  );
  const items = (report?.item_counts || []).filter(i => i.sold - i.refunded > 0).sort((a, b) => (b.sold - b.refunded) - (a.sold - a.refunded)).slice(0, 10);
  if (items.length) lines.push('', `${t('Top items', 'أكثر الأصناف مبيعاً')}:`, ...items.map(i => `• ${i.sold - i.refunded}× ${(ar ? i.name_ar || i.name_en : i.name_en || i.name_ar) || i.item_id}`));
  const expenses = report?.expenses || [];
  if (expenses.length) lines.push('', `${t('Drawer expenses', 'مصاريف الصندوق')}: ${expenses.map(e => `${e.amount} ${e.currency || 'USD'} ${e.category || ''}`.trim()).join(', ')}`);
  if (report?.warnings?.length) lines.push('', `⚠️ ${report.warnings.join(' ')}`);
  if (origin && shift.id) lines.push('', `${t('Full report', 'التقرير الكامل')}: ${origin}/shift-report?shift_id=${encodeURIComponent(shift.id)}`);
  return lines.join('\n');
}

export function shiftWhatsAppUrl(shift, report, { number, ar = false, origin = '' } = {}) {
  return `https://wa.me/${whatsappNumber(number)}?text=${encodeURIComponent(shiftWhatsAppText(shift, report, { ar, origin }))}`;
}
