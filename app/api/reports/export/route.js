import {NextResponse} from 'next/server';
import * as XLSX from 'xlsx';
import {getUser,allow} from '../../../../lib/auth.js';
import {readState,orderCost,orderTotal} from '../../../../lib/store.js';
import {financeLedger,inFinancePeriod} from '../../../../lib/finance-ledger.js';

const norm=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
function addSheet(wb,name,rows,widths=[]){const ws=XLSX.utils.json_to_sheet(rows.length?rows:[{}]);if(widths.length)ws['!cols']=widths.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,name)}
function receiptFor(state,order){return (state.receipts||[]).find(r=>r.order_id===order.id)||null}
function totalsFor(state,order,rate){const receipt=receiptFor(state,order);return receipt?.totals||order.financial_snapshot?.totals||orderTotal(order,rate)}
function cogsFor(state,order){return Number(order.financial_snapshot?.cogs_usd??receiptFor(state,order)?.cogs_usd??orderCost(state,order)??0)}
function orderDate(order){return order.paid_at||order.updated_at||order.created_at}
function refundFor(state,order){return (state.refunds||[]).find(r=>r.order_id===order.id)||null}
function refundDate(state,order){return refundFor(state,order)?.at||order.updated_at||orderDate(order)}
function addItem(itemMap,key,row){if(!itemMap[key])itemMap[key]={Item:row.Item||'',Arabic:row.Arabic||'',Category:row.Category||'',Group:row.Group||'',Quantity:0,Revenue_USD:0,COGS_USD:0};itemMap[key].Quantity+=Number(row.Quantity||0);itemMap[key].Revenue_USD+=Number(row.Revenue_USD||0);itemMap[key].COGS_USD+=Number(row.COGS_USD||0)}

