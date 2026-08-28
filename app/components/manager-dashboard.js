'use client';
import {PageHeader,Stat,usd} from './ui.js';

export default function ManagerDashboard({data}){
  const reports=data.reports||{};
  const orders=Array.isArray(data.orders)?data.orders:[];
  const tables=Array.isArray(data.tables)?data.tables:[];
  const shifts=Array.isArray(data.shifts)?data.shifts:[];
  const tickets=Array.isArray(data.tickets)?data.tickets:[];
  const inventory=Array.isArray(data.inventory)?data.inventory:[];
  const menu=Array.isArray(data.menu_all)?data.menu_all:(Array.isArray(data.menu)?data.menu:[]);
  const openTables=orders.filter(order=>order.type==='table'&&order.status==='open').length;
  const bestSellers=menu
    .map(item=>({...item,units_sold:Math.max(0,Number(item.units_sold||0))}))
    .filter(item=>item.units_sold>0)
    .sort((a,b)=>b.units_sold-a.units_sold||Number(Boolean(b.best_seller))-Number(Boolean(a.best_seller))||String(a.name_en||'').localeCompare(String(b.name_en||'')))
    .slice(0,5);

  return <>
    <PageHeader title="Dashboard" sub={`Good day, ${data.user.name}. Live Cocktaillo overview.`}/>
    <div className="cards">
      <Stat label="Net sales" value={usd(reports.sales_cents||0)}/>
      <Stat label="Orders" value={reports.orders||0}/>
      <Stat label="Net profit" value={`$${Number(reports.net_profit||0).toFixed(2)}`}/>
      <Stat label="Occupied tables" value={`${openTables} / ${tables.length}`}/>
    </div>
    <div className="cards section">
      <Stat label="Inventory value" value={`$${Number(reports.inventory_value||0).toFixed(2)}`}/>
      <Stat label="Active shifts" value={shifts.filter(shift=>shift.status==='open').length}/>
      <Stat label="Bar queue" value={tickets.filter(ticket=>ticket.station==='bar'&&ticket.status!=='ready').length}/>
      <Stat label="Low stock" value={inventory.filter(item=>Number(item.quantity)<=Number(item.minimum)).length}/>
    </div>
    <div className="card section">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap'}}>
        <div>
          <h2 style={{margin:'0 0 4px'}}>Best Sellers</h2>
          <small style={{color:'var(--muted)'}}>Top items by quantity sold from paid orders. Refunded, void and unpaid orders are excluded.</small>
        </div>
        {bestSellers[0]&&<span className="pill">★ #1 {bestSellers[0].name_en}</span>}
      </div>
      <div className="list" style={{marginTop:12}}>
        {bestSellers.map((item,index)=><div className="listRow" key={item.id}>
          <div style={{width:34,fontSize:20,fontWeight:900}}>#{index+1}</div>
          <div className="grow">
            <strong>{item.name_en||item.name_ar||'Menu item'}</strong>
            <small style={{display:'block',color:'var(--muted)'}}>{item.name_ar||''}{item.category?`${item.name_ar?' · ':''}${item.category}`:''}</small>
          </div>
          <div style={{textAlign:'right'}}>
            <strong>{item.units_sold}</strong>
            <small style={{display:'block',color:'var(--muted)'}}>units sold</small>
          </div>
        </div>)}
        {!bestSellers.length&&<p style={{color:'var(--muted)',margin:0}}>No paid item sales yet.</p>}
      </div>
    </div>
  </>;
}
