import {mutateState} from './store.js';
export function shiftWhatsAppConfigured(env=process.env){
  try{return Boolean(env.WHATSAPP_ACCESS_TOKEN&&/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')&&/^\d{8,15}$/.test(env.MANAGER_WHATSAPP_NUMBER||'')&&env.WHATSAPP_SHIFT_TEMPLATE&&env.WHATSAPP_TEMPLATE_LANGUAGE&&new URL(env.PUBLIC_APP_URL).protocol==='https:')}catch{return false}
}
export function shiftTemplateMessage(report,env=process.env){
  const c=report.cash,money=n=>(n/100).toFixed(2);
  const summary=`${report.shift_id}; ${report.opened_at} - ${report.closed_at}; Orders ${report.order_count}; sales USD ${money(report.sales_total_cents)}; discounts USD ${money(report.discount_total_cents)}; refunds USD ${money(report.refund_total_cents)}; net sales USD ${money(report.net_total_cents)}; expected USD ${money(c.expected_usd_cents)} / LBP ${c.expected_lbp}; counted USD ${money(c.counted_usd_cents)} / LBP ${c.counted_lbp}; variance USD ${money(c.variance_usd_cents)} / LBP ${c.variance_lbp}${report.warnings.length?'; REVIEW WARNINGS IN REPORT':''}`;
  const url=new URL('/shift-report',env.PUBLIC_APP_URL);url.searchParams.set('shift_id',report.shift_id);
  return {messaging_product:'whatsapp',to:env.MANAGER_WHATSAPP_NUMBER,type:'template',template:{name:env.WHATSAPP_SHIFT_TEMPLATE,language:{code:env.WHATSAPP_TEMPLATE_LANGUAGE},components:[{type:'body',parameters:[{type:'text',text:report.cashier.replace(/[\r\n\t]/g,' ').slice(0,100)},{type:'text',text:summary},{type:'text',text:url.href}]}]}};
}
export async function sendShiftTemplate(report,{env=process.env,fetcher=fetch}={}){
  if(!shiftWhatsAppConfigured(env))return {status:'not_configured',error:'WhatsApp credentials, approved template, recipient and HTTPS site URL are required.'};
  try{
    const response=await fetcher(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION||'v23.0'}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{Authorization:`Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(shiftTemplateMessage(report,env)),signal:AbortSignal.timeout(15000)});
    const payload=await response.json().catch(()=>null);
    if(!response.ok)return {status:response.status>=500?'uncertain':'failed',error:`WhatsApp rejected request (${response.status}; code ${payload?.error?.code||'unknown'}). Check provider configuration.`};
    if(!payload?.messages?.[0]?.id)return {status:'uncertain',error:'Provider response had no message ID. Check WhatsApp before resending.'};
    return {status:'accepted',message_id:payload.messages[0].id,to:env.MANAGER_WHATSAPP_NUMBER};
  }catch{return {status:'uncertain',error:'Connection interrupted; provider may have accepted the message. Check WhatsApp before resending.'}}
}
// Claim under the same file lock as closing. No network I/O while holding it.
export async function deliverShiftReport(shiftId,{retry=false,send=sendShiftTemplate,mutate=mutateState}={}){
  const claim=await mutate(s=>{
    const d=(s.report_deliveries||[]).find(d=>d.shift_id===shiftId),r=(s.shift_reports||[]).find(r=>r.shift_id===shiftId);
    if(!d||!r)throw new Error('Saved shift report not found.');
    if(d.status==='sending'&&Date.now()-Date.parse(d.started_at)>60000){d.status='uncertain';d.error='Sending was interrupted. Check provider before resending.'}
    const eligible=d.status==='pending'||(retry&&['not_configured','failed'].includes(d.status));
    if(!eligible)return {delivery:d};
    if(send===sendShiftTemplate&&!shiftWhatsAppConfigured()){d.status='not_configured';d.error='WhatsApp setup is incomplete.';return {delivery:d}}
    d.status='sending';d.attempts=(d.attempts||0)+1;d.started_at=new Date().toISOString();d.claim=crypto.randomUUID();d.error=null;
    return {report:r,delivery:d,claim:d.claim};
  });
  if(!claim.report)return claim.delivery;
  let result;try{result=await send(claim.report)}catch{result={status:'uncertain',error:'Sending was interrupted. Check provider before resending.'}}
  return mutate(s=>{const d=s.report_deliveries.find(d=>d.shift_id===shiftId);if(d.claim===claim.claim){Object.assign(d,result,{updated_at:new Date().toISOString()});delete d.claim}s.audit.push({id:`audit-${crypto.randomUUID()}`,type:'shift_report_delivery',shift_id:shiftId,status:d.status,at:new Date().toISOString()});return d});
}
