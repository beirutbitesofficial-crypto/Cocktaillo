import {NextResponse} from 'next/server';
import {getUser,allow} from '../../../lib/auth.js';
import {mutateState} from '../../../lib/store.js';

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'waiter','cashier','manager'))return NextResponse.json({error:'Table setup access required.'},{status:403});
  const b=await request.json().catch(()=>({}));
  try{
    const data=await mutateState(state=>{
      const now=new Date().toISOString();
      if(b.action==='save_table'){
        const input=b.table||{};
        let table=input.id?state.tables.find(t=>t.id===input.id):null;
        if(input.id&&!table)throw new Error('Table not found.');
        const name=String(input.name||'').trim();
        const capacity=Math.max(1,Math.floor(Number(input.capacity||1)));
        if(!name)throw new Error('Table name is required.');
        if(!Number.isFinite(capacity))throw new Error('Valid table capacity is required.');
        if(state.tables.some(t=>t.id!==table?.id&&String(t.name).trim().toLowerCase()===name.toLowerCase()))throw new Error('A table with this name already exists.');
        if(!table){table={id:`table-${crypto.randomUUID()}`,status:'available'};state.tables.push(table)}
        table.name=name;table.capacity=capacity;
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'table_saved',table_id:table.id,user:user.name,at:now});
        return {table};
      }
      if(b.action==='delete_table'){
        const table=state.tables.find(t=>t.id===b.id);
        if(!table)throw new Error('Table not found.');
        if(state.orders.some(o=>o.type==='table'&&o.table_id===table.id&&o.status==='open'))throw new Error('Cannot delete an occupied table.');
        state.tables=state.tables.filter(t=>t.id!==table.id);
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'table_deleted',table_id:table.id,table_name:table.name,user:user.name,at:now});
        return {ok:true};
      }
      throw new Error('Unknown table setup action.');
    });
    return NextResponse.json(data);
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Table setup failed.'},{status:400})}
}
