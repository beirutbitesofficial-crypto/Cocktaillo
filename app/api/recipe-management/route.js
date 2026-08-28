import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { mutateState } from '../../../lib/store.js';
import { ensureDefaultRecipes } from '../../../lib/recipe-templates.js';

export async function POST(request){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'manager','cashier'))return NextResponse.json({error:'Manager or cashier required.'},{status:403});
  const body=await request.json().catch(()=>({}));
  try{
    const result=await mutateState(state=>{
      if(body.action==='save_recipe'){
        const menuItem=state.menu.find(x=>x.id===body.menu_item_id);
        if(!menuItem)throw new Error('Menu item not found.');
        const lines=(Array.isArray(body.lines)?body.lines:[])
          .map(line=>({inventory_id:String(line.inventory_id||''),quantity:Number(line.quantity||0)}))
          .filter(line=>state.inventory.some(i=>i.id===line.inventory_id)&&Number.isFinite(line.quantity)&&line.quantity>0);
        if(!lines.length)throw new Error('Add at least one valid stock component to the recipe.');
        let recipe=state.recipes.find(r=>r.menu_item_id===menuItem.id);
        if(!recipe){recipe={id:`recipe-${crypto.randomUUID()}`,menu_item_id:menuItem.id,lines:[]};state.recipes.push(recipe)}
        recipe.lines=lines;
        recipe.auto_template=false;
        recipe.updated_at=new Date().toISOString();
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'recipe_saved',item_id:menuItem.id,user:user.name,at:recipe.updated_at});
        return {recipe};
      }
      if(body.action==='restore_starter_recipe'){
        const menuItem=state.menu.find(x=>x.id===body.menu_item_id);
        if(!menuItem)throw new Error('Menu item not found.');
        state.recipes=state.recipes.filter(r=>r.menu_item_id!==menuItem.id);
        ensureDefaultRecipes(state);
        const recipe=state.recipes.find(r=>r.menu_item_id===menuItem.id);
        state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'recipe_template_restored',item_id:menuItem.id,user:user.name,at:new Date().toISOString()});
        return {recipe};
      }
      throw new Error('Unknown recipe action.');
    });
    return NextResponse.json(result);
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Recipe action failed.'},{status:400});
  }
}
