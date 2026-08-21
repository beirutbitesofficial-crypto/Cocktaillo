import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUser, allow } from '../../../lib/auth.js';
import { deductRecipes, mutateState, orderTotal, publicUser } from '../../../lib/store.js';

export async function POST(request){
 const user=await getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
 const b=await request.json().catch(()=>({}));
 try{const data=await mutateState(async s=>{
  const now=new Date().toISOString();
  if(b.action==='open_shift'){
   if(!allow(user,'cashier','manager'))throw new Error('Not allowed.');
   if(s.shifts.some(x=>x.user_id===user.id&&x.status==='open'))throw new Error('Shift already open.');
   const shift={id:`shift-${crypto.randomUUID()}`,user_id:user.id,user_name:user.name,status:'open',opened_at:now,opening_usd:Number(b.opening_usd||0),closed_at:null,closing_usd:null,expected_usd:null,variance_usd:null};s.shifts.push(shift);return {shift};
  }
  if(b.action==='close_shift'){
   if(!allow(user,'cashier','manager'))throw new Error('Not allowed.');const shift=s.shifts.find(x=>x.user_id===user.id&&x.status==='open');if(!shift)throw new Error('No open shift.');
   const receipts=s.receipts.filter(r=>r.cashier===user.name&&r.created_at>=shift.opened_at);
   const cashUsd=receipts.reduce((sum,r)=>sum+Number(r.payment?.usd_cents||0)/100,0);
   const drawerExpenses=s.expenses.filter(e=>e.paid_from==='cash_drawer'&&e.currency==='USD'&&e.created_at>=shift.opened_at).reduce((sum,e)=>sum+Number(e.amount||0),0);
   const expected=Number(shift.opening_usd||0)+cashUsd-drawerExpenses;
   shift.status='closed';shift.closed_at=now;shift.closing_usd=Number(b.closing_usd||0);shift.expected_usd=expected;shift.variance_usd=shift.closing_usd-expected;return {shift};
  }
  if(b.action==='pay_order'){
   if(!allow(user,'cashier','manager'))throw new Error('Cashier access required.');
   if(user.role==='cashier'&&!s.shifts.some(x=>x.user_id===user.id&&x.status==='open'))throw new Error('Open your shift before collecting payment.');
   const order=s.orders.find(x=>x.id===b.order_id&&x.status!=='paid');if(!order)throw new Error('Order not found.');
   const totals=orderTotal(order,s.settings.exchange_rate);const usdCents=Math.round(Number(b.usd||0)*100),lbp=Math.round(Number(b.lbp||0));const paidEquivalent=usdCents+Math.round((lbp/s.settings.exchange_rate)*100);if(paidEquivalent<totals.total_equivalent_cents)throw new Error('Payment is less than total.');
   order.payments=[{usd_cents:usdCents,lbp,rate:s.settings.exchange_rate,cashier:user.name,at:now}];order.status='paid';order.paid_at=now;
   deductRecipes(s,order);
   const receipt={id:`rcpt-${crypto.randomUUID()}`,number:order.number,order_id:order.id,type:order.type,table_id:order.table_id,items:order.lines,totals,payment:order.payments[0],change_cents:paidEquivalent-totals.total_equivalent_cents,cashier:user.name,created_at:now};s.receipts.push(receipt);return {receipt};
  }
  if(b.action==='transfer_table'){
   if(!allow(user,'waiter','cashier','manager'))throw new Error('Not allowed.');const order=s.orders.find(x=>x.id===b.order_id&&x.type==='table'&&x.status==='open');if(!order)throw new Error('Open table order not found.');if(s.orders.some(x=>x.type==='table'&&x.table_id===b.to_table_id&&x.status==='open'))throw new Error('Destination table is occupied.');if(!s.tables.some(x=>x.id===b.to_table_id))throw new Error('Destination table not found.');order.table_id=b.to_table_id;order.updated_at=now;return {order};
  }
  if(b.action==='ticket_status'){
   if(!allow(user,'cashier','manager'))throw new Error('Not allowed.');const ticket=s.tickets.find(x=>x.id===b.ticket_id);if(!ticket)throw new Error('Ticket not found.');if(!['new','preparing','ready'].includes(b.status))throw new Error('Invalid status.');ticket.status=b.status;ticket.updated_at=now;return {ticket};
  }
  if(b.action==='add_user'){
   if(!allow(user,'manager'))throw new Error('Manager only.');if(!['cashier','waiter','manager'].includes(b.role))throw new Error('Invalid role.');const username=String(b.username||'').trim().toLowerCase();if(s.users.some(x=>x.username===username))throw new Error('Username exists.');const password=String(b.password||'');const u={id:`u-${crypto.randomUUID()}`,name:String(b.name||'').trim(),username,password_hash:await bcrypt.hash(password,10),role:b.role,active:true};if(!u.name||!u.username||password.length<4)throw new Error('Name, username and password are required. Password must be at least 4 characters.');s.users.push(u);s.audit.push({id:`audit-${crypto.randomUUID()}`,type:'user_created',target_user:u.username,user:user.name,at:now});return {user:publicUser(u)};
  }
  if(b.action==='update_user'){
   if(!allow(user,'manager'))throw new Error('Manager only.');const target=s.users.find(x=>x.id===b.id);if(!target)throw new Error('User not found.');const name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase(),role=String(b.role||target.role);if(!name||!username)throw new Error('Name and username are required.');if(!['cashier','waiter','manager'].includes(role))throw new Error('Invalid role.');if(s.users.some(x=>x.id!==target.id&&x.username===username))throw new Error('Username exists.');if(target.id===user.id&&role!=='manager')throw new Error('You cannot remove your own Manager role.');target.name=name;target.username=username;target.role=role;target.active=b.active!==false;if(String(b.password||'').trim()){if(String(b.password).length<4)throw new Error('New password must be at least 4 characters.');target.password_hash=await bcrypt.hash(String(b.password),10)}s.audit.push({id:`audit-${crypto.randomUUID()}`,type:'user_updated',target_user:target.username,user:user.name,at:now});return {user:publicUser(target)};
  }
  if(b.action==='delete_user'){
   if(!allow(user,'manager'))throw new Error('Manager only.');const target=s.users.find(x=>x.id===b.id);if(!target)throw new Error('User not found.');if(target.id===user.id)throw new Error('You cannot delete your own Manager account.');if(target.role==='manager'&&s.users.filter(x=>x.role==='manager'&&x.active).length<=1)throw new Error('At least one active Manager account is required.');s.users=s.users.filter(x=>x.id!==target.id);s.audit.push({id:`audit-${crypto.randomUUID()}`,type:'user_deleted',target_user:target.username,user:user.name,at:now});return {ok:true};
  }
  if(b.action==='add_expense'){
   if(!allow(user,'manager'))throw new Error('Manager only.');const e={id:`exp-${crypto.randomUUID()}`,date:b.date||now.slice(0,10),category:b.category||'Other',amount:Number(b.amount||0),currency:b.currency||'USD',paid_from:b.paid_from||'owner',note:b.note||'',created_by:user.name,created_at:now};s.expenses.push(e);return {expense:e};
  }
  if(b.action==='save_settings'){
   if(!allow(user,'manager'))throw new Error('Manager only.');const nextTheme=['light','dark'].includes(b.settings?.theme)?b.settings.theme:s.settings.theme||'light';s.settings={...s.settings,...b.settings,theme:nextTheme,exchange_rate:Number(b.settings?.exchange_rate||s.settings.exchange_rate)};return {settings:s.settings};
  }
  if(b.action==='factory_reset'){
   if(!allow(user,'manager'))throw new Error('Manager only.');
   if(String(b.confirmation||'')!=='RESET COCKTAILLO')throw new Error('Type RESET COCKTAILLO to confirm.');
   const manager=s.users.find(x=>x.id===user.id)||s.users.find(x=>x.role==='manager');
   s.users=manager?[manager]:[];
   s.shifts=[];s.orders=[];s.receipts=[];s.tickets=[];s.expenses=[];s.reservations=[];s.audit=[];s.next_order_number=1;
   s.inventory=(s.inventory||[]).map(i=>({...i,quantity:0,updated_at:now}));
   s.tables=(s.tables||[]).map(t=>({...t,status:'available'}));
   s.audit.push({id:`audit-${crypto.randomUUID()}`,type:'factory_reset',user:user.name,at:now,reason:'Transactional data reset; configuration/catalog preserved.'});
   return {ok:true};
  }
  throw new Error('Unknown action.');
 });return NextResponse.json(data)}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Action failed.'},{status:400})}
}
