'use client';
import {useState} from 'react';
import {PageHeader} from './ui.js';

export default function ExcelReports({reload}){
  const[file,setFile]=useState(null),[preview,setPreview]=useState(null),[result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restoreInventory,setRestoreInventory]=useState(false);
  async function send(mode){
    if(!file)return setError('Choose a Cocktaillo Excel report first.');
    setBusy(true);setError('');if(mode==='preview')setResult(null);
    try{
      const form=new FormData();form.append('file',file);form.append('mode',mode);form.append('restore_inventory',restoreInventory?'true':'false');
      const r=await fetch('/api/reports/import',{method:'POST',body:form});const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||'Could not read this Excel file.');
      if(mode==='preview')setPreview(data);else{setResult(data.added||{});setPreview(data.preview||preview);await reload?.()}
    }catch(e){setError(e.message||'Excel recovery failed.')}finally{setBusy(false)}
  }
  return <>
    <PageHeader title="Expert Excel Reports" sub="Download accounting workbooks or restore missing Finance and Dashboard history from a previous Cocktaillo Excel export."/>
    <div className="cards"><Export period="daily" title="Daily Report" text="Today: revenue, COGS, profit, expenses, orders, items, inventory, shifts and audit."/><Export period="monthly" title="Monthly Report" text="Current month workbook with complete operational and finance detail."/><Export period="yearly" title="Yearly Report" text="Current year management workbook for accounting and business review."/></div>
    <div className="card section">
      <h2 style={{marginTop:0}}>Restore missing data from Excel</h2>
      <p style={{color:'var(--muted)',lineHeight:1.7,marginTop:0}}>Use a <strong>cocktaillo-daily-finance.xlsx</strong>, monthly or yearly workbook that was downloaded from this POS. Preview compares it with the current data and restores only missing records. Existing orders and menu items are not overwritten.</p>
      <div style={{display:'flex',gap:10,alignItems:'end',flexWrap:'wrap'}}>
        <div className="field" style={{minWidth:280,flex:'1 1 320px'}}><label>Finance workbook</label><input className="input" type="file" accept=".xlsx,.xls" onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setResult(null);setError('')}}/></div>
        <button className="btn btnSoft" disabled={!file||busy} onClick={()=>send('preview')}>{busy?'Checking…':'Preview Recovery'}</button>
      </div>
      <label style={{display:'flex',gap:9,alignItems:'center',marginTop:12,cursor:'pointer'}}><input type="checkbox" checked={restoreInventory} onChange={e=>setRestoreInventory(e.target.checked)}/><span><strong>Restore Inventory snapshot too</strong> <small style={{color:'var(--muted)'}}>— optional; this updates stock quantities and unit costs to the values saved in the workbook.</small></span></label>
      {error&&<div className="error" style={{marginTop:12}}>{error}</div>}
      {preview&&<RecoveryPreview preview={preview} busy={busy} onRestore={()=>send('restore')} restoreInventory={restoreInventory}/>} 
      {result&&<div className="card" style={{marginTop:12,background:'var(--soft)'}}><h3 style={{marginTop:0}}>Recovery completed ✓</h3><p style={{marginBottom:0,color:'var(--muted)'}}>Added {result.orders||0} missing orders, {result.refunds||0} refunds, {result.item_units||0} item units, {result.expenses||0} expenses, {result.purchases||0} purchases and {result.shifts||0} shifts.{result.inventory_updated?` Updated ${result.inventory_updated} inventory items.`:''} Finance and Dashboard now include the restored history.</p></div>}
    </div>
    <div className="card section"><h3>Every workbook includes</h3><p style={{color:'var(--muted)',lineHeight:1.7}}>Summary · Orders · Item Performance · Expenses · Inventory valuation · Cashier shifts and variances · Audit trail. Profitability uses recipe/BOM ingredient costs from Inventory.</p></div>
  </>
}

function RecoveryPreview({preview,busy,onRestore,restoreInventory}){
  const m=preview.missing||{},w=preview.workbook||{},nothing=![m.orders,m.refunds,m.item_units,m.expenses,m.purchases,m.shifts].some(Number)&&!(restoreInventory&&Number(w.inventory||0)>0);
  return <div style={{marginTop:16}}>
    <div className="cards">
      <Mini label="Missing orders" value={m.orders||0} sub={`of ${w.orders||0} in workbook`}/>
      <Mini label="Missing item units" value={m.item_units||0} sub="for Dashboard ranking"/>
      <Mini label="Missing expenses" value={m.expenses||0} sub={`of ${w.expenses||0}`}/>
      <Mini label="Missing shifts" value={m.shifts||0} sub={`of ${w.shifts||0}`}/>
    </div>
    <div className="card" style={{marginTop:12,background:'var(--soft)'}}>
      <strong>Workbook period: {preview.period||'unknown'}</strong>
      <p style={{color:'var(--muted)',lineHeight:1.6,margin:'7px 0'}}>Also found {m.refunds||0} missing refunds and {m.purchases||0} missing purchases. {preview.note}</p>
      <p style={{color:'var(--muted)',lineHeight:1.6,margin:'7px 0'}}>Finance totals are restored from the Orders sheet; item quantities are used to rebuild Dashboard sales ranking. The original receipt line-by-line composition cannot be recreated from the finance workbook because the Orders sheet stores order totals, not every product inside each receipt.</p>
      {restoreInventory&&<p style={{margin:'7px 0'}}><strong>Inventory restore is ON:</strong> {w.inventory||0} inventory rows will be applied as a snapshot.</p>}
      <button className="btn btnPrimary" disabled={busy||nothing} onClick={onRestore}>{busy?'Restoring…':nothing?'Nothing missing':'Restore Missing Data'}</button>
    </div>
  </div>
}
function Mini({label,value,sub}){return <div className="card"><small style={{color:'var(--muted)'}}>{label}</small><div style={{fontSize:28,fontWeight:900,margin:'5px 0'}}>{value}</div><small style={{color:'var(--muted)'}}>{sub}</small></div>}
function Export({period,title,text}){return <div className="card"><h2>{title}</h2><p style={{color:'var(--muted)',minHeight:54}}>{text}</p><a className="btn btnPrimary" style={{display:'inline-block'}} href={`/api/reports/export?period=${period}`}>Download .xlsx</a></div>}
