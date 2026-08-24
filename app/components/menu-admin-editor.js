'use client';
import {useState} from 'react';
import {Input,PageHeader,post,usd} from './ui.js';

const blank=(data)=>({name_en:'',name_ar:'',category:data.categories?.[0]||'Dessert',subcategory:data.subcategories?.[0]||'',price_usd:'',station:'bar',allow_addons:false,available:true});

export default function MenuAdminEditor({data,reload}){
  const[item,setItem]=useState(()=>blank(data));
  const editing=Boolean(item.id);

  function startEdit(i){
    setItem({
      id:i.id,
      name_en:i.name_en||'',
      name_ar:i.name_ar||'',
      category:i.category||data.categories?.[0]||'Dessert',
      subcategory:i.subcategory||'',
      price_usd:(Number(i.price_cents||0)/100).toFixed(2),
      station:i.station==='kitchen'?'kitchen':'bar',
      allow_addons:Boolean(i.allow_addons),
      available:i.available!==false,
      sort_order:i.sort_order,
    });
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function cancel(){setItem(blank(data))}

  async function save(){
    const price=Number(item.price_usd);
    if(!item.name_en.trim()||!item.name_ar.trim()){alert('English and Arabic names are required.');return}
    if(!Number.isFinite(price)||price<0){alert('Enter a valid price.');return}
    try{
      await post('/api/admin',{action:'save_menu_item',item});
      setItem(blank(data));
      await reload();
      alert(editing?'Menu item updated successfully.':'Menu item added successfully.');
    }catch(e){alert(e.message)}
  }

  return <>
    <PageHeader title="Menu Management" sub="Add new items or edit existing menu items, including price."/>
    <div className="card formGrid">
      <Input label="English name" value={item.name_en} onChange={v=>setItem({...item,name_en:v})}/>
      <Input label="Arabic name" value={item.name_ar} onChange={v=>setItem({...item,name_ar:v})}/>
      <select className="input" value={item.category} onChange={e=>setItem({...item,category:e.target.value})}>{data.categories.map(c=><option key={c}>{c}</option>)}</select>
      <select className="input" value={item.subcategory} onChange={e=>setItem({...item,subcategory:e.target.value})}>{(data.subcategories||[]).map(c=><option key={c}>{c}</option>)}</select>
      <Input label="Price USD" value={item.price_usd} onChange={v=>setItem({...item,price_usd:v})}/>
      <select className="input" value={item.station} onChange={e=>setItem({...item,station:e.target.value})}><option value="bar">Bar</option><option value="kitchen">Kitchen</option></select>
      <button className="btn btnSoft" onClick={()=>setItem({...item,allow_addons:!item.allow_addons})}>Add-ons: {item.allow_addons?'Enabled':'Disabled'}</button>
      <button className="btn btnSoft" onClick={()=>setItem({...item,available:!item.available})}>Availability: {item.available?'Available':'Unavailable'}</button>
      <button className="btn btnPrimary" onClick={save}>{editing?'Save changes':'Add menu item'}</button>
      {editing&&<button className="btn btnSoft" onClick={cancel}>Cancel edit</button>}
    </div>
    <div className="menuGrid section">{data.menu.map(i=><div className="menuItem" key={i.id} style={{cursor:'default'}}><strong>{i.name_en}</strong><small>{i.name_ar}</small><small>{i.category}{i.subcategory?` › ${i.subcategory}`:''}</small><b>{usd(i.price_cents)}</b><button className="btn btnSoft" style={{marginTop:8,width:'100%'}} onClick={()=>startEdit(i)}>Edit</button></div>)}</div>
  </>
}
