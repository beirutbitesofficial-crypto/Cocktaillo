const out=[];
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
function add(category,subcategory,name_en,name_ar,price_cents){out.push({id:`${slug(category)}-${slug(subcategory)}-${slug(name_en)}`,name_en,name_ar,category,subcategory,price_cents,station:'bar',allow_addons:false,available:true})}
function sizes(category,subcategory,rows){for(const [en,ar,medium,large] of rows){add(category,subcategory,`${en} - Medium`,`${ar} - وسط`,medium);add(category,subcategory,`${en} - Large`,`${ar} - كبير`,large)}}
function one(category,subcategory,rows){for(const [en,ar,price] of rows)add(category,subcategory,en,ar,price)}

sizes('Cold Beverage','Fresh Juices',[
 ['Orange','برتقال',250,300],['Lemonade','ليموناضة',250,300],['Minted Lemonade','ليموناضة بالنعنع',277,333],['Carrot','جزر',277,333],['Apple','تفاح',277,333],['Strawberry','فراولة',277,333],['Melon','شمام',277,333],['Watermelon','بطيخ',277,333],['Pomegranate','رمان',333,444],['Pineapple','أناناس',333,444],['Mango','مانغا',333,444],['Tropical','تروبيكال',333,444]
]);
one('Cold Beverage','Frappe',[
 ['Caramel','كراميل',488],['Frappuccino','فرابتشينو',488],['Vanilla','فانيلا',488],['Mocha','موكا',488],['Pistachio','فستق',488]
]);
one('Cold Beverage','Shakes',[
 ['Nutella','نوتيلا',500],['Oreo','أوريو',500],['Lotus','لوتس',500],['Kinder','كيندر',500],['Strawberry','فراولة',500],['Cerelac','سيريلاك',500],['Snickers','سنيكرز',500],['Avocado','أفوكادو',500]
]);
one('Cold Beverage','Iced Coffee',[
 ['Iced Coffee','آيس كوفي',388],['Iced Caramel','آيس كراميل',388],['Iced Mocha','آيس موكا',388],['Iced Spanish Latte','آيس سبانيش لاتيه',388],['Iced Latte','آيس لاتيه',388],['Iced Americano','آيس أمريكانو',388]
]);
one('Cold Beverage','Mojito',[
 ['Classic','كلاسيك',444],['Blue Hawaii','بلو هاواي',444],['Blueberry','بلوبيري',444],['Passion','باشن',444],['Pomegranate','رمان',444],['Energy Red','إنرجي ريد',444]
]);
one('Cold Beverage','Mocktaillo',[
 ['Royal Berry','رويال بيري',444],['Jamaika','جامايكا',444],['Laguna','لاغونا',444],['Tropicana','تروبيكانا',444],['Green Energy','جرين إنرجي',444],['Blue Strawberry','بلو ستروبيري',444],['Rosereta','روزيريتا',444],['Red House','ريد هاوس',444]
]);
one('Cold Beverage','Soft Drinks',[
 ['Pepsi','بيبسي',133],['7UP','سفن أب',133],['Mirinda','ميرندا',133],['Diet 7UP','دايت سفن أب',133],['Diet Pepsi','دايت بيبسي',133],['Small Water','مياه صغيرة',50],['Large Water','مياه كبيرة',122],['Sparkling Water Bottle','مياه غازية - قنينة',300],['Sparkling Water','مياه غازية',200],['Energy Drink','مشروب طاقة',300]
]);
sizes('Cocktail','Cocktail',[
 ['Cocktail Pieces','كوكتيل شقف',611,722],['Strawberry & Banana','فريز وموز',333,400],['Avocado','أفوكادو',522,622],['Avocado Strawberry & Banana','أفوكادو فريز وموز',522,622],['Banana & Milk','موز وحليب',333,400],['Strawberry & Milk','فريز وحليب',333,400]
]);
one('Cocktail','Cocktail',[['Cocktaillo','كوكتايلو',1000]]);
one('Hot Beverage','Hot Beverage',[
 ['Espresso','إسبريسو',150],['Nescafe','نسكافيه',333],['Double Espresso','دبل إسبريسو',200],['Ristretto','ريستريتو',150],['Lungo','لونغو',150],['Macchiato','ماكياتو',200],['Cappuccino','كابتشينو',333],['Hot Chocolate','هوت شوكولا',333],['Latte','لاتيه',333],['Caramel Latte','كراميل لاتيه',400],['Vanilla Latte','فانيلا لاتيه',400],['Mocha','موكا',400],['Tea','شاي',150],['Herbal Tea','زهورات',150],['Anise','ينسون',150],['Chamomile','بابونج',150],['Green Tea','شاي أخضر',150],['Americano','أمريكانو',333]
]);

export const beverageMenu=out.map((item,i)=>({...item,sort_order:100+i}));
export const beverageCategories=['Cold Beverage','Cocktail','Hot Beverage'];
export const beverageSubcategories=['Fresh Juices','Frappe','Shakes','Iced Coffee','Mojito','Mocktaillo','Soft Drinks','Cocktail','Hot Beverage'];
