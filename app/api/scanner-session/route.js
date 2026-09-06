import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {readState,mutateState} from '../../../lib/store.js';

const SESSION_MS=4*60*60*1000;
const cleanBarcode=value=>String(value||'').trim().replace(/\s+/g,'');
const activeSession=(session,now=Date.now())=>session&&new Date(session.expires_at).getTime()>now&&!session.closed_at;

export async function GET(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const id=request.nextUrl.searchParams.get('id');
  const after=Math.max(0,Number(request.nextUrl.searchParams.get('after')||0));
  const state=await readState();
  const session=(state.scanner_sessions||[]).find(x=>x.id===id&&x.user_id===user.id);
  if(!session)return NextResponse.json({error:'Scanner session not found.'},{status:404});
  if(!activeSession(session))return NextResponse.json({error:'Scanner session expired.',expired:true},{status:410});
  const scans=(session.scans||[]).filter(x=>Number(x.seq||0)>after).slice(-50);
  return NextResponse.json({id:session.id,expires_at:session.expires_at,last_seq:Number(session.last_seq||0),scans},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request){
  const body=await request.json().catch(()=>({}));
  const action=String(body.action||'');

  if(action==='push'){
    const token=String(body.token||'');
    const barcode=cleanBarcode(body.barcode);
    if(!token||barcode.length<3||barcode.length>128)return NextResponse.json({error:'Invalid scan.'},{status:400});
    try{
      const result=await mutateState(state=>{
        state.scanner_sessions=Array.isArray(state.scanner_sessions)?state.scanner_sessions:[];
        const session=state.scanner_sessions.find(x=>x.token===token);
        if(!activeSession(session))throw new Error('Scanner session expired.');
        const now=new Date().toISOString();
        const recent=(session.scans||[]).at(-1);
        if(recent&&recent.barcode===barcode&&Date.now()-new Date(recent.at).getTime()<650)return {ok:true,duplicate:true,seq:recent.seq};
        session.last_seq=Number(session.last_seq||0)+1;
        session.scans=Array.isArray(session.scans)?session.scans:[];
        session.scans.push({seq:session.last_seq,barcode,at:now});
        if(session.scans.length>200)session.scans=session.scans.slice(-200);
        return {ok:true,seq:session.last_seq};
      });
      return NextResponse.json(result);
    }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Scanner session unavailable.'},{status:410})}
  }

  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'manager','cashier'))return NextResponse.json({error:'Manager or cashier required.'},{status:403});

  try{
    const result=await mutateState(state=>{
      state.scanner_sessions=Array.isArray(state.scanner_sessions)?state.scanner_sessions:[];
      const now=Date.now();
      state.scanner_sessions=state.scanner_sessions.filter(x=>new Date(x.expires_at).getTime()>now-24*60*60*1000);
      if(action==='create'){
        state.scanner_sessions.forEach(x=>{if(x.user_id===user.id&&!x.closed_at)x.closed_at=new Date().toISOString()});
        const session={id:`scan-${crypto.randomUUID()}`,token:`${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-',''),user_id:user.id,user_name:user.name,created_at:new Date(now).toISOString(),expires_at:new Date(now+SESSION_MS).toISOString(),last_seq:0,scans:[]};
        state.scanner_sessions.push(session);
        return {id:session.id,token:session.token,expires_at:session.expires_at};
      }
      if(action==='close'){
        const session=state.scanner_sessions.find(x=>x.id===body.id&&x.user_id===user.id);
        if(session)session.closed_at=new Date().toISOString();
        return {ok:true};
      }
      throw new Error('Unknown scanner action.');
    });
    if(action==='create')result.scan_url=`${request.nextUrl.origin}/scan/${result.token}`;
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Scanner action failed.'},{status:400})}
}
