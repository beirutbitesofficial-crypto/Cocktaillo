import { NextResponse } from 'next/server';
import { mutateState, orderTotal } from '../../../lib/store.js';

function safeEqual(left,right){
  const a=String(left||''),b=String(right||'');
  if(!a||!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}

function text(value,max=500){return String(value||'').trim().slice(0,max)}

export async function POST(request){
  const configuredKey=String(process.env.COCKTAILLO_WEBSITE_ORDER_KEY||'').trim();
  const suppliedKey=String(request.headers.get('x-cocktaillo-order-key')||'').trim();
  if(!configuredKey){
    console.error('[Cocktaillo] COCKTAILLO_WEBSITE_ORDER_KEY is not configured.');
    return NextResponse.json({error:'Website ordering is not configured on the POS.'},{status:503});
  }
  if(!safeEqual(configuredKey,suppliedKey))return NextResponse.json({error:'Unauthorized'},{status:401});

  const body=await request.json().catch(()=>null);
  if(!body||!Array.isArray(body.lines)||!body.lines.length)return NextResponse.json({error:'Order items are required.'},{status:400});

  const externalId=text(body.external_id,160);
  const type=text(body.type,30).toLowerCase();
  if(!externalId)return NextResponse.json({error:'external_id is required.'},{status:400});
  if(!['delivery','takeaway'].includes(type))return NextResponse.json({error:'Invalid website order type.'},{status:400});

  try{
    const result=await mutateState(state=>{
      state.orders=Array.isArray(state.orders)?state.orders:[];
      state.audit=Array.isArray(state.audit)?state.audit:[];

      const existing=state.orders.find(order=>order.website_order_id===externalId);
      if(existing)return {order:{...existing,totals:orderTotal(existing,state.settings.exchange_rate)},duplicate:true};

      const customerInput=body.customer&&typeof body.customer==='object'?body.customer:{};
      const customer={
        name:text(customerInput.name,180),
        phone:text(customerInput.phone,80),
        address:text(customerInput.address,700),
        notes:text(customerInput.notes,700),
        payment_method:text(body.payment_method,40).toUpperCase(),
        payment_reference:text(body.payment_reference,180),
        source:'website'
      };
      if(!customer.phone)throw new Error('Customer phone is required.');
      if(type==='delivery'&&!customer.address)throw new Error('Delivery address is required.');

      const now=new Date().toISOString();
      const order={
        id:`ord-${crypto.randomUUID()}`,
        number:state.next_order_number++,
        type,
        table_id:null,
        customer,
        created_by:'website',
        created_by_name:'Website',
        source:'website',
        website_order_id:externalId,
        website_confirmed_at:null,
        website_confirmed_by:null,
        status:'pending_payment',
        created_at:now,
        updated_at:now,
        lines:[],
        payments:[]
      };

      for(const raw of body.lines){
        const item=state.menu.find(menuItem=>menuItem.id===String(raw.menu_item_id||'')&&menuItem.available!==false&&!menuItem.deleted);
        const quantity=Math.max(1,Math.min(50,Math.floor(Number(raw.quantity||1))));
        if(!item)throw new Error('One or more website menu items are no longer available.');

        const addonInputs=Array.isArray(raw.addons)?raw.addons:[];
        const selected=(item.allow_addons?addonInputs:[]).map(input=>{
          const id=typeof input==='object'&&input?String(input.id||''):String(input||'');
          const found=state.addons.find(addon=>addon.id===id&&addon.available!==false);
          if(!found)return null;
          return {id:found.id,name_en:found.name_en,name_ar:found.name_ar,price_lbp:found.price_lbp,quantity:Math.max(1,Math.min(20,Math.floor(Number(input?.quantity||1))))};
        }).filter(Boolean);
        if(item.allow_addons&&selected.length!==addonInputs.length)throw new Error('One or more website add-ons are no longer available.');

        const station=item.category==='Hookah'?'hookah':['bar','kitchen','service','hookah'].includes(item.station)?item.station:'bar';
        order.lines.push({id:`line-${crypto.randomUUID()}`,menu_item_id:item.id,name_en:item.name_en,name_ar:item.name_ar,price_cents:item.price_cents,station,quantity,addons:selected,note:text(raw.note,400)});
      }

      const deliveryFeeCents=type==='delivery'?Math.max(0,Math.min(100000,Math.round(Number(body.delivery_fee_cents||0)))):0;
      if(deliveryFeeCents>0){
        order.lines.push({id:`line-${crypto.randomUUID()}`,menu_item_id:null,name_en:'Delivery Fee',name_ar:'رسوم التوصيل',price_cents:deliveryFeeCents,station:'service',quantity:1,addons:[],note:'Website delivery charge'});
      }

      state.orders.push(order);
      state.audit.push({id:`audit-${crypto.randomUUID()}`,type:'website_order_received_pending_confirmation',order_id:order.id,order_number:order.number,external_id:externalId,user:'Website',at:now});
      return {order:{...order,totals:orderTotal(order,state.settings.exchange_rate)},duplicate:false};
    });

    return NextResponse.json(result,{status:result.duplicate?200:201});
  }catch(error){
    console.error('[Cocktaillo] Website order ingest failed',error);
    return NextResponse.json({error:error instanceof Error?error.message:'Could not create website order.'},{status:400});
  }
}
