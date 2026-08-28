import { mkdir, readFile, rename, writeFile, access, open, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { beverageMenu, beverageCategories, beverageSubcategories } from './beverage-seed.js';
import { dessertMenu, dessertSubcategories, dessertAddons } from './dessert-seed.js';

const file = process.env.POS_DATA_FILE || path.join(process.cwd(), '.data', 'cocktaillo.json');
const backupDir=path.join(path.dirname(file),'backups');
const lockFile=`${file}.lock`;
let queue = Promise.resolve();
const extraMenu = [
 ['salad-fruit','Fruit Salad','سلطة فواكه','Salads',600,'bar'],['salad-fruit-nutella','Fruit Salad with Nutella','سلطة فواكه مع نوتيلا','Salads',700,'bar'],['salad-fruit-nuts','Fruit Salad with Nuts','سلطة فواكه مع مكسرات','Salads',700,'bar'],['salad-fruit-cream-honey-nuts','Fruit Salad with Cream, Honey & Nuts','سلطة فواكه مع قشطة وعسل ومكسرات','Salads',800,'bar'],['hookah-two-apples-fakher','Two Apples - Fakher','تفاحتين - فاخر','Hookah',700,'bar'],['hookah-two-apples-nakhla','Two Apples - Nakhla','تفاحتين - نخلة','Hookah',700,'bar'],['hookah-two-apples-mix','Two Apples - Mix','تفاحتين - ميكس','Hookah',700,'bar'],['hookah-lemon-mint','Lemon & Mint','ليمون ونعنع','Hookah',700,'bar'],['hookah-grape-mint','Grape & Mint','عنب ونعنع','Hookah',700,'bar'],['hookah-love','Love','لوف','Hookah',700,'bar'],['hookah-head-change','Head Change','تغيير راس','Hookah',388,'bar']
].map(([id,name_en,name_ar,category,price_cents,station],i)=>({id,name_en,name_ar,category,subcategory:'',price_cents,station,allow_addons:false,available:true,sort_order:500+i}));
const menu=[...dessertMenu,...beverageMenu,...extraMenu];
const addons=dessertAddons;
const defaultSettings={business_name:'Cocktaillo',exchange_rate:89500,receipt_footer:'Thank you for visiting Cocktaillo',language:'en',theme:'light',print_agent_url:'http://127.0.0.1:17483',customer_printer_name:'Customer Receipt',kitchen_printer_name:'Kitchen Printer',bar_printer_name:'Bar Printer'};
const salesKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').trim();

function refreshBestSellers(state){
  state.menu=Array.isArray(state.menu)?state.menu:[];
  state.orders=Array.isArray(state.orders)?state.orders:[];
  const stats=new Map();
  const byId=new Map();
  const byName=new Map();
  for(const item of state.menu){
    const id=String(item.id);
    byId.set(id,item);
    const en=salesKey(item.name_en),ar=salesKey(item.name_ar);
    if(en&&!byName.has(en))byName.set(en,item);
    if(ar&&!byName.has(ar))byName.set(ar,item);
    stats.set(id,{units:0,revenue_cents:0,last_sale_at:''});
  }
  for(const order of state.orders){
    if(order.status!=='paid')continue;
    const soldAt=String(order.paid_at||order.updated_at||order.created_at||'');
    for(const line of Array.isArray(order.lines)?order.lines:[]){
      const quantity=Math.max(0,Math.floor(Number(line.quantity||0)));
      if(!quantity)continue;
      let item=byId.get(String(line.menu_item_id||''));
      if(!item){
        const en=salesKey(line.name_en),ar=salesKey(line.name_ar);
        item=(en&&byName.get(en))||(ar&&byName.get(ar));
      }
      if(!item)continue;
      const stat=stats.get(String(item.id));
      stat.units+=quantity;
      stat.revenue_cents+=Math.max(0,Number(line.price_cents||item.price_cents||0))*quantity;
      if(soldAt>stat.last_sale_at)stat.last_sale_at=soldAt;
    }
  }
  let winner=null;
  for(const item of state.menu){
    const stat=stats.get(String(item.id))||{units:0,revenue_cents:0,last_sale_at:''};
    item.units_sold=stat.units;
    item.best_seller=false;
    if(!stat.units)continue;
    if(!winner||stat.units>winner.stat.units||
      (stat.units===winner.stat.units&&stat.revenue_cents>winner.stat.revenue_cents)||
      (stat.units===winner.stat.units&&stat.revenue_cents===winner.stat.revenue_cents&&stat.last_sale_at>winner.stat.last_sale_at)||
      (stat.units===winner.stat.units&&stat.revenue_cents===winner.stat.revenue_cents&&stat.last_sale_at===winner.stat.last_sale_at&&Number(item.sort_order||0)<Number(winner.item.sort_order||0))){
      winner={item,stat};
    }
  }
  if(winner)winner.item.best_seller=true;
  return winner?{item_id:winner.item.id,units_sold:winner.stat.units}:null;
}

function firstBootManagerPassword(){const configured=String(process.env.POS_INITIAL_MANAGER_PASSWORD||'');if(configured){const minimum=process.env.NODE_ENV==='production'?8:4;if(configured.length<minimum)throw new Error(`POS_INITIAL_MANAGER_PASSWORD must be at least ${minimum} characters.`);return configured}if(process.env.NODE_ENV==='production')console.warn('[Cocktaillo] POS data file is missing and POS_INITIAL_MANAGER_PASSWORD is not configured. Using the legacy manager password for compatibility; configure POS_INITIAL_MANAGER_PASSWORD and persistent POS_DATA_FILE storage as soon as possible.');return '2300'}
async function initialState(){const passwordManager=await bcrypt.hash(firstBootManagerPassword(),10);return {version:9,users:[{id:'u-manager',name:'Alex Daher',username:'manager',password_hash:passwordManager,role:'manager',active:true}],settings:{...defaultSettings},tables:Array.from({length:12},(_,i)=>({id:`table-${i+1}`,name:`Table ${i+1}`,capacity:[2,4,4,2,6,4,2,8,4,2,4,6][i],status:'available'})),categories:['Dessert',...beverageCategories,'Salads','Hookah'],subcategories:[...dessertSubcategories,...beverageSubcategories],menu,addons,shifts:[],orders:[],receipts:[],tickets:[],print_jobs:[],inventory:[],recipes:[],expenses:[],purchases:[],refunds:[],reservations:[],audit:[],next_order_number:1}}
function migrate(state){
  const oldVersion=Number(state.version||0);
  state.version=9;
  for(const k of ['receipts','recipes','inventory','expenses','purchases','refunds','reservations','audit','print_jobs','orders'])state[k]=Array.isArray(state[k])?state[k]:[];
  state.users=Array.isArray(state.users)?state.users:[];
  state.addons=Array.isArray(state.addons)?state.addons:[];
  if(oldVersion<7){const manager=state.users.find(u=>u.role==='manager')||state.users[0];state.users=manager?[{...manager,role:'manager',active:true}]:[]}
  state.settings={...defaultSettings,...(state.settings||{})};
  state.categories=Array.from(new Set(['Dessert',...beverageCategories,'Salads','Hookah',...(state.categories||[]).filter(x=>!['Crepe','Waffle','Pancakes','Pancake','Cold Dessert','Ice Cream','Merry Cream'].includes(x))]));
  state.subcategories=Array.from(new Set([...dessertSubcategories,...beverageSubcategories,...(state.subcategories||[])]));
  state.menu=(state.menu||[]).map(i=>{if(['Crepe','Waffle','Pancakes','Pancake','Cold Dessert','Ice Cream','Merry Cream'].includes(i.category))return {...i,category:'Dessert',subcategory:i.category==='Pancakes'?'Pancake':i.category};return {...i,subcategory:typeof i.subcategory==='string'?i.subcategory:''}});
  const incoming=[...dessertMenu,...beverageMenu,...extraMenu];
  const byId=new Map(state.menu.map(i=>[i.id,i]));
  for(const item of incoming){
    const current=byId.get(item.id);
    if(current){
      if(typeof current.name_en!=='string'||!current.name_en.trim())current.name_en=item.name_en;
      if(typeof current.name_ar!=='string'||!current.name_ar.trim())current.name_ar=item.name_ar;
      if(typeof current.category!=='string'||!current.category.trim())current.category=item.category;
      if(typeof current.subcategory!=='string')current.subcategory=item.subcategory||'';
      if(!Number.isFinite(Number(current.price_cents)))current.price_cents=item.price_cents;
      if(!['bar','kitchen'].includes(current.station))current.station=item.station;
      if(typeof current.allow_addons!=='boolean')current.allow_addons=Boolean(item.allow_addons);
      if(typeof current.available!=='boolean')current.available=true;
      if(!Number.isFinite(Number(current.sort_order)))current.sort_order=item.sort_order;
    }else{
      state.menu.push({...item});
      byId.set(item.id,state.menu[state.menu.length-1]);
    }
  }
  const addonById=new Map((state.addons||[]).map(a=>[a.id,a]));
  for(const addon of dessertAddons){const current=addonById.get(addon.id);if(current)Object.assign(current,{...addon,available:current.available!==false});else{state.addons.push({...addon});addonById.set(addon.id,addon)}}
  refreshBestSellers(state);
  return state;
}
async function readUnlocked(){let raw;try{raw=await readFile(file,'utf8')}catch(e){if(e?.code!=='ENOENT')throw e;const state=await initialState();await writeUnlocked(state);return state}let parsed;try{parsed=JSON.parse(raw)}catch(e){throw new Error(`POS data file is not valid JSON: ${file}`,{cause:e})}if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(`POS data file has an invalid root structure: ${file}`);return migrate(parsed)}
async function writeDailySnapshot(state){try{await mkdir(backupDir,{recursive:true});const day=new Date().toISOString().slice(0,10),target=path.join(backupDir,`cocktaillo-auto-${day}.json`);try{await access(target);return}catch{}await writeFile(target,JSON.stringify({format:'cocktaillo-pos-auto-backup',created_at:new Date().toISOString(),data:state},null,2))}catch(e){console.warn('[Cocktaillo] Automatic backup snapshot failed:',e instanceof Error?e.message:e)}}
async function writeUnlocked(state){await mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;await writeFile(tmp,JSON.stringify(state,null,2));await rename(tmp,file)}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function acquireFileLock(){await mkdir(path.dirname(file),{recursive:true});const started=Date.now();while(true){try{const handle=await open(lockFile,'wx');await handle.writeFile(`${process.pid}:${Date.now()}`);return async()=>{try{await handle.close()}finally{await unlink(lockFile).catch(e=>{if(e?.code!=='ENOENT')throw e})}}}catch(e){if(e?.code!=='EEXIST')throw e;try{const info=await stat(lockFile);if(Date.now()-info.mtimeMs>30000){await unlink(lockFile).catch(err=>{if(err?.code!=='ENOENT')throw err});continue}}catch(err){if(err?.code==='ENOENT')continue;throw err}if(Date.now()-started>=10000)throw new Error('POS data file is busy. Please retry the operation.');await wait(50)}}}
export async function readState(){return readUnlocked()}
async function runMutation(fn){const release=await acquireFileLock();try{const state=await readUnlocked();await writeDailySnapshot(state);const value=await fn(state);refreshBestSellers(state);await writeUnlocked(state);return value}finally{await release()}}
export async function mutateState(fn){const run=()=>runMutation(fn);const result=queue.then(run,run);queue=result.catch(()=>{});return result}
export const publicUser=u=>({id:u.id,name:u.name,username:u.username,role:u.role,active:u.active});
export const publicSettings=s=>{const {manager_pin_hash,...safe}=s||{};return safe};
export const orderTotal=(order,rate=89500)=>{const exchangeRate=Number(rate);if(!Number.isFinite(exchangeRate)||exchangeRate<=0)throw new Error('Exchange rate must be a positive number.');const usd=order.lines.reduce((s,l)=>s+l.price_cents*l.quantity,0);const lbp=order.lines.reduce((s,l)=>s+l.addons.reduce((a,x)=>a+x.price_lbp*x.quantity*l.quantity,0),0);const before=usd+Math.round((lbp/exchangeRate)*100);const d=order.discount||null;let discount_cents=0;if(d?.type==='percent')discount_cents=Math.round(before*Math.min(100,Math.max(0,Number(d.value||0)))/100);if(d?.type==='fixed')discount_cents=Math.min(before,Math.round(Math.max(0,Number(d.value||0))*100));return {usd_cents:usd,lbp,subtotal_equivalent_cents:before,discount_cents,total_equivalent_cents:Math.max(0,before-discount_cents)}};
export function recipeCost(state,menuItemId){const recipe=state.recipes.find(r=>r.menu_item_id===menuItemId);return (recipe?.lines||[]).reduce((sum,l)=>{const inv=state.inventory.find(i=>i.id===l.inventory_id);return sum+Number(l.quantity||0)*Number(inv?.unit_cost||0)},0)}
export function orderCost(state,order){return order.lines.reduce((sum,l)=>sum+recipeCost(state,l.menu_item_id)*Number(l.quantity||0),0)}
export function deductRecipes(state,order){for(const line of order.lines){const recipe=state.recipes.find(r=>r.menu_item_id===line.menu_item_id);if(!recipe)continue;for(const component of recipe.lines||[]){const stock=state.inventory.find(i=>i.id===component.inventory_id);if(stock)stock.quantity=Number(stock.quantity||0)-Number(component.quantity||0)*line.quantity}}}
export function restoreRecipes(state,order){for(const line of order.lines){const recipe=state.recipes.find(r=>r.menu_item_id===line.menu_item_id);if(!recipe)continue;for(const component of recipe.lines||[]){const stock=state.inventory.find(i=>i.id===component.inventory_id);if(stock)stock.quantity=Number(stock.quantity||0)+Number(component.quantity||0)*line.quantity}}}
