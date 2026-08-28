import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { mutateState } from '../../../lib/store.js';
import { ensureDefaultRecipes } from '../../../lib/recipe-templates.js';

const menuKey=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const b=await request.json().catch(()=>({}));
  try{
    const data=await mutateState(state=>{
      const now=new Date().toISOString();
      state.deleted_website_menu_names=Array.isArray(state.deleted_website_menu_names)?state.deleted_website_menu_names:[];
      if(b.action==='save_menu_item'){
        if(!allow(user,'manager','cashier'))throw new Error('Manager or cashier required.');
        const input=b.item||{};
        let item=input.id?state.menu.find(x=>x.id===input.id&&!x.deleted):null;
        if(!input.name_en||!input.name_ar||!input.category)throw new Error('English name, Arabic name and category are required.');
        if(!state.categories.includes(input.category))state.categories.push(input.category);
        if(input.subcategory&&!state.subcategories.includes(input.subcategory))state.subcategories.push(input.subcategory);
        if(!item){item={id:`item-${crypto.randomUUID()}`,sort_order:state.menu.length+1};state.menu.push(item)}
        const station=input.category==='Hookah'?'hookah':['bar','kitchen','service'].includes(input.station)?input.station:'bar';
        Object.assign(item,{
          name_en:String(input.name_en).trim(),
          name_ar:String(input.name_ar).trim(),
          category:String(input.category),
          subcategory:String(input.subcategory||''),
          price_cents:Math.round(Number(input.price_usd||0)*100),
          station,
          allow_addons:Boolean(input.allow_addons),
          available:input.available!==false,
          deleted:false,
          sort_order:Number(input.sort_order||item.sort_order||1)
        });
        const key=menuKey(item.name_en);
        state.deleted_website_menu_names=state.deleted_website_menu_names.filter(x=>x!==key);
        ensureDefaultRecipes(state);
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'menu_item_saved',item_id:item.id,user:user.name,at:now});
        return {item};
      }
      if(b.action==='delete_menu_item'){
        if(!allow(user,'manager'))throw new Error('Manager only.');
        const item=state.menu.find(x=>x.id===b.id&&!x.deleted);
        if(!item)throw new Error('Menu item not found.');
        const key=menuKey(item.name_en);
        if(key&&!state.deleted_website_menu_names.includes(key))state.deleted_website_menu_names.push(key);
        item.deleted=true;
        item.available=false;
        item.deleted_at=now;
        item.deleted_by=user.name;
        state.recipes=(state.recipes||[]).filter(r=>r.menu_item_id!==item.id);
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'menu_item_deleted',item_id:item.id,item_name:item.name_en,user:user.name,at:now});
        return {ok:true,id:item.id};
      }
      throw new Error('Unknown menu action.');
    });
    return NextResponse.json(data);
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Menu action failed.'},{status:400});
  }
}
