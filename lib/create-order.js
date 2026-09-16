import {orderTotal} from './store.js';
import {arabicCategory,waiterOrder} from './menu-labels.js';
export function createOrder(state,user,body){const type=body.type||'table';
      const requestId=String(body.request_id||'').trim();
      if(!requestId||requestId.length>128)throw new Error('Refresh the POS before sending this order.');
      const fingerprint=JSON.stringify({type,table_id:body.table_id||null,customer:body.customer||null,lines:body.lines});
      state.order_requests=state.order_requests||[];
      const previous=state.order_requests.find(r=>r.user_id===user.id&&r.request_id===requestId);
      if(previous){if(previous.fingerprint!==fingerprint)throw new Error('This request was already used for different items.');const saved=state.orders.find(o=>o.id===(previous.order_id||previous.order?.id));if(!saved)throw new Error('Previously sent order is no longer available.');return user.role==='waiter'?waiterOrder(saved):{...saved,totals:orderTotal(saved,state.settings.exchange_rate)}}
      const activeCashierShift=state.shifts.find(sh=>sh.status==='open'&&state.users.some(u=>u.id===sh.user_id&&u.role==='cashier'&&u.active!==false));
      if(!activeCashierShift)throw new Error('POS is closed. A cashier must open a shift before any order can be sent.');
      if(type==='table'&&!state.tables.some(t=>t.id===body.table_id))throw new Error('Table not found.');
      let order=type==='table'?state.orders.find(o=>o.type==='table'&&o.table_id===body.table_id&&o.status==='open'):null;
      if(order&&type==='table'&&user.role==='waiter'&&order.created_by!==user.id)throw new Error('This table is already assigned to another waiter.');
      if(!order){order={id:`ord-${crypto.randomUUID()}`,number:state.next_order_number++,type,table_id:type==='table'?body.table_id:null,customer:body.customer||null,created_by:user.id,created_by_name:user.name,status:type==='table'?'open':'pending_payment',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),lines:[],payments:[]};state.orders.push(order)}
      const stationLines={bar:[],kitchen:[],hookah:[]};
      for(const raw of body.lines){
        const item=state.menu.find(x=>x.id===raw.menu_item_id&&x.available&&!x.deleted);
        const qty=Number(raw.quantity||1);if(!Number.isSafeInteger(qty)||qty<1||qty>999)throw new Error('Invalid quantity.');
        if(!item)throw new Error('Invalid menu item.');
        const selected=(item.allow_addons?raw.addons||[]:[]).map(a=>{const found=state.addons.find(x=>x.id===a.id&&x.available);return found?{id:found.id,name_en:found.name_en,name_ar:found.name_ar,price_lbp:found.price_lbp,quantity:Math.max(1,Math.floor(Number(a.quantity||1)))}:null}).filter(Boolean);
        const station=item.category==='Hookah'?'hookah':['bar','kitchen','service','hookah'].includes(item.station)?item.station:'bar';
        const line={id:`line-${crypto.randomUUID()}`,menu_item_id:item.id,name_en:item.name_en,name_ar:item.name_ar,category:item.category,subcategory:item.subcategory,category_ar:arabicCategory(item),price_cents:item.price_cents,station,quantity:qty,addons:selected,note:String(raw.note||'').trim()};
        order.lines.push(line);
        if(stationLines[station])stationLines[station].push(line);
      }
      order.updated_at=new Date().toISOString();
      state.print_jobs=Array.isArray(state.print_jobs)?state.print_jobs:[];
      for(const station of ['bar','kitchen','hookah'])if(stationLines[station].length){
        const ticket={id:`ticket-${crypto.randomUUID()}`,order_id:order.id,order_number:order.number,table_id:order.table_id,station,status:'new',kind:'NEW',created_at:new Date().toISOString(),staff_name:user.name,lines:stationLines[station].map(l=>({name_en:l.name_en,name_ar:l.name_ar,category:l.category,subcategory:l.subcategory,category_ar:l.category_ar,quantity:l.quantity,addons:l.addons.map(a=>({name_en:a.name_en,name_ar:a.name_ar,quantity:a.quantity})),note:l.note}))};
        state.tickets.push(ticket);
        if(station==='bar'||station==='hookah'){
          const printerName=station==='hookah'?state.settings.hookah_printer_name||'HOOKAH':state.settings.bar_printer_name||'Bar Printer';
          state.print_jobs.push({id:`print-${crypto.randomUUID()}`,ticket_id:ticket.id,order_id:order.id,order_number:order.number,destination:station,mode:'automatic',status:'pending',printer_name:printerName,created_at:ticket.created_at,updated_at:ticket.created_at,attempts:0,last_error:null,printed_at:null,requested_by:user.name});
        }
      }
      const response=user.role==='waiter'?waiterOrder(order):{...order,totals:orderTotal(order,state.settings.exchange_rate)};
      state.order_requests.push({request_id:requestId,user_id:user.id,fingerprint,order_id:order.id});
      return response;
}
