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

      const receipts=state.receipts
        .filter(r=>r.cashier===user.name&&r.created_at>=shift.opened_at)
        .sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      const cashUsd=receipts.reduce((sum,r)=>sum+Number(r.payment?.usd_cents||0)/100-Number(r.refund_payment?.usd_cents||0)/100,0);
      const cashLbp=receipts.reduce((sum,r)=>sum+Number(r.payment?.lbp||0)-Number(r.refund_payment?.lbp||0),0);
      const drawerUsd=state.expenses.filter(e=>e.paid_from==='cash_drawer'&&e.currency==='USD'&&e.created_at>=shift.opened_at).reduce((sum,e)=>sum+Number(e.amount||0),0);
      const drawerLbp=state.expenses.filter(e=>e.paid_from==='cash_drawer'&&e.currency==='LBP'&&e.created_at>=shift.opened_at).reduce((sum,e)=>sum+Number(e.amount||0),0);
      const closingUsd=nonNegativeNumber(b.closing_usd,'Closing USD');
      const closingLbp=nonNegativeNumber(b.closing_lbp,'Closing LBP');

      shift.expected_usd=Number(shift.opening_usd||0)+cashUsd-drawerUsd;
      shift.expected_lbp=Number(shift.opening_lbp||0)+cashLbp-drawerLbp;
      shift.status='closed';
      shift.closed_at=now;
      shift.closing_usd=closingUsd;
      shift.closing_lbp=closingLbp;
      shift.variance_usd=shift.closing_usd-shift.expected_usd;
      shift.variance_lbp=shift.closing_lbp-shift.expected_lbp;

      const orders=receipts.map(r=>{
        const total_cents=Number(r.totals?.total_equivalent_cents||0);
        const refunded_cents=Math.max(0,Math.round(Number(r.refund_usd||0)*100));
        return {number:r.number,total_cents,refunded_cents,net_cents:Math.max(0,total_cents-refunded_cents),created_at:r.created_at};
      });
      const gross_total_cents=orders.reduce((sum,o)=>sum+o.total_cents,0);
      const refund_total_cents=orders.reduce((sum,o)=>sum+o.refunded_cents,0);
      const net_total_cents=Math.max(0,gross_total_cents-refund_total_cents);

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
        items:orders.map(o=>({name:`Order #${o.number}${o.refunded_cents?' REFUND':''}`,quantity:1,unit_price_cents:o.net_cents,line_total_cents:o.net_cents,addons:[]})),
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
