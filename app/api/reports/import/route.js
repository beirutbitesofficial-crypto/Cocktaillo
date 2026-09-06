import {NextResponse} from 'next/server';
import * as XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {getUser,allow} from '../../../../lib/auth.js';
import {readState,mutateState,orderTotal} from '../../../../lib/store.js';

export const runtime='nodejs';
const MAX_FILE_SIZE=20*1024*1024;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const txt=v=>String(v??'').trim();
const norm=v=>txt(v).toLowerCase().replace(/\s+/g,' ');
const cents=v=>Math.round(n(v)*100);

function excelDate(value){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value;
  if(typeof value==='number'&&Number.isFinite(value)){
    const p=XLSX.SSF.parse_date_code(value);
    if(p)return new Date(Date.UTC(p.y,p.m-1,p.d,p.H||0,p.M||0,Math.floor(p.S||0)));
  }
  const d=new Date(value);
  return Number.isNaN(d.getTime())?null:d;
}
function iso(value){const d=excelDate(value);return d?d.toISOString():''}
function minute(value){const d=excelDate(value);return d?String(Math.floor(d.getTime()/60000)):norm(value)}
function sheet(wb,name){const ws=wb.Sheets[name];return ws?XLSX.utils.sheet_to_json(ws,{defval:'',raw:true}):[]}
function orderKey(number,date,total){return `${norm(number)}|${minute(date)}|${cents(total)}`}
function expenseKey(row){return `${minute(row.Date)}|${norm(row.Category)}|${n(row.Amount)}|${norm(row.Currency)}|${norm(row.Note)}`}
function purchaseKey(row){return `${minute(row.Date)}|${norm(row.Item)}|${norm(row.Supplier)}|${n(row.Quantity)}|${n(row.Total_Cost_USD)}|${norm(row.Invoice)}`}
function shiftKey(row){return `${norm(row.Cashier)}|${minute(row.Opened)}|${minute(row.Closed)}`}
function refundKey(order,date,amount){return `${norm(order)}|${minute(date)}|${cents(amount)}`}
function itemKey(name,arabic=''){return norm(name)||norm(arabic)}

function parseWorkbook(buffer){
  const wb=XLSX.read(buffer,{type:'buffer',cellDates:true});
  const data={
    summary:sheet(wb,'Summary')[0]||{},
    orders:sheet(wb,'Orders'),
    refunds:sheet(wb,'Refunds'),
    items:sheet(wb,'Item Performance'),
    expenses:sheet(wb,'Expenses'),
    purchases:sheet(wb,'Purchases'),
    inventory:sheet(wb,'Inventory'),
    shifts:sheet(wb,'Shifts'),
    audit:sheet(wb,'Audit')
  };
  if(!data.orders.length&&!data.items.length&&!data.summary.Period)throw new Error('This does not look like a Cocktaillo finance workbook. Summary, Orders or Item Performance is required.');
  return {wb,data};
}

function actualOrderKey(state,o){
  const total=orderTotal(o,Number(state.settings?.exchange_rate||89500)).total_equivalent_cents/100;
  return orderKey(o.number,o.paid_at||o.created_at,total);
}
function actualRefundKey(state,o){
  const total=orderTotal(o,Number(state.settings?.exchange_rate||89500)).total_equivalent_cents/100;
  const r=(state.refunds||[]).find(x=>x.order_id===o.id)||{};
  return refundKey(o.number,r.at||o.updated_at||o.created_at,total);
}
function makeExistingMaps(state){
  const actualOrders=new Map();
  for(const o of state.orders||[])if(o.status==='paid')actualOrders.set(actualOrderKey(state,o),o);
  const recovery=state.excel_recovery||{};
  const recoveredOrders=new Map((recovery.orders||[]).map(o=>[orderKey(o.order_number,o.date,o.sales_usd),o]));
  const actualRefunds=new Set();
  for(const o of state.orders||[])if(o.status==='refunded')actualRefunds.add(actualRefundKey(state,o));
  const recoveredRefunds=new Set((recovery.refunds||[]).map(r=>refundKey(r.order_number,r.date,r.amount_usd)));
  return {actualOrders,recoveredOrders,actualRefunds,recoveredRefunds};
}

