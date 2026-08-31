import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../../lib/auth.js';
import {mutateState,orderTotal} from '../../../../lib/store.js';

const INSTAGRAM_URL='https://www.instagram.com/cocktaillorestocafe?igsi=MThhZmZ3MTVpMTF2bg==';

function customerSnapshot(state,order,user,createdAt){
  const totals=orderTotal(order,state.settings.exchange_rate);
  return {
    business_name:'COCKTAILLO',
    order_number:order.number,
    receipt_id:null,
    order_id:order.id,
    type:order.type,
    table:null,
    created_at:createdAt,
    cashier:user.name,
    items:(order.lines||[]).map(line=>({
      name:line.name_en,
      quantity:Number(line.quantity||1),
      unit_price_cents:Number(line.price_cents||0),
      line_total_cents:Number(line.price_cents||0)*Number(line.quantity||1),
      addons:(line.addons||[]).map(addon=>({name:addon.name_en,quantity:Number(addon.quantity||1),price_lbp:Number(addon.price_lbp||0)}))
    })),
    subtotal_cents:Number(totals.subtotal_equivalent_cents??totals.total_equivalent_cents??0),
    discount_cents:Number(totals.discount_cents||0),
    total_cents:Number(totals.total_equivalent_cents||0),
    payment_method:`ONLINE - ${String(order.customer?.payment_method||'CASH').toUpperCase()}`,
    paid_usd_cents:0,
    paid_lbp:0,
    exchange_rate:Number(state.settings.exchange_rate||89500),
    change_cents:0,
    is_online_order:true,
    footer:`ONLINE ORDER - ${state.settings.receipt_footer||'Thank you for visiting Cocktaillo'}`,
    instagram_url:INSTAGRAM_URL,
    instagram_handle:'@cocktaillorestocafe'
  };
}

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'cashier','manager'))return NextResponse.json({error:'Cashier access required.'},{status:403});
  const body=await request.json().catch(()=>({}));
  const orderId=String(body.order_id||'').trim();
  if(!orderId)return NextResponse.json({error:'order_id is required.'},{status:400});

  try{
    const result=await mutateState(state=>{
      state.orders=Array.isArray(state.orders)?state.orders:[];
      state.tickets=Array.isArray(state.tickets)?state.tickets:[];
      state.print_jobs=Array.isArray(state.print_jobs)?state.print_jobs:[];
      state.audit=Array.isArray(state.audit)?state.audit:[];

      const order=state.orders.find(item=>item.id===orderId&&item.source==='website');
      if(!order)throw new Error('Online order not found.');
      if(order.website_confirmed_at)return {order:{...order,totals:orderTotal(order,state.settings.exchange_rate)},already_confirmed:true};
      if(!['pending_payment','open'].includes(order.status))throw new Error('This online order can no longer be confirmed.');

      const now=new Date().toISOString();
      const stationLines={bar:[],kitchen:[],hookah:[]};
      for(const line of order.lines||[]){
        if(!line.menu_item_id)continue;
        const station=line.station==='hookah'?'hookah':['bar','kitchen','hookah'].includes(line.station)?line.station:'bar';
        stationLines[station].push(line);
      }

      for(const station of ['bar','kitchen','hookah']){
        if(!stationLines[station].length)continue;
        let ticket=state.tickets.find(item=>item.order_id===order.id&&item.station===station&&item.source==='website');
        if(!ticket){
          ticket={
            id:`ticket-${crypto.randomUUID()}`,
            order_id:order.id,
            order_number:order.number,
            table_id:null,
            station,
            status:'new',
            kind:'NEW',
            created_at:now,
            staff_name:user.name,
            source:'website',
            lines:stationLines[station].map(line=>({
              name_en:line.name_en,
              name_ar:line.name_ar,
              quantity:line.quantity,
              addons:(line.addons||[]).map(addon=>({name_en:addon.name_en,name_ar:addon.name_ar,quantity:addon.quantity})),
              note:line.note||''
            }))
          };
          state.tickets.push(ticket);
        }

        if(station==='bar'||station==='hookah'){
          const existingJob=state.print_jobs.find(job=>job.order_id===order.id&&job.ticket_id===ticket.id&&job.destination===station);
          if(!existingJob){
            const printerName=station==='hookah'?state.settings.hookah_printer_name||'HOOKAH':state.settings.bar_printer_name||'Bar Printer';
            state.print_jobs.push({id:`print-${crypto.randomUUID()}`,ticket_id:ticket.id,order_id:order.id,order_number:order.number,destination:station,mode:'automatic',status:'pending',printer_name:printerName,created_at:now,updated_at:now,attempts:0,last_error:null,printed_at:null,next_attempt_at:null,requested_by:user.name});
          }
        }
      }

      const existingCustomerJob=state.print_jobs.find(job=>job.order_id===order.id&&job.destination==='customer'&&job.website_order_confirmation===true);
      if(!existingCustomerJob){
        const receipt_snapshot=customerSnapshot(state,order,user,now);
        state.print_jobs.push({id:`print-${crypto.randomUUID()}`,receipt_id:null,receipt_snapshot,website_order_confirmation:true,order_id:order.id,order_number:order.number,destination:'customer',mode:'prebill',open_drawer:false,status:'pending',printer_name:state.settings.customer_printer_name||'Customer Receipt',created_at:now,updated_at:now,attempts:0,last_error:null,printed_at:null,next_attempt_at:null,requested_by:user.name});
      }

      order.website_confirmed_at=now;
      order.website_confirmed_by=user.name;
      order.updated_at=now;
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'website_order_confirmed',order_id:order.id,order_number:order.number,user:user.name,at:now});
      return {order:{...order,totals:orderTotal(order,state.settings.exchange_rate)},already_confirmed:false};
    });
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Could not confirm online order.'},{status:400});
  }
}
