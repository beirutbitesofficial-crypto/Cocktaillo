import * as XLSX from 'xlsx';
import {shiftCash,changeFor} from './cash.js';

const sum=(rows,fn)=>rows.reduce((n,r)=>n+fn(r),0);
const integer=(v,label)=>{const n=Number(v);if(!Number.isSafeInteger(n))throw new Error(`Invalid ${label}; review the ledger before closing.`);return n};
export function cashAmount(value,currency){
  if(value==null||String(value).trim()==='')throw new Error(`Enter counted ${currency}, including zero.`);
  const text=String(value).trim(),pattern=currency==='USD'?/^\d+(?:\.\d{1,2})?$/:/^\d+$/;
  if(!pattern.test(text))throw new Error(`Enter a valid ${currency} amount (${currency==='USD'?'at most 2 decimals':'whole pounds'}).`);
  return integer(Math.round(Number(text)*(currency==='USD'?100:1)),currency);
}
export function closeShift(state,user,body,now=new Date().toISOString()){
  if(!body.shift_id)throw new Error('Refresh the app before closing: shift ID is required.');
  const shift=body.shift_id?state.shifts.find(s=>s.id===body.shift_id&&s.user_id===user.id):state.shifts.find(s=>s.user_id===user.id&&s.status==='open');
  if(!shift)throw new Error('No matching shift. Refresh and try again.');
  // A retry is tied to this shift, even after the cashier has opened a new one.
  if(shift.status==='closed'){
    const report=(state.shift_reports||[]).find(r=>r.shift_id===shift.id);
    if(!report)throw new Error('This older shift has no saved detailed report.');
    return {shift,report,print_job_id:report.print_job_id,replayed:true};
  }
  const countedUsd=cashAmount(body.closing_usd,'USD'),countedLbp=cashAmount(body.closing_lbp,'LBP');
  const cash=shiftCash(state,shift,now),seen=new Set();
  for(const r of cash.receipts){
    if(!r.order_id||seen.has(r.order_id))throw new Error('Duplicate or unidentified receipt. Manager must review before closing.');
    seen.add(r.order_id);
    integer(r.totals?.total_equivalent_cents,'receipt total');
    integer(r.payment?.usd_cents||0,'USD tender');integer(r.payment?.lbp||0,'LBP tender');
  }
  // Never charge an unassigned legacy expense to multiple drawers.
  const ambiguous=cash.expenses.filter(e=>!e.shift_id&&state.shifts.some(s=>s.id!==shift.id&&s.opened_at<=e.created_at&&(!s.closed_at||s.closed_at>=e.created_at)));
  if(ambiguous.length)throw new Error('Unassigned drawer expense overlaps multiple shifts. Manager must assign its shift before closing.');
  const expectedUsd=integer(Math.round(cash.expected_usd*100),'expected USD'),expectedLbp=integer(cash.expected_lbp,'expected LBP');
  const receipts=structuredClone(cash.receipts).map(r=>({...r,table_name:state.tables.find(t=>t.id===r.table_id)?.name||'',change_payment:r.change_payment||changeFor(r.change_cents)}));
  const refunds=structuredClone(cash.refunds),expenses=structuredClone(cash.expenses);
  const sales=sum(receipts,r=>integer(r.totals.total_equivalent_cents,'sales')),discounts=sum(receipts,r=>integer(r.totals.discount_cents||0,'discount'));
  const refunded=sum(refunds,r=>integer(r.amount_cents,'refund'));
  const itemMap=new Map();
  function item(line,quantity,field){const key=line.menu_item_id||line.name_en||line.name_ar||line.line_id;const entry=itemMap.get(key)||{item_id:key,name_en:line.name_en||'',name_ar:line.name_ar||'',sold:0,refunded:0};entry[field]+=Number(quantity||0);itemMap.set(key,entry)}
  for(const r of receipts)for(const l of r.items||[])item(l,l.quantity,'sold');
  for(const r of refunds)for(const l of r.items||[])item(l,l.quantity,'refunded');
  const warnings=[];
  if(cash.receipts.some(r=>!r.change_payment&&Number(r.change_cents)>0))warnings.push('Legacy receipts: change currency was not recorded; USD assumed. Verify against physical cash.');
  if(cash.receipts.some(r=>!r.shift_id)||cash.refunds.some(r=>!r.shift_id)||cash.expenses.some(e=>!e.shift_id))warnings.push('Some legacy entries were matched by cashier/time instead of a shift ID.');
  const report={id:`report-${shift.id}`,version:1,shift_id:shift.id,user_id:user.id,cashier:shift.user_name,opened_at:shift.opened_at,closed_at:now,
    order_count:receipts.length,gross_total_cents:sales+discounts,discount_total_cents:discounts,sales_total_cents:sales,refund_total_cents:refunded,net_total_cents:sales-refunded,
    cash:{opening_usd_cents:Math.round(Number(shift.opening_usd||0)*100),opening_lbp:Number(shift.opening_lbp||0),
      tender_usd_cents:sum(receipts,r=>Number(r.payment.usd_cents||0)),tender_lbp:sum(receipts,r=>Number(r.payment.lbp||0)),
      change_usd_cents:sum(receipts,r=>Number(r.change_payment.usd_cents||0)),change_lbp:sum(receipts,r=>Number(r.change_payment.lbp||0)),
      refund_usd_cents:sum(refunds,r=>Number(r.payment?.usd_cents||0)),refund_lbp:sum(refunds,r=>Number(r.payment?.lbp||0)),
      expense_usd_cents:sum(expenses,e=>e.currency==='LBP'?0:Math.round(Number(e.amount)*100)),expense_lbp:sum(expenses,e=>e.currency==='LBP'?Number(e.amount):0),
      expected_usd_cents:expectedUsd,expected_lbp:expectedLbp,counted_usd_cents:countedUsd,counted_lbp:countedLbp,variance_usd_cents:countedUsd-expectedUsd,variance_lbp:countedLbp-expectedLbp},
    receipts,refunds,expenses,item_counts:[...itemMap.values()],inventory:structuredClone(state.inventory||[]),warnings,
    activity:structuredClone((state.audit||[]).filter(a=>a.at>=shift.opened_at&&a.at<=now&&(a.user===shift.user_name||a.shift_id===shift.id))),
    open_orders:structuredClone((state.orders||[]).filter(o=>['open','pending_payment'].includes(o.status)).map(o=>({number:o.number,type:o.type,table_id:o.table_id,created_by:o.created_by_name}))),
    print_job_id:`print-close-${shift.id}`};
  Object.assign(shift,{status:'closed',closed_at:now,expected_usd:expectedUsd/100,expected_lbp:expectedLbp,closing_usd:countedUsd/100,closing_lbp:countedLbp,variance_usd:(countedUsd-expectedUsd)/100,variance_lbp:countedLbp-expectedLbp,report_id:report.id});
  (state.shift_reports??=[]).push(report);
  (state.print_jobs??=[]).push({id:report.print_job_id,shift_id:shift.id,destination:'customer',mode:'prebill',receipt_snapshot:shiftReceipt(report),open_drawer:false,status:'pending',created_at:now,updated_at:now,attempts:0,requested_by:user.name,printer_name:state.settings.customer_printer_name||'Customer Receipt'});
  (state.report_deliveries??=[]).push({id:`delivery-${shift.id}`,shift_id:shift.id,status:'pending',at:now,attempts:0});
  state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'shift_closed',shift_id:shift.id,user:user.name,at:now,order_count:report.order_count,net_total_cents:report.net_total_cents});
  return {shift,report,print_job_id:report.print_job_id,replayed:false};
}
const dollars=c=>`$${(Number(c||0)/100).toFixed(2)}`;
export function shiftReceipt(r){
  // Standard receipt fields intentionally support the installed Windows Agent 2.5.
  // Each order contributes its net paid sale once; descriptive add-ons have no amount.
  const items=r.receipts.map(o=>({name:`ORDER #${o.number} ${o.table_name||o.type} ${o.created_at}`,quantity:1,line_total_cents:o.totals.total_equivalent_cents,
    addons:[...(o.items||[]).map(l=>({name:`${l.quantity} x ${l.name_en||l.menu_item_id} @ ${dollars(l.price_cents)}${l.note?` NOTE: ${l.note}`:''}${(l.addons||[]).map(a=>` + ${a.quantity||1} x ${a.name_en} @ ${a.price_lbp} LBP per item`).join('')}`,quantity:1,price_lbp:0})),{name:`Discount ${dollars(o.totals.discount_cents)}; tender ${dollars(o.payment.usd_cents)} + ${o.payment.lbp||0} LBP; change ${dollars(o.change_payment.usd_cents)} + ${o.change_payment.lbp||0} LBP`,quantity:1,price_lbp:0}]}));
  for(const refund of r.refunds)items.push({name:`REFUND ORDER #${refund.order_number} ${refund.reason||''}`,quantity:1,line_total_cents:-refund.amount_cents,addons:(refund.items||[]).map(l=>({name:`${l.quantity} x ${l.name_en||l.menu_item_id}`,quantity:1,price_lbp:0}))});
  const c=r.cash,footer=[`SHIFT CLOSING REPORT ${r.shift_id}`,`CASHIER ${r.cashier}`,`FROM ${r.opened_at} TO ${r.closed_at}`,`Orders ${r.order_count}; gross ${dollars(r.gross_total_cents)}; discounts ${dollars(r.discount_total_cents)}; sales ${dollars(r.sales_total_cents)}; refunds ${dollars(r.refund_total_cents)}; NET SALES ${dollars(r.net_total_cents)} (not profit).`,
    ...['opening','tender','change','refund','expense','expected','counted','variance'].map(k=>`${k.toUpperCase()}: ${dollars(c[`${k}_usd_cents`])} / ${c[`${k}_lbp`]} LBP.`),
    'DRAWER EXPENSES:',...r.expenses.map(e=>`${e.amount} ${e.currency} ${e.category} ${e.note||''}`),
    'ITEM COUNTS (refunds may relate to earlier shifts):',...r.item_counts.map(i=>`${i.name_en||i.item_id}: sold ${i.sold}, returned ${i.refunded}, net ${i.sold-i.refunded}.`),
    'RECORDED STOCK AT CLOSE - NOT A PHYSICAL COUNT:',...r.inventory.map(i=>`${i.name}: ${i.quantity} ${i.unit||''}.`),
    `Unpaid orders at close: ${r.open_orders.map(o=>`#${o.number}`).join(', ')||'none'} (excluded from cash).`,...r.warnings];
  return {business_name:'COCKTAILLO',order_number:`SHIFT ${r.shift_id}`,type:'SHIFT CLOSE',table:'SHIFT CLOSING REPORT',cashier:r.cashier,created_at:r.closed_at,items,subtotal_cents:r.net_total_cents,discount_cents:0,total_cents:r.net_total_cents,payment_method:'NET SALES - SEE CASH RECONCILIATION',paid_usd_cents:0,paid_lbp:0,change_cents:0,footer:footer.join(' | ')};
}
export function buildShiftWorkbook(r){
  const wb=XLSX.utils.book_new();
  const sheet=(name,rows)=>{const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{Info:'No entries'}]);ws['!cols']=Object.keys(rows[0]||{}).map(()=>({wch:24}));XLSX.utils.book_append_sheet(wb,ws,name)};
  sheet('Summary',[{Shift:r.shift_id,Cashier:r.cashier,Opened:r.opened_at,Closed:r.closed_at,Orders:r.order_count,Gross_USD:r.gross_total_cents/100,Discount_USD:r.discount_total_cents/100,Sales_USD:r.sales_total_cents/100,Refunds_USD:r.refund_total_cents/100,Net_Sales_USD:r.net_total_cents/100,Note:'Net sales is not profit. Inventory is recorded stock, not a physical count.'}]);
  sheet('Cash Reconciliation', ['opening','tender','change','refund','expense','expected','counted','variance'].map(k=>({Entry:k,USD:r.cash[`${k}_usd_cents`]/100,LBP:r.cash[`${k}_lbp`]})));
  sheet('Orders',r.receipts.map(o=>({Order:o.number,Receipt:o.id,Paid_At:o.created_at,Table:o.table_name,Type:o.type,Gross_USD:(o.totals.total_equivalent_cents+Number(o.totals.discount_cents||0))/100,Discount_USD:Number(o.totals.discount_cents||0)/100,Sale_USD:o.totals.total_equivalent_cents/100,Tender_USD:Number(o.payment.usd_cents||0)/100,Tender_LBP:o.payment.lbp||0,Change_USD:o.change_payment.usd_cents/100,Change_LBP:o.change_payment.lbp,Rate:o.payment.rate})));
  sheet('Items',r.receipts.flatMap(o=>(o.items||[]).map(l=>({Order:o.number,Item:l.name_en,Arabic:l.name_ar,Quantity:l.quantity,Unit_USD:Number(l.price_cents||0)/100,Category:l.subcategory||l.category||'',Notes:l.note||'',Addons:(l.addons||[]).map(a=>`${a.quantity||1} x ${a.name_en||a.name_ar} @ ${a.price_lbp} LBP per item`).join('; ')}))));
  sheet('Item Counts',r.item_counts.map(i=>({Item:i.name_en,Arabic:i.name_ar,Sold:i.sold,Returned:i.refunded,Net:i.sold-i.refunded})));
  sheet('Refunds',r.refunds.map(f=>({Order:f.order_number,At:f.at,User:f.user,Reason:f.reason,Amount_USD:f.amount_cents/100,Payout_USD:Number(f.payment?.usd_cents||0)/100,Payout_LBP:f.payment?.lbp||0,Items:(f.items||[]).map(i=>`${i.quantity} x ${i.name_en||i.name_ar}`).join('; ')})));
  sheet('Drawer Expenses',r.expenses.map(e=>({At:e.created_at,Category:e.category,Amount:e.amount,Currency:e.currency,Note:e.note,User:e.created_by})));
  sheet('Recorded Stock',r.inventory.map(i=>({Item:i.name,Quantity:i.quantity,Unit:i.unit,Minimum:i.minimum,Note:'Recorded stock; physical count not entered'})));
  sheet('Unpaid Orders',r.open_orders);sheet('Audit',r.activity.map(a=>({At:a.at,Type:a.type,User:a.user,Order:a.order_id||'',Reason:a.reason||''})));sheet('Warnings',r.warnings.map(w=>({Warning:w})));
  return {buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),filename:`Cocktaillo-${r.shift_id}.xlsx`};
}
