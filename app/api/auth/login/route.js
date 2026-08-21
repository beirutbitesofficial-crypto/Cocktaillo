import { NextResponse } from 'next/server';
import { authenticate, setSession } from '../../../../lib/auth.js';
export async function POST(request){const body=await request.json().catch(()=>({}));const user=await authenticate(body.username,body.password);if(!user)return NextResponse.json({error:'Invalid username or password.'},{status:401});await setSession(user);return NextResponse.json({user});}
