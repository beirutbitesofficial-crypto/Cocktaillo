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

  async function transfer(table){
    const order=openOrderFor(table.id);
    if(!order)return alert('This table has no open order.');
    const available=data.tables.filter(t=>t.id!==table.id&&!isOccupied(t.id));
    if(!available.length)return alert('No available destination tables.');
    const choices=available.map((t,i)=>`${i+1}. ${t.name}`).join('\n');
    const answer=prompt(`Transfer Order #${order.number} from ${table.name} to:\n\n${choices}\n\nEnter table number:`,'');
    if(answer===null)return;
    const target=available[Number(answer)-1];
    if(!target)return alert('Choose a valid table number.');
    if(!confirm(`Transfer Order #${order.number} from ${table.name} to ${target.name}?`))return;
    setBusy(true);
    try{
      await post('/api/actions',{action:'transfer_table',order_id:order.id,to_table_id:target.id});
      await reload();
      alert(`Order #${order.number} transferred to ${target.name}.`);
    }catch(e){alert(e.message)}finally{setBusy(false)}
  }

  return <>
    <PageHeader title="Table Setup" sub="Add or edit tables and transfer open orders when guests move."/>
    <div className="card formGrid">
      <Input label="Table name" value={name} onChange={setName}/>
      <Input label="Capacity" value={capacity} onChange={setCapacity}/>
      <button disabled={busy} className="btn btnPrimary" onClick={()=>save()}>Add table</button>
    </div>
    <div className="section list">{data.tables.map(t=>{const order=openOrderFor(t.id);return <div className="listRow" key={t.id}>
      <div className="grow"><strong>{t.name}</strong><small style={{display:'block'}}>{t.capacity} seats · {order?`Occupied · Order #${order.number}`:'Available'}</small></div>
      {order&&<button disabled={busy} className="btn btnPrimary" onClick={()=>transfer(t)}>Transfer Order</button>}
      <button disabled={busy} className="btn btnSoft" onClick={()=>{const c=prompt('Capacity',String(t.capacity));if(c)save({...t,capacity:c})}}>Edit capacity</button>
      <button className="btn btnDanger" disabled={busy||Boolean(order)} onClick={()=>remove(t.id)}>Delete</button>
    </div>})}</div>
  </>;
}
