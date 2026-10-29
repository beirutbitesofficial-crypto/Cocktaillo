import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { readState, mutateState } from '../../../lib/store.js';

const REQUIRED=['users','settings','tables','categories','menu','addons','shifts','orders','receipts','tickets','inventory','recipes','expenses','reservations','audit'];

export async function GET(){
 const user=await getUser();
 if(!user||!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
 const state=await readState();
 const backup={format:'cocktaillo-pos-backup',backup_version:1,created_at:new Date().toISOString(),data:state};
 return new NextResponse(JSON.stringify(backup,null,2),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="cocktaillo-backup-${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'no-store'}});
}

export async function POST(request){
 const user=await getUser();
 if(!user||!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
 try{
  const backup=await request.json();
  // Manual backups and the server's daily automatic snapshots (cocktaillo-pos-auto-backup) can both be restored.
  const manual=backup?.format==='cocktaillo-pos-backup'&&backup?.backup_version===1,auto=backup?.format==='cocktaillo-pos-auto-backup';
  if((!manual&&!auto)||!backup?.data||typeof backup.data!=='object')throw new Error('Invalid Cocktaillo backup file. Choose the cocktaillo-backup-….json file from Download Full Backup.');
  const restored=backup.data;
  for(const key of ['users','settings','menu'])if(restored[key]===undefined)throw new Error(`Backup is incomplete: missing ${key}.`);
  // Older backups can predate some sections; start those empty instead of rejecting the file.
  for(const key of REQUIRED)if(restored[key]===undefined)restored[key]=key==='settings'?{}:[];
  if(!Array.isArray(restored.users)||!restored.users.some(u=>u.role==='manager'&&u.active!==false))throw new Error('Backup must contain an active Manager account.');
  await mutateState(async state=>{
   for(const key of Object.keys(state))delete state[key];
   Object.assign(state,JSON.parse(JSON.stringify(restored)));
   state.print_jobs=Array.isArray(state.print_jobs)?state.print_jobs:[];
   state.purchases=Array.isArray(state.purchases)?state.purchases:[];
   state.refunds=Array.isArray(state.refunds)?state.refunds:[];
   state.audit=Array.isArray(state.audit)?state.audit:[];
   state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'backup_restored',user:user.name,at:new Date().toISOString(),reason:`Restored backup created ${backup.created_at||'unknown date'}`});
   return {ok:true};
  });
  return NextResponse.json({ok:true,message:'Backup restored successfully. Please sign in again if your account changed.'});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Restore failed.'},{status:400})}
}
