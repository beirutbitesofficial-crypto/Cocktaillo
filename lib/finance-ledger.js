import {orderCost,orderTotal} from './store.js';

const text=v=>String(v??'').trim();
const norm=v=>text(v).toLowerCase().replace(/\s+/g,' ');
const cents=v=>Math.round(Number(v||0)*100);
const validDate=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?null:d};

export function inFinancePeriod(value,period='all',anchor=new Date()){
  if(period==='all')return true;
  const d=validDate(value),a=validDate(anchor);
  if(!d||!a)return false;
  if(period==='daily')return d.getFullYear()===a.getFullYear()&&d.getMonth()===a.getMonth()&&d.getDate()===a.getDate();
  if(period==='monthly')return d.getFullYear()===a.getFullYear()&&d.getMonth()===a.getMonth();
  if(period==='yearly')return d.getFullYear()===a.getFullYear();
  return true;
}

function receiptForOrder(state,order){return (state.receipts||[]).find(r=>r.order_id===order.id)||null}
function saleCents(state,order,rate){
  const receipt=receiptForOrder(state,order);
  if(receipt?.totals?.total_equivalent_cents!=null)return Number(receipt.totals.total_equivalent_cents||0);
  if(order?.financial_snapshot?.net_sales_cents!=null)return Number(order.financial_snapshot.net_sales_cents||0);
  return Number(orderTotal(order,rate).total_equivalent_cents||0);
}
function subtotalCents(state,order,rate){
  const receipt=receiptForOrder(state,order);
  if(receipt?.totals?.subtotal_equivalent_cents!=null)return Number(receipt.totals.subtotal_equivalent_cents||0);
  if(order?.financial_snapshot?.subtotal_cents!=null)return Number(order.financial_snapshot.subtotal_cents||0);
  return Number(orderTotal(order,rate).subtotal_equivalent_cents||0);
}
function discountCents(state,order,rate){
  const receipt=receiptForOrder(state,order);
  if(receipt?.totals?.discount_cents!=null)return Number(receipt.totals.discount_cents||0);
  if(order?.financial_snapshot?.discount_cents!=null)return Number(order.financial_snapshot.discount_cents||0);
  return Number(orderTotal(order,rate).discount_cents||0);
}
function cogsUsd(state,order){
  if(order?.financial_snapshot?.cogs_usd!=null)return Number(order.financial_snapshot.cogs_usd||0);
  const receipt=receiptForOrder(state,order);
  if(receipt?.cogs_usd!=null)return Number(receipt.cogs_usd||0);
  return Number(orderCost(state,order)||0);
}
function orderDate(order){return order.paid_at||order.updated_at||order.created_at}
function refundRecord(state,order){return (state.refunds||[]).find(r=>r.order_id===order.id)||null}
function refundDate(state,order){const r=refundRecord(state,order);return r?.at||order.updated_at||order.paid_at||order.created_at}
function paymentFor(state,order){
  const receipt=receiptForOrder(state,order);
  return receipt?.payment||order.payments?.[0]||{};
}
function refundPaymentFor(state,order){
  const r=refundRecord(state,order),receipt=receiptForOrder(state,order);
  return r?.payment||receipt?.refund_payment||{};
}

function recoveryKey(number,date,total){
  const d=validDate(date);const minute=d?Math.floor(d.getTime()/60000):norm(date);
  return `${norm(number)}|${minute}|${cents(total)}`;
}
function activeRecovery(state,rate){
  const recovery=state.excel_recovery||{};
  const settled=(state.orders||[]).filter(o=>['paid','refunded'].includes(o.status));
  const actualOrders=new Set(settled.map(o=>recoveryKey(o.number,orderDate(o),saleCents(state,o,rate)/100)));
  const actualRefunds=new Set((state.orders||[]).filter(o=>o.status==='refunded').map(o=>recoveryKey(o.number,refundDate(state,o),saleCents(state,o,rate)/100)));
  return {
    orders:(recovery.orders||[]).filter(o=>!actualOrders.has(recoveryKey(o.order_number,o.date,o.sales_usd))),
    refunds:(recovery.refunds||[]).filter(r=>!actualRefunds.has(recoveryKey(r.order_number,r.date,r.amount_usd)))
  };
}

