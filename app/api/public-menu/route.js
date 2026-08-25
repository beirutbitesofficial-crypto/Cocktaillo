import { NextResponse } from 'next/server';
import { readState } from '../../../lib/store.js';

const slug=value=>String(value||'menu').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'menu';

export async function GET(){
  const state=await readState();
  const exchangeRate=Math.max(1,Number(state.settings?.exchange_rate||89500));
  const categoryOrder=new Map((state.categories||[]).map((name,index)=>[String(name),index]));
  const addons=(state.addons||[])
    .filter(addon=>addon.available!==false)
    .map(addon=>({
      id:String(addon.id),
      name:String(addon.name_en||''),
      name_ar:String(addon.name_ar||''),
      price_lbp:Math.max(0,Number(addon.price_lbp||0)),
      price_usd:Math.round((Math.max(0,Number(addon.price_lbp||0))/exchangeRate)*100)/100
    }));
  const items=(state.menu||[])
    .filter(item=>item.available!==false)
    .map(item=>({
      id:String(item.id),
      name:String(item.name_en||''),
      name_ar:String(item.name_ar||''),
      category:String(item.category||'Menu'),
      subcategory:String(item.subcategory||''),
      price:Number(item.price_cents||0)/100,
      allow_addons:Boolean(item.allow_addons),
      best_seller:Boolean(item.best_seller),
      sort_order:Number(item.sort_order||0)
    }))
    .sort((a,b)=>Number(b.best_seller)-Number(a.best_seller)||a.sort_order-b.sort_order||a.name.localeCompare(b.name));

  const grouped=new Map();
  for(const item of items){
    if(!grouped.has(item.category))grouped.set(item.category,[]);
    grouped.get(item.category).push(item);
  }
  const categories=[...grouped.entries()]
    .sort(([a],[b])=>(categoryOrder.get(a)??9999)-(categoryOrder.get(b)??9999)||a.localeCompare(b))
    .map(([name,products],index)=>({id:`pos-${slug(name)}-${index+1}`,name,products}));

  return NextResponse.json({
    source:'cocktaillo-pos',
    generated_at:new Date().toISOString(),
    exchange_rate:exchangeRate,
    addons,
    categories,
    items
  },{headers:{'Cache-Control':'no-store, max-age=0'}});
}
