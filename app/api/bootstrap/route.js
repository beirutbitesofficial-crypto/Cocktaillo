import { NextResponse } from 'next/server';
import { getUser } from '../../../lib/auth.js';
import { readState, publicUser, orderTotal } from '../../../lib/store.js';
export async function GET(){
 const user=await getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const s=await readState();
 const withTotals=o=>({...o,totals:orderTotal(o,s.settings.exchange_rate)});
 const openOrders=s.orders.filter(o=>o.status==='open').map(withTotals);
 const recentOrders=s.orders.slice(-250).reverse().map(withTotals);
 const base={user,settings:s.settings,tables:s.tables,menu:s.menu.filter(x=>x.available),addons:s.addons.filter(x=>x.available),categories:s.categories,orders:user.role==='waiter'?openOrders:recentOrders};
 if(user.role==='waiter')return NextResponse.json(base,{headers:{'Cache-Control':'no-store'}});
 if(user.role==='cashier')return NextResponse.json({...base,shifts:s.shifts.filter(x=>x.user_id===user.id),tickets:s.tickets,receipts:s.receipts.filter(r=>r.cashier===user.name).slice(-100).reverse()},{headers:{'Cache-Control':'no-store'}});
 const paid=s.orders.filter(o=>o.status==='paid');
 return NextResponse.json({...base,shifts:s.shifts,tickets:s.tickets,receipts:s.receipts.slice(-250).reverse(),users:s.users.map(publicUser),inventory:s.inventory,recipes:s.recipes,expenses:s.expenses,reservations:s.reservations,audit:s.audit.slice(-250).reverse(),reports:{sales_cents:paid.reduce((a,o)=>a+orderTotal(o,s.settings.exchange_rate).total_equivalent_cents,0),orders:paid.length}},{headers:{'Cache-Control':'no-store'}})
}
