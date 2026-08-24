'use client';
import {useState} from 'react';
import {Input,PageHeader,post,usd} from './ui.js';

export default function MenuAdmin({data,reload}){
  const empty={name_en:'',name_ar:'',category:'Dessert',subcategory:data.subcategories?.[0]||'Crepe',price_usd:'',station:'bar',allow_addons:false,available:true,best_seller:false};
  const[item,setItem]=useState(empty);
  const[syncing,setSyncing]=useState(false);
  const editing=Boolean(item.id);
  const isManager=data.user?.role==='manager';
  function edit(i){setItem({...i,price_usd:((Number(i.price_cents)||0)/100).toFixed(2),available:i.available!==false,best_seller:Boolean(i.best_seller)})}
  function cancel(){setItem(empty)}
  async function saveItem(){
    try{
      const price=Number(item.price_usd);
      if(!Number.isFinite(price)||price<0)throw new Error('Enter a valid price.');
      await post('/api/menu-management',{action:'save_menu_item',item});
      setItem(empty);
      await reload();
    }catch(e){alert(e.message)}
  }
  async function deleteItem(i){
    if(!confirm(`Delete ${i.name_en} from the POS menu? This will also remove its recipe, but historical orders stay unchanged.`))return;
    try{await post('/api/menu-management',{action:'delete_menu_item',id:i.id});if(item.id===i.id)setItem(empty);await reload()}catch(e){alert(e.message)}
  }
  async function syncWebsite(){
    if(!isManager)return;
    setSyncing(true);
    try{const r=await fetch('/api/menu-sync',{method:'POST'});const out=await r.json();if(!r.ok)throw new Error(out.error||'Menu sync failed.');alert(`Website menu synced. Added ${out.added}, updated ${out.updated}.`);await reload()}catch(e){alert(e.message)}finally{setSyncing(false)}
  }
  return <>
    <PageHeader title="Menu Management" sub="Add, edit, mark best sellers, sync website items and delete POS menu items."/>
    {isManager&&<div className="card" style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong>Website menu sync</strong><small style={{display:'block',color:'var(--muted)',marginTop:4}}>Import the same Cocktaillo website menu items and prices without deleting POS history.</small></div><button className="btn btnSoft" disabled={syncing} onClick={syncWebsite}>{syncing?'Syncing…':'Sync from website'}</button></div>}
    <div className="card formGrid">
      <Input label="English name" value={item.name_en} onChange={v=>setItem({...item,name_en:v})}/>
      <Input label="Arabic name" value={item.name_ar} onChange={v=>setItem({...item,name_ar:v})}/>
      <select className="input" value={item.category} onChange={e=>setItem({...item,category:e.target.value})}>{data.categories.map(c=><option key={c}>{c}</option>)}</select>
      <select className="input" value={item.subcategory} onChange={e=>setItem({...item,subcategory:e.target.value})}>{(data.subcategories||[]).map(c=><option key={c}>{c}</option>)}</select>
      <Input label="Price USD" type="number" value={item.price_usd} onChange={v=>setItem({...item,price_usd:v})}/>
      <select className="input" value={item.station} onChange={e=>setItem({...item,station:e.target.value})}><option value="bar">Bar</option><option value="kitchen">Kitchen</option></select>
      <button className="btn btnSoft" onClick={()=>setItem({...item,allow_addons:!item.allow_addons})}>Add-ons: {item.allow_addons?'Enabled':'Disabled'}</button>
      <button className="btn btnSoft" onClick={()=>setItem({...item,available:!item.available})}>Availability: {item.available?'Available':'Unavailable'}</button>
      <button className="btn btnSoft" onClick={()=>setItem({...item,best_seller:!item.best_seller})}>★ Best Seller: {item.best_seller?'Yes':'No'}</button>
      <button className="btn btnPrimary" onClick={saveItem}>{editing?'Save changes':'Add menu item'}</button>
      {editing&&<button className="btn btnSoft" onClick={cancel}>Cancel edit</button>}
    </div>
    <div className="menuGrid section">{data.menu.map(i=><div className="menuItem" key={i.id} style={{position:'relative'}}>{i.best_seller&&<span className="pill" style={{position:'absolute',top:8,right:8}}>★ BEST SELLER</span>}<strong>{i.name_en}</strong><small>{i.name_ar}</small><small>{i.category} › {i.subcategory}</small><b>{usd(i.price_cents)}</b><button className="btn btnSoft" style={{width:'100%',marginTop:8}} onClick={()=>edit(i)}>Edit item</button>{isManager&&<button className="btn btnDanger" style={{width:'100%',marginTop:6}} onClick={()=>deleteItem(i)}>Delete item</button>}</div>)}</div>
  </>;
}
