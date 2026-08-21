'use client';
import qz from 'qz-tray';

const BAR_PRINTER='Bar Printer';
const CUSTOMER_PRINTER='Customer Receipt';
const BAR_PRINTED_KEY='cocktaillo_qz_bar_printed';
let installed=false;
let nativeFetch=null;
let connecting=null;

function emit(detail){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cocktaillo-print-status',{detail}))}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function money(c){return `$${(Number(c||0)/100).toFixed(2)}`}
function lbp(v){return `${Number(v||0).toLocaleString('en-US')} LBP`}
function tableLabel(order){if(!order?.table_id)return '';const n=String(order.table_id).match(/(\d+)/)?.[1];return n?`Table ${n}`:String(order.table_id)}
function rememberedBarIds(){try{return JSON.parse(localStorage.getItem(BAR_PRINTED_KEY)||'[]')}catch{return []}}
function rememberBarId(id){if(typeof window==='undefined'||!id)return;const ids=[id,...rememberedBarIds().filter(x=>x!==id)].slice(0,200);localStorage.setItem(BAR_PRINTED_KEY,JSON.stringify(ids))}

async function ensureQz(){
  if(qz.websocket.isActive())return qz;
  if(connecting)return connecting;
  connecting=qz.websocket.connect({retries:2,delay:0.5}).then(()=>qz).finally(()=>{connecting=null});
  return connecting;
}
async function ensurePrinter(name){await ensureQz();const found=await qz.printers.find(name);if(!found)throw new Error(`QZ Tray cannot find Windows printer: ${name}`);return found}
async function pixelPrint(printer,html,{cut=true}={}){
  const p=await ensurePrinter(printer);
  const config=qz.configs.create(p,{copies:1,margins:0,colorType:'grayscale'});
  await qz.print(config,[{type:'pixel',format:'html',flavor:'plain',data:html}]);
  if(cut){try{await qz.print(config,[{type:'raw',format:'command',flavor:'hex',data:'1B64051D5600'}])}catch{}}
}
function shell(body,dir='ltr'){return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Tahoma,sans-serif;width:72mm}*{box-sizing:border-box}.r{padding:3mm 2.5mm;font-size:12px;line-height:1.35}.c{text-align:center}.b{font-weight:700}.big{font-size:22px}.row{display:flex;justify-content:space-between;gap:8px}.line{border-top:1px dashed #000;margin:6px 0}.item{margin:5px 0}.small{font-size:10px}.rtl{direction:rtl;text-align:right}</style></head><body dir="${dir}"><div class="r">${body}</div></body></html>`}
function customerHtml(r){
  const items=(r.items||r.lines||[]).map(i=>`<div class="item"><div class="row"><span>${esc(i.quantity||1)} × ${esc(i.name_en||i.name||'Item')}</span><b>${money(i.line_total_cents??Number(i.price_cents||0)*Number(i.quantity||1))}</b></div>${(i.addons||[]).map(a=>`<div class="small">+ ${esc(a.name_en||a.name||'Add-on')} ×${esc(a.quantity||1)} · ${lbp(a.price_lbp)}</div>`).join('')}</div>`).join('');
  const total=r.total_cents??r.totals?.total_equivalent_cents??0;
  const subtotal=r.subtotal_cents??r.totals?.usd_cents??total;
  return shell(`<div class="c b big">COCKTAILLO</div><div class="c">Receipt #${esc(r.order_number||r.number||'')}</div>${r.table?`<div class="c b">${esc(r.table)}</div>`:''}<div class="c small">${esc(r.created_at?new Date(r.created_at).toLocaleString('en-GB'):new Date().toLocaleString('en-GB'))}</div><div class="line"></div>${items}<div class="line"></div><div class="row"><span>Subtotal</span><b>${money(subtotal)}</b></div>${Number(r.discount_cents||r.totals?.discount_cents||0)>0?`<div class="row"><span>Discount</span><b>-${money(r.discount_cents||r.totals?.discount_cents)}</b></div>`:''}<div class="row b"><span>TOTAL</span><span>${money(total)}</span></div><div class="row"><span>Payment</span><span>${esc(r.payment_method||r.payment?.method||'')}</span></div>${Number(r.paid_usd_cents||r.payment?.usd_cents||0)>0?`<div class="row"><span>Paid USD</span><span>${money(r.paid_usd_cents||r.payment?.usd_cents)}</span></div>`:''}${Number(r.paid_lbp||r.payment?.lbp||0)>0?`<div class="row"><span>Paid LBP</span><span>${lbp(r.paid_lbp||r.payment?.lbp)}</span></div>`:''}${Number(r.change_cents||0)>0?`<div class="row b"><span>CHANGE</span><span>${money(r.change_cents)}</span></div>`:''}<div class="row"><span>Cashier</span><span>${esc(r.cashier||'')}</span></div><div class="line"></div><div class="c b">Follow us on Instagram</div><div class="c small">@cocktaillorestocafe</div><div class="c" style="margin-top:5px">Thank you</div>`);
}
function barHtml(order,lines){
  const items=lines.map(l=>`<div class="item rtl"><div class="row b"><span>${esc(l.name_ar||l.name_en||'')}</span><span>× ${esc(l.quantity||1)}</span></div>${(l.addons||[]).map(a=>`<div class="small">+ ${esc(a.name_ar||a.name_en||'')} ×${esc(a.quantity||1)}</div>`).join('')}${l.note?`<div class="b">ملاحظة: ${esc(l.note)}</div>`:''}</div>`).join('');
  return shell(`<div class="c b big">COCKTAILLO</div><div class="c b">BAR</div><div class="c b">Order #${esc(order.number||'')}</div>${order.table_id?`<div class="c b">${esc(tableLabel(order))}</div>`:''}<div class="c small">${new Date().toLocaleString('en-GB')}</div><div class="line"></div>${items}<div class="line"></div><div class="c b">${esc(order.created_by_name||'')}</div>`,'rtl');
}

async function serverPost(body){const f=nativeFetch||fetch;const r=await f('/api/print-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Print server HTTP ${r.status}`);return d}
async function executeJob(bundle){
  const {job,receipt,printer_name,should_print}=bundle;
  if(!should_print){if(job?.status==='printed')emit({status:'printed',jobId:job.id,receiptId:job.receipt_id,message:`Receipt #${job.order_number} already printed.`});return bundle}
  await serverPost({action:'status',job_id:job.id,status:'printing'});
  try{
    await pixelPrint(printer_name||CUSTOMER_PRINTER,customerHtml(receipt),{cut:true});
    await serverPost({action:'status',job_id:job.id,status:'printed'});
    emit({status:'printed',jobId:job.id,receiptId:job.receipt_id,message:`Customer receipt #${job.order_number} printed.`});
    return bundle;
  }catch(e){await serverPost({action:'status',job_id:job.id,status:'failed',error:e.message}).catch(()=>{});throw Object.assign(e,{jobId:job.id,receiptId:job.receipt_id})}
}
export async function autoPrintCustomerReceipt(receiptId){try{const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'automatic'});return await executeJob(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||null,receiptId:e.receiptId||receiptId,message:'Receipt printing failed',error:e.message});throw e}}
export async function reprintCustomerReceipt(receiptId){try{const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'reprint'});return await executeJob(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||null,receiptId:e.receiptId||receiptId,message:'Receipt printing failed',error:e.message});throw e}}
export async function retryPrintJob(jobId){try{const bundle=await serverPost({action:'retry',job_id:jobId});return await executeJob(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||jobId,receiptId:e.receiptId||null,message:'Receipt printing failed',error:e.message});throw e}}
export async function autoPrintBarTicket(order){
  if(!order?.id||rememberedBarIds().includes(order.id))return;
  const lines=(order.lines||[]).filter(l=>l.station==='bar');if(!lines.length)return;
  try{await pixelPrint(BAR_PRINTER,barHtml(order,lines),{cut:true});rememberBarId(order.id);emit({status:'printed',message:`Bar ticket #${order.number} printed.`})}catch(e){emit({status:'failed',message:'Bar ticket printing failed',error:e.message});throw e}
}
export async function testQzPrinters(){await ensureQz();const printers=await qz.printers.find();return {ok:true,printers,customer:printers.includes(CUSTOMER_PRINTER),bar:printers.includes(BAR_PRINTER)}}
export function installPrintBridgeInterceptor(){
  if(installed||typeof window==='undefined')return()=>{};installed=true;nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){const response=await nativeFetch(input,init);try{const url=typeof input==='string'?input:input?.url||'';if(response.ok&&init?.method?.toUpperCase()==='POST'){
    const cloned=response.clone();cloned.json().then(d=>{
      if((url.includes('/api/actions')||url.includes('/api/split-pay'))&&d?.receipt?.id)void autoPrintCustomerReceipt(d.receipt.id);
      if(url.includes('/api/orders')&&d?.order?.id)void autoPrintBarTicket(d.order);
    }).catch(()=>{});
  }}catch{}return response};
  return()=>{if(nativeFetch){window.fetch=nativeFetch;installed=false}}
}
