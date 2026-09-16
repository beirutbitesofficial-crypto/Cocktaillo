// Keep tender, change and refunds separate; all USD arithmetic uses cents.
export function changeFor(cents, currency='USD', rate=89500){
  const amount=Math.max(0,Math.round(Number(cents||0)));
  return currency==='LBP'?{usd_cents:0,lbp:Math.round(amount*rate/100)}:{usd_cents:amount,lbp:0};
}
export function netTender(receipt){
  const p=receipt?.payment||{},change=receipt?.change_payment||changeFor(receipt?.change_cents);
  return {usd_cents:Number(p.usd_cents||0)-Number(change.usd_cents||0),lbp:Number(p.lbp||0)-Number(change.lbp||0)};
}
export function shiftCash(state,shift,until=new Date().toISOString()){
  const inPeriod=at=>at>=shift.opened_at&&at<=until;
  const belongs=(record,at,name)=>record.shift_id?record.shift_id===shift.id:inPeriod(at)&&(record.cashier_id?record.cashier_id===shift.user_id:name===shift.user_name);
  const receipts=(state.receipts||[]).filter(r=>belongs(r,r.created_at,r.cashier));
  let usd=0,lbp=0;
  for(const r of receipts){const p=netTender(r);usd+=p.usd_cents;lbp+=p.lbp}
  const refunds=(state.refunds||[]).filter(r=>belongs(r,r.at,r.user));
  for(const r of refunds){usd-=Number(r.payment?.usd_cents||0);lbp-=Number(r.payment?.lbp||0)}
  for(const e of state.expenses||[]){if(e.paid_from!=='cash_drawer'||!(e.shift_id?e.shift_id===shift.id:inPeriod(e.created_at)))continue;if(e.currency==='LBP')lbp-=Number(e.amount||0);else usd-=Math.round(Number(e.amount||0)*100)}
  return {receipts,refunds,expected_usd:(Math.round(Number(shift.opening_usd||0)*100)+usd)/100,expected_lbp:Number(shift.opening_lbp||0)+lbp};
}