export function financeLedger(state,{period='all',anchor=new Date()}={}){
  const rate=Number(state.settings?.exchange_rate||89500);
  const settled=(state.orders||[]).filter(o=>['paid','refunded'].includes(o.status)&&inFinancePeriod(orderDate(o),period,anchor));
  const paid=settled.filter(o=>o.status==='paid');
  const refunded=(state.orders||[]).filter(o=>o.status==='refunded'&&inFinancePeriod(refundDate(state,o),period,anchor));
  const recovery=activeRecovery(state,rate);
  const recoveredOrders=recovery.orders.filter(o=>inFinancePeriod(o.date,period,anchor));
  const recoveredRefunds=recovery.refunds.filter(r=>inFinancePeriod(r.date,period,anchor));
  const expenses=(state.expenses||[]).filter(e=>inFinancePeriod(e.date||e.created_at,period,anchor));
  const purchases=(state.purchases||[]).filter(p=>inFinancePeriod(p.date||p.created_at,period,anchor));
  const shifts=(state.shifts||[]).filter(s=>inFinancePeriod(s.opened_at,period,anchor));

  const grossSalesCents=settled.reduce((sum,o)=>sum+saleCents(state,o,rate),0)+recoveredOrders.reduce((sum,o)=>sum+cents(o.sales_usd),0);
  const refundsCents=refunded.reduce((sum,o)=>sum+saleCents(state,o,rate),0)+recoveredRefunds.reduce((sum,r)=>sum+cents(r.amount_usd),0);
  const netSalesCents=grossSalesCents-refundsCents;
  const subtotalCentsTotal=settled.reduce((sum,o)=>sum+subtotalCents(state,o,rate),0)+recoveredOrders.reduce((sum,o)=>sum+cents(o.subtotal_usd||o.sales_usd),0);
  const discountsCents=settled.reduce((sum,o)=>sum+discountCents(state,o,rate),0)+recoveredOrders.reduce((sum,o)=>sum+cents(o.discount_usd),0);

  const cogs=paid.reduce((sum,o)=>sum+cogsUsd(state,o),0)+recoveredOrders.reduce((sum,o)=>sum+Number(o.cogs_usd||0),0)-recoveredRefunds.reduce((sum,r)=>{
    const original=recoveredOrders.find(o=>String(o.order_number)===String(r.order_number));
    return sum+Number(original?.cogs_usd||0);
  },0);

  const expenseUsd=expenses.reduce((sum,e)=>sum+(String(e.currency).toUpperCase()==='LBP'?Number(e.amount||0)/rate:Number(e.amount||0)),0);
  const grossProfit=netSalesCents/100-cogs;
  const netProfit=grossProfit-expenseUsd;

  let paidUsd=0,paidLbp=0,refundedUsd=0,refundedLbp=0;
  for(const o of settled){const p=paymentFor(state,o);paidUsd+=Number(p.usd_cents||0)/100;paidLbp+=Number(p.lbp||0)}
  for(const o of refunded){const p=refundPaymentFor(state,o);refundedUsd+=Number(p.usd_cents||0)/100;refundedLbp+=Number(p.lbp||0)}
  for(const o of recoveredOrders){paidUsd+=Number(o.paid_usd||0);paidLbp+=Number(o.paid_lbp||0)}
  for(const r of recoveredRefunds){refundedUsd+=Number(r.paid_usd||0);refundedLbp+=Number(r.paid_lbp||0)}

  const inventoryValue=(state.inventory||[]).reduce((sum,i)=>sum+Number(i.quantity||0)*Number(i.unit_cost||0),0);
  const purchaseUsd=purchases.reduce((sum,p)=>sum+Number(p.total_cost||0),0);
  const averageOrder=settled.length+recoveredOrders.length?grossSalesCents/100/(settled.length+recoveredOrders.length):0;

  return {
    period,anchor:new Date(anchor).toISOString(),exchange_rate:rate,
    gross_sales_cents:grossSalesCents,refunds_cents:refundsCents,net_sales_cents:netSalesCents,
    subtotal_cents:subtotalCentsTotal,discounts_cents:discountsCents,
    orders:settled.length+recoveredOrders.length,paid_orders:paid.length+recoveredOrders.length,refunded_orders:refunded.length+recoveredRefunds.length,
    average_order_usd:averageOrder,cogs_usd:cogs,gross_profit_usd:grossProfit,expenses_usd:expenseUsd,net_profit_usd:netProfit,
    gross_margin_percent:netSalesCents?grossProfit/(netSalesCents/100)*100:0,
    paid_usd:paidUsd,paid_lbp:paidLbp,refunded_usd:refundedUsd,refunded_lbp:refundedLbp,net_cash_usd:paidUsd-refundedUsd,net_cash_lbp:paidLbp-refundedLbp,
    inventory_value_usd:inventoryValue,purchases_usd:purchaseUsd,
    expenses,purchases,shifts,recovered_orders:recoveredOrders,recovered_refunds:recoveredRefunds
  };
}