function itemCountsForMatchedActual(state,workbookOrderKeys){
  const out=new Map();
  for(const o of state.orders||[]){
    if(o.status!=='paid'||!workbookOrderKeys.has(actualOrderKey(state,o)))continue;
    for(const l of o.lines||[]){
      const k=itemKey(l.name_en,l.name_ar);if(!k)continue;
      out.set(k,(out.get(k)||0)+n(l.quantity));
    }
  }
  return out;
}
function itemCountsForMatchedRecovery(recovery,workbookOrderKeys){
  const out=new Map();
  for(const o of recovery.orders||[]){
    if(!workbookOrderKeys.has(orderKey(o.order_number,o.date,o.sales_usd)))continue;
    for(const l of o.item_details||[]){const k=itemKey(l.name,l.arabic);if(k)out.set(k,(out.get(k)||0)+n(l.quantity))}
  }
  return out;
}
function menuMatcher(state){
  const byName=new Map();
  for(const item of state.menu||[]){
    for(const key of [itemKey(item.name_en),itemKey(item.name_ar)])if(key&&!byName.has(key))byName.set(key,item);
  }
  return row=>byName.get(itemKey(row.Item,row.Arabic))||byName.get(itemKey(row.Arabic,row.Item))||null;
}

function analyze(state,data){
  const maps=makeExistingMaps(state),recovery=state.excel_recovery||{};
  const workbookOrderKeys=new Set(data.orders.map(r=>orderKey(r.Order,r.Date,r.Sales_USD)));
  const missingOrders=data.orders.filter(r=>{const k=orderKey(r.Order,r.Date,r.Sales_USD);return !maps.actualOrders.has(k)&&!maps.recoveredOrders.has(k)});
  const missingRefunds=data.refunds.filter(r=>{const k=refundKey(r.Order,r.Refunded_At,r.Amount_USD);return !maps.actualRefunds.has(k)&&!maps.recoveredRefunds.has(k)});
  const existingExpenseKeys=new Set((state.expenses||[]).map(e=>expenseKey({Date:e.date||e.created_at,Category:e.category,Amount:e.amount,Currency:e.currency,Note:e.note})));
  const missingExpenses=data.expenses.filter(r=>!existingExpenseKeys.has(expenseKey(r)));
  const existingPurchaseKeys=new Set((state.purchases||[]).map(p=>purchaseKey({Date:p.date||p.created_at,Item:p.item_name,Supplier:p.supplier,Quantity:p.quantity,Total_Cost_USD:p.total_cost,Invoice:p.invoice})));
  const missingPurchases=data.purchases.filter(r=>!existingPurchaseKeys.has(purchaseKey(r)));
  const existingShiftKeys=new Set((state.shifts||[]).map(s=>shiftKey({Cashier:s.user_name,Opened:s.opened_at,Closed:s.closed_at})));
  const missingShifts=data.shifts.filter(r=>!existingShiftKeys.has(shiftKey(r)));
  const actualItems=itemCountsForMatchedActual(state,workbookOrderKeys),recoveredItems=itemCountsForMatchedRecovery(recovery,workbookOrderKeys);
  const missingItemRows=data.items.map(r=>{
    const k=itemKey(r.Item,r.Arabic),qty=Math.max(0,n(r.Quantity)-n(actualItems.get(k))-n(recoveredItems.get(k)));
    return {...r,__missing_qty:qty};
  }).filter(r=>r.__missing_qty>0);
  return {maps,workbookOrderKeys,missingOrders,missingRefunds,missingExpenses,missingPurchases,missingShifts,missingItemRows};
}

function allocateItems(state,missingOrders,missingItemRows){
  const matcher=menuMatcher(state),queue=[];
  for(const r of missingItemRows){
    const qty=Math.max(0,Math.round(n(r.__missing_qty)));if(!qty)continue;
    const item=matcher(r),unitRevenue=qty?n(r.Revenue_USD)/Math.max(1,n(r.Quantity)):0;
    queue.push({name:txt(r.Item)||txt(r.Arabic)||'Recovered item',arabic:txt(r.Arabic),item_id:item?.id||null,quantity:qty,revenue_usd:unitRevenue*qty,unit_revenue_usd:unitRevenue});
  }
  const result=new Map();let qi=0,remaining=queue[0]?.quantity||0;
  for(const row of missingOrders){
    let capacity=Math.max(0,Math.round(n(row.Items))),details=[];
    while(capacity>0&&qi<queue.length){
      const src=queue[qi],take=Math.min(capacity,remaining);
      if(take>0)details.push({name:src.name,arabic:src.arabic,item_id:src.item_id,quantity:take,revenue_usd:src.unit_revenue_usd*take});
      capacity-=take;remaining-=take;
      if(remaining<=0){qi++;remaining=queue[qi]?.quantity||0}
    }
    result.set(orderKey(row.Order,row.Date,row.Sales_USD),details);
  }
  if(qi<queue.length&&missingOrders.length){
    const firstKey=orderKey(missingOrders[0].Order,missingOrders[0].Date,missingOrders[0].Sales_USD),details=result.get(firstKey)||[];
    while(qi<queue.length){const src=queue[qi],take=remaining||src.quantity;details.push({name:src.name,arabic:src.arabic,item_id:src.item_id,quantity:take,revenue_usd:src.unit_revenue_usd*take});qi++;remaining=queue[qi]?.quantity||0}
    result.set(firstKey,details);
  }
  return result;
}

