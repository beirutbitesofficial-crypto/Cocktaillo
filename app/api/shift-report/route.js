import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {readState} from '../../../lib/store.js';
import {buildShiftWorkbook} from '../../../lib/shift-report.js';
import {deliverShiftReport} from '../../../lib/shift-delivery.js';
export async function GET(request){
  const user=await getUser();if(!allow(user,'manager','cashier'))return NextResponse.json({error:'Sign in to Cocktaillo as manager or cashier to view this report.'},{status:401});
  const url=new URL(request.url),s=await readState(),report=(s.shift_reports||[]).find(r=>r.shift_id===url.searchParams.get('shift_id'));
  if(!report||(user.role!=='manager'&&report.user_id!==user.id))return NextResponse.json({error:'Report not found.'},{status:404});
  if(url.searchParams.get('format')==='xlsx'){const {buffer,filename}=buildShiftWorkbook(report);return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}
  return NextResponse.json({report,delivery:(s.report_deliveries||[]).find(d=>d.shift_id===report.shift_id),print_job:(s.print_jobs||[]).find(j=>j.id===report.print_job_id)},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request){
  const user=await getUser();if(!allow(user,'manager','cashier'))return NextResponse.json({error:'Not allowed.'},{status:403});
  const b=await request.json().catch(()=>({})),s=await readState();
  const report=(s.shift_reports||[]).find(r=>r.shift_id===b.shift_id);
  if(!report||(user.role!=='manager'&&report.user_id!==user.id))return NextResponse.json({error:'Report not found.'},{status:404});
  if(b.retry&&user.role!=='manager')return NextResponse.json({error:'Manager only.'},{status:403});
  try{return NextResponse.json({delivery:await deliverShiftReport(report.shift_id,{retry:b.retry===true})})}catch{return NextResponse.json({error:'Report saved; could not update delivery status.'},{status:503})}
}
