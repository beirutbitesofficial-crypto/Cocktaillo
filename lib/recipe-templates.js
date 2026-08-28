const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,' ').trim();
const baseName=value=>String(value||'').replace(/\s*-\s*(Medium|Large)$/i,'').trim();

function ensureInventory(state,{key,name,unit,category='Recipe Stock'}){
  state.inventory=Array.isArray(state.inventory)?state.inventory:[];
  let item=state.inventory.find(x=>x.recipe_key===key)||state.inventory.find(x=>norm(x.name)===norm(name)&&norm(x.unit)===norm(unit));
  if(!item){item={id:`inv-${crypto.randomUUID()}`,name,category,quantity:0,unit,minimum:0,unit_cost:0,recipe_key:key,auto_created:true,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};state.inventory.push(item)}else if(!item.recipe_key){item.recipe_key=key}
  return item;
}
const ing=(key,name,unit,quantity,category)=>({key,name,unit,quantity,category});
const flavorKey=value=>norm(value).replaceAll(' ','-')||'flavor';

function dessertTemplate(item){
  const name=String(item.name_en||''),sub=String(item.subcategory||''),lower=name.toLowerCase();
  const topping=()=>{const rows=[['nutella','Nutella','g',60],['lotus','Lotus Spread','g',60],['white chocolate','White Chocolate','g',60],['dark chocolate','Dark Chocolate','g',60],['belgian chocolate','Belgian Chocolate','g',60],['chocolate','Chocolate Sauce','g',60],['kinder','Kinder Chocolate','pcs',2],['oreo','Oreo','pcs',4],['marshmallow','Marshmallow','g',40],['pistachio','Pistachio Sauce','g',60],['ferrero','Ferrero','pcs',2]];const found=rows.find(([token])=>lower.includes(token));return found?ing(`dessert-${flavorKey(found[1])}`,found[1],found[2],found[3],'Dessert Ingredients'):null};
  if(sub==='Crepe'){const lines=[ing('crepe-batter','Crepe Batter','g',lower.includes('fettuccine')||lower.includes('sushi')||lower.includes('roll')?150:120,'Dessert Ingredients')],top=topping();lines.push(top||ing('dessert-chocolate-sauce','Chocolate Sauce','g',80,'Dessert Ingredients'));return lines}
  if(sub==='Waffle'){const lines=[ing('waffle-batter','Waffle Batter','g',150,'Dessert Ingredients')],top=topping();if(top)lines.push(top);return lines}
  if(sub==='Pancake'){const count=lower.includes('12')?12:6,lines=[ing('pancake-batter','Pancake Batter','g',count*30,'Dessert Ingredients')],top=topping();if(top)lines.push({...top,quantity:count===12?top.quantity*2:top.quantity});if(lower.includes('mix'))lines.push(ing('dessert-white-chocolate','White Chocolate','g',50,'Dessert Ingredients'),ing('dessert-lotus-spread','Lotus Spread','g',50,'Dessert Ingredients'));return lines}
  if(sub==='Ice Cream'){const grams=lower.includes('1 kg')?1000:lower.includes('1/2')?500:80;return [ing('ice-cream-bulk','Ice Cream Bulk','g',grams,'Dessert Ingredients')]}
  return [ing(`prepared-${flavorKey(name)}`,`${name} Portion`,'pcs',1,'Prepared Desserts')];
}

