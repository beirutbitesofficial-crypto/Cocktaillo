import {createHmac,timingSafeEqual} from 'node:crypto';
import {mutateState} from '../../../lib/store.js';
export async function GET(request){const q=new URL(request.url).searchParams;if(process.env.WHATSAPP_VERIFY_TOKEN&&q.get('hub.mode')==='subscribe'&&q.get('hub.verify_token')===process.env.WHATSAPP_VERIFY_TOKEN)return new Response(q.get('hub.challenge'));return new Response('Forbidden',{status:403})}
export async function POST(request){
  const secret=process.env.WHATSAPP_APP_SECRET;if(!secret)return new Response('Not configured',{status:503});
  const body=await request.text(),signature=request.headers.get('x-hub-signature-256')||'',expected=`sha256=${createHmac('sha256',secret).update(body).digest('hex')}`;
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return new Response('Forbidden',{status:403});
  let payload;try{payload=JSON.parse(body)}catch{return new Response('Bad request',{status:400})}
  await mutateState(s=>{for(const entry of payload.entry||[])for(const change of entry.changes||[])for(const status of change.value?.statuses||[]){
    const d=(s.report_deliveries||[]).find(d=>d.message_id===status.id);if(!d)continue;
    const rank={accepted:0,sent:1,delivered:2,read:3};
    if(status.status==='failed'&&!['delivered','read'].includes(d.status)){d.status='failed';d.error=`Provider delivery failure (${status.errors?.[0]?.code||'unknown'}).`}
    else if(rank[status.status]!=null&&rank[status.status]>(rank[d.status]??-1)){d.status=status.status;d.error=null}
    d.provider_timestamp=status.timestamp;d.updated_at=new Date().toISOString();
  }});
  return new Response('OK');
}
