import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {readState} from '../../../lib/store.js';
import {buildDailyWorkbook} from '../../../lib/daily-report.js';
export async function GET(request){const user=await getUser();if(!allow(user,'cashier','manager'))return NextResponse.json({error:'Not allowed.'},{status:403});const url=new URL(request.url),date=url.searchParams.get('date'),anchor=date?new Date(`${date}T12:00:00`):new Date(),state=await readState(),report=buildDailyWorkbook(state,anchor);return new NextResponse(report.buffer,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${report.filename}"`,'Cache-Control':'no-store'}})}
