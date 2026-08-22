'use client';

const STORAGE_KEY='cocktaillo-local-print-v1';
const DEFAULTS={serviceUrl:'http://127.0.0.1:17483',token:'',customerPrinter:'Customer Receipt',barPrinter:'Bar Printer',paperWidth:80};
let installed=false,nativeFetch=null,workerTimer=null,workerBusy=false,lastHealthAt=0,lastHealthOk=false;

function emit(detail){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cocktaillo-print-status',{detail}))}
function normalizeSettings(raw={}){return {serviceUrl:String(raw.serviceUrl||DEFAULTS.serviceUrl).replace(/\/$/,''),token:String(raw.token||''),customerPrinter:String(raw.customerPrinter||DEFAULTS.customerPrinter),barPrinter:String(raw.barPrinter||DEFAULTS.barPrinter),paperWidth:Number(raw.paperWidth)===58?58:80}}
export function getLocalPrintSettings(){if(typeof window==='undefined')return {...DEFAULTS};try{return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'))}catch{return {...DEFAULTS}}}
export function saveLocalPrintSettings(settings){const next=normalizeSettings(settings);if(typeof window!=='undefined')localStorage.setItem(STORAGE_KEY,JSON.stringify(next));lastHealthAt=0;lastHealthOk=false;return next}

async function agentRequest(path,options={},settings=getLocalPrintSettings()){
  if(!settings.token.trim())throw new Error('Printer setup is not completed on this Windows device.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
  try{
    const response=await fetch(`${settings.serviceUrl}${path}`,{...options,cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','Authorization':`Bearer ${settings.token.trim()}`,...(options.headers||{})}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`Local print service HTTP ${response.status}`);
    return payload;
  }catch(e){if(e?.name==='AbortError')throw new Error('Local print service did not respond.');throw e}
  finally{clearTimeout(timer)}
}
export async function testLocalPrintService(settings=getLocalPrintSettings()){
  const health=await agentRequest('/health',{},settings),list=await agentRequest('/printers',{},settings);
  return {ok:health.ok===true,service:health.name||'Cocktaillo Print Agent',printers:Array.isArray(list.printers)?list.printers:[]};
}
async function localServiceReady(){const settings=getLocalPrintSettings();if(!settings.token.trim())return false;const now=Date.now();if(now-lastHealthAt<12000)return lastHealthOk;lastHealthAt=now;try{await agentRequest('/health',{},settings);lastHealthOk=true}catch{lastHealthOk=false}return lastHealthOk}

async function serverPost(body){const f=nativeFetch||fetch;const r=await f('/api/print-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Print server HTTP ${r.status}`);return d}

async function sendCustomerToAgent(bundle){const {job,receipt,should_print}=bundle;if(!should_print){if(job?.status==='printed')emit({status:'printed',jobId:job.id,receiptId:job.receipt_id,message:`Receipt #${job.order_number} already printed.`});return bundle}const settings=getLocalPrintSettings();await serverPost({action:'status',job_id:job.id,status:'printing'});try{await agentRequest('/print',{method:'POST',body:JSON.stringify({job_id:job.id,destination:'customer',printer_name:settings.customerPrinter||bundle.printer_name,receipt})},settings);await serverPost({action:'status',job_id:job.id,status:'printed'});emit({status:'printed',jobId:job.id,receiptId:job.receipt_id,message:`Customer receipt #${job.order_number} printed.`});return bundle}catch(e){await serverPost({action:'status',job_id:job.id,status:'failed',error:e.message}).catch(()=>{});throw Object.assign(e,{jobId:job.id,receiptId:job.receipt_id})}}
export async function autoPrintCustomerReceipt(receiptId){try{const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'automatic'});return await sendCustomerToAgent(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||null,receiptId:e.receiptId||receiptId,message:'Receipt saved, but printing needs attention',error:e.message});throw e}}
export async function reprintCustomerReceipt(receiptId){try{const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'reprint'});return await sendCustomerToAgent(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||null,receiptId:e.receiptId||receiptId,message:'Receipt reprint failed',error:e.message});throw e}}

function wrapText(ctx,text,maxWidth){const words=String(text||'').trim().split(/\s+/).filter(Boolean);if(!words.length)return [''];const lines=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width<=maxWidth||!line)line=next;else{lines.push(line);line=word}}if(line)lines.push(line);return lines}
function barTicketRaw(ticket,paperWidth=80){
  if(typeof document==='undefined')throw new Error('Bar ticket rendering requires the cashier browser.');
  const width=paperWidth===58?384:576,margin=22,usable=width-margin*2,rows=[];
  const measure=document.createElement('canvas').getContext('2d');
  measure.font='bold 28px Arial, Tahoma, sans-serif';
  rows.push({text:'COCKTAILLO',size:34,bold:true,align:'center'},{text:'BAR',size:30,bold:true,align:'center'},{text:`Order #${ticket.order_number||''}`,size:28,bold:true,align:'center'});
  if(ticket.table)rows.push({text:String(ticket.table),size:25,bold:true,align:'center'});
  rows.push({text:new Date(ticket.created_at||Date.now()).toLocaleString('en-GB'),size:18,align:'center'},{separator:true});
  for(const item of ticket.lines||[]){
    measure.font='bold 28px Arial, Tahoma, sans-serif';
    const main=`× ${Number(item.quantity||1)}  ${item.name_ar||item.name_en||'Item'}`;
    for(const text of wrapText(measure,main,usable))rows.push({text,size:28,bold:true,rtl:true});
    measure.font='22px Arial, Tahoma, sans-serif';
    for(const addon of item.addons||[]){const value=`+ ${addon.name_ar||addon.name_en||''} ×${Number(addon.quantity||1)}`;for(const text of wrapText(measure,value,usable-18))rows.push({text,size:22,rtl:true,indent:18})}
    if(item.note){measure.font='bold 22px Arial, Tahoma, sans-serif';for(const text of wrapText(measure,`ملاحظة: ${item.note}`,usable))rows.push({text,size:22,bold:true,rtl:true})}
    rows.push({gap:8});
  }
  rows.push({separator:true},{text:ticket.staff_name||'',size:20,bold:true,align:'center'});
  let height=28;for(const row of rows){if(row.separator)height+=18;else if(row.gap)height+=row.gap;else height+=Math.ceil((row.size||22)*1.35)}height+=40;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#000';ctx.textBaseline='top';let y=18;
  for(const row of rows){if(row.separator){ctx.fillRect(margin,y+7,usable,2);y+=18;continue}if(row.gap){y+=row.gap;continue}ctx.font=`${row.bold?'700':'400'} ${row.size||22}px Arial, Tahoma, sans-serif`;ctx.direction=row.rtl?'rtl':'ltr';ctx.textAlign=row.align==='center'?'center':row.rtl?'right':'left';const x=row.align==='center'?width/2:row.rtl?width-margin-(row.indent||0):margin+(row.indent||0);ctx.fillText(row.text,x,y,usable);y+=Math.ceil((row.size||22)*1.35)}
  const image=ctx.getImageData(0,0,width,height),bytesPerRow=Math.ceil(width/8),raster=new Uint8Array(bytesPerRow*height);for(let yy=0;yy<height;yy++){for(let xx=0;xx<width;xx++){const p=(yy*width+xx)*4,lum=image.data[p]*0.299+image.data[p+1]*0.587+image.data[p+2]*0.114;if(lum<180)raster[yy*bytesPerRow+(xx>>3)]|=0x80>>(xx&7)}}
  const header=new Uint8Array([0x1b,0x40,0x1d,0x76,0x30,0x00,bytesPerRow&255,(bytesPerRow>>8)&255,height&255,(height>>8)&255]),feed=new Uint8Array([0x1b,0x64,0x04]),out=new Uint8Array(header.length+raster.length+feed.length);out.set(header,0);out.set(raster,header.length);out.set(feed,header.length+raster.length);let binary='';const chunk=0x8000;for(let i=0;i<out.length;i+=chunk)binary+=String.fromCharCode(...out.subarray(i,i+chunk));return btoa(binary)
}
async function sendBarToAgent(bundle){const settings=getLocalPrintSettings(),raw_base64=barTicketRaw(bundle.ticket,settings.paperWidth);await agentRequest('/print',{method:'POST',body:JSON.stringify({job_id:bundle.job.id,destination:'bar',printer_name:settings.barPrinter||bundle.printer_name,raw_base64})},settings);await serverPost({action:'status',job_id:bundle.job.id,status:'printed'});emit({status:'printed',jobId:bundle.job.id,message:`Bar ticket #${bundle.job.order_number} printed.`});return bundle}
export async function retryPrintJob(jobId){try{const bundle=await serverPost({action:'retry',job_id:jobId});if(bundle.job?.destination==='bar')return await sendBarToAgent(bundle);return await sendCustomerToAgent(bundle)}catch(e){emit({status:'failed',jobId,message:'Printing needs attention',error:e.message});throw e}}

