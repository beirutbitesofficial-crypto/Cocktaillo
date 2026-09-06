'use client';
import {useEffect,useMemo,useState} from 'react';
import {PageHeader,Stat,fmt,usd} from './ui.js';

const localDateValue=date=>{const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function shiftDate(value,period,amount){const d=new Date(`${value}T12:00:00`);if(period==='daily')d.setDate(d.getDate()+amount);else if(period==='monthly')d.setMonth(d.getMonth()+amount);else d.setFullYear(d.getFullYear()+amount);return localDateValue(d)}
function periodLabel(period,value){const d=new Date(`${value}T12:00:00`);if(period==='daily')return d.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'});if(period==='monthly')return d.toLocaleDateString(undefined,{year:'numeric',month:'long'});return String(d.getFullYear())}
const money=v=>`$${Number(v||0).toFixed(2)}`;

export default function FinanceCenter({data}){
  const[period,setPeriod]=useState('daily'),[selectedDate,setSelectedDate]=useState(()=>localDateValue(new Date())),[payload,setPayload]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{let active=true;(async()=>{setLoading(true);setError('');try{const r=await fetch(`/api/finance?period=${period}&anchor=${selectedDate}`,{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load finance report.');if(active)setPayload(d)}catch(e){if(active)setError(e.message)}finally{if(active)setLoading(false)}})();return()=>{active=false}},[period,selectedDate]);
  const l=payload?.ledger||{};
  const netCashEquivalent=Number(l.net_cash_usd||0)+(Number(l.net_cash_lbp||0)/Number(l.exchange_rate||89500));
  const variance=useMemo(()=>((l.shifts||[]).filter(s=>s.status==='closed').reduce((a,s)=>({usd:a.usd+Number(s.variance_usd||0),lbp:a.lbp+Number(s.variance_lbp||0)}),{usd:0,lbp:0})),[l.shifts]);

  return <>
    <PageHeader title="Finance & Audit" sub="Canonical sales ledger, cash reconciliation, profitability and audit — all Manager reports use the same source of truth."/>
    <div className="card" style={{marginBottom:12}}>
      <div className="modeTabs" style={{marginBottom:12}}>{['daily','monthly','yearly'].map(p=><button key={p} className={period===p?'active':''} onClick={()=>setPeriod(p)}>{p[0].toUpperCase()+p.slice(1)}</button>)}</div>
      <div style={{display:'flex',alignItems:'end',gap:8,flexWrap:'wrap'}}>
        <div className="field" style={{minWidth:210}}><label>Report calendar</label><input className="input" type="date" value={selectedDate} onChange={e=>e.target.value&&setSelectedDate(e.target.value)}/></div>
        <button className="btn btnSoft" onClick={()=>setSelectedDate(v=>shiftDate(v,period,-1))}>← Previous</button>
        <button className="btn btnSoft" onClick={()=>setSelectedDate(localDateValue(new Date()))}>Today</button>
        <button className="btn btnSoft" onClick={()=>setSelectedDate(v=>shiftDate(v,period,1))}>Next →</button>
        <strong style={{padding:'10px 0'}}>{periodLabel(period,selectedDate)}</strong>
      </div>
    </div>

    {error&&<div className="error" style={{marginBottom:12}}>{error}</div>}
    {loading&&!payload&&<div className="card">Loading finance ledger…</div>}
    {payload&&<>
      <div className="cards section">
        <Stat label="Gross sales" value={usd(l.gross_sales_cents||0)}/>
        <Stat label="Refunds" value={usd(l.refunds_cents||0)}/>
        <Stat label="Net sales" value={usd(l.net_sales_cents||0)}/>
        <Stat label="Completed orders" value={l.orders||0}/>
      </div>
      <div className="cards section">
        <Stat label="Discounts" value={usd(l.discounts_cents||0)}/>
        <Stat label="COGS" value={money(l.cogs_usd)}/>
        <Stat label="Gross profit" value={money(l.gross_profit_usd)}/>
        <Stat label="Gross margin" value={`${Number(l.gross_margin_percent||0).toFixed(1)}%`}/>
      </div>
      <div className="cards section">
        <Stat label="Expenses" value={money(l.expenses_usd)}/>
        <Stat label="Net profit" value={money(l.net_profit_usd)}/>
        <Stat label="Average order" value={money(l.average_order_usd)}/>
        <Stat label="Purchases" value={money(l.purchases_usd)}/>
      </div>
      <div className="cards section">
        <Stat label="Cash collected USD" value={money(l.paid_usd)}/>
        <Stat label="Cash collected LBP" value={`${fmt(l.paid_lbp||0)} LBP`}/>
        <Stat label="Cash refunded" value={`${money(l.refunded_usd)} + ${fmt(l.refunded_lbp||0)} LBP`}/>
        <Stat label="Net cash equivalent" value={money(netCashEquivalent)}/>
      </div>
      <div className="cards section">
        <Stat label="Paid orders" value={l.paid_orders||0}/>
        <Stat label="Refunded orders" value={l.refunded_orders||0}/>
        <Stat label="Inventory value" value={money(l.inventory_value_usd)}/>
        <Stat label="Exchange rate" value={fmt(l.exchange_rate||0)}/>
      </div>

      <div className="card section">
        <h3 style={{marginTop:0}}>Cash reconciliation — {periodLabel(period,selectedDate)}</h3>
        <div className="cards" style={{marginBottom:12}}><Stat label="Total variance USD" value={`${variance.usd>=0?'+':''}${money(variance.usd)}`}/><Stat label="Total variance LBP" value={`${variance.lbp>=0?'+':''}${fmt(variance.lbp)} LBP`}/></div>
        <div className="list">{(l.shifts||[]).slice().reverse().map(s=><div className="listRow" key={s.id}><div className="grow"><strong>{s.user_name}</strong><small style={{display:'block',color:'var(--muted)'}}>{s.status} · {new Date(s.opened_at).toLocaleString()}</small></div><div style={{textAlign:'right'}}><strong>{s.status==='closed'?`USD ${Number(s.variance_usd||0)>=0?'+':''}${Number(s.variance_usd||0).toFixed(2)}`:'Open'}</strong>{s.status==='closed'&&<small style={{display:'block'}}>LBP {fmt(s.variance_lbp||0)}</small>}</div></div>)}{!(l.shifts||[]).length&&<p style={{color:'var(--muted)'}}>No shifts in this period.</p>}</div>
      </div>

      <div className="card section">
        <h3 style={{marginTop:0}}>Audit trail — {periodLabel(period,selectedDate)}</h3>
        <div className="list">{(payload.audit||[]).map(a=><div className="listRow" key={a.id}><div className="grow"><strong>{String(a.type||'').replaceAll('_',' ')}</strong><small style={{display:'block',color:'var(--muted)'}}>{a.user||''} · {new Date(a.at).toLocaleString()} {a.reason?`· ${a.reason}`:''}</small></div></div>)}{!(payload.audit||[]).length&&<p style={{color:'var(--muted)'}}>No audit activity in this period.</p>}</div>
      </div>
    </>}
  </>;
}
