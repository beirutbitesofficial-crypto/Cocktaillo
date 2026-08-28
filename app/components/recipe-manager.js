'use client';
import { useMemo, useState } from 'react';
import { Input, PageHeader, post } from './ui.js';

export default function RecipeManager({data,reload}){
  const menuItems=data.menu_all||data.menu||[];
  const[menuId,setMenuId]=useState(menuItems[0]?.id||'');
  const[lines,setLines]=useState(()=>data.recipes?.find(r=>r.menu_item_id===menuItems[0]?.id)?.lines?.map(x=>({...x}))||[]);
  const[selected,setSelected]=useState('');
  const[qty,setQty]=useState('');
  const[query,setQuery]=useState('');
  const[saving,setSaving]=useState(false);
  const existing=useMemo(()=>data.recipes?.find(r=>r.menu_item_id===menuId),[data.recipes,menuId]);
  const menu=menuItems.find(i=>i.id===menuId);
  const filtered=menuItems.filter(item=>!query.trim()||[item.name_en,item.name_ar,item.category,item.subcategory].some(v=>String(v||'').toLowerCase().includes(query.trim().toLowerCase())));
  const covered=menuItems.filter(item=>(data.recipes||[]).some(recipe=>recipe.menu_item_id===item.id&&(recipe.lines||[]).length)).length;

  function loadExisting(id){
    setMenuId(id);
    const recipe=data.recipes?.find(x=>x.menu_item_id===id);
    setLines((recipe?.lines||[]).map(x=>({...x})));
  }
  function addLine(){
    if(!selected||Number(qty)<=0)return;
    const same=lines.find(x=>x.inventory_id===selected);
    setLines(same?lines.map(x=>x.inventory_id===selected?{...x,quantity:Number(qty)}:x):[...lines,{inventory_id:selected,quantity:Number(qty)}]);
    setSelected('');setQty('');
  }
  async function save(){
    if(saving)return;
    try{
      setSaving(true);
      await post('/api/recipe-management',{action:'save_recipe',menu_item_id:menuId,lines});
      await reload();
      alert('Recipe saved. Future sales will deduct these exact quantities from stock.');
    }catch(e){alert(e.message)}finally{setSaving(false)}
  }
  async function restoreStarter(){
    if(!menuId||!confirm('Restore the automatic starter recipe for this item? Your manual recipe will be replaced.'))return;
    try{
      setSaving(true);
      const out=await post('/api/recipe-management',{action:'restore_starter_recipe',menu_item_id:menuId});
      setLines((out.recipe?.lines||[]).map(x=>({...x})));
      await reload();
    }catch(e){alert(e.message)}finally{setSaving(false)}
  }

  return <>
    <PageHeader title="Recipes / Stock Consumption" sub="Define exactly what stock each sold item consumes. Starter recipes are created for the full menu and can be edited per item."/>
    <div className="cards">
      <div className="card stat"><label>Recipe coverage</label><strong>{covered} / {menuItems.length}</strong></div>
      <div className="card stat"><label>Selected item</label><strong style={{fontSize:18}}>{menu?.name_en||'—'}</strong></div>
    </div>
    <div className="card section">
      <Input label="Search menu item" value={query} onChange={setQuery} placeholder="Hookah, crepe, juice, coffee..."/>
      <div className="field" style={{marginTop:10}}><label>Menu item</label><select className="input" value={menuId} onChange={e=>loadExisting(e.target.value)}>{filtered.map(i=><option key={i.id} value={i.id}>{i.name_en} — {i.category}{i.subcategory?` / ${i.subcategory}`:''}</option>)}</select></div>
      {existing?.auto_template&&<small style={{display:'block',marginTop:8,color:'var(--muted)'}}>Starter recipe — review the quantities and save once to make it your custom recipe.</small>}
      {!existing?.auto_template&&existing&&<small style={{display:'block',marginTop:8,color:'var(--muted)'}}>Custom recipe — automatic templates will not overwrite it.</small>}
    </div>
    <div className="card section formGrid">
      <div className="field"><label>Stock component</label><select className="input" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose inventory item…</option>{(data.inventory||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).map(i=><option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select></div>
      <div className="field"><label>Quantity used per sold item</label><input className="input" inputMode="decimal" value={qty} onChange={e=>setQty(e.target.value)} placeholder="e.g. 120"/></div>
      <button className="btn btnSoft" onClick={addLine}>Add / update component</button>
    </div>
    <div className="card section">
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{marginBottom:3}}>{menu?.name_en||'Recipe'}</h2><small style={{color:'var(--muted)'}}>{menu?.name_ar||''}</small></div>{menu?.category==='Hookah'&&<span className="pill">Default: 120g molasses + 4 charcoal</span>}</div>
      <div className="list" style={{marginTop:12}}>{lines.map(line=>{const inv=data.inventory?.find(i=>i.id===line.inventory_id);return <div className="listRow" key={line.inventory_id}><div className="grow"><strong>{inv?.name||'Inventory item'}</strong><small style={{display:'block',color:'var(--muted)'}}>{line.quantity} {inv?.unit||''} deducted per sold {menu?.name_en||'item'}</small></div><button className="btn btnDanger" onClick={()=>setLines(lines.filter(x=>x.inventory_id!==line.inventory_id))}>Remove</button></div>})}{!lines.length&&<p style={{color:'var(--muted)'}}>No stock components linked yet.</p>}</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="btn btnPrimary" disabled={saving||!menuId} onClick={save}>{saving?'Saving…':'Save custom recipe'}</button><button className="btn btnSoft" disabled={saving||!menuId} onClick={restoreStarter}>Restore starter recipe</button></div>
    </div>
  </>;
}
