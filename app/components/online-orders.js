'use client';
import {useMemo,useState} from 'react';
import {PageHeader,usd} from './ui.js';

const pillStyle={display:'inline-flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:999,fontSize:12,fontWeight:800};

export default function OnlineOrders({data,reload}){
  const[filter,setFilter]=useState('all');
  const[expanded,setExpanded]=useState(null);
  const[busy,setBusy]=useState('');
  const[error,setError]=useState('');
  const orders=useMemo(()=>{
    const all=(Array.isArray(data.orders)?data.orders:[]).filter(order=>order.source==='website');
    return all.sort((a,b)=>{
      const ap=Number(a.status==='pending_payment'&&!a.website_confirmed_at);
      const bp=Number(b.status==='pending_payment'&&!b.website_confirmed_at);
      if(ap!==bp)return bp-ap;
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
  },[data.orders]);
  const pending=orders.filter(order=>order.status==='pending_payment'&&!order.website_confirmed_at);
  const delivery=orders.filter(order=>order.type==='delivery');
  const takeaway=orders.filter(order=>order.type==='takeaway');
  const visible=orders.filter(order=>{
    if(filter==='pending')return order.status==='pending_payment'&&!order.website_confirmed_at;
    if(filter==='delivery')return order.type==='delivery';
    if(filter==='takeaway')return order.type==='takeaway';
    return true;
  });

  async function confirm(order){
    if(busy)return;
    setBusy(order.id);setError('');
    try{
      const response=await fetch('/api/website-orders/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_id:order.id})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not confirm online order.');
      await reload();
    }catch(e){setError(e instanceof Error?e.message:'Could not confirm online order.')}finally{setBusy('')}
  }

  return <>
    <PageHeader title="Online Orders" sub="Website delivery and takeaway orders with full customer details."/>
    <div className="cards">
      <button type="button" className="card" onClick={()=>setFilter('all')} style={{textAlign:'left',cursor:'pointer',border:filter==='all'?'2px solid #166534':undefined}}><small>Total online</small><strong style={{display:'block',fontSize:28,marginTop:6}}>{orders.length}</strong></button>
      <button type="button" className="card" onClick={()=>setFilter('pending')} style={{textAlign:'left',cursor:'pointer',border:filter==='pending'?'2px solid #d97706':undefined}}><small>Pending</small><strong style={{display:'block',fontSize:28,marginTop:6}}>{pending.length}</strong></button>
      <button type="button" className="card" onClick={()=>setFilter('delivery')} style={{textAlign:'left',cursor:'pointer',border:filter==='delivery'?'2px solid #166534':undefined}}><small>Delivery</small><strong style={{display:'block',fontSize:28,marginTop:6}}>{delivery.length}</strong></button>
      <button type="button" className="card" onClick={()=>setFilter('takeaway')} style={{textAlign:'left',cursor:'pointer',border:filter==='takeaway'?'2px solid #166534':undefined}}><small>Takeaway</small><strong style={{display:'block',fontSize:28,marginTop:6}}>{takeaway.length}</strong></button>
    </div>

    {error&&<div className="error section">{error}</div>}

    <div className="section" style={{display:'grid',gap:12}}>
      {visible.map(order=>{
        const customer=order.customer||{};
        const isPending=order.status==='pending_payment'&&!order.website_confirmed_at;
        const isOpen=expanded===order.id;
        return <div className="card" key={order.id} style={{border:isPending?'2px solid #d97706':undefined}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'start',flexWrap:'wrap'}}>
            <div style={{minWidth:220}}>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <strong style={{fontSize:22}}>#{order.number}</strong>
                <span style={{...pillStyle,background:order.type==='delivery'?'#dcfce7':'#e0f2fe',color:order.type==='delivery'?'#166534':'#075985',textTransform:'capitalize'}}>{order.type}</span>
                <span style={{...pillStyle,background:isPending?'#fff7ed':'#ecfdf5',color:isPending?'#9a3412':'#166534'}}>{isPending?'Pending confirmation':'Confirmed'}</span>
              </div>
              <div style={{marginTop:8,fontSize:15}}><b>{customer.name||'Website customer'}</b></div>
              <div style={{marginTop:3,color:'var(--muted)'}}>{customer.phone||'No phone'}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <strong style={{fontSize:24}}>{usd(order.totals?.total_equivalent_cents||0)}</strong>
              <small style={{display:'block',marginTop:4,color:'var(--muted)'}}>{new Date(order.created_at).toLocaleString()}</small>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:14,paddingTop:12,borderTop:'1px solid rgba(0,0,0,.08)'}}>
            <div><small style={{color:'var(--muted)'}}>Payment</small><div style={{fontWeight:800,marginTop:3}}>{customer.payment_method||'CASH'}</div></div>
            <div><small style={{color:'var(--muted)'}}>Address</small><div style={{fontWeight:700,marginTop:3}}>{order.type==='delivery'?(customer.address||'No address'):'Pickup at Cocktaillo'}</div></div>
            <div><small style={{color:'var(--muted)'}}>Customer notes</small><div style={{fontWeight:700,marginTop:3}}>{customer.notes||'—'}</div></div>
          </div>

          {isOpen&&<div style={{marginTop:14,paddingTop:12,borderTop:'1px solid rgba(0,0,0,.08)'}}>
            <strong>Order details</strong>
            <div style={{display:'grid',gap:8,marginTop:9}}>{(order.lines||[]).map(line=><div key={line.id} style={{display:'flex',justifyContent:'space-between',gap:14,alignItems:'start'}}>
              <div><b>{line.quantity}× {line.name_en}</b>{(line.addons||[]).map(addon=><small key={addon.id} style={{display:'block',color:'var(--muted)',paddingLeft:16,marginTop:2}}>+ {addon.name_en}</small>)}{line.note&&<small style={{display:'block',color:'var(--muted)',paddingLeft:16,marginTop:2}}>Note: {line.note}</small>}</div>
              <b>{usd(Number(line.price_cents||0)*Number(line.quantity||1))}</b>
            </div>)}</div>
            {customer.payment_reference&&<div style={{marginTop:10}}><small style={{color:'var(--muted)'}}>Payment reference</small><div style={{fontWeight:800}}>{customer.payment_reference}</div></div>}
            {order.website_confirmed_at&&<div style={{marginTop:10,fontSize:12,color:'var(--muted)'}}>Confirmed by {order.website_confirmed_by||'cashier'} · {new Date(order.website_confirmed_at).toLocaleString()}</div>}
          </div>}

          <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
            <button type="button" className="secondary" onClick={()=>setExpanded(isOpen?null:order.id)}>{isOpen?'Hide details':'View full details'}</button>
            {isPending&&<button type="button" className="primary" disabled={busy===order.id} onClick={()=>confirm(order)}>{busy===order.id?'Confirming…':'Confirm & Print'}</button>}
          </div>
        </div>;
      })}
      {!visible.length&&<div className="card"><p style={{margin:0,color:'var(--muted)'}}>No online orders in this filter.</p></div>}
    </div>
  </>;
}
