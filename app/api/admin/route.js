import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { mutateState } from '../../../lib/store.js';

export async function POST(request){
 const user=await getUser();if(!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
 const b=await request.json().catch(()=>({}));
 try{const data=await mutateState(state=>{
  const now=new Date().toISOString();
  if(b.action==='add_category'){
    const name=String(b.name||'').trim();if(!name)throw new Error('Category name required.');if(!state.categories.includes(name))state.categories.push(name);return {categories:state.categories};
  }
  if(b.action==='save_menu_item'){
    const input=b.item||{};let item=input.id?state.menu.find(x=>x.id===input.id):null;
    if(!input.name_en||!input.name_ar||!input.category)throw new Error('English name, Arabic name and category are required.');
    if(!state.categories.includes(input.category))state.categories.push(input.category);
    if(!item){item={id:`item-${crypto.randomUUID()}`,sort_order:state.menu.length+1};state.menu.push(item)}
    Object.assign(item,{name_en:String(input.name_en).trim(),name_ar:String(input.name_ar).trim(),category:input.category,price_cents:Math.round(Number(input.price_usd||0)*100),station:input.station==='kitchen'?'kitchen':'bar',allow_addons:Boolean(input.allow_addons),available:input.available!==false,sort_order:Number(input.sort_order||item.sort_order||1)});return {item};
  }
  if(b.action==='toggle_menu_item'){
    const item=state.menu.find(x=>x.id===b.id);if(!item)throw new Error('Menu item not found.');item.available=!item.available;return {item};
  }
  if(b.action==='save_addon'){
    const input=b.addon||{};let addon=input.id?state.addons.find(x=>x.id===input.id):null;if(!input.name_en||!input.name_ar)throw new Error('Add-on names required.');if(!addon){addon={id:`addon-${crypto.randomUUID()}`};state.addons.push(addon)}Object.assign(addon,{name_en:String(input.name_en).trim(),name_ar:String(input.name_ar).trim(),price_lbp:Math.round(Number(input.price_lbp||0)),available:input.available!==false});return {addon};
  }
  if(b.action==='save_inventory'){
    const input=b.item||{};let item=input.id?state.inventory.find(x=>x.id===input.id):null;if(!input.name)throw new Error('Inventory item name required.');if(!item){item={id:`inv-${crypto.randomUUID()}`,created_at:now};state.inventory.push(item)}Object.assign(item,{name:String(input.name).trim(),category:input.category||'General',quantity:Number(input.quantity||0),unit:input.unit||'pcs',minimum:Number(input.minimum||0),unit_cost:Number(input.unit_cost||0),updated_at:now});return {item};
  }
  if(b.action==='adjust_inventory'){
    const item=state.inventory.find(x=>x.id===b.id);if(!item)throw new Error('Inventory item not found.');const delta=Number(b.delta||0);item.quantity=Number(item.quantity||0)+delta;item.updated_at=now;state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'inventory_adjustment',item_id:item.id,delta,reason:b.reason||'',user:user.name,at:now});return {item};
  }
  if(b.action==='save_recipe'){
    const menuItem=state.menu.find(x=>x.id===b.menu_item_id);if(!menuItem)throw new Error('Menu item not found.');const lines=(Array.isArray(b.lines)?b.lines:[]).map(line=>({inventory_id:line.inventory_id,quantity:Number(line.quantity||0)})).filter(line=>state.inventory.some(i=>i.id===line.inventory_id)&&line.quantity>0);let recipe=state.recipes.find(r=>r.menu_item_id===menuItem.id);if(!recipe){recipe={id:`recipe-${crypto.randomUUID()}`,menu_item_id:menuItem.id,lines:[]};state.recipes.push(recipe)}recipe.lines=lines;recipe.updated_at=now;return {recipe};
  }
  if(b.action==='save_reservation'){
    const r={id:`res-${crypto.randomUUID()}`,table_id:b.table_id,name:b.name||'',phone:b.phone||'',guests:Number(b.guests||1),date_time:b.date_time||now,notes:b.notes||'',status:'reserved',created_by:user.name,created_at:now};state.reservations.push(r);return {reservation:r};
  }
  if(b.action==='set_user_active'){
    const target=state.users.find(x=>x.id===b.id);if(!target)throw new Error('User not found.');if(target.id===user.id&&b.active===false)throw new Error('You cannot deactivate your own account.');target.active=Boolean(b.active);return {id:target.id,active:target.active};
  }
  throw new Error('Unknown manager action.');
 });return NextResponse.json(data)}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Manager action failed.'},{status:400})}
}
