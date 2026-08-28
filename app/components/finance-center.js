'use client';
import {useMemo,useState} from 'react';
import {PageHeader,Stat,fmt,usd} from './ui.js';

const localDateValue=date=>{const d=new Date(date);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`};
function inPeriod(date,period,anchorValue){
  const d=new Date(date),a=new Date(`${anchorValue}T12:00:00`);
  if(Number.isNaN(d.getTime())||Number.isNaN(a.getTime()))return false;
  if(period==='daily')return d.getFullYear()===a.getFullYear()&&d.getMonth()===a.getMonth()&&d.getDate()===a.getDate();
  if(period==='monthly')return d.getFullYear()===a.getFullYear()&&d.getMonth()===a.getMonth();
  return d.getFullYear()===a.getFullYear();
}
function recipeCost(data,itemId){const r=(data.recipes||[]).find(x=>x.menu_item_id===itemId);return (r?.lines||[]).reduce((s,l)=>{const i=(data.inventory||[]).find(x=>x.id===l.inventory_id);return s+Number(l.quantity||0)*Number(i?.unit_cost||0)},0)}
function shiftDate(value,period,amount){const d=new Date(`${value}T12:00:00`);if(period==='daily')d.setDate(d.getDate()+amount);else if(period==='monthly')d.setMonth(d.getMonth()+amount);else d.setFullYear(d.getFullYear()+amount);return localDateValue(d)}
function periodLabel(period,value){const d=new Date(`${value}T12:00:00`);if(period==='daily')return d.toLocaleDateString(undefined,{weekday:'short',year:'numeric',month:'short',day:'numeric'});if(period==='monthly')return d.toLocaleDateString(undefined,{year:'numeric',month:'long'});return String(d.getFullYear())}

export default function FinanceCenter({data}){
  const[period,setPeriod]=useState('daily');
  const[selectedDate,setSelectedDate]=useState(()=>localDateValue(new Date()));
  const rate=Number(data.settings.exchange_rate||89500);
  const calc=useMemo(()=>{
    const paid=data.orders.filter(o=>o.status==='paid'&&inPeriod(o.paid_at||o.created_at,period,selectedDate));
    const refunded=data.orders.filter(o=>o.status==='refunded'&&inPeriod(o.paid_at||o.created_at,period,selectedDate));
    const gross=paid.reduce((s,o)=>s+(o.totals?.total_equivalent_cents||0),0);
    const refunds=refunded.reduce((s,o)=>s+(o.totals?.total_equivalent_cents||0),0);
    const cogs=paid.reduce((s,o)=>s+o.lines.reduce((a,l)=>a+recipeCost(data,l.menu_item_id)*Number(l.quantity||0),0),0);
    const expenses=(data.expenses||[]).filter(e=>inPeriod(e.date||e.created_at,period,selectedDate));
    const expUsd=expenses.reduce((s,e)=>s+(e.currency==='LBP'?Number(e.amount||0)/rate:Number(e.amount||0)),0);
    const payments=paid.reduce((a,o)=>{const p=o.payments?.[0]||{};a.usd+=Number(p.usd_cents||0)/100;a.lbp+=Number(p.lbp||0);return a},{usd:0,lbp:0});
    const netSales=(gross-refunds)/100,grossProfit=netSales-cogs,netProfit=grossProfit-expUsd;
    const shifts=(data.shifts||[]).filter(s=>inPeriod(s.opened_at,period,selectedDate));
    return {paid,refunded,gross,refunds,cogs,expenses,expUsd,payments,netSales,grossProfit,netProfit,shifts};
  },[data,period,selectedDate,rate]);
  const margin=calc.netSales?calc.grossProfit/calc.netSales*100:0;
  const audit=(data.audit||[]).filter(a=>inPeriod(a.at,period,selectedDate)).slice(0,50);

  return <>
    <PageHeader title="Finance & Audit" sub="Choose any date from the calendar and review daily, monthly or yearly sales, costs, expenses and cash variances."/>
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
    <div className="cards section"><Stat label="Gross sales" value={usd(calc.gross)}/><Stat label="Refunds" value={usd(calc.refunds)}/><Stat label="Net sales" value={`$${calc.netSales.toFixed(2)}`}/><Stat label="Orders" value={calc.paid.length}/></div>
    <div className="cards section"><Stat label="COGS" value={`$${calc.cogs.toFixed(2)}`}/><Stat label="Gross profit" value={`$${calc.grossProfit.toFixed(2)}`}/><Stat label="Expenses" value={`$${calc.expUsd.toFixed(2)}`}/><Stat label="Net profit" value={`$${calc.netProfit.toFixed(2)}`}/></div>
    <div className="cards section"><Stat label="Gross margin" value={`${margin.toFixed(1)}%`}/><Stat label="Paid USD" value={`$${calc.payments.usd.toFixed(2)}`}/><Stat label="Paid LBP" value={`${fmt(calc.payments.lbp)} LBP`}/><Stat label="Inventory value" value={`$${(data.inventory||[]).reduce((s,i)=>s+Number(i.quantity||0)*Number(i.unit_cost||0),0).toFixed(2)}`}/></div>
    <div className="card section"><h3>Cash reconciliation — {periodLabel(period,selectedDate)}</h3><div className="list">{calc.shifts.slice().reverse().map(s=><div className="listRow" key={s.id}><div className="grow"><strong>{s.user_name}</strong><small style={{display:'block'}}>{s.status} · {new Date(s.opened_at).toLocaleString()}</small></div><div style={{textAlign:'right'}}><strong>{s.status==='closed'?`USD ${Number(s.variance_usd||0)>=0?'+':''}${Number(s.variance_usd||0).toFixed(2)}`:'Open'}</strong>{s.status==='closed'&&<small style={{display:'block'}}>LBP {fmt(s.variance_lbp||0)}</small>}</div></div>)}{!calc.shifts.length&&<p style={{color:'var(--muted)'}}>No shifts in this period.</p>}</div></div>
    <div className="card section"><h3>Audit trail — {periodLabel(period,selectedDate)}</h3><div className="list">{audit.map(a=><div className="listRow" key={a.id}><div className="grow"><strong>{String(a.type||'').replaceAll('_',' ')}</strong><small style={{display:'block'}}>{a.user||''} · {new Date(a.at).toLocaleString()} {a.reason?`· ${a.reason}`:''}</small></div></div>)}{!audit.length&&<p style={{color:'var(--muted)'}}>No audit activity in this period.</p>}</div></div>
  </>;
}
