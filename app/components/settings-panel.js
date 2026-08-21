'use client';
import {useState} from 'react';
import {Input,PageHeader,post} from './ui.js';

export default function SettingsPanel({data,reload}){
 const[rate,setRate]=useState(String(data.settings.exchange_rate));
 const[footer,setFooter]=useState(data.settings.receipt_footer||'');
 const[theme,setTheme]=useState(data.settings.theme||'light');
 const[resetText,setResetText]=useState('');
 const[busy,setBusy]=useState(false);
 function previewTheme(value){setTheme(value);document.documentElement.dataset.theme=value}
 async function save(){setBusy(true);try{await post('/api/actions',{action:'save_settings',settings:{exchange_rate:rate,receipt_footer:footer,theme}});await reload();alert('Settings saved.')}catch(e){alert(e.message)}finally{setBusy(false)}}
 async function factoryReset(){if(resetText!=='RESET COCKTAILLO'){alert('Type RESET COCKTAILLO exactly to confirm.');return}if(!confirm('This will permanently reset orders, receipts, shifts, expenses, reservations and stock quantities. Menu, recipes, tables, settings and your manager account will be preserved. Continue?'))return;setBusy(true);try{await post('/api/actions',{action:'factory_reset',confirmation:resetText});setResetText('');await reload();alert('Factory reset completed.')}catch(e){alert(e.message)}finally{setBusy(false)}}
 return <><PageHeader title="Settings" sub="Business configuration, appearance and protected system reset."/>
 <div className="card" style={{maxWidth:820}}><h3 style={{marginTop:0}}>General</h3><div className="formGrid"><Input label="USD / LBP exchange rate" value={rate} onChange={setRate}/><Input label="Receipt footer" value={footer} onChange={setFooter}/></div>
 <div className="section"><div className="field"><label>Appearance</label><div className="themeChooser"><button type="button" className={`themeChoice ${theme==='light'?'active':''}`} onClick={()=>previewTheme('light')}><span className="themeSwatch lightSwatch"/>Light mode</button><button type="button" className={`themeChoice ${theme==='dark'?'active':''}`} onClick={()=>previewTheme('dark')}><span className="themeSwatch darkSwatch"/>Dark mode</button></div></div></div>
 <button disabled={busy} className="btn btnPrimary section" onClick={save}>Save settings</button></div>
 <div className="card dangerZone section" style={{maxWidth:820}}><h3>Factory Reset</h3><p>Resets transactional data to zero: orders, receipts, shifts, tickets, expenses, reservations, audit history and current stock quantities. It preserves the menu catalog, recipes, table setup, business settings and your current Manager account.</p><div className="field"><label>Type RESET COCKTAILLO to confirm</label><input className="input" value={resetText} onChange={e=>setResetText(e.target.value)} placeholder="RESET COCKTAILLO" autoComplete="off"/></div><button disabled={busy||resetText!=='RESET COCKTAILLO'} className="btn btnDanger" style={{marginTop:12}} onClick={factoryReset}>Factory Reset System</button></div></>
}
