'use client';
import {useEffect,useMemo,useRef,useState} from 'react';

const usd=cents=>`$${(Number(cents||0)/100).toFixed(2)}`;

export default function WebsiteOrderNotifier({data,reload}){
  const[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const seenRef=useRef(new Set());
  const pending=useMemo(()=>{
    if(data?.user?.role!=='cashier')return [];
    return (data.orders||[])
      .filter(order=>order.source==='website'&&order.status==='pending_payment'&&!order.website_confirmed_at)
      .slice()
      .sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  },[data]);
  const order=pending[0]||null;

  useEffect(()=>{
    const currentIds=new Set(pending.map(item=>item.id));
    const hasNew=pending.some(item=>!seenRef.current.has(item.id));
    if(hasNew)setExpanded(false);
    seenRef.current=currentIds;
  },[pending]);

  if(!order)return null;
  const customer=order.customer||{};
  const total=order.totals?.total_equivalent_cents||0;

  async function confirm(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/website-orders/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:order.id})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not confirm online order.');
      setExpanded(false);
      await reload();
    }catch(e){setError(e instanceof Error?e.message:'Could not confirm online order.')}finally{setBusy(false)}
  }

  return <div style={{position:'fixed',right:14,top:72,zIndex:80,width:'min(380px,calc(100vw - 28px))',background:'var(--card,#fff)',border:'2px solid #d97706',borderRadius:18,boxShadow:'0 18px 45px rgba(0,0,0,.22)',overflow:'hidden'}}>
    <div style={{background:'#fff7ed',padding:'12px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
      <div><div style={{fontSize:11,fontWeight:900,letterSpacing:'.08em',color:'#9a3412'}}>● NEW ONLINE ORDER</div><strong style={{fontSize:20}}>#{order.number}</strong> <span style={{fontSize:13,textTransform:'capitalize',color:'#6b7280'}}>· {order.type}</span></div>
      {pending.length>1&&<span style={{background:'#9a3412',color:'#fff',borderRadius:999,padding:'5px 9px',fontSize:12,fontWeight:900}}>{pending.length} pending</span>}
    </div>
    <div style={{padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}><div><strong>{customer.name||'Website customer'}</strong><div style={{fontSize:13,color:'var(--muted,#6b7280)',marginTop:3}}>{customer.phone||''}</div></div><strong style={{fontSize:20}}>{usd(total)}</strong></div>
      {expanded&&<div style={{marginTop:12,paddingTop:12,borderTop:'1px solid rgba(0,0,0,.1)'}}>
        <div style={{display:'grid',gap:7,maxHeight:220,overflowY:'auto'}}>{(order.lines||[]).map(line=><div key={line.id} style={{display:'flex',justifyContent:'space-between',gap:10,fontSize:13}}><span><b>{line.quantity}×</b> {line.name_en}{(line.addons||[]).map(a=><small key={a.id} style={{display:'block',paddingLeft:18,color:'var(--muted,#6b7280)'}}>+ {a.name_en}</small>)}</span><b>{usd(Number(line.price_cents||0)*Number(line.quantity||1))}</b></div>)}</div>
        {customer.address&&<div style={{marginTop:10,fontSize:13}}><b>Address:</b> {customer.address}</div>}
        {customer.notes&&<div style={{marginTop:6,fontSize:13}}><b>Notes:</b> {customer.notes}</div>}
        <div style={{marginTop:6,fontSize:13}}><b>Payment:</b> {customer.payment_method||'CASH'}</div>
      </div>}
      {error&&<div style={{marginTop:10,padding:9,borderRadius:10,background:'#fef2f2',color:'#b91c1c',fontSize:12,fontWeight:700}}>{error}</div>}
      <div style={{display:'flex',gap:8,marginTop:12}}>
        <button type="button" onClick={()=>setExpanded(value=>!value)} style={{flex:1,border:'1px solid rgba(0,0,0,.15)',background:'transparent',borderRadius:11,padding:'10px 12px',fontWeight:800,cursor:'pointer'}}>{expanded?'Hide details':'View details'}</button>
        <button type="button" disabled={busy} onClick={confirm} style={{flex:1.35,border:0,background:'#166534',color:'#fff',borderRadius:11,padding:'10px 12px',fontWeight:900,cursor:busy?'wait':'pointer',opacity:busy?0.7:1}}>{busy?'Confirming…':'Confirm & Print'}</button>
      </div>
      <div style={{fontSize:11,color:'var(--muted,#6b7280)',marginTop:9,textAlign:'center'}}>You can keep using the POS. Nothing prints until Confirm.</div>
    </div>
  </div>;
}
