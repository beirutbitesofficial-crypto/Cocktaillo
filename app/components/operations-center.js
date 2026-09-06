'use client';
import {useEffect,useMemo,useState} from 'react';
import {Input,PageHeader,Stat,post,usd,fmt} from './ui.js';

const todayValue=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const money=v=>`$${Number(v||0).toFixed(2)}`;
export default function OperationsCenter({data,reload}){
  const[pin,setPin]=useState(''),[discount,setDiscount]=useState({order_id:'',type:'percent',value:''}),[purchase,setPurchase]=useState({inventory_id:'',quantity:'',unit_cost:'',supplier:'',invoice:'',note:''}),[merge,setMerge]=useState({source:'',target:''}),[daily,setDaily]=useState(null);
  const open=data.orders.filter(o=>['open','pending_payment'].includes(o.status)),paid=data.orders.filter(o=>o.status==='paid');
  const low=useMemo(()=>(data.inventory||[]).filter(i=>Number(i.minimum||0)>0&&Number(i.quantity)<=Number(i.minimum)),[data.inventory]);
  const occupied=data.tables.filter(t=>data.orders.some(o=>o.type==='table'&&o.table_id===t.id&&o.status==='open'));
  async function refreshDaily(){try{const r=await fetch(`/api/finance?period=daily&anchor=${todayValue()}`,{cache:'no-store'}),j=await r.json();if(r.ok)setDaily(j.ledger)}catch{}}
  useEffect(()=>{void refreshDaily()},[data]);
  async function action(payload){try{await post('/api/actions',{...payload,manager_pin:pin});setPin('');await reload();await refreshDaily()}catch(e){alert(e.message)}}
  async function doDiscount(){await action({action:'apply_discount',order_id:discount.order_id,discount_type:discount.type,value:discount.value});setDiscount({...discount,value:''})}
  async function voidOrder(o){const reason=prompt(`Void Order #${o.number}. Reason:`);if(reason)await action({action:'void_order',order_id:o.id,reason})}
  async function refundOrder(o){const reason=prompt(`Refund Order #${o.number}. Reason:`);if(reason&&confirm(`Refund full order #${o.number}? Inventory recipe quantities will be restored.`))await action({action:'refund_order',order_id:o.id,reason})}
  async function mergeTables(){if(!merge.source||!merge.target||merge.source===merge.target)return alert('Choose two different occupied tables.');await action({action:'merge_tables',source_table_id:merge.source,target_table_id:merge.target});setMerge({source:'',target:''})}
  async function buy(){try{await post('/api/admin',{action:'purchase_stock',...purchase});setPurchase({inventory_id:'',quantity:'',unit_cost:'',supplier:'',invoice:'',note:''});await reload();await refreshDaily()}catch(e){alert(e.message)}}
  return <>
    <PageHeader title="Operations Control" sub="Protected discounts, void/refund control, purchasing, table merge and reconciled end-of-day reporting."/>
    <div className="cards">
      <Stat label="Today's net sales" value={usd(daily?.net_sales_cents||0)}/>
      <Stat label="Gross profit" value={money(daily?.gross_profit_usd)}/>
      <Stat label="Net profit" value={money(daily?.net_profit_usd)}/>
      <Stat label="Completed orders" value={daily?.orders||0}/>
    </div>
    <div className="cards section">
      <Stat label="Refunds" value={usd(daily?.refunds_cents||0)}/>
      <Stat label="Discounts" value={usd(daily?.discounts_cents||0)}/>
      <Stat label="Expenses" value={money(daily?.expenses_usd)}/>
      <Stat label="Low stock" value={low.length}/>
    </div>
    <div className="card section"><h3>Manager approval PIN</h3><Input label="PIN for protected cashier actions" type="password" value={pin} onChange={setPin}/></div>
    <div className="card section"><h3>Discount open order</h3><div className="formGrid"><div className="field"><label>Order</label><select className="input" value={discount.order_id} onChange={e=>setDiscount({...discount,order_id:e.target.value})}><option value="">Choose order…</option>{open.map(o=><option key={o.id} value={o.id}>#{o.number} · {o.type} · {usd(o.totals?.total_equivalent_cents||0)}</option>)}</select></div><div className="field"><label>Type</label><select className="input" value={discount.type} onChange={e=>setDiscount({...discount,type:e.target.value})}><option value="percent">Percent %</option><option value="fixed">Fixed USD</option></select></div><Input label="Value" value={discount.value} onChange={v=>setDiscount({...discount,value:v})}/><button className="btn btnPrimary" onClick={doDiscount}>Apply Discount</button></div></div>
    <div className="card section"><h3>Open checks / voids</h3><div className="list">{open.map(o=><div className="listRow" key={o.id}><div className="grow"><strong>#{o.number} · {o.type}</strong><small style={{display:'block'}}>{usd(o.totals?.total_equivalent_cents||0)} · {o.created_by_name}</small></div><button className="btn btnDanger" onClick={()=>voidOrder(o)}>Void</button></div>)}{!open.length&&<p style={{color:'var(--muted)'}}>No open checks.</p>}</div></div>
    <div className="card section"><h3>Merge occupied tables</h3><div className="formGrid"><div className="field"><label>Source</label><select className="input" value={merge.source} onChange={e=>setMerge({...merge,source:e.target.value})}><option value="">Choose…</option>{occupied.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><div className="field"><label>Target</label><select className="input" value={merge.target} onChange={e=>setMerge({...merge,target:e.target.value})}><option value="">Choose…</option>{occupied.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div><button className="btn btnSoft" onClick={mergeTables}>Merge Checks</button></div></div>
    <div className="card section"><h3>Paid orders / refunds</h3><div className="list">{paid.slice(0,50).map(o=><div className="listRow" key={o.id}><div className="grow"><strong>#{o.number} · {usd(o.totals?.total_equivalent_cents||0)}</strong><small style={{display:'block'}}>{o.payments?.[0]?.cashier||''} · {o.paid_at?new Date(o.paid_at).toLocaleString():''}</small></div><button className="btn btnDanger" onClick={()=>refundOrder(o)}>Refund</button></div>)}{!paid.length&&<p style={{color:'var(--muted)'}}>No paid orders found.</p>}</div></div>
    <div className="card section"><h3>Stock In / Purchase</h3><div className="formGrid"><div className="field"><label>Inventory item</label><select className="input" value={purchase.inventory_id} onChange={e=>setPurchase({...purchase,inventory_id:e.target.value})}><option value="">Choose item…</option>{(data.inventory||[]).map(i=><option key={i.id} value={i.id}>{i.name} · {fmt(i.quantity)} {i.unit}</option>)}</select></div><Input label="Quantity received" value={purchase.quantity} onChange={v=>setPurchase({...purchase,quantity:v})}/><Input label="Unit cost USD" value={purchase.unit_cost} onChange={v=>setPurchase({...purchase,unit_cost:v})}/><Input label="Supplier" value={purchase.supplier} onChange={v=>setPurchase({...purchase,supplier:v})}/><Input label="Invoice #" value={purchase.invoice} onChange={v=>setPurchase({...purchase,invoice:v})}/><Input label="Note" value={purchase.note} onChange={v=>setPurchase({...purchase,note:v})}/><button className="btn btnPrimary" onClick={buy}>Receive Stock</button></div></div>
    {low.length>0&&<div className="card section"><h3>Low-stock alerts</h3><div className="list">{low.map(i=><div className="listRow" key={i.id}><div className="grow"><strong>{i.name}</strong><small style={{display:'block'}}>{fmt(i.quantity)} {i.unit} remaining · minimum {fmt(i.minimum)}</small></div></div>)}</div></div>}
    <div className="card section"><h3>End of Day Closing</h3><p style={{color:'var(--muted)'}}>Downloads the same reconciled ledger used by Finance and Dashboard, so Summary, Orders, Expenses, Shifts, Purchases and Inventory stay consistent.</p><a className="btn btnPrimary" style={{display:'inline-block'}} href="/api/reports/export?period=daily">Download Reconciled Daily Excel</a></div>
  </>;
}
