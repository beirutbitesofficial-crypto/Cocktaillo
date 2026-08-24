import { NextResponse } from 'next/server';
import { getUser, allow } from '../../../lib/auth.js';
import { mutateState } from '../../../lib/store.js';
import { fetchCocktailloWebsiteMenu, mergeCocktailloWebsiteMenu, COCKTAILLO_MENU_SOURCE } from '../../../lib/alqaima-menu.js';

async function syncMenu(){
  const user=await getUser();
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  if(!allow(user,'manager'))return NextResponse.json({error:'Manager only.'},{status:403});
  try{
    const items=await fetchCocktailloWebsiteMenu();
    if(!items.length)throw new Error('No Cocktaillo menu items were found at the website source.');
    const result=await mutateState(state=>{
      const merged=mergeCocktailloWebsiteMenu(state,items);
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'website_menu_synced',source:COCKTAILLO_MENU_SOURCE,added:merged.added,updated:merged.updated,total:merged.total,user:user.name,at:new Date().toISOString()});
      return merged;
    });
    return NextResponse.json({ok:true,source:COCKTAILLO_MENU_SOURCE,...result});
  }catch(e){
    return NextResponse.json({error:e instanceof Error?e.message:'Menu sync failed.'},{status:400});
  }
}

export async function POST(){return syncMenu()}
export async function GET(){return syncMenu()}