export async function GET(request){
  const user=await getUser();if(!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
  const url=new URL(request.url),period=['daily','monthly','yearly'].includes(url.searchParams.get('period'))?url.searchParams.get('period'):'daily';
  const state=await readState(),anchor=new Date(),rate=Number(state.settings.exchange_rate||89500),ledger=financeLedger(state,{period,anchor}),wb=XLSX.utils.book_new();
  const settled=(state.orders||[]).filter(o=>['paid','refunded'].includes(o.status)&&inFinancePeriod(orderDate(o),period,anchor));
  const refunded=(state.orders||[]).filter(o=>o.status==='refunded'&&inFinancePeriod(refundDate(state,o),period,anchor));
  const recoveredOrders=ledger.recovered_orders||[],recoveredRefunds=ledger.recovered_refunds||[];

  addSheet(wb,'Summary',[{
    Period:period,
    Gross_Sales_USD:ledger.gross_sales_cents/100,
    Refunds_USD:ledger.refunds_cents/100,
    Net_Sales_USD:ledger.net_sales_cents/100,
    Completed_Orders:ledger.orders,
    Paid_Orders:ledger.paid_orders,
    Refunded_Orders:ledger.refunded_orders,
    Average_Order_USD:ledger.average_order_usd,
    Discounts_USD:ledger.discounts_cents/100,
    COGS_USD:ledger.cogs_usd,
    Gross_Profit_USD:ledger.gross_profit_usd,
    Expenses_USD_Equivalent:ledger.expenses_usd,
    Net_Profit_USD:ledger.net_profit_usd,
    Gross_Margin_Percent:ledger.gross_margin_percent,
    Paid_USD:ledger.paid_usd,
    Paid_LBP:ledger.paid_lbp,
    Refunded_USD_Cash:ledger.refunded_usd,
    Refunded_LBP_Cash:ledger.refunded_lbp,
    Net_Cash_USD:ledger.net_cash_usd,
    Net_Cash_LBP:ledger.net_cash_lbp,
    Exchange_Rate:ledger.exchange_rate,
    Inventory_Value_USD:ledger.inventory_value_usd,
    Purchases_USD:ledger.purchases_usd,
    Recovered_Orders:recoveredOrders.length
  }]);

  const orderRows=settled.map(o=>{const t=totalsFor(state,o,rate),p=receiptFor(state,o)?.payment||o.payments?.[0]||{};return {Order:o.number,Date:orderDate(o),Status:o.status,Type:o.type,Table:state.tables.find(x=>x.id===o.table_id)?.name||'',Staff:o.created_by_name||'',Cashier:p.cashier||'',Items:(o.lines||[]).reduce((a,l)=>a+Number(l.quantity||0),0),Subtotal_USD:Number(t.subtotal_equivalent_cents??t.total_equivalent_cents??0)/100,Discount_USD:Number(t.discount_cents||0)/100,Sales_USD:Number(t.total_equivalent_cents||0)/100,COGS_USD:cogsFor(state,o),Gross_Profit_USD:o.status==='refunded'?0:Number(t.total_equivalent_cents||0)/100-cogsFor(state,o),Paid_USD:Number(p.usd_cents||0)/100,Paid_LBP:Number(p.lbp||0),Exchange_Rate:Number(p.rate||rate),Recovered:'NO'}});
  for(const o of recoveredOrders)orderRows.push({Order:o.order_number,Date:o.date,Status:'paid',Type:o.type,Table:o.table||'',Staff:o.staff||'',Cashier:o.cashier||'',Items:o.items||0,Subtotal_USD:Number(o.subtotal_usd||o.sales_usd||0),Discount_USD:Number(o.discount_usd||0),Sales_USD:Number(o.sales_usd||0),COGS_USD:Number(o.cogs_usd||0),Gross_Profit_USD:Number(o.sales_usd||0)-Number(o.cogs_usd||0),Paid_USD:Number(o.paid_usd||0),Paid_LBP:Number(o.paid_lbp||0),Exchange_Rate:Number(o.exchange_rate||rate),Recovered:'YES'});
  orderRows.sort((a,b)=>new Date(a.Date)-new Date(b.Date));addSheet(wb,'Orders',orderRows);

  const refundRows=refunded.map(o=>{const t=totalsFor(state,o,rate),r=refundFor(state,o)||{};return {Order:o.number,Refunded_At:r.at||refundDate(state,o),Reason:r.reason||'',Approved_By:r.user||'',Amount_USD:Number(t.total_equivalent_cents||0)/100,Original_Paid_USD:Number(r.payment?.usd_cents||0)/100,Original_Paid_LBP:Number(r.payment?.lbp||0),Recovered:'NO'}});
  for(const r of recoveredRefunds)refundRows.push({Order:r.order_number,Refunded_At:r.date,Reason:r.reason||'',Approved_By:r.approved_by||'',Amount_USD:Number(r.amount_usd||0),Original_Paid_USD:Number(r.paid_usd||0),Original_Paid_LBP:Number(r.paid_lbp||0),Recovered:'YES'});addSheet(wb,'Refunds',refundRows);

  const itemMap={};
  for(const o of settled.filter(x=>x.status==='paid'))for(const l of o.lines||[]){const item=state.menu.find(i=>i.id===l.menu_item_id),key=l.menu_item_id||norm(l.name_en||l.name_ar);addItem(itemMap,key,{Item:l.name_en,Arabic:l.name_ar,Category:item?.category||'',Group:item?.subcategory||'',Quantity:l.quantity,Revenue_USD:Number(l.price_cents||0)*Number(l.quantity||0)/100,COGS_USD:orderCost(state,{lines:[l]})})}
  for(const o of recoveredOrders){const details=o.item_details||[],revenueTotal=details.reduce((a,l)=>a+Number(l.revenue_usd||0),0),qtyTotal=details.reduce((a,l)=>a+Number(l.quantity||0),0);for(const l of details){const item=state.menu.find(i=>i.id===l.item_id),weight=revenueTotal>0?Number(l.revenue_usd||0)/revenueTotal:qtyTotal>0?Number(l.quantity||0)/qtyTotal:0,key=l.item_id||norm(l.name||l.arabic);addItem(itemMap,key,{Item:l.name,Arabic:l.arabic,Category:item?.category||'',Group:item?.subcategory||'',Quantity:l.quantity,Revenue_USD:Number(l.revenue_usd||0),COGS_USD:Number(o.cogs_usd||0)*weight})}}
  addSheet(wb,'Item Performance',Object.values(itemMap).map(x=>({...x,Gross_Profit_USD:x.Revenue_USD-x.COGS_USD,Margin_Percent:x.Revenue_USD?(x.Revenue_USD-x.COGS_USD)/x.Revenue_USD*100:0})));
  addSheet(wb,'Expenses',(ledger.expenses||[]).map(e=>({Date:e.date||e.created_at,Category:e.category,Amount:e.amount,Currency:e.currency,USD_Equivalent:String(e.currency).toUpperCase()==='LBP'?Number(e.amount||0)/rate:Number(e.amount||0),Paid_From:e.paid_from,Note:e.note,Created_By:e.created_by,Recovered:e.recovered_from_excel?'YES':'NO'})));
  addSheet(wb,'Purchases',(ledger.purchases||[]).map(p=>({Date:p.date||p.created_at,Item:p.item_name,Supplier:p.supplier,Quantity:p.quantity,Unit:p.unit,Unit_Cost_USD:p.unit_cost,Total_Cost_USD:p.total_cost,Invoice:p.invoice,Note:p.note,Created_By:p.created_by,Recovered:p.recovered_from_excel?'YES':'NO'})));
  addSheet(wb,'Inventory',(state.inventory||[]).map(i=>({Item:i.name,Category:i.category,Quantity:i.quantity,Unit:i.unit,Minimum:i.minimum,Unit_Cost_USD:i.unit_cost,Stock_Value_USD:Number(i.quantity||0)*Number(i.unit_cost||0),Low_Stock:Number(i.minimum||0)>0&&Number(i.quantity)<=Number(i.minimum)?'YES':'NO'})));
  addSheet(wb,'Shifts',(ledger.shifts||[]).map(x=>({Cashier:x.user_name,Opened:x.opened_at,Closed:x.closed_at||'',Opening_USD:x.opening_usd,Opening_LBP:x.opening_lbp,Expected_USD:x.expected_usd??'',Expected_LBP:x.expected_lbp??'',Counted_USD:x.closing_usd??'',Counted_LBP:x.closing_lbp??'',Variance_USD:x.variance_usd??'',Variance_LBP:x.variance_lbp??'',Status:x.status,Recovered:x.recovered_from_excel?'YES':'NO'})));
  addSheet(wb,'Audit',(state.audit||[]).filter(a=>inFinancePeriod(a.at,period,anchor)).map(a=>({Date:a.at,Action:a.type,User:a.user||'',Reason:a.reason||'',Order_ID:a.order_id||'',Item_ID:a.item_id||a.menu_item_id||'',Delta:a.delta??'',Value:a.value??''})));
  const bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});return new NextResponse(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="cocktaillo-${period}-finance.xlsx"`,'Cache-Control':'no-store'}})
}
