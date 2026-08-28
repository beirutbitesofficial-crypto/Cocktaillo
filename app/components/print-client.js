'use client';

const PRINT_AGENT_STORAGE_KEY='cocktaillo.print-agent.v1';
const DEFAULT_AGENT_URL='http://127.0.0.1:17483';
const DEFAULT_BAR_PRINTER='Bar Printer';
const DEFAULT_HOOKAH_PRINTER='HOOKAH';
const DEFAULT_CUSTOMER_PRINTER='Customer Receipt';
let installed=false;
let nativeFetch=null;
let workerTimer=null;
let workerBusy=false;
let lastPrinterCheckAt=0;
let lastDestinations=[];

function emit(detail){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('cocktaillo-print-status',{detail}))}
function isWindowsDevice(){return typeof navigator!=='undefined'&&/Windows/i.test(navigator.userAgent||'')}
function cleanUrl(value){return String(value||DEFAULT_AGENT_URL).trim().replace(/\/+$/,'')}
function validateLoopbackUrl(value){const url=cleanUrl(value);let parsed;try{parsed=new URL(url)}catch{throw new Error('Enter a valid print agent URL.')}if(parsed.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))throw new Error('For security, the print agent URL must use local HTTP on 127.0.0.1 or localhost.');return url}
function defaultsFromServer(serverSettings={}){return {url:serverSettings.print_agent_url||DEFAULT_AGENT_URL,token:'',customerPrinter:serverSettings.customer_printer_name||DEFAULT_CUSTOMER_PRINTER,barPrinter:serverSettings.bar_printer_name||DEFAULT_BAR_PRINTER,hookahPrinter:serverSettings.hookah_printer_name||DEFAULT_HOOKAH_PRINTER}}
export function getPrintAgentSettings(serverSettings={}){
  const defaults=defaultsFromServer(serverSettings);
  if(typeof window==='undefined')return defaults;
  try{const saved=JSON.parse(window.localStorage.getItem(PRINT_AGENT_STORAGE_KEY)||'{}');return {...defaults,...saved,url:cleanUrl(saved.url||defaults.url)}}catch{return defaults}
}
function checkedSettings(input){const settings={...defaultsFromServer(),...(input||{})};settings.url=validateLoopbackUrl(settings.url);settings.token=String(settings.token||'').trim();settings.customerPrinter=String(settings.customerPrinter||DEFAULT_CUSTOMER_PRINTER).trim();settings.barPrinter=String(settings.barPrinter||DEFAULT_BAR_PRINTER).trim();settings.hookahPrinter=String(settings.hookahPrinter||DEFAULT_HOOKAH_PRINTER).trim();if(!settings.token)throw new Error('Paste the pairing token from the Windows Print Agent.');if(!settings.customerPrinter||!settings.barPrinter||!settings.hookahPrinter)throw new Error('Choose the customer, bar and Hookah printers.');return settings}
export function savePrintAgentSettings(input){if(typeof window==='undefined')throw new Error('Printer setup is only available in the browser.');const settings=checkedSettings(input);window.localStorage.setItem(PRINT_AGENT_STORAGE_KEY,JSON.stringify(settings));lastPrinterCheckAt=0;lastDestinations=[];emit({status:'ready',message:'Local printer setup saved on this cashier computer.'});return settings}
async function agentRequest(path,{method='GET',body=null,settings=null}={}){
  const config=checkedSettings(settings||getPrintAgentSettings());
  const f=nativeFetch||window.fetch.bind(window);
  const response=await f(config.url+path,{method,mode:'cors',cache:'no-store',headers:{Authorization:'Bearer '+config.token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||('Print Agent HTTP '+response.status));
  return data;
}
export async function testPrintAgent(overrides=null){
  const settings=checkedSettings(overrides?{...getPrintAgentSettings(),...overrides}:getPrintAgentSettings());
  const [health,printerResult]=await Promise.all([agentRequest('/health',{settings}),agentRequest('/printers',{settings})]);
  const printers=Array.isArray(printerResult.printers)?printerResult.printers:[];
  return {ok:true,version:health.version||'',printers,customer:printers.includes(settings.customerPrinter),bar:printers.includes(settings.barPrinter),hookah:printers.includes(settings.hookahPrinter),settings};
}
async function availableDestinations(force=false){
  if(!isWindowsDevice())return [];
  const now=Date.now();if(!force&&now-lastPrinterCheckAt<10000)return lastDestinations;
  lastPrinterCheckAt=now;
  try{const result=await testPrintAgent();lastDestinations=[];if(result.bar)lastDestinations.push('bar');if(result.hookah)lastDestinations.push('hookah');if(result.customer)lastDestinations.push('customer');return lastDestinations}
  catch{lastDestinations=[];return []}
}
async function agentPrint(bundle){
  const settings=checkedSettings(getPrintAgentSettings());
  const destination=bundle.job?.destination;
  if(!['bar','hookah','customer'].includes(destination))throw new Error('Unsupported print destination.');
  const printerName=destination==='bar'?settings.barPrinter:destination==='hookah'?settings.hookahPrinter:settings.customerPrinter;
  const agentDestination=destination==='hookah'?'bar':destination; // Agent 2.4 compatibility: Bar and Hookah share the Arabic raster renderer; printerName still targets HOOKAH.
  return agentRequest('/print',{method:'POST',settings,body:{job_id:bundle.job.id,destination:agentDestination,printer_name:printerName,receipt:bundle.receipt||null,ticket:bundle.ticket||null,open_drawer:bundle.job?.open_drawer===true}});
}

async function serverPost(body){const f=nativeFetch||fetch;const r=await f('/api/print-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Print server HTTP ${r.status}`);return d}
async function executeCustomerJob(bundle,{claimed=false}={}){
  const {job,receipt,printer_name,should_print}=bundle;
  if(!should_print){if(job?.status==='printed')emit({status:'printed',jobId:job.id,receiptId:job.receipt_id,message:`Receipt #${job.order_number} already printed.`});return bundle}
  if(!claimed)await serverPost({action:'status',job_id:job.id,status:'printing'});
  try{await agentPrint(bundle);await serverPost({action:'status',job_id:job.id,status:'printed'});emit({status:'printed',jobId:job.id,receiptId:job.receipt_id,message:`Customer receipt #${job.order_number} printed.`});return bundle}
  catch(e){await serverPost({action:'status',job_id:job.id,status:'failed',error:e.message}).catch(()=>{});throw Object.assign(e,{jobId:job.id,receiptId:job.receipt_id})}
}
export async function autoPrintCustomerReceipt(receiptId){
  const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'automatic'});
  const destinations=await availableDestinations();
  if(!destinations.includes('customer')){emit({status:'queued',jobId:bundle.job?.id||null,receiptId,message:`Receipt #${bundle.job?.order_number||''} queued for cashier printer.`});return bundle}
  try{return await executeCustomerJob(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||bundle.job?.id||null,receiptId,message:'Receipt printing failed on cashier device',error:e.message});throw e}
}
export async function reprintCustomerReceipt(receiptId){
  const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'reprint'});
  const destinations=await availableDestinations(true);
  if(!destinations.includes('customer')){emit({status:'queued',jobId:bundle.job?.id||null,receiptId,message:`Receipt #${bundle.job?.order_number||''} queued for cashier printer.`});return bundle}
  return executeCustomerJob(bundle)
}
export async function retryPrintJob(jobId){
  const bundle=await serverPost({action:'retry',job_id:jobId}),destinations=await availableDestinations(true),destination=bundle.job?.destination;
  if(!destinations.includes(destination)){emit({status:'queued',jobId,message:'Print job is queued for the cashier Windows printer.'});return bundle}
  try{if(destination==='bar'||destination==='hookah'){await agentPrint(bundle);await serverPost({action:'status',job_id:jobId,status:'printed'});return bundle}return await executeCustomerJob(bundle)}catch(e){emit({status:'failed',jobId:e.jobId||jobId,receiptId:e.receiptId||null,message:'Printing failed on cashier device',error:e.message});throw e}
}
async function processPrintQueue(){
  if(workerBusy)return;
  const destinations=await availableDestinations();
  if(!destinations.length)return;
  workerBusy=true;
  try{
    const bundle=await serverPost({action:'claim-next',destinations});
    if(!bundle?.job)return;
    try{
      if(bundle.job.destination==='bar'||bundle.job.destination==='hookah'){
        await agentPrint(bundle);
        await serverPost({action:'status',job_id:bundle.job.id,status:'printed'});
        emit({status:'printed',jobId:bundle.job.id,message:`${bundle.job.destination==='hookah'?'Hookah':'Bar'} ticket #${bundle.job.order_number} printed.`});
      }else await executeCustomerJob(bundle,{claimed:true});
    }catch(e){await serverPost({action:'status',job_id:bundle.job.id,status:'failed',error:e.message}).catch(()=>{});emit({status:'failed',jobId:bundle.job.id,message:`Print job #${bundle.job.order_number} queued for retry`,error:e.message})}
  }catch{}finally{workerBusy=false}
}
export function startCentralPrintWorker(){
  if(typeof window==='undefined'||workerTimer||!isWindowsDevice())return()=>{};
  void processPrintQueue();
  workerTimer=window.setInterval(()=>void processPrintQueue(),1800);
  return()=>{if(workerTimer){clearInterval(workerTimer);workerTimer=null}}
}
export function installPrintBridgeInterceptor(){
  if(installed||typeof window==='undefined')return()=>{};installed=true;nativeFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){const response=await nativeFetch(input,init);try{const url=typeof input==='string'?input:input?.url||'';if(response.ok&&init?.method?.toUpperCase()==='POST'){
    const cloned=response.clone();cloned.json().then(d=>{if((url.includes('/api/actions')||url.includes('/api/split-pay'))&&d?.receipt?.id)void autoPrintCustomerReceipt(d.receipt.id).catch(()=>{})}).catch(()=>{});
  }}catch{}return response};
  return()=>{if(nativeFetch){window.fetch=nativeFetch;installed=false}}
}
