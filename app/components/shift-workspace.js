'use client';
import { useMemo, useState } from 'react';
import { Input, PageHeader, Stat, post, usd } from './ui.js';
export default function ShiftWorkspace({data,reload}){
 const[value,setValue]=useState('');
 const mine=(data.shifts||[]).filter(s=>s.user_id===data.user.id);
 const open=mine.find(s=>s.status==='open');
 const paidOrders=open?data.orders.filter(o=>o.status==='paid'&&o.payments?.some(p=>p.cashier===data.user.name&&new Date(p.at||o.paid_at||o.created_at)>=new Date(open.opened_at))):[];
 const sales=useMemo(()=>paidOrders.reduce((sum,o)=>sum+(o.totals?.total_equivalent_cents||0),0),[paidOrders]);
 async function act(action){try{await post('/api/actions',{action,[action==='open_shift'?'opening_usd':'closing_usd']:value});setValue('');await reload()}catch(e){alert(e.message)}}
 return <><PageHeader title={data.user.role==='manager'?'Shifts':'My Shift'} sub="Open and close the cash register with a counted amount."/>
 <div className="cards"><Stat label="Status" value={open?'OPEN':'CLOSED'}/><Stat label="Opening cash" value={open?`$${Number(open.opening_usd||0).toFixed(2)}`:'—'}/><Stat label="Recorded sales" value={usd(open?sales:0)}/><Stat label="Orders" value={open?paidOrders.length:0}/></div>
 <div className="card section" style={{maxWidth:720}}><h2>{open?'Close current shift':'Ready to start?'}</h2><p style={{color:'var(--muted)'}}>{open?`Opened ${new Date(open.opened_at).toLocaleString()}. Enter the exact counted cash before closing.`:'Enter the exact opening cash currently in the drawer.'}</p><Input label={open?'Counted closing cash (USD)':'Opening cash (USD)'} value={value} onChange={setValue}/><button className="btn btnPrimary" onClick={()=>act(open?'close_shift':'open_shift')}>{open?'Close shift':'Open shift'}</button></div>
 {data.user.role==='manager'&&<div className="section list">{(data.shifts||[]).slice().reverse().map(s=><div className="listRow" key={s.id}><div className="grow"><strong>{s.user_name}</strong><small style={{display:'block',color:'var(--muted)'}}>{new Date(s.opened_at).toLocaleString()}</small></div><span className="pill">{s.status}</span></div>)}</div>}</>}
