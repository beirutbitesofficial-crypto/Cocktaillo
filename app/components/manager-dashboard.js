'use client';
import {PageHeader,Stat,fmt,usd} from './ui.js';

const money=v=>`$${Number(v||0).toFixed(2)}`;
export default function ManagerDashboard({data}){
  const reports=data.reports||{},orders=Array.isArray(data.orders)?data.orders:[],online=data.online_orders_summary||{},tables=Array.isArray(data.tables)?data.tables:[],shifts=Array.isArray(data.shifts)?data.shifts:[],tickets=Array.isArray(data.tickets)?data.tickets:[],inventory=Array.isArray(data.inventory)?data.inventory:[],menu=Array.isArray(data.menu_all)?data.menu_all:(Array.isArray(data.menu)?data.menu:[]);
  const openTables=orders.filter(order=>order.type==='table'&&order.status==='open').length;
  const salesRanking=menu.map(item=>({...item,units_sold:Math.max(0,Number(item.units_sold||0))})).sort((a,b)=>b.units_sold-a.units_sold||Number(Boolean(b.best_seller))-Number(Boolean(a.best_seller))||String(a.name_en||'').localeCompare(String(b.name_en||'')));
  const soldItems=salesRanking.filter(item=>item.units_sold>0).length,activeShifts=shifts.filter(s=>s.status==='open').length,barQueue=tickets.filter(t=>t.station==='bar'&&t.status!=='ready').length,kitchenQueue=tickets.filter(t=>t.station==='kitchen'&&t.status!=='ready').length,hookahQueue=tickets.filter(t=>t.station==='hookah'&&t.status!=='ready').length;
  return <>
    <PageHeader title="Manager Dashboard" sub={`Live Cocktaillo control center · signed in as ${data.user.name}. Finance figures are reconciled from the same canonical ledger used by Reports.`}/>
    <div className="cards">
      <Stat label="Net sales" value={usd(reports.sales_cents||0)}/>
      <Stat label="Net profit" value={money(reports.net_profit)}/>
      <Stat label="Completed orders" value={reports.orders||0}/>
      <Stat label="Gross margin" value={`${Number(reports.gross_margin_percent||0).toFixed(1)}%`}/>
    </div>
    <div className="cards section">
      <Stat label="Gross sales" value={usd(reports.gross_sales_cents||0)}/>
      <Stat label="Refunds" value={usd(reports.refunds_cents||0)}/>
      <Stat label="Discounts" value={usd(reports.discounts_cents||0)}/>
      <Stat label="COGS" value={money(reports.cogs)}/>
    </div>
    <div className="cards section">
      <Stat label="Cash USD net" value={money(reports.net_cash_usd)}/>
      <Stat label="Cash LBP net" value={`${fmt(reports.net_cash_lbp||0)} LBP`}/>
      <Stat label="Expenses" value={money(reports.expenses)}/>
      <Stat label="Purchases" value={money(reports.purchases)}/>
    </div>
    <div className="cards section">
      <Stat label="Occupied tables" value={`${openTables} / ${tables.length}`}/>
      <Stat label="Active shifts" value={activeShifts}/>
      <Stat label="Inventory value" value={money(reports.inventory_value)}/>
      <Stat label="Low stock" value={reports.low_stock??inventory.filter(i=>Number(i.minimum||0)>0&&Number(i.quantity)<=Number(i.minimum)).length}/>
    </div>
    <div className="cards section">
      <Stat label="Bar queue" value={barQueue}/>
      <Stat label="Kitchen queue" value={kitchenQueue}/>
      <Stat label="Hookah queue" value={hookahQueue}/>
      <Stat label="Pending online" value={Number(online.pending||0)}/>
    </div>
    <div className="cards section">
      <Stat label="Online orders" value={Number(online.total||0)}/>
      <Stat label="Online delivery" value={Number(online.delivery||0)}/>
      <Stat label="Online takeaway" value={Number(online.takeaway||0)}/>
      <Stat label="Refunded orders" value={Number(reports.refunded_orders||0)}/>
    </div>
    <div className="card section">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 4px'}}>Sales Ranking — All Menu Items</h2><small style={{color:'var(--muted)'}}>Paid historical sales plus restored Excel history. Refunded, void and unpaid checks are excluded.</small></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><span className="pill">{soldItems} sold items</span><span className="pill">{salesRanking.length} total items</span>{salesRanking[0]?.units_sold>0&&<span className="pill">★ #1 {salesRanking[0].name_en}</span>}</div></div>
      <div className="list" style={{marginTop:12,maxHeight:'620px',overflowY:'auto'}}>{salesRanking.map((item,index)=><div className="listRow" key={item.id}><div style={{width:42,fontSize:18,fontWeight:900}}>#{index+1}</div><div className="grow"><strong>{item.name_en||item.name_ar||'Menu item'} {index===0&&item.units_sold>0?'★':''}</strong><small style={{display:'block',color:'var(--muted)'}}>{item.name_ar||''}{item.category?`${item.name_ar?' · ':''}${item.category}`:''}</small></div><div style={{textAlign:'right',minWidth:82}}><strong>{item.units_sold}</strong><small style={{display:'block',color:'var(--muted)'}}>{item.units_sold===1?'unit sold':'units sold'}</small></div></div>)}{!salesRanking.length&&<p style={{color:'var(--muted)',margin:0}}>No menu items found.</p>}</div>
    </div>
  </>;
}
