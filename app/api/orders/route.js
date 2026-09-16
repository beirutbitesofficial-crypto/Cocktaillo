import {createOrder} from '../../../lib/create-order.js';
import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { mutateState } from '../../../lib/store.js';

export async function POST(request){
  const user=await getUser(); if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await request.json().catch(()=>null); if(!body||!Array.isArray(body.lines)||!body.lines.length)return NextResponse.json({error:'Order items are required.'},{status:400});
  const type=body.type||'table';
  if(user.role==='waiter'&&type!=='table')return NextResponse.json({error:'Waiters can only create table orders.'},{status:403});
  if(type!=='table'&&!allow(user,'cashier','manager'))return NextResponse.json({error:'Counter orders require cashier access.'},{status:403});
  try{
    const result=await mutateState(state=>{
      return createOrder(state,user,body);
    });return NextResponse.json({order:result},{status:201});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not create order.'},{status:400})}
}