function beverageTemplate(item){
  const name=String(item.name_en||''),sub=String(item.subcategory||''),lower=name.toLowerCase(),size=lower.includes('large')?'large':'medium',plain=baseName(name);
  if(sub==='Soft Drinks')return [ing(`sku-${flavorKey(plain)}`,plain,'pcs',1,'Packaged Drinks')];
  if(sub==='Fresh Juices')return [ing(`fruit-${flavorKey(plain)}`,plain,'g',size==='large'?450:300,'Fresh Fruit')];
  if(sub==='Frappe'){const lines=[ing('milk','Milk','ml',250,'Beverage Ingredients'),ing('ice','Ice','g',150,'Beverage Ingredients')];if(lower.includes('frappuccino'))lines.push(ing('coffee-beans','Coffee Beans','g',8,'Coffee'));else lines.push(ing(`flavor-${flavorKey(plain)}`,`${plain} Flavor`,'g',40,'Beverage Ingredients'));return lines}
  if(sub==='Shakes'){const lines=[ing('milk','Milk','ml',250,'Beverage Ingredients'),ing('ice-cream-bulk','Ice Cream Bulk','g',120,'Dessert Ingredients')];if(lower.includes('oreo'))lines.push(ing('dessert-oreo','Oreo','pcs',4,'Dessert Ingredients'));else if(lower.includes('kinder'))lines.push(ing('dessert-kinder-chocolate','Kinder Chocolate','pcs',2,'Dessert Ingredients'));else if(lower.includes('snickers'))lines.push(ing('shake-snickers','Snickers','pcs',1,'Beverage Ingredients'));else if(lower.includes('strawberry'))lines.push(ing('fruit-strawberry','Strawberry','g',120,'Fresh Fruit'));else if(lower.includes('avocado'))lines.push(ing('fruit-avocado','Avocado','g',150,'Fresh Fruit'));else if(lower.includes('cerelac'))lines.push(ing('shake-cerelac','Cerelac','g',40,'Beverage Ingredients'));else lines.push(ing(`shake-${flavorKey(plain)}`,plain,'g',50,'Beverage Ingredients'));return lines}
  if(sub==='Iced Coffee'){const lines=[ing('coffee-beans','Coffee Beans','g',16,'Coffee'),ing('ice','Ice','g',180,'Beverage Ingredients')];if(!lower.includes('americano'))lines.push(ing('milk','Milk','ml',200,'Beverage Ingredients'));if(lower.includes('caramel'))lines.push(ing('syrup-caramel','Caramel Syrup','ml',20,'Beverage Ingredients'));if(lower.includes('mocha'))lines.push(ing('dessert-chocolate-sauce','Chocolate Sauce','g',20,'Dessert Ingredients'));if(lower.includes('spanish'))lines.push(ing('condensed-milk','Condensed Milk','ml',35,'Beverage Ingredients'));return lines}
  if(sub==='Mojito'){const lines=[ing('lemon-juice','Lemon Juice','ml',60,'Beverage Ingredients'),ing('soda-water','Soda Water','ml',200,'Beverage Ingredients'),ing('mint','Mint','g',10,'Fresh Produce'),ing('ice','Ice','g',180,'Beverage Ingredients')];if(!lower.includes('classic'))lines.push(ing(`syrup-${flavorKey(plain)}`,`${plain} Syrup`,'ml',30,'Beverage Ingredients'));return lines}
  if(sub==='Mocktaillo')return [ing(`syrup-${flavorKey(plain)}`,`${plain} Syrup`,'ml',60,'Beverage Ingredients'),ing('soda-water','Soda Water','ml',200,'Beverage Ingredients'),ing('ice','Ice','g',180,'Beverage Ingredients')];
  if(sub==='Cocktail'){const lines=[ing('mixed-fruit','Mixed Fruit','g',size==='large'?450:300,'Fresh Fruit')];if(lower.includes('milk'))lines.push(ing('milk','Milk','ml',200,'Beverage Ingredients'));if(lower.includes('avocado'))lines.push(ing('fruit-avocado','Avocado','g',150,'Fresh Fruit'));return lines}
  if(sub==='Hot Beverage'){if(['tea','herbal tea','anise','chamomile','green tea'].some(x=>lower===x))return [ing(`tea-${flavorKey(plain)}`,plain,'pcs',1,'Tea & Herbs')];if(lower.includes('hot chocolate'))return [ing('hot-chocolate-powder','Hot Chocolate Powder','g',25,'Beverage Ingredients'),ing('milk','Milk','ml',250,'Beverage Ingredients')];const coffeeQty=lower.includes('double')?16:8,lines=[ing('coffee-beans','Coffee Beans','g',coffeeQty,'Coffee')];if(['macchiato','cappuccino','latte','mocha','nescafe'].some(x=>lower.includes(x)))lines.push(ing('milk','Milk','ml',lower.includes('macchiato')?30:200,'Beverage Ingredients'));if(lower.includes('caramel'))lines.push(ing('syrup-caramel','Caramel Syrup','ml',20,'Beverage Ingredients'));if(lower.includes('vanilla'))lines.push(ing('syrup-vanilla','Vanilla Syrup','ml',20,'Beverage Ingredients'));if(lower.includes('mocha'))lines.push(ing('dessert-chocolate-sauce','Chocolate Sauce','g',20,'Dessert Ingredients'));return lines}
  return [ing(`sku-${flavorKey(name)}`,name,'pcs',1,'Packaged Drinks')];
}

function templateFor(item){
  const category=String(item.category||''),name=String(item.name_en||'Menu Item'),lower=name.toLowerCase();
  if(category==='Hookah')return [ing('hookah-molasses','Hookah Molasses','g',120,'Hookah'),ing('hookah-charcoal','Hookah Charcoal','pcs',4,'Hookah')];
  if(category==='Dessert')return dessertTemplate(item);
  if(['Cold Beverage','Cocktail','Hot Beverage'].includes(category))return beverageTemplate(item);
  if(category==='Salads'){const lines=[ing('mixed-fruit','Mixed Fruit','g',300,'Fresh Fruit')];if(lower.includes('nutella'))lines.push(ing('dessert-nutella','Nutella','g',50,'Dessert Ingredients'));if(lower.includes('nuts'))lines.push(ing('nuts','Nuts','g',30,'Dessert Ingredients'));if(lower.includes('cream'))lines.push(ing('cream','Cream','g',50,'Dessert Ingredients'));if(lower.includes('honey'))lines.push(ing('honey','Honey','g',20,'Dessert Ingredients'));return lines}
  return [ing(`menu-stock-${flavorKey(name)}`,name,'pcs',1,'Menu Stock')];
}

export function ensureDefaultRecipes(state){
  state.menu=Array.isArray(state.menu)?state.menu:[];
  state.recipes=Array.isArray(state.recipes)?state.recipes:[];
  const byMenuId=new Map(state.recipes.map(recipe=>[recipe.menu_item_id,recipe]));
  for(const menuItem of state.menu){
    if(menuItem.deleted)continue;
    let recipe=byMenuId.get(menuItem.id);
    if(recipe&&!recipe.auto_template)continue;
    const suggested=templateFor(menuItem).map(spec=>{const stock=ensureInventory(state,spec);return {inventory_id:stock.id,quantity:Number(spec.quantity||0)}}).filter(line=>line.quantity>0);
    const hookah=menuItem.category==='Hookah';
    if(!recipe){
      recipe={id:`recipe-${crypto.randomUUID()}`,menu_item_id:menuItem.id,lines:hookah?suggested:[],suggested_lines:suggested,auto_template:!hookah,updated_at:new Date().toISOString()};
      state.recipes.push(recipe);byMenuId.set(menuItem.id,recipe);
    }else{
      recipe.suggested_lines=suggested;
      recipe.lines=hookah?suggested:[];
      recipe.auto_template=!hookah;
      recipe.updated_at=new Date().toISOString();
    }
  }
  return state;
}
