import {changeFor} from './cash.js';
import {restoreRecipes} from './store.js';

export const refundedQuantity=(state,orderId,lineId)=>(state.refunds||[]).filter(r=>r.order_id===orderId).flatMap(r=>r.items||[]).filter(i=>i.line_id===lineId).reduce((s,i)=>s+Number(i.quantity||0),0);

export function refundableLines(state,order){
  return (order?.lines||[]).map(line=>({...line,refunded_quantity:refundedQuantity(state,order.id,line.id),refundable_quantity:Math.max(0,Number(line.quantity||0)-refundedQuantity(state,order.id,line.id))}));
}

export function refundAmountForItems(state,order,selections,rate=89500){
  const lines=refundableLines(state,order),byId=new Map(lines.map(l=>[l.id,l]));let raw=0;
  const items=selections.map(s=>{const line=byId.get(s.line_id),quantity=Math.floor(Number(s.quantity||0));if(!line||quantity<1||quantity>line.refundable_quantity)throw new Error('Invalid refund item quantity.');const addonLbp=(line.addons||[]).reduce((a,x)=>a+Number(x.price_lbp||0)*Number(x.quantity||1),0);const unitCents=Number(line.price_cents||0)+Math.round(addonLbp/Number(rate)*100);raw+=unitCents*quantity;return {line_id:line.id,menu_item_id:line.menu_item_id,name_en:line.name_en,name_ar:line.name_ar,quantity,unit_cents:unitCents,amount_cents:unitCents*quantity}});
  const receipt=(state.receipts||[]).find(r=>r.order_id===order.id),total=Number(receipt?.totals?.total_equivalent_cents||0),subtotal=Number(receipt?.totals?.subtotal_equivalent_cents||total||1);const amount=Math.min(total,Math.round(raw*(subtotal?total/subtotal:1)));return {items,amount_cents:amount};
}

export function restoreRefundedRecipes(state,items){
  for(const item of items){const line={menu_item_id:item.menu_item_id,quantity:item.quantity};restoreRecipes(state,{lines:[line]})}
}

export function makeRefundPayment(amountCents,currency,rate){return changeFor(amountCents,currency==='LBP'?'LBP':'USD',rate)}
