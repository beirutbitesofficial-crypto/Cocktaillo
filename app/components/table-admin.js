'use client';
import {useState} from 'react';
import {Input,PageHeader,post} from './ui.js';

export default function TableAdmin({data,reload}){
  const[name,setName]=useState(''),[capacity,setCapacity]=useState('4'),[busy,setBusy]=useState(false);
  const openOrderFor=tableId=>data.orders.find(o=>o.type==='table'&&o.table_id===tableId&&o.status==='open');
  const isOccupied=tableId=>Boolean(openOrderFor(tableId));

  async function save(table){
    setBusy(true);
    try{
      await post('/api/tables-admin',{action:'save_table',table:table||{name,capacity}});
      setName('');
      await reload();
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  async function remove(id){
    if(!confirm('Delete this table?'))return;
    setBusy(true);
    try{await post('/api/tables-admin',{action:'delete_table',id});await reload()}catch(e){alert(e.message)}finally{setBusy(false)}
  }

  async function moveOrder(table){
    const order=openOrderFor(table.id);
    if(!order)return alert('This table has no open order.');
    const destinations=data.tables.filter(t=>t.id!==table.id);
    if(!destinations.length)return alert('No destination tables found.');
    const choices=destinations.map((t,i)=>`${i+1}. ${t.name}${isOccupied(t.id)?' — OCCUPIED (MERGE)':' — AVAILABLE (TRANSFER)'}`).join('\n');
    const answer=prompt(`Move Order #${order.number} from ${table.name}:\n\n${choices}\n\nChoose destination number:`,'');
    if(answer===null)return;
    const target=destinations[Number(answer)-1];
    if(!target)return alert('Choose a valid table number.');
    const merging=isOccupied(target.id);
    const question=merging
      ?`${target.name} already has an open order. Merge all items from Order #${order.number} into ${target.name}?`
      :`Transfer Order #${order.number} from ${table.name} to ${target.name}?`;
    if(!confirm(question))return;
    setBusy(true);
    try{
      const result=await post('/api/table-transfer',{order_id:order.id,to_table_id:target.id});
      await reload();
      alert(result.mode==='merge'
        ?`Merged Order #${order.number} into ${target.name}. All items moved successfully.`
        :`Order #${order.number} transferred to ${target.name}.`);
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  const canManageTables=data.user.role==='manager'||data.user.role==='cashier';
  return <>
    <PageHeader title="Table Setup" sub="Move open checks safely: available destination = transfer, occupied destination = merge."/>
    {canManageTables&&<div className="card formGrid">
      <Input label="Table name" value={name} onChange={setName}/>
      <Input label="Capacity" value={capacity} onChange={setCapacity}/>
      <button disabled={busy} className="btn btnPrimary" onClick={()=>save()}>Add table</button>
    </div>}
    <div className="section list">{data.tables.map(t=>{const order=openOrderFor(t.id);return <div className="listRow" key={t.id}>
      <div className="grow"><strong>{t.name}</strong><small style={{display:'block'}}>{t.capacity} seats · {order?`Occupied · Order #${order.number}`:'Available'}</small></div>
      {order&&<button disabled={busy} className="btn btnPrimary" onClick={()=>moveOrder(t)}>Transfer / Merge</button>}
      {canManageTables&&<button disabled={busy} className="btn btnSoft" onClick={()=>{const c=prompt('Capacity',String(t.capacity));if(c)save({...t,capacity:c})}}>Edit capacity</button>}
      {canManageTables&&<button className="btn btnDanger" disabled={busy||Boolean(order)} onClick={()=>remove(t.id)}>Delete</button>}
    </div>})}</div>
  </>;
}