async function processBarQueue(){if(workerBusy)return;if(!(await localServiceReady()))return;workerBusy=true;try{const bundle=await serverPost({action:'claim-next'});if(!bundle?.job)return;try{await sendBarToAgent(bundle)}catch(e){await serverPost({action:'status',job_id:bundle.job.id,status:'failed',error:e.message}).catch(()=>{});emit({status:'failed',jobId:bundle.job.id,message:`Bar ticket #${bundle.job.order_number} is queued for retry`,error:e.message})}}catch{}finally{workerBusy=false}}
export function startCentralPrintWorker(){if(typeof window==='undefined'||workerTimer)return()=>{};void processBarQueue();workerTimer=window.setInterval(()=>void processBarQueue(),1800);return()=>{if(workerTimer){clearInterval(workerTimer);workerTimer=null}}}

export function installPrintBridgeInterceptor(){if(installed||typeof window==='undefined')return()=>{};installed=true;nativeFetch=window.fetch.bind(window);window.fetch=async function(input,init){const response=await nativeFetch(input,init);try{const url=typeof input==='string'?input:input?.url||'';if(response.ok&&init?.method?.toUpperCase()==='POST'){const cloned=response.clone();cloned.json().then(d=>{if((url.includes('/api/actions')||url.includes('/api/split-pay'))&&d?.receipt?.id)void autoPrintCustomerReceipt(d.receipt.id)}).catch(()=>{})}}catch{}return response};return()=>{if(nativeFetch){window.fetch=nativeFetch;installed=false}}}
