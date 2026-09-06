import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {mutateState} from '../../../lib/store.js';

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'waiter','cashier','manager'))return NextResponse.json({error:'Not allowed.'},{status:403});
  const body=await request.json().catch(()=>({}));
  try{
    const result=await mutateState(state=>{
      const now=new Date().toISOString();
      const source=state.orders.find(o=>o.id===body.order_id&&o.type==='table'&&o.status==='open');
      if(!source)throw new Error('Open table order not found.');
      if(source.table_id===body.to_table_id)throw new Error('Choose a different destination table.');
      const destination=state.tables.find(t=>t.id===body.to_table_id);
      if(!destination)throw new Error('Destination table not found.');
      const target=state.orders.find(o=>o.type==='table'&&o.table_id===destination.id&&o.status==='open');

      if(!target){
        const fromTable=source.table_id;
        source.table_id=destination.id;
        source.updated_at=now;
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'table_transferred',order_id:source.id,from_table_id:fromTable,to_table_id:destination.id,user:user.name,at:now});
        return {mode:'transfer',order:source};
      }

      if(target.id===source.id)throw new Error('Source and destination are the same order.');
      const movedLines=Array.isArray(source.lines)?source.lines.length:0;
      target.lines.push(...(source.lines||[]));
      target.updated_at=now;
      source.status='merged';
      source.merged_into=target.id;
      source.merged_at=now;
      source.merged_by=user.name;
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'tables_merged',source_order:source.id,target_order:target.id,from_table_id:source.table_id,to_table_id:destination.id,moved_lines:movedLines,user:user.name,at:now});
      return {mode:'merge',order:target,source_order_id:source.id,moved_lines:movedLines};
    });
    return NextResponse.json(result);
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Could not move table order.'},{status:400});
  }
}
