import * as cheerio from 'cheerio';

export const COCKTAILLO_MENU_SOURCE='https://alqaima.com/menu/cocktaillo-resto-cafe/en';

const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const money=text=>{const m=String(text||'').match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);return m?Number(m[1]):null};

function walkJson(value,out){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const v of value)walkJson(v,out);return}
  const obj=value;
  const name=typeof obj.name==='string'?clean(obj.name):'';
  const raw=obj.price??obj.priceUSD??obj.price_usd;
  const price=typeof raw==='number'?raw:typeof raw==='string'?Number(raw.replace(/[^0-9.]/g,'')):NaN;
  if(name&&Number.isFinite(price)&&price>=0){
    const c=obj.category;
    const category=typeof c==='string'?clean(c):(c&&typeof c.name==='string'?clean(c.name):'Menu');
    const description=typeof obj.description==='string'?clean(obj.description):'';
    const imageUrl=typeof obj.image==='string'?obj.image:(typeof obj.imageUrl==='string'?obj.imageUrl:'');
    out.push({name,description,price,imageUrl,category:category||'Menu'});
  }
  for(const v of Object.values(obj))walkJson(v,out);
}

export async function fetchCocktailloWebsiteMenu(url=COCKTAILLO_MENU_SOURCE){
  const res=await fetch(url,{headers:{
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language':'en-US,en;q=0.9',
    'cache-control':'no-cache',
    'pragma':'no-cache',
    'referer':'https://alqaima.com/',
    'upgrade-insecure-requests':'1'
  },cache:'no-store',redirect:'follow'});
  if(!res.ok)throw new Error(`Cocktaillo menu source returned ${res.status}`);
  const html=await res.text();
  const $=cheerio.load(html);
  const items=[];
  $('script').each((_,el)=>{const type=$(el).attr('type')||'';const text=$(el).html()||'';if(!text||(!type.includes('json')&&!text.trim().startsWith('{')&&!text.trim().startsWith('[')))return;try{walkJson(JSON.parse(text),items)}catch{}});
  $('h3').each((_,el)=>{
    const name=clean($(el).text());
    if(!name||/items?|categories|featured/i.test(name))return;
    let container=$(el).parent();
    for(let i=0;i<4;i++){const t=clean(container.text());if(/\$\s*[0-9]/.test(t)||/Category\s*:/i.test(t)||/Add to Cart|\bAdd\b/i.test(t))break;container=container.parent()}
    const text=clean(container.text());
    const price=money(text);if(price===null)return;
    const match=text.match(/Category\s*:\s*([^$]+?)(?:Add|\$|$)/i);
    let category=clean(match?.[1])||'Menu';if(category.length>60)category='Menu';
    const img=container.find('img').first().attr('src')||'';
    const paragraphs=container.find('p').map((_,p)=>clean($(p).text())).get().filter(Boolean);
    const description=paragraphs.find(p=>p!==name&&!p.includes('$')&&!/Category:/i.test(p))||'';
    items.push({name,description,price,imageUrl:img,category});
  });
  const dedup=new Map();
  for(const item of items){const key=item.name.toLowerCase();if(!dedup.has(key)||(dedup.get(key)?.category==='Menu'&&item.category!=='Menu'))dedup.set(key,item)}
  return [...dedup.values()].filter(i=>i.name.length<120);
}

const slug=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'menu';
const normalized=s=>clean(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const inferStation=category=>/hookah/i.test(category)?'hookah':/food|burger|sandwich|wrap|meal|platter|pizza|breakfast|lunch|dinner|salad|kitchen/i.test(category)?'kitchen':'bar';

export function mergeCocktailloWebsiteMenu(state,items){
  const byName=new Map((state.menu||[]).map(item=>[normalized(item.name_en),item]));
  const deleted=new Set(Array.isArray(state.deleted_website_menu_names)?state.deleted_website_menu_names:[]);
  let added=0,updated=0,skipped=0;
  for(const source of items){
    const category=clean(source.category)||'Menu';
    const key=normalized(source.name);
    if(deleted.has(key)){skipped++;continue}
    if(!state.categories.includes(category))state.categories.push(category);
    const current=byName.get(key);
    if(current){
      current.price_cents=Math.round(Number(source.price||0)*100);
      current.category=category;
      current.available=current.available!==false;
      current.best_seller=Boolean(current.best_seller);
      current.station=current.station||inferStation(category);
      if(!current.name_ar)current.name_ar=source.name;
      updated++;
      continue;
    }
    const item={
      id:`web-${slug(category)}-${slug(source.name)}`,
      name_en:source.name,
      name_ar:source.name,
      category,
      subcategory:'',
      price_cents:Math.round(Number(source.price||0)*100),
      station:inferStation(category),
      allow_addons:false,
      available:true,
      best_seller:false,
      sort_order:(state.menu?.length||0)+added+1
    };
    state.menu.push(item);byName.set(key,item);added++;
  }
  return {added,updated,skipped,total:items.length};
}
