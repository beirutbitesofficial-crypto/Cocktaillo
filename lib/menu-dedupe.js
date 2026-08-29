const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').replace(/\s+/g,' ').trim();

function normalizedName(item){
  let name=clean(item?.name_en);
  const category=clean(item?.category);
  const subcategory=clean(item?.subcategory);

  // Legacy shake items may contain the word "shake" while the canonical seed uses only the flavor name.
  if(category==='cold beverage'&&(subcategory==='shakes'||/\bshake\b/.test(name))){
    name=name.replace(/\bshakes?\b/g,' ').replace(/\s+/g,' ').trim();
  }

  // Keep meaningful size/count numbers so 6 pcs and 12 pcs never collapse together.
  return name;
}

function duplicateKey(item){
  return `${clean(item?.category)}|${normalizedName(item)}`;
}

function score(item){
  let value=0;
  if(item?.deleted)value-=100;
  if(item?.available!==false)value+=3;
  if(String(item?.subcategory||'').trim())value+=2;
  if(item?.allow_addons)value+=1;
  // Seed/canonical ids are descriptive slugs; legacy/manual ids are often UUID-like or opaque.
  if(/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(String(item?.id||'')))value+=2;
  return value;
}

export function dedupeMenuItems(items=[]){
  const result=[];
  const seen=new Map();

  for(const item of Array.isArray(items)?items:[]){
    if(!item||item.deleted)continue;
    const key=duplicateKey(item);
    if(!key||key.endsWith('|')){
      result.push(item);
      continue;
    }

    const existing=seen.get(key);
    if(!existing){
      seen.set(key,{item,index:result.push(item)-1,score:score(item)});
      continue;
    }

    const nextScore=score(item);
    if(nextScore>existing.score){
      result[existing.index]=item;
      seen.set(key,{item,index:existing.index,score:nextScore});
    }
  }

  return result;
}
