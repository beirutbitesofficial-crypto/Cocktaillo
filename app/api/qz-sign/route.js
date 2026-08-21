import {NextResponse} from 'next/server';
import crypto from 'node:crypto';
import {getUser,allow} from '../../../lib/auth.js';

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'cashier','manager'))return NextResponse.json({error:'Cashier access required.'},{status:403});
  const body=await request.json().catch(()=>({}));
  const payload=String(body.request||'');
  if(!payload)return NextResponse.json({error:'Missing signing payload.'},{status:400});
  const raw=process.env.QZ_PRIVATE_KEY_B64||'';
  if(!raw)return NextResponse.json({error:'QZ signing key is not configured.'},{status:503});
  try{
    const privateKey=Buffer.from(raw,'base64').toString('utf8');
    const signer=crypto.createSign('RSA-SHA512');
    signer.update(payload,'utf8');
    signer.end();
    const signature=signer.sign(privateKey,'base64');
    return NextResponse.json({signature});
  }catch(error){
    return NextResponse.json({error:'QZ signing failed.'},{status:500});
  }
}
