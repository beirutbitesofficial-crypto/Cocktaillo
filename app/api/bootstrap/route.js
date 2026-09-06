import { NextResponse } from 'next/server';
import { getUser } from '../../../lib/auth.js';
import { readState, mutateState, publicUser, publicSettings, orderTotal } from '../../../lib/store.js';
import { financeLedger } from '../../../lib/finance-ledger.js';
import { fetchCocktailloWebsiteMenu, mergeCocktailloWebsiteMenu, COCKTAILLO_MENU_SOURCE } from '../../../lib/alqaima-menu.js';
import { ensureDefaultRecipes } from '../../../lib/recipe-templates.js';
import { dedupeMenuItems } from '../../../lib/menu-dedupe.js';
import { cleanupMenuTaxonomy } from '../../../lib/menu-taxonomy.js';

let catalogPrepared=false;
const norm=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
const minute=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?norm(value):String(Math.floor(d.getTime()/60000))};
const cents=value=>Math.round(Number(value||0)*100);
const recoveryOrderKey=(number,date,total)=>`${norm(number)}|${minute(date)}|${cents(total)}`;
const recoveryRefundKey=(number,date,total)=>`${norm(number)}|${minute(date)}|${cents(total)}`;

async function ensureCatalogPrepared(){
  if(catalogPrepared)return;
  await mutateState(state=>{cleanupMenuTaxonomy(state);ensureDefaultRecipes(state)});
  catalogPrepared=true;
}

async function ensureWebsiteMenu(user){
  if(user.role!=='manager')return;
  const current=await readState();
  if(current.website_menu_synced_at)return;
  try{
    const items=await fetchCocktailloWebsiteMenu();
    if(!items.length)return;
    await mutateState(state=>{
      if(state.website_menu_synced_at)return;
      const merged=mergeCocktailloWebsiteMenu(state,items);
      cleanupMenuTaxonomy(state);
      ensureDefaultRecipes(state);
      state.website_menu_synced_at=new Date().toISOString();
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'website_menu_synced',source:COCKTAILLO_MENU_SOURCE,added:merged.added,updated:merged.updated,total:merged.total,user:user.name,at:state.website_menu_synced_at});
    });
  }catch(error){console.warn('[Cocktaillo] Website menu auto-sync unavailable:',error instanceof Error?error.message:error)}
}

function activeRecovery(state,rate){
  const recovery=state.excel_recovery||{},settled=state.orders.filter(o=>['paid','refunded'].includes(o.status)),refunded=state.orders.filter(o=>o.status==='refunded');
  const actualPaidKeys=new Set(settled.map(o=>recoveryOrderKey(o.number,o.paid_at||o.updated_at||o.created_at,orderTotal(o,rate).total_equivalent_cents/100)));
  const actualRefundKeys=new Set(refunded.map(o=>{const r=(state.refunds||[]).find(x=>x.order_id===o.id)||{};return recoveryRefundKey(o.number,r.at||o.updated_at||o.created_at,orderTotal(o,rate).total_equivalent_cents/100)}));
  return {
    orders:(recovery.orders||[]).filter(o=>!actualPaidKeys.has(recoveryOrderKey(o.order_number,o.date,o.sales_usd))),
    refunds:(recovery.refunds||[]).filter(r=>!actualRefundKeys.has(recoveryRefundKey(r.order_number,r.date,r.amount_usd)))
  };
}

function enrichMenuWithRecovery(menu,recoveryOrders){
  const byId=new Map(),byName=new Map();
  for(const order of recoveryOrders)for(const line of order.item_details||[]){
    const qty=Math.max(0,Number(line.quantity||0));if(!qty)continue;
    if(line.item_id)byId.set(String(line.item_id),(byId.get(String(line.item_id))||0)+qty);
    else {const key=norm(line.name)||norm(line.arabic);if(key)byName.set(key,(byName.get(key)||0)+qty)}
  }
  const out=menu.map(item=>{
    const extra=(byId.get(String(item.id))||0)+(byName.get(norm(item.name_en))||0)+(byName.get(norm(item.name_ar))||0);
    return {...item,units_sold:Math.max(0,Number(item.units_sold||0))+extra,best_seller:false};
  });
  let best=null;for(const item of out)if(Number(item.units_sold||0)>0&&(!best||Number(item.units_sold)>Number(best.units_sold)))best=item;
  if(best)best.best_seller=true;
  return out;
}