function previewPayload(data,a){
  return {
    period:txt(data.summary.Period)||'unknown',
    workbook:{orders:data.orders.length,refunds:data.refunds.length,item_rows:data.items.length,expenses:data.expenses.length,purchases:data.purchases.length,inventory:data.inventory.length,shifts:data.shifts.length},
    missing:{orders:a.missingOrders.length,refunds:a.missingRefunds.length,item_units:a.missingItemRows.reduce((s,r)=>s+n(r.__missing_qty),0),expenses:a.missingExpenses.length,purchases:a.missingPurchases.length,shifts:a.missingShifts.length},
    note:'Restore only fills rows that are missing from the current POS. Existing data is not replaced. Menu items are never overwritten.'
  };
}

function restoreInto(state,data,a,{restoreInventory,user,fileName,fingerprint}){
  state.excel_recovery=state.excel_recovery&&typeof state.excel_recovery==='object'?state.excel_recovery:{orders:[],refunds:[],imports:[]};
  state.excel_recovery.orders=Array.isArray(state.excel_recovery.orders)?state.excel_recovery.orders:[];
  state.excel_recovery.refunds=Array.isArray(state.excel_recovery.refunds)?state.excel_recovery.refunds:[];
  state.excel_recovery.imports=Array.isArray(state.excel_recovery.imports)?state.excel_recovery.imports:[];
  state.expenses=Array.isArray(state.expenses)?state.expenses:[];state.purchases=Array.isArray(state.purchases)?state.purchases:[];state.shifts=Array.isArray(state.shifts)?state.shifts:[];state.audit=Array.isArray(state.audit)?state.audit:[];
  const allocated=allocateItems(state,a.missingOrders,a.missingItemRows),defaultRate=n(data.summary.Exchange_Rate)||n(state.settings?.exchange_rate)||89500;
  for(const r of a.missingOrders){
    const key=orderKey(r.Order,r.Date,r.Sales_USD);
    state.excel_recovery.orders.push({id:`xl-order-${crypto.randomUUID()}`,order_number:txt(r.Order),date:iso(r.Date)||new Date().toISOString(),type:txt(r.Type)||'recovered',table:txt(r.Table),staff:txt(r.Staff),cashier:txt(r.Cashier),items:n(r.Items),subtotal_usd:n(r.Subtotal_USD),discount_usd:n(r.Discount_USD),sales_usd:n(r.Sales_USD),cogs_usd:n(r.COGS_USD),paid_usd:n(r.Paid_USD),paid_lbp:n(r.Paid_LBP),exchange_rate:n(r.Exchange_Rate)||defaultRate,item_details:allocated.get(key)||[],source_file:fileName,source_hash:fingerprint,restored_at:new Date().toISOString()});
  }
  for(const r of a.missingRefunds)state.excel_recovery.refunds.push({id:`xl-refund-${crypto.randomUUID()}`,order_number:txt(r.Order),date:iso(r.Refunded_At)||new Date().toISOString(),reason:txt(r.Reason),approved_by:txt(r.Approved_By),amount_usd:n(r.Amount_USD),paid_usd:n(r.Original_Paid_USD),paid_lbp:n(r.Original_Paid_LBP),source_file:fileName,source_hash:fingerprint});
  for(const r of a.missingExpenses)state.expenses.push({id:`exp-${crypto.randomUUID()}`,date:iso(r.Date)||txt(r.Date)||new Date().toISOString(),category:txt(r.Category)||'Recovered',amount:n(r.Amount),currency:txt(r.Currency).toUpperCase()==='LBP'?'LBP':'USD',paid_from:txt(r.Paid_From),note:txt(r.Note),created_by:txt(r.Created_By)||user.name,recovered_from_excel:true,source_hash:fingerprint});
  for(const r of a.missingPurchases)state.purchases.push({id:`pur-${crypto.randomUUID()}`,date:iso(r.Date)||txt(r.Date)||new Date().toISOString(),item_name:txt(r.Item),supplier:txt(r.Supplier),quantity:n(r.Quantity),unit:txt(r.Unit),unit_cost:n(r.Unit_Cost_USD),total_cost:n(r.Total_Cost_USD),invoice:txt(r.Invoice),note:txt(r.Note),created_by:txt(r.Created_By)||user.name,recovered_from_excel:true,source_hash:fingerprint});
  for(const r of a.missingShifts)state.shifts.push({id:`shift-xl-${crypto.randomUUID()}`,user_id:null,user_name:txt(r.Cashier)||'Recovered cashier',opened_at:iso(r.Opened)||new Date().toISOString(),closed_at:iso(r.Closed)||null,opening_usd:n(r.Opening_USD),opening_lbp:n(r.Opening_LBP),expected_usd:r.Expected_USD===''?null:n(r.Expected_USD),expected_lbp:r.Expected_LBP===''?null:n(r.Expected_LBP),closing_usd:r.Counted_USD===''?null:n(r.Counted_USD),closing_lbp:r.Counted_LBP===''?null:n(r.Counted_LBP),variance_usd:r.Variance_USD===''?null:n(r.Variance_USD),variance_lbp:r.Variance_LBP===''?null:n(r.Variance_LBP),status:norm(r.Status)==='open'?'closed':(txt(r.Status)||'closed'),recovered_from_excel:true,source_hash:fingerprint});
  let inventoryUpdated=0;
  if(restoreInventory&&data.inventory.length){
    const byName=new Map((state.inventory||[]).map(i=>[norm(i.name),i]));
    state.inventory=Array.isArray(state.inventory)?state.inventory:[];
    for(const r of data.inventory){const name=txt(r.Item);if(!name)continue;let item=byName.get(norm(name));if(!item){item={id:`inv-${crypto.randomUUID()}`,name,category:txt(r.Category),quantity:0,unit:txt(r.Unit)||'unit',minimum:0,unit_cost:0};state.inventory.push(item);byName.set(norm(name),item)}item.category=txt(r.Category)||item.category;item.quantity=n(r.Quantity);item.unit=txt(r.Unit)||item.unit;item.minimum=n(r.Minimum);item.unit_cost=n(r.Unit_Cost_USD);inventoryUpdated++}
  }
  const at=new Date().toISOString();
  state.excel_recovery.imports.push({id:`xl-import-${crypto.randomUUID()}`,file_name:fileName,hash:fingerprint,period:txt(data.summary.Period)||'unknown',at,user:user.name,added_orders:a.missingOrders.length,added_refunds:a.missingRefunds.length,added_expenses:a.missingExpenses.length,added_purchases:a.missingPurchases.length,added_shifts:a.missingShifts.length,inventory_updated:inventoryUpdated});
  state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'excel_finance_recovery',user:user.name,at,file:fileName,hash:fingerprint,orders:a.missingOrders.length,refunds:a.missingRefunds.length,expenses:a.missingExpenses.length,purchases:a.missingPurchases.length,shifts:a.missingShifts.length,inventory_updated:inventoryUpdated});
  return {orders:a.missingOrders.length,refunds:a.missingRefunds.length,item_units:a.missingItemRows.reduce((s,r)=>s+n(r.__missing_qty),0),expenses:a.missingExpenses.length,purchases:a.missingPurchases.length,shifts:a.missingShifts.length,inventory_updated:inventoryUpdated};
}

