import { beverageCategories, beverageSubcategories } from './beverage-seed.js';
import { dessertSubcategories } from './dessert-seed.js';
import { foodCategories, foodSubcategories } from './food-seed.js';

const BASE_CATEGORIES=[...foodCategories,'Dessert',...beverageCategories,'Salads','Hookah'];
const DESSERT_SUBS=new Map(dessertSubcategories.map(name=>[key(name),name]));
DESSERT_SUBS.set('pancakes','Pancake');
const COLD_SUBS=new Map([
  ['fresh juices','Fresh Juices'],
  ['fresh juice','Fresh Juices'],
  ['frappe','Frappe'],
  ['shakes','Shakes'],
  ['shake','Shakes'],
  ['iced coffee','Iced Coffee'],
  ['mojito','Mojito'],
  ['mocktaillo','Mocktaillo'],
  ['soft drinks','Soft Drinks'],
  ['soft drink','Soft Drinks'],
  ['bottle juices','Bottle Juices'],
  ['bottle juice','Bottle Juices'],
  ['bottled juices','Bottle Juices'],
  ['bottled juice','Bottle Juices'],
  ['bottel juices','Bottle Juices'],
  ['bottel juice','Bottle Juices']
]);
const BOTTLE_KEYS=new Set(['bottle juices','bottle juice','bottled juices','bottled juice','bottel juices','bottel juice']);
// Website food categories ("Burgers (beef)", "platters"…) are sections of the one Food category.
const FOOD_SECTIONS=new Map([['sandwiches','Sandwiches'],['sandwich','Sandwiches'],['burgers beef','Beef Burgers'],['burger beef','Beef Burgers'],['beef burgers','Beef Burgers'],['beef burger','Beef Burgers'],['burgers chicken','Chicken Burgers'],['burger chicken','Chicken Burgers'],['chicken burgers','Chicken Burgers'],['chicken burger','Chicken Burgers'],['pasta','Pasta'],['platters','Platters'],['platter','Platters'],['plates','Platters'],['appetizers','Appetizers'],['appetizer','Appetizers'],['starters','Appetizers']]);
const SIGNATURE_SALAD_KEYS=new Set(['signature salad','signature salads']);
const ADDON_SUBCATEGORIES=new Set(['Crepe','Waffle','Pancake']);

function key(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function englishLabel(value){return String(value||'').split('/')[0].trim()}
function cleanSubcategory(value){
  const raw=String(value||'').split('>').pop().trim();
  const k=key(raw);
  return DESSERT_SUBS.get(k)||COLD_SUBS.get(k)||raw;
}

export function normalizeMenuLocation(category,subcategory=''){
  const rawCategory=String(category||'').trim();
  const pathParts=rawCategory.split('>').map(part=>part.trim()).filter(Boolean);
  const parentRaw=englishLabel(pathParts[0]||rawCategory);
  const impliedSub=pathParts.length>1?cleanSubcategory(pathParts[pathParts.length-1]):'';
  const parentKey=key(parentRaw);
  let normalizedCategory=parentRaw;
  let normalizedSubcategory=impliedSub||cleanSubcategory(subcategory);

  if(FOOD_SECTIONS.has(parentKey)){normalizedCategory='Food';normalizedSubcategory=FOOD_SECTIONS.get(parentKey)}
  else if(parentKey==='food'&&FOOD_SECTIONS.has(key(normalizedSubcategory)))normalizedSubcategory=FOOD_SECTIONS.get(key(normalizedSubcategory));
  else if(SIGNATURE_SALAD_KEYS.has(parentKey)){normalizedCategory='Salads';normalizedSubcategory='Signature Salad'}
  else if(parentKey==='dessert'||parentKey==='desserts')normalizedCategory='Dessert';
  else if(parentKey==='cold beverage'||parentKey==='cold beverages')normalizedCategory='Cold Beverage';
  else if(parentKey==='cocktail'||parentKey==='cocktails')normalizedCategory='Cocktail';
  else if(parentKey==='hot beverage'||parentKey==='hot beverages')normalizedCategory='Hot Beverage';
  else if(parentKey==='salad'||parentKey==='salads')normalizedCategory='Salads';
  else if(parentKey==='hookah'||parentKey==='shisha')normalizedCategory='Hookah';
  else if(BOTTLE_KEYS.has(parentKey)){
    normalizedCategory='Cold Beverage';
    normalizedSubcategory='Bottle Juices';
  }else if(DESSERT_SUBS.has(parentKey)){
    normalizedCategory='Dessert';
    normalizedSubcategory=DESSERT_SUBS.get(parentKey);
  }else if(COLD_SUBS.has(parentKey)){
    normalizedCategory='Cold Beverage';
    normalizedSubcategory=COLD_SUBS.get(parentKey);
  }

  if(normalizedCategory==='Cold Beverage'&&BOTTLE_KEYS.has(key(parentRaw)))normalizedSubcategory='Bottle Juices';
  if(normalizedCategory==='Cold Beverage'&&key(normalizedSubcategory)==='cocktail'){
    normalizedCategory='Cocktail';
    normalizedSubcategory='Cocktail';
  }
  if(normalizedCategory==='Cocktail'&&!normalizedSubcategory)normalizedSubcategory='Cocktail';
  return {category:normalizedCategory||'Menu',subcategory:normalizedSubcategory||''};
}

export function cleanupMenuTaxonomy(state){
  state.menu=Array.isArray(state.menu)?state.menu:[];
  for(const item of state.menu){
    const location=normalizeMenuLocation(item.category,item.subcategory);
    if(location.category==='Food'&&item.category!=='Food')item.station='kitchen';
    item.category=location.category;
    item.subcategory=location.subcategory;
    if(item.category==='Dessert'&&ADDON_SUBCATEGORIES.has(item.subcategory))item.allow_addons=true;
    if(item.category==='Hookah'&&!item.deleted)item.station='hookah';
  }

  const activeItems=state.menu.filter(item=>!item.deleted);
  const usedCategories=Array.from(new Set(activeItems.map(item=>String(item.category||'').trim()).filter(Boolean)));
  const customCategories=usedCategories.filter(name=>!BASE_CATEGORIES.includes(name));
  state.categories=Array.from(new Set([...BASE_CATEGORIES,...customCategories]));

  const usedSubcategories=Array.from(new Set(activeItems.map(item=>String(item.subcategory||'').trim()).filter(Boolean)));
  state.subcategories=Array.from(new Set([...dessertSubcategories,...beverageSubcategories,'Bottle Juices',...foodSubcategories,...usedSubcategories]));
  return state;
}