export async function GET(){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  await ensureCatalogPrepared();
  await ensureWebsiteMenu(user);
  const s=await readState(),rate=Number(s.settings.exchange_rate||89500),recovery=activeRecovery(s,rate);
  const visibleMenu=enrichMenuWithRecovery(dedupeMenuItems((s.menu||[]).filter(item=>!item.deleted)),recovery.orders);
  const withTotals=o=>({...o,totals:orderTotal(o,rate)});
  const openOrders=s.orders.filter(o=>o.status==='open').map(withTotals);
  const recentOrders=s.orders.slice(-1000).reverse().map(withTotals);
  const onlineAll=s.orders.filter(order=>order.source==='website');
  const online_orders_summary={total:onlineAll.length,pending:onlineAll.filter(order=>order.status==='pending_payment'&&!order.website_confirmed_at).length,confirmed:onlineAll.filter(order=>Boolean(order.website_confirmed_at)).length,delivery:onlineAll.filter(order=>order.type==='delivery').length,takeaway:onlineAll.filter(order=>order.type==='takeaway').length};
  const activeCashierShift=s.shifts.find(sh=>sh.status==='open'&&s.users.some(u=>u.id===sh.user_id&&u.role==='cashier'&&u.active!==false));
  const base={user,settings:publicSettings(s.settings),tables:s.tables,menu:visibleMenu.filter(x=>x.available),addons:s.addons.filter(x=>x.available),categories:s.categories,subcategories:s.subcategories||[],orders:user.role==='waiter'?openOrders:recentOrders,online_orders_summary,pos_open:Boolean(activeCashierShift),active_cashier:activeCashierShift?{id:activeCashierShift.user_id,name:activeCashierShift.user_name,opened_at:activeCashierShift.opened_at}:null};
  if(user.role==='waiter')return NextResponse.json(base,{headers:{'Cache-Control':'no-store'}});
  if(user.role==='cashier')return NextResponse.json({...base,menu_all:visibleMenu,shifts:s.shifts.filter(x=>x.user_id===user.id),tickets:s.tickets,receipts:s.receipts.filter(r=>r.cashier===user.name).slice(-250).reverse(),print_jobs:(s.print_jobs||[]).filter(j=>j.requested_by===user.name||s.receipts.some(r=>r.id===j.receipt_id&&r.cashier===user.name)).slice(-500).reverse(),inventory:s.inventory,recipes:s.recipes},{headers:{'Cache-Control':'no-store'}});

  const ledger=financeLedger(s,{period:'all'});
  const reports={
    sales_cents:ledger.net_sales_cents,
    gross_sales_cents:ledger.gross_sales_cents,
    refunds_cents:ledger.refunds_cents,
    subtotal_cents:ledger.subtotal_cents,
    discounts_cents:ledger.discounts_cents,
    orders:ledger.orders,
    paid_orders:ledger.paid_orders,
    refunded_orders:ledger.refunded_orders,
    cogs:ledger.cogs_usd,
    expenses:ledger.expenses_usd,
    gross_profit:ledger.gross_profit_usd,
    net_profit:ledger.net_profit_usd,
    gross_margin_percent:ledger.gross_margin_percent,
    paid_usd:ledger.paid_usd,
    paid_lbp:ledger.paid_lbp,
    refunded_usd:ledger.refunded_usd,
    refunded_lbp:ledger.refunded_lbp,
    net_cash_usd:ledger.net_cash_usd,
    net_cash_lbp:ledger.net_cash_lbp,
    inventory_value:ledger.inventory_value_usd,
    purchases:ledger.purchases_usd,
    low_stock:s.inventory.filter(i=>Number(i.minimum||0)>0&&Number(i.quantity)<=Number(i.minimum)).length
  };
  return NextResponse.json({...base,menu_all:visibleMenu,shifts:s.shifts,tickets:s.tickets,receipts:s.receipts.slice(-1000).reverse(),print_jobs:(s.print_jobs||[]).slice(-2000).reverse(),users:s.users.map(publicUser),inventory:s.inventory,recipes:s.recipes,expenses:s.expenses,purchases:s.purchases||[],refunds:s.refunds||[],reservations:s.reservations,audit:s.audit.slice(-1000).reverse(),excel_recovery:{orders:recovery.orders,refunds:recovery.refunds,imports:(s.excel_recovery?.imports||[]).slice(-25).reverse()},reports},{headers:{'Cache-Control':'no-store'}});
}
