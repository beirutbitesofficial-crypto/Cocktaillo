import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {mutateState} from '../../../lib/store.js';
import {closeShift} from '../../../lib/shift-report.js';
import {deliverShiftReport} from '../../../lib/shift-delivery.js';
export async function POST(request){
  const user=await getUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'cashier','manager'))return NextResponse.json({error:'Not allowed.'},{status:403});
  const body=await request.json().catch(()=>({}));let out;
  try{out=await mutateState(s=>closeShift(s,user,body))}catch(e){return NextResponse.json({error:e.message||'Could not close shift.'},{status:400})}
  // Closing and printing are durable before attempting delivery.
  let whatsapp;try{whatsapp=await deliverShiftReport(out.shift.id)}catch{whatsapp={status:'pending',error:'Shift saved. Check report delivery status.'}}
  return NextResponse.json({...out,whatsapp},{headers:{'Cache-Control':'no-store'}});
}
