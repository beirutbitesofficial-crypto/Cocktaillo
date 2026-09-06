import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {readState} from '../../../lib/store.js';
import {financeLedger} from '../../../lib/finance-ledger.js';

export async function GET(request){
  const user=await getUser();
  if(!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
  const url=new URL(request.url);
  const period=['daily','monthly','yearly','all'].includes(url.searchParams.get('period'))?url.searchParams.get('period'):'daily';
  const anchorValue=url.searchParams.get('anchor');
  const anchor=anchorValue?new Date(`${anchorValue}T12:00:00`):new Date();
  if(Number.isNaN(anchor.getTime()))return NextResponse.json({error:'Invalid report date.'},{status:400});
  const state=await readState();
  const ledger=financeLedger(state,{period,anchor});
  const audit=(state.audit||[]).filter(a=>{
    const d=new Date(a.at);if(Number.isNaN(d.getTime()))return false;
    if(period==='all')return true;
    if(period==='daily')return d.getFullYear()===anchor.getFullYear()&&d.getMonth()===anchor.getMonth()&&d.getDate()===anchor.getDate();
    if(period==='monthly')return d.getFullYear()===anchor.getFullYear()&&d.getMonth()===anchor.getMonth();
    return d.getFullYear()===anchor.getFullYear();
  }).slice(-100).reverse();
  return NextResponse.json({ledger,audit},{headers:{'Cache-Control':'no-store'}});
}
