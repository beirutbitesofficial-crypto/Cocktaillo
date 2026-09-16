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
function checkedSettings(input){const settings={...defaultsFromServer(),...(input||{})};settings.url=validateLoopbackUrl(settings.url);settings.token=String(settings.token||'').trim();settings.customerPrinter=String(settings.customerPrinter||DEFAULT_CUSTOMER_PRINTER).trim();settings.barPrinter=String(settings.barPrinter||DEFAULT_BAR_PRINTER).trim();settings.hookahPrinter=String(settings.hookahPrinter||DEFAULT_HOOKAH_PRINTER).trim();if(!settings.token)throw new Error('Paste the pairing token from the Windows Print Agent.');if(!settings.customerPrinter||!settings.barPrinter||!settings.hookahPrinter)throw new Error('Choose the customer, bar and Shisha printers.');return settings}
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
  const agentDestination=destination==='hookah'?'bar':destination; // Agent 2.4 compatibility: Bar and Shisha share the Arabic raster renderer; printerName still targets HOOKAH.
  return agentRequest('/print',{method:'POST',settings,body:{job_id:bundle.job.id,destination:agentDestination,printer_name:printerName,receipt:bundle.receipt||null,ticket:bundle.ticket||null,open_drawer:bundle.job?.open_drawer===true}});
}

async function serverPost(body){const f=nativeFetch||fetch;const r=await f('/api/print-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`Print server HTTP ${r.status}`);return d}
async function executeJob(bundle,{claimed=false}={}){
  if(!claimed)bundle=await serverPost({action:'claim',job_id:bundle.job.id});
  if(!bundle.should_print)return bundle;
  const job=bundle.job,claim={job_id:job.id,claim_token:job.claim_token};
  const heartbeat=setInterval(()=>void serverPost({action:'heartbeat',...claim}).catch(()=>{}),10000);
  try{await agentPrint(bundle);await serverPost({action:'status',...claim,status:'printed'});emit({status:'printed',jobId:job.id,message:`${job.destination==='hookah'?'Shisha':job.destination} #${job.order_number} printed.`});return bundle}
  catch(e){await serverPost({action:'status',...claim,status:'failed',error:e.message}).catch(()=>{});emit({status:'failed',jobId:job.id,message:'Print job queued for retry',error:e.message});throw e}
  finally{clearInterval(heartbeat)}
}
export async function autoPrintCustomerReceipt(receiptId){
  const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'automatic'});
  void processPrintQueue();return bundle;
}
export async function reprintCustomerReceipt(receiptId){const bundle=await serverPost({action:'create',receipt_id:receiptId,mode:'reprint'});void processPrintQueue();return bundle}
export async function retryPrintJob(jobId){
  const bundle=await serverPost({action:'retry',job_id:jobId}),destinations=await availableDestinations(true);
  if(!destinations.includes(bundle.job?.destination)){emit({status:'queued',jobId,message:'Queued for the cashier Windows printer.'});return bundle}
  return executeJob(bundle);
}
async function processPrintQueue(){
  if(workerBusy)return;
  workerBusy=true;
  try{
    const destinations=await availableDestinations();if(!destinations.length)return;
    // Drain a burst in one pass so simultaneous waiter tickets do not wait for a refresh.
    for(let count=0;count<10;count++){
      const bundle=await serverPost({action:'claim-next',destinations});if(!bundle?.job)break;
      try{await executeJob(bundle,{claimed:true})}catch{}
    }
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
