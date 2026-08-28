import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { mutateState, orderTotal } from '../../../lib/store.js';

export async function POST(request){
  const user=await getUser(); if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await request.json().catch(()=>null); if(!body||!Array.isArray(body.lines)||!body.lines.length)return NextResponse.json({error:'Order items are required.'},{status:400});
  const type=body.type||'table';
  if(user.role==='waiter'&&type!=='table')return NextResponse.json({error:'Waiters can only create table orders.'},{status:403});
  if(type!=='table'&&!allow(user,'cashier','manager'))return NextResponse.json({error:'Counter orders require cashier access.'},{status:403});
  try{
    const result=await mutateState(state=>{
      const activeCashierShift=state.shifts.find(sh=>sh.status==='open'&&state.users.some(u=>u.id===sh.user_id&&u.role==='cashier'&&u.active!==false));
      if(!activeCashierShift)throw new Error('POS is closed. A cashier must open a shift before any order can be sent.');
      if(type==='table'&&!state.tables.some(t=>t.id===body.table_id))throw new Error('Table not found.');
      let order=type==='table'?state.orders.find(o=>o.type==='table'&&o.table_id===body.table_id&&o.status==='open'):null;
      if(!order){order={id:`ord-${crypto.randomUUID()}`,number:state.next_order_number++,type,table_id:type==='table'?body.table_id:null,customer:body.customer||null,created_by:user.id,created_by_name:user.name,status:type==='table'?'open':'pending_payment',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),lines:[],payments:[]};state.orders.push(order)}
      const stationLines={bar:[],kitchen:[],hookah:[]};
      for(const raw of body.lines){
        const item=state.menu.find(x=>x.id===raw.menu_item_id&&x.available);
        const qty=Math.max(1,Math.floor(Number(raw.quantity||1)));
        if(!item)throw new Error('Invalid menu item.');
        const selected=(item.allow_addons?raw.addons||[]:[]).map(a=>{const found=state.addons.find(x=>x.id===a.id&&x.available);return found?{id:found.id,name_en:found.name_en,name_ar:found.name_ar,price_lbp:found.price_lbp,quantity:Math.max(1,Math.floor(Number(a.quantity||1)))}:null}).filter(Boolean);
        const station=item.category==='Hookah'?'hookah':['bar','kitchen','service','hookah'].includes(item.station)?item.station:'bar';
        const line={id:`line-${crypto.randomUUID()}`,menu_item_id:item.id,name_en:item.name_en,name_ar:item.name_ar,price_cents:item.price_cents,station,quantity:qty,addons:selected,note:String(raw.note||'').trim()};
        order.lines.push(line);
        if(stationLines[station])stationLines[station].push(line);
      }
      order.updated_at=new Date().toISOString();
      state.print_jobs=Array.isArray(state.print_jobs)?state.print_jobs:[];
      for(const station of ['bar','kitchen','hookah'])if(stationLines[station].length){
        const ticket={id:`ticket-${crypto.randomUUID()}`,order_id:order.id,order_number:order.number,table_id:order.table_id,station,status:'new',kind:'NEW',created_at:new Date().toISOString(),staff_name:user.name,lines:stationLines[station].map(l=>({name_en:l.name_en,name_ar:l.name_ar,quantity:l.quantity,addons:l.addons.map(a=>({name_en:a.name_en,name_ar:a.name_ar,quantity:a.quantity})),note:l.note}))};
        state.tickets.push(ticket);
        if(station==='bar'||station==='hookah'){
          const printerName=station==='hookah'?state.settings.hookah_printer_name||'HOOKAH':state.settings.bar_printer_name||'Bar Printer';
          state.print_jobs.push({id:`print-${crypto.randomUUID()}`,ticket_id:ticket.id,order_id:order.id,order_number:order.number,destination:station,mode:'automatic',status:'pending',printer_name:printerName,created_at:ticket.created_at,updated_at:ticket.created_at,attempts:0,last_error:null,printed_at:null,requested_by:user.name});
        }
      }
      return {...order,totals:orderTotal(order,state.settings.exchange_rate)};
    });return NextResponse.json({order:result},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not create order.'},{status:400})}
}
