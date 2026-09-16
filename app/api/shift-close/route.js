import {shiftCash} from '../../../lib/cash.js';
import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {mutateState} from '../../../lib/store.js';

function nonNegativeNumber(value,label){const n=Number(value??0);if(!Number.isFinite(n)||n<0)throw new Error(`${label} must be a valid non-negative number.`);return n}

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'cashier','manager'))return NextResponse.json({error:'Not allowed.'},{status:403});
  const b=await request.json().catch(()=>({}));
  try{
    const out=await mutateState(state=>{
      const now=new Date().toISOString();
      const shift=state.shifts.find(x=>x.user_id===user.id&&x.status==='open');
      if(!shift)throw new Error('No open shift.');

      const cash=shiftCash(state,shift,now),receipts=cash.receipts;
      const closingUsd=nonNegativeNumber(b.closing_usd,'Closing USD');
      const closingLbp=nonNegativeNumber(b.closing_lbp,'Closing LBP');

      shift.expected_usd=cash.expected_usd;
      shift.expected_lbp=cash.expected_lbp;
      shift.status='closed';
      shift.closed_at=now;
      shift.closing_usd=closingUsd;
      shift.closing_lbp=closingLbp;
      shift.variance_usd=shift.closing_usd-shift.expected_usd;
      shift.variance_lbp=shift.closing_lbp-shift.expected_lbp;

      const orders=receipts.map(r=>{
        const total_cents=Number(r.totals?.total_equivalent_cents||0);
        const refunded_cents=cash.refunds.filter(f=>f.order_id===r.order_id).reduce((sum,f)=>sum+Number(f.amount_cents||0),0);
        return {number:r.number,total_cents,refunded_cents,net_cents:Math.max(0,total_cents-refunded_cents),created_at:r.created_at};
      });
      const gross_total_cents=orders.reduce((sum,o)=>sum+o.total_cents,0);
      const refund_total_cents=cash.refunds.reduce((sum,r)=>sum+Number(r.amount_cents||0),0);
      const net_total_cents=gross_total_cents-refund_total_cents;

      const receipt_snapshot={
        is_shift_report:true,
        business_name:'COCKTAILLO',
        order_number:`SHIFT-${shift.id.slice(-8)}`,
        receipt_id:null,
        order_id:null,
        type:'SHIFT CLOSING',
        created_at:now,
        cashier:user.name,
        opened_at:shift.opened_at,
        closed_at:now,
        orders,
        order_count:orders.length,
        gross_total_cents,
        refund_total_cents,
        net_total_cents,
        opening_usd:Number(shift.opening_usd||0),
        opening_lbp:Number(shift.opening_lbp||0),
        expected_usd:Number(shift.expected_usd||0),
        expected_lbp:Number(shift.expected_lbp||0),
        closing_usd:Number(shift.closing_usd||0),
        closing_lbp:Number(shift.closing_lbp||0),
        variance_usd:Number(shift.variance_usd||0),
        variance_lbp:Number(shift.variance_lbp||0),
        items:orders.map(o=>({name:`Order #${o.number}${o.refunded_cents?' REFUND':''}`,quantity:1,unit_price_cents:o.net_cents,line_total_cents:o.net_cents,addons:[]})).concat(cash.refunds.filter(r=>!receipts.some(sale=>sale.order_id===r.order_id)).map(r=>({name:`Refund #${r.order_number}`,quantity:1,unit_price_cents:-Number(r.amount_cents||0),line_total_cents:-Number(r.amount_cents||0),addons:[]}))),
        subtotal_cents:net_total_cents,
        discount_cents:0,
        total_cents:net_total_cents,
        payment_method:'SHIFT CLOSE',
        paid_usd_cents:0,
        paid_lbp:0,
        exchange_rate:Number(state.settings.exchange_rate||89500),
        change_cents:0,
        footer:`Shift closing report · ${orders.length} order${orders.length===1?'':'s'}`
      };

      state.print_jobs=Array.isArray(state.print_jobs)?state.print_jobs:[];
      const printJob={id:`print-${crypto.randomUUID()}`,receipt_id:null,receipt_snapshot,order_id:null,order_number:`SHIFT-${shift.id.slice(-8)}`,destination:'customer',mode:'prebill',open_drawer:false,status:'pending',printer_name:state.settings.customer_printer_name||'Customer Receipt',created_at:now,updated_at:now,attempts:0,last_error:null,printed_at:null,next_attempt_at:null,requested_by:user.name};
      state.print_jobs.push(printJob);
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'shift_closed',shift_id:shift.id,user:user.name,at:now,variance_usd:shift.variance_usd,variance_lbp:shift.variance_lbp,order_count:orders.length,net_total_cents,print_job_id:printJob.id});
      return {shift,report:{order_count:orders.length,gross_total_cents,refund_total_cents,net_total_cents},print_job_id:printJob.id};
    });
    return NextResponse.json(out);
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Could not close shift.'},{status:400});
  }
}
