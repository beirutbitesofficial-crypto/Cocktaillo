import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {shiftCash,netTender,changeFor} from '../lib/cash.js';
import {waiterOrder} from '../lib/menu-labels.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildArabicTicketDocument}=require('../print-agent/arabic-ticket.js');
const shift={id:'s1',user_id:'c1',user_name:'Cashier',opened_at:'2026-09-16T08:00:00Z',opening_usd:100,opening_lbp:100000};
const at='2026-09-16T09:00:00Z',until='2026-09-16T12:00:00Z';
const receipt={id:'r1',cashier:'Cashier',created_at:at,payment:{usd_cents:2000,lbp:0},change_cents:1300};
test('$20 tender for $7 sale increases expected cash by $7, not $20',()=>{
 assert.equal(shiftCash({receipts:[receipt]},shift,until).expected_usd,107);
 assert.deepEqual(netTender(receipt),{usd_cents:700,lbp:0});
});
test('mixed tender and LBP change reduce the correct currency',()=>{
 const r={...receipt,payment:{usd_cents:1000,lbp:500000},change_payment:changeFor(200,'LBP',100000)};
 const cash=shiftCash({receipts:[r]},shift,until);
 assert.equal(cash.expected_usd,110);assert.equal(cash.expected_lbp,400000);
});
test('refund of an older receipt belongs to the shift when it is paid out',()=>{
 const old={...receipt,created_at:'2026-09-15T09:00:00Z',refund_payment:{usd_cents:700},refunded_at:at};
 const cash=shiftCash({receipts:[old],refunds:[{user:'Cashier',at,payment:{usd_cents:700,lbp:0}}]},shift,until);
 assert.equal(cash.expected_usd,93);
});
test('shift IDs override renamed cashiers and prevent overlapping drawers sharing transactions',()=>{
 const cash=shiftCash({receipts:[{...receipt,shift_id:'s1',cashier:'Old name'},{...receipt,shift_id:'s2'}],expenses:[{paid_from:'cash_drawer',shift_id:'s2',currency:'USD',amount:80,created_at:at},{paid_from:'cash_drawer',shift_id:'s1',currency:'USD',amount:2,created_at:at}]},shift,until);
 assert.equal(cash.expected_usd,105);
});
test('waiter response excludes totals, payment, discount and line prices',()=>{
 const safe=waiterOrder({id:'o',totals:{total_equivalent_cents:700},payments:[{usd_cents:700}],discount:{value:50},lines:[{id:'l',price_cents:700,addons:[{id:'a',price_lbp:10}]}]});
 assert.doesNotMatch(JSON.stringify(safe),/price|total|payment|discount/);
});
test('Arabic category sits immediately below each production item',()=>{
 const d=buildArabicTicketDocument({station:'bar',lines:[{name_ar:'أوريو',quantity:1,category_ar:'فرابيه'}]});
 const lines=d.blocks.filter(b=>b.type==='text').map(b=>b.text);
 assert.equal(lines[lines.indexOf('1 × أوريو')+1],'فرابيه');
 const shisha=buildArabicTicketDocument({station:'hookah',lines:[{name_ar:'تفاحتين فاخر',quantity:1}]}).blocks.filter(b=>b.type==='text').map(b=>b.text);
 assert.equal(shisha[shisha.indexOf('1 × تفاحتين فاخر')+1],'شيشة');
});
test('server ownership keeps one waiter on a table and deduplicates retries',{timeout:30000},async()=>{
 const folder=await mkdtemp(join(tmpdir(),'cocktaillo-regression-'));
 process.env.POS_DATA_FILE=join(folder,'pos.json');
 const {mutateState,readState}=await import('../lib/store.js');
 try{
  await mutateState(s=>{s.users.push({id:'cashier',role:'cashier',active:true});s.shifts.push({id:'active',user_id:'cashier',status:'open'});s.menu.push({id:'test-oreo',name_en:'Oreo',name_ar:'أوريو',category:'Cold Beverage',subcategory:'Frappe',station:'bar',price_cents:700,available:true});});
  const source=`import {mutateState} from './lib/store.js';import {createOrder} from './lib/create-order.js';const user={id:process.env.TEST_WAITER,name:process.env.TEST_WAITER,role:'waiter'};await mutateState(s=>createOrder(s,user,{request_id:process.env.TEST_REQUEST,type:'table',table_id:'table-1',lines:[{menu_item_id:'test-oreo',quantity:1}]}));`;
  const send=(user,id)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',source],{cwd:process.cwd(),env:{...process.env,TEST_WAITER:user,TEST_REQUEST:id}});let err='';child.stderr.on('data',d=>err+=d);child.on('error',reject);child.on('exit',code=>code?reject(Error(err)):resolve())});
  await Promise.all([send('waiter-1','request-1'),send('waiter-1','request-1')]);
  await assert.rejects(()=>send('waiter-2','request-2'),/already assigned to another waiter/);
  let s=await readState();assert.equal(s.orders.length,1);assert.equal(s.orders[0].created_by,'waiter-1');assert.equal(s.orders[0].lines.length,1);assert.equal(s.tickets.length,1);assert.equal(s.print_jobs.length,1);assert.equal(s.order_requests.length,1);
  assert.equal(s.tickets[0].lines[0].category_ar,'فرابيه');
  await send('waiter-1','request-1');s=await readState();assert.equal(s.orders[0].lines.length,1);assert.equal(s.tickets.length,1);
 }finally{await rm(folder,{recursive:true,force:true})}
});