export async function POST(request){
  const user=await getUser();if(!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
  try{
    const form=await request.formData(),file=form.get('file');
    if(!file||typeof file.arrayBuffer!=='function')return NextResponse.json({error:'Choose a Cocktaillo .xlsx file.'},{status:400});
    if(file.size>MAX_FILE_SIZE)return NextResponse.json({error:'Excel file is too large (20 MB max).'},{status:413});
    const buffer=Buffer.from(await file.arrayBuffer()),fingerprint=createHash('sha256').update(buffer).digest('hex'),{data}=parseWorkbook(buffer),mode=txt(form.get('mode'))||'preview',restoreInventory=txt(form.get('restore_inventory'))==='true';
    if(mode==='preview'){const state=await readState(),a=analyze(state,data);return NextResponse.json({ok:true,hash:fingerprint,...previewPayload(data,a)});}
    if(mode!=='restore')return NextResponse.json({error:'Invalid import mode.'},{status:400});
    let result;
    await mutateState(state=>{const a=analyze(state,data);result={preview:previewPayload(data,a),added:restoreInto(state,data,a,{restoreInventory,user,fileName:file.name||'cocktaillo-finance.xlsx',fingerprint})};});
    return NextResponse.json({ok:true,hash:fingerprint,...result});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not read this Excel file.'},{status:400})}
}
