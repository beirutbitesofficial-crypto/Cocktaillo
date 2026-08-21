import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const file = process.env.POS_DATA_FILE || path.join(process.cwd(), '.data', 'cocktaillo.json');
let queue = Promise.resolve();

const menu = [
  ['crepe-chocolate','Crepe - Chocolate','كريب - شوكولا','Crepe',500,'bar',true],
  ['crepe-nutella','Crepe - Nutella','كريب - نوتيلا','Crepe',600,'bar',true],
  ['crepe-lotus','Crepe - Lotus','كريب - لوتس','Crepe',600,'bar',true],
  ['waffle-chocolate','Waffle - Chocolate','وافل - شوكولا','Waffle',600,'bar',true],
  ['waffle-nutella','Waffle - Nutella','وافل - نوتيلا','Waffle',700,'bar',true],
  ['pancake6-chocolate','Pancake 6 pcs - Chocolate','بان كيك ٦ قطع - شوكولا','Pancakes',350,'bar',true],
  ['pancake12-chocolate','Pancake 12 pcs - Chocolate','بان كيك ١٢ قطعة - شوكولا','Pancakes',700,'bar',true],
  ['cold-jelly','Jelly','جيلي','Cold Dessert',100,'bar',false],
  ['cold-rice-pudding','Rice Pudding','رز بحليب','Cold Dessert',188,'bar',false],
  ['cold-knafeh','Knafeh','كنافة','Cold Dessert',388,'bar',false],
  ['icecream-ball','Ice Cream 1 ball','آيس كريم كرة واحدة','Ice Cream',111,'bar',false],
  ['icecream-half','Ice Cream 1/2 kg','آيس كريم نصف كغ','Ice Cream',900,'bar',false],
  ['icecream-kg','Ice Cream 1 kg','آيس كريم ١ كغ','Ice Cream',1800,'bar',false],
].map(([id,name_en,name_ar,category,price_cents,station,allow_addons],i)=>({id,name_en,name_ar,category,price_cents,station,allow_addons,available:true,sort_order:i+1}));

const addons = [
  ['nutella','Nutella','نوتيلا',100000],['lotus','Lotus','لوتس',100000],['icecream','Ice Cream','آيس كريم',100000],['milka','Milka','ميلكا',100000],['white-chocolate','White Chocolate','شوكولا بيضاء',100000],['kinder','Kinder','كيندر',100000],['oreo','Oreo','أوريو',100000],['marshmallow','Marshmallow','مارشميلو',100000],['caramel','Caramel','كراميل',100000],['banana','Banana','موز',80000],['strawberry','Strawberry','فراولة',80000],['pineapple','Pineapple','أناناس',80000],['mango','Mango','مانغا',80000],['nuts','Nuts','مكسرات',80000],['kiwi','Kiwi','كيوي',80000],['cotton-candy','Cotton Candy','غزل البنات',80000]
].map(([id,name_en,name_ar,price_lbp])=>({id,name_en,name_ar,price_lbp,available:true}));

async function initialState(){
  const passwordManager = await bcrypt.hash('2300',10);
  const passwordCashier = await bcrypt.hash('1234',10);
  const passwordWaiter = await bcrypt.hash('12345678',10);
  return {
    version:1,
    users:[
      {id:'u-manager',name:'Alex Daher',username:'manager',password_hash:passwordManager,role:'manager',active:true},
      {id:'u-cashier',name:'Jamie D.',username:'cashier',password_hash:passwordCashier,role:'cashier',active:true},
      {id:'u-waiter',name:'Waiter',username:'waiter',password_hash:passwordWaiter,role:'waiter',active:true}
    ],
    settings:{business_name:'Cocktaillo',exchange_rate:89500,receipt_footer:'Thank you for visiting Cocktaillo',language:'en'},
    tables:Array.from({length:12},(_,i)=>({id:`table-${i+1}`,name:`Table ${i+1}`,capacity:[2,4,4,2,6,4,2,8,4,2,4,6][i],status:'available'})),
    categories:['Crepe','Waffle','Pancakes','Cold Dessert','Ice Cream'], menu, addons,
    shifts:[], orders:[], tickets:[], inventory:[], expenses:[], reservations:[], audit:[], next_order_number:1
  };
}

async function readUnlocked(){
  try { return JSON.parse(await readFile(file,'utf8')); } catch { const state=await initialState(); await writeUnlocked(state); return state; }
}
async function writeUnlocked(state){
  await mkdir(path.dirname(file),{recursive:true}); const tmp=`${file}.${process.pid}.${Date.now()}.tmp`; await writeFile(tmp,JSON.stringify(state,null,2)); await rename(tmp,file);
}
export async function readState(){ return readUnlocked(); }
export async function mutateState(fn){
  let resolve,reject; const result=new Promise((r,j)=>{resolve=r;reject=j});
  queue=queue.then(async()=>{try{const state=await readUnlocked();const value=await fn(state);await writeUnlocked(state);resolve(value)}catch(e){reject(e)}},async()=>{try{const state=await readUnlocked();const value=await fn(state);await writeUnlocked(state);resolve(value)}catch(e){reject(e)}}); return result;
}
export const publicUser = u => ({id:u.id,name:u.name,username:u.username,role:u.role,active:u.active});
export const orderTotal = (order, rate=89500) => {
  const usd=order.lines.reduce((s,l)=>s+l.price_cents*l.quantity,0);
  const lbp=order.lines.reduce((s,l)=>s+l.addons.reduce((a,x)=>a+x.price_lbp*x.quantity*l.quantity,0),0);
  return {usd_cents:usd,lbp,total_equivalent_cents:usd+Math.round((lbp/rate)*100)};
};
