import { NextResponse } from 'next/server';
import { authenticate, setSession } from '../../../../lib/auth.js';

export async function POST(request){
  try{
    const body=await request.json().catch(()=>({}));
    const user=await authenticate(body.username,body.password);
    if(!user)return NextResponse.json({error:'Invalid username or password.'},{status:401});
    await setSession(user);
    return NextResponse.json({user});
  }catch(e){
    console.error('[Cocktaillo] Login failed:',e instanceof Error?e.message:e);
    return NextResponse.json({error:'Login service is temporarily unavailable. Please retry.'},{status:503});
  }
}
