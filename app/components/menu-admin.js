'use client';
import {useState} from 'react';
import {Input,PageHeader,post,usd} from './ui.js';

export default function MenuAdmin({data,reload}){
  const empty={name_en:'',name_ar:'',category:data.categories?.[0]||'Dessert',subcategory:data.subcategories?.[0]||'Crepe',price_usd:'',station:'bar',allow_addons:false,available:true};
  const[item,setItem]=useState(empty);
  const[query,setQuery]=useState('');
  const[selectedCategory,setSelectedCategory]=useState('all');
  const[selectedSubcategory,setSelectedSubcategory]=useState('all');
  const[newCategory,setNewCategory]=useState('');
  const[syncing,setSyncing]=useState(false);
  const[saving,setSaving]=useState(false);
  const editing=Boolean(item.id);
  const isManager=data.user?.role==='manager';
  const search=query.trim().toLowerCase();
  const rawMenu=[...(data.menu_all||data.menu||[])];
  const categoryOrder=new Map((data.categories||[]).map((name,index)=>[String(name),index]));
  const websiteOrder=(a,b)=>Number(Boolean(b.best_seller))-Number(Boolean(a.best_seller))||
    (categoryOrder.get(String(a.category))??9999)-(categoryOrder.get(String(b.category))??9999)||
    Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.name_en||'').localeCompare(String(b.name_en||''));
  const orderedMenu=[...rawMenu].sort(websiteOrder);
  const categoryNames=[
    ...(data.categories||[]).filter(category=>orderedMenu.some(i=>String(i.category)===String(category))),
    ...Array.from(new Set(orderedMenu.map(i=>String(i.category||'Menu')))).filter(category=>!(data.categories||[]).includes(category))
  ];
  const categoryMenu=selectedCategory==='all'?orderedMenu:orderedMenu.filter(i=>String(i.category)===selectedCategory);
  const subcategoryNames=selectedCategory==='all'?[]:Array.from(new Set(
    categoryMenu.map(i=>String(i.subcategory||'').trim()).filter(Boolean)
  ));
  const menuItems=categoryMenu
    .filter(i=>selectedSubcategory==='all'||String(i.subcategory||'')===selectedSubcategory)
    .filter(i=>!search||[i.name_en,i.name_ar,i.category,i.subcategory].some(value=>String(value||'').toLowerCase().includes(search)));

  function selectCategory(category){
    setSelectedCategory(category);
    setSelectedSubcategory('all');
  }
  function edit(i){
    setItem({
      id:i.id,
      name_en:i.name_en||'',
      name_ar:i.name_ar||'',
      category:i.category||data.categories?.[0]||'Dessert',
      subcategory:typeof i.subcategory==='string'?i.subcategory:'',
      price_usd:((Number(i.price_cents)||0)/100).toFixed(2),
      station:['bar','kitchen','service','hookah'].includes(i.station)?i.station:'bar',
      allow_addons:Boolean(i.allow_addons),
      available:i.available!==false,
      sort_order:i.sort_order
    });
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function cancel(){setItem(empty)}
  async function addCategory(){
    const name=newCategory.trim();
    if(!name)return alert('Enter a category name.');
    try{await post('/api/admin',{action:'add_category',name});setNewCategory('');setItem({...item,category:name});await reload()}catch(e){alert(e.message)}
  }
  async function saveItem(){
    if(saving)return;
    try{
      const price=Number(item.price_usd);
      if(!String(item.name_en||'').trim()||!String(item.name_ar||'').trim())throw new Error('English and Arabic names are required.');
      if(!Number.isFinite(price)||price<0)throw new Error('Enter a valid price.');
      setSaving(true);
      const result=await post('/api/menu-management',{action:'save_menu_item',item});
      if(editing&&String(result.item?.id||'')!==String(item.id))throw new Error('The edited menu item could not be confirmed. Please retry.');
      setItem(empty);
      await reload();
    }catch(e){alert(e.message)}finally{setSaving(false)}
  }
  async function deleteItem(i){
    if(!confirm(`Delete ${i.name_en} from the POS menu? This will also remove its recipe, but historical orders stay unchanged.`))return;
    try{await post('/api/menu-management',{action:'delete_menu_item',id:i.id});if(item.id===i.id)setItem(empty);await reload()}catch(e){alert(e.message)}
  }
  async function syncWebsite(){
    if(!isManager)return;
    setSyncing(true);
    try{const r=await fetch('/api/menu-sync',{method:'POST'});const out=await r.json();if(!r.ok)throw new Error(out.error||'Menu sync failed.');alert(`Website menu synced. Added ${out.added}, updated ${out.updated}${out.skipped?`, skipped ${out.skipped} deleted item(s)`:''}.`);await reload()}catch(e){alert(e.message)}finally{setSyncing(false)}
  }
  const filterRow={display:'flex',gap:8,overflowX:'auto',paddingBottom:4,WebkitOverflowScrolling:'touch'};
  const filterButton={whiteSpace:'nowrap',borderRadius:999,flex:'0 0 auto'};
  return <>
    <PageHeader title="Menu Management" sub="Website-matched category, subcategory and item order for fast POS ↔ website checking."/>
    {isManager&&<div className="card" style={{marginBottom:12}}><strong>Add Category</strong><small style={{display:'block',color:'var(--muted)',marginTop:4,marginBottom:10}}>Create a new category and use it immediately for menu items.</small><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}><div style={{minWidth:220,flex:'1 1 260px'}}><Input label="Category name" value={newCategory} onChange={setNewCategory}/></div><button className="btn btnPrimary" onClick={addCategory}>Add Category</button></div></div>}
    {isManager&&<div className="card" style={{marginBottom:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><div><strong>Website menu sync</strong><small style={{display:'block',color:'var(--muted)',marginTop:4}}>Import the same Cocktaillo website menu items and prices without deleting POS history. Items you delete in the POS stay deleted on future syncs.</small></div><button className="btn btnSoft" disabled={syncing} onClick={syncWebsite}>{syncing?'Syncing…':'Sync from website'}</button></div>}
    <div className="card formGrid">
      <Input label="English name" value={item.name_en} onChange={v=>setItem({...item,name_en:v})}/>
      <Input label="Arabic name" value={item.name_ar} onChange={v=>setItem({...item,name_ar:v})}/>
      <select className="input" value={item.category} onChange={e=>setItem({...item,category:e.target.value,station:e.target.value==='Hookah'?'hookah':item.station})}>{data.categories.map(c=><option key={c}>{c}</option>)}</select>
      <select className="input" value={item.subcategory} onChange={e=>setItem({...item,subcategory:e.target.value})}>{(data.subcategories||[]).map(c=><option key={c}>{c}</option>)}</select>
      <Input label="Price USD" type="number" value={item.price_usd} onChange={v=>setItem({...item,price_usd:v})}/>
      <div className="field"><label>Production route</label><select className="input" value={item.station} onChange={e=>setItem({...item,station:e.target.value})} disabled={item.category==='Hookah'}><option value="bar">Bar</option><option value="kitchen">Kitchen</option><option value="service">Service — no production ticket</option><option value="hookah">Hookah printer</option></select>{item.category==='Hookah'&&<small style={{display:'block',color:'var(--muted)',marginTop:4}}>Hookah always prints separately in Arabic on the Hookah printer and never on the Bar printer.</small>}</div>
      <button className="btn btnSoft" onClick={()=>setItem({...item,allow_addons:!item.allow_addons})}>Add-ons: {item.allow_addons?'Enabled':'Disabled'}</button>
      <button className="btn btnSoft" onClick={()=>setItem({...item,available:!item.available})}>Availability: {item.available?'Available':'Unavailable'}</button>
      <button className="btn btnPrimary" disabled={saving} onClick={saveItem}>{saving?'Saving…':editing?'Save changes':'Add menu item'}</button>
      {editing&&<button className="btn btnSoft" disabled={saving} onClick={cancel}>Cancel edit</button>}
    </div>
    <div className="card" style={{marginTop:12}}>
      <Input label="Search menu" value={query} onChange={setQuery} placeholder="Search by English/Arabic name, category or subcategory"/>
      <small style={{display:'block',color:'var(--muted)',marginTop:8}}>Website order is used below: main categories first, then each category's subcategories and menu items in the same sequence. ★ Best Seller follows the same priority as the website.</small>
    </div>
    <div className="card" style={{marginTop:12}}>
      <strong style={{display:'block',marginBottom:10}}>Main categories</strong>
      <div style={filterRow}>
        <button className={`btn ${selectedCategory==='all'?'btnPrimary':'btnSoft'}`} style={filterButton} onClick={()=>selectCategory('all')}>All</button>
        {categoryNames.map(category=><button key={category} className={`btn ${selectedCategory===category?'btnPrimary':'btnSoft'}`} style={filterButton} onClick={()=>selectCategory(category)}>{category}</button>)}
      </div>
      {selectedCategory!=='all'&&subcategoryNames.length>0&&<>
        <strong style={{display:'block',marginTop:16,marginBottom:10}}>Subcategories</strong>
        <div style={filterRow}>
          <button className={`btn ${selectedSubcategory==='all'?'btnPrimary':'btnSoft'}`} style={filterButton} onClick={()=>setSelectedSubcategory('all')}>All</button>
          {subcategoryNames.map(subcategory=><button key={subcategory} className={`btn ${selectedSubcategory===subcategory?'btnPrimary':'btnSoft'}`} style={filterButton} onClick={()=>setSelectedSubcategory(subcategory)}>{subcategory}</button>)}
        </div>
      </>}
      <small style={{display:'block',color:'var(--muted)',marginTop:12}}>{menuItems.length} item{menuItems.length===1?'':'s'} shown · same browsing order as the website</small>
    </div>
    <div className="menuGrid section">{menuItems.map((i,index)=><div className="menuItem" key={i.id} style={{position:'relative',opacity:i.available===false?.65:1}}>{i.best_seller&&<span className="pill" style={{position:'absolute',top:8,right:8}}>★ BEST SELLER</span>}<small style={{fontWeight:700,color:'var(--muted)'}}>#{index+1}</small><strong>{i.name_en}</strong><small>{i.name_ar}</small><small>{i.category} › {i.subcategory}</small><small>{i.available===false?'Unavailable':'Available'} · {i.station==='service'?'Service':i.station==='hookah'?'Hookah':i.station==='kitchen'?'Kitchen':'Bar'}</small><small>{Number(i.units_sold||0)} sold in paid orders</small><b>{usd(i.price_cents)}</b><button className="btn btnSoft" style={{width:'100%',marginTop:8}} onClick={()=>edit(i)}>Edit item</button>{isManager&&<button className="btn btnDanger" style={{width:'100%',marginTop:6}} onClick={()=>deleteItem(i)}>Delete item</button>}</div>)}</div>
    {!menuItems.length&&<div className="card" style={{marginTop:12,textAlign:'center',color:'var(--muted)'}}>No menu items match the selected website section{query?` and “${query}”`:''}.</div>}
  </>;
}
