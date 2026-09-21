import {changeFor} from './cash.js';
import {restoreRecipes} from './store.js';

export const refundedQuantity=(state,orderId,lineId)=>(state.refunds||[]).filter(r=>r.order_id===orderId).flatMap(r=>r.items||[]).filter(i=>i.line_id===lineId).reduce((s,i)=>s+Number(i.quantity||0),0);

export function refundableLines(state,order){
  return (order?.lines||[]).map(line=>({...line,refunded_quantity:refundedQuantity(state,order.id,line.id),refundable_quantity:Math.max(0,Number(line.quantity||0)-refundedQuantity(state,order.id,line.id))}));
}

export function refundAmountForItems(state,order,selections,rate=89500){
  if(!Number.isFinite(Number(rate))||Number(rate)<=0)throw new Error('Invalid refund exchange rate.');
  const lines=refundableLines(state,order),byId=new Map(lines.map(l=>[l.id,l])),seen=new Set();
  // Keep LBP add-ons unrounded until allocating the receipt's frozen paid total.
  const weight=l=>Number(l.price_cents||0)*Number(rate)+(l.addons||[]).reduce((n,a)=>n+Number(a.price_lbp||0)*Number(a.quantity||1)*100,0);
  const items=selections.map(s=>{const line=byId.get(s.line_id),quantity=Number(s.quantity);if(seen.has(s.line_id)||!line||!Number.isSafeInteger(quantity)||quantity<1||quantity>line.refundable_quantity)throw new Error('Invalid or duplicate refund item quantity.');seen.add(s.line_id);return {line_id:line.id,menu_item_id:line.menu_item_id,name_en:line.name_en,name_ar:line.name_ar,quantity}});
  const receipt=(state.receipts||[]).find(r=>r.order_id===order.id),total=Number(receipt?.totals?.total_equivalent_cents||0),already=(state.refunds||[]).filter(r=>r.order_id===order.id).reduce((n,r)=>n+Number(r.amount_cents||0),0),remaining=Math.max(0,total-already);
  const whole=lines.reduce((n,l)=>n+weight(l)*Number(l.quantity),0),prior=lines.reduce((n,l)=>n+weight(l)*l.refunded_quantity,0),selected=items.reduce((n,i)=>n+weight(byId.get(i.line_id))*i.quantity,0);
  const allReturned=lines.every(l=>l.refundable_quantity===(items.find(i=>i.line_id===l.id)?.quantity||0));
  const amount=allReturned?remaining:Math.max(0,Math.min(remaining,Math.round(total*(prior+selected)/(whole||1))-already));
  return {items,amount_cents:amount};
}

export function restoreRefundedRecipes(state,items){
  for(const item of items){const line={menu_item_id:item.menu_item_id,quantity:item.quantity};restoreRecipes(state,{lines:[line]})}
}

export function makeRefundPayment(amountCents,currency,rate){return changeFor(amountCents,currency==='LBP'?'LBP':'USD',rate)}

