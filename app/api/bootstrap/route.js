import { NextResponse } from 'next/server';
import { getUser } from '../../../lib/auth.js';
import { readState, mutateState, publicUser, publicSettings, orderTotal, orderCost } from '../../../lib/store.js';
import { fetchCocktailloWebsiteMenu, mergeCocktailloWebsiteMenu, COCKTAILLO_MENU_SOURCE } from '../../../lib/alqaima-menu.js';
import { ensureDefaultRecipes } from '../../../lib/recipe-templates.js';

let catalogPrepared=false;
async function ensureCatalogPrepared(){
  if(catalogPrepared)return;
  await mutateState(state=>{
    for(const item of state.menu||[])if(item.category==='Hookah'&&!item.deleted)item.station='hookah';
    ensureDefaultRecipes(state);
  });
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
      for(const item of state.menu||[])if(item.category==='Hookah'&&!item.deleted)item.station='hookah';
      ensureDefaultRecipes(state);
      state.website_menu_synced_at=new Date().toISOString();
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'website_menu_synced',source:COCKTAILLO_MENU_SOURCE,added:merged.added,updated:merged.updated,total:merged.total,user:user.name,at:state.website_menu_synced_at});
    });
  }catch(error){
    console.warn('[Cocktaillo] Website menu auto-sync unavailable:',error instanceof Error?error.message:error);
  }
}

export async function GET(){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  await ensureCatalogPrepared();
  await ensureWebsiteMenu(user);
  const s=await readState(),rate=Number(s.settings.exchange_rate||89500);
  const visibleMenu=(s.menu||[]).filter(item=>!item.deleted);
  const withTotals=o=>({...o,totals:orderTotal(o,rate)});
  const openOrders=s.orders.filter(o=>o.status==='open').map(withTotals);
  const recentOrders=s.orders.slice(-1000).reverse().map(withTotals);
  const activeCashierShift=s.shifts.find(sh=>sh.status==='open'&&s.users.some(u=>u.id===sh.user_id&&u.role==='cashier'&&u.active!==false));
  const base={user,settings:publicSettings(s.settings),tables:s.tables,menu:visibleMenu.filter(x=>x.available),addons:s.addons.filter(x=>x.available),categories:s.categories,subcategories:s.subcategories||[],orders:user.role==='waiter'?openOrders:recentOrders,pos_open:Boolean(activeCashierShift),active_cashier:activeCashierShift?{id:activeCashierShift.user_id,name:activeCashierShift.user_name,opened_at:activeCashierShift.opened_at}:null};
  if(user.role==='waiter')return NextResponse.json(base,{headers:{'Cache-Control':'no-store'}});
  if(user.role==='cashier')return NextResponse.json({...base,menu_all:visibleMenu,shifts:s.shifts.filter(x=>x.user_id===user.id),tickets:s.tickets,receipts:s.receipts.filter(r=>r.cashier===user.name).slice(-250).reverse(),print_jobs:(s.print_jobs||[]).filter(j=>j.requested_by===user.name||s.receipts.some(r=>r.id===j.receipt_id&&r.cashier===user.name)).slice(-500).reverse(),inventory:s.inventory,recipes:s.recipes},{headers:{'Cache-Control':'no-store'}});
  const paid=s.orders.filter(o=>o.status==='paid'),refunded=s.orders.filter(o=>o.status==='refunded'),grossSales=paid.reduce((a,o)=>a+orderTotal(o,rate).total_equivalent_cents,0),refunds=refunded.reduce((a,o)=>a+orderTotal(o,rate).total_equivalent_cents,0),sales_cents=grossSales-refunds,cogs=paid.reduce((a,o)=>a+orderCost(s,o),0),expenses=s.expenses.reduce((a,e)=>a+(e.currency==='LBP'?Number(e.amount||0)/rate:Number(e.amount||0)),0);
  return NextResponse.json({...base,menu_all:visibleMenu,shifts:s.shifts,tickets:s.tickets,receipts:s.receipts.slice(-1000).reverse(),print_jobs:(s.print_jobs||[]).slice(-2000).reverse(),users:s.users.map(publicUser),inventory:s.inventory,recipes:s.recipes,expenses:s.expenses,purchases:s.purchases||[],refunds:s.refunds||[],reservations:s.reservations,audit:s.audit.slice(-1000).reverse(),reports:{sales_cents,gross_sales_cents:grossSales,refunds_cents:refunds,orders:paid.length,cogs,expenses,gross_profit:sales_cents/100-cogs,net_profit:sales_cents/100-cogs-expenses,inventory_value:s.inventory.reduce((a,i)=>a+Number(i.quantity||0)*Number(i.unit_cost||0),0),low_stock:s.inventory.filter(i=>Number(i.minimum||0)>0&&Number(i.quantity)<=Number(i.minimum)).length}},{headers:{'Cache-Control':'no-store'}});
}
