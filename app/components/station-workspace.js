'use client';
import {useEffect,useRef,useState} from 'react';
import {PageHeader,post} from './ui.js';

export default function StationWorkspace({data,reload,station}){
 const tickets=(data.tickets||[]).filter(t=>t.station===station&&t.status!=='ready');
 const initialized=useRef(false),seen=useRef(new Set()),[printTicket,setPrintTicket]=useState(null);
 async function setStatus(ticket,status){try{await post('/api/actions',{action:'ticket_status',ticket_id:ticket.id,status});await reload()}catch(e){alert(e.message)}}
 useEffect(()=>{
  const current=(data.tickets||[]).filter(t=>t.station===station&&t.status==='new');
  if(!initialized.current){current.forEach(t=>seen.current.add(t.id));initialized.current=true;return}
  const fresh=current.filter(t=>!seen.current.has(t.id));
  current.forEach(t=>seen.current.add(t.id));
  if(fresh.length)setPrintTicket(fresh[0]);
 },[data.tickets,station]);
 useEffect(()=>{
  if(!printTicket)return;
  const timer=setTimeout(()=>{window.print();setPrintTicket(null)},180);
  return()=>clearTimeout(timer);
 },[printTicket]);
 return <><PageHeader title={station==='bar'?'Bar Production':'Kitchen Production'} sub="Auto-print is active for new Arabic production tickets on this station terminal."/><div className="card" style={{marginBottom:12,background:'var(--soft)'}}><strong>Automatic printing: ON</strong><small style={{display:'block',marginTop:4,color:'var(--muted)'}}>Keep this station screen open on the device connected to the {station} printer. For silent printing, configure the browser/device in kiosk or silent-print mode.</small></div><div className="stationGrid">{tickets.map(t=><div className="ticket" key={t.id}><span className="pill">{t.status.toUpperCase()}</span><h3>{t.table_id?data.tables.find(x=>x.id===t.table_id)?.name:`Order #${t.order_number}`}</h3><div className="ticketLines">{t.lines.map((l,i)=><div className="ticketLine" key={i}><strong>{l.quantity} × {l.name_ar}</strong>{(l.addons||[]).map((a,n)=><div key={n}>+ {a.name_ar} ×{a.quantity}</div>)}{l.note&&<div>ملاحظة: {l.note}</div>}</div>)}</div><div className="ticketActions">{t.status==='new'&&<button className="btn btnSoft" onClick={()=>setStatus(t,'preparing')}>Preparing</button>}<button className="btn btnPrimary" onClick={()=>setStatus(t,'ready')}>Ready</button><button className="btn btnSoft" onClick={()=>{setPrintTicket(t)}}>Reprint</button></div></div>)}</div>{printTicket&&<div className="productionPrint"><h1>COCKTAILLO</h1><h2>{station==='bar'?'البار':'المطبخ'}</h2><div className="productionMeta"><strong>{printTicket.table_id?(data.tables.find(x=>x.id===printTicket.table_id)?.name||'طاولة'):`طلب رقم ${printTicket.order_number}`}</strong><span>{new Date(printTicket.created_at||Date.now()).toLocaleTimeString('ar-LB',{hour:'2-digit',minute:'2-digit'})}</span></div><hr/>{printTicket.lines.map((l,i)=><div className="productionLine" key={i}><strong>{l.quantity} × {l.name_ar}</strong>{(l.addons||[]).map((a,n)=><div key={n}>+ {a.name_ar} ×{a.quantity}</div>)}{l.note&&<div>ملاحظة: {l.note}</div>}</div>)}</div>}</>;
}
