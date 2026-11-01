import test from 'node:test';
import assert from 'node:assert/strict';
import {closeShift} from '../lib/shift-report.js';
const user={id:'c1',name:'Rami'},opened='2026-10-31T18:00:00.000Z',closed='2026-11-01T02:00:00.000Z';
const line={menu_item_id:'fahita',name_en:'Fahita',quantity:2,price_cents:722,addons:[]};
function fixture(otherShiftOpen=false){return {settings:{exchange_rate:89500,customer_printer_name:'Customer Receipt'},tables:[{id:'table-3',name:'Table 3'}],audit:[],inventory:[],receipts:[],refunds:[],expenses:[],
 shifts:[{id:'s1',user_id:user.id,user_name:user.name,status:'open',opened_at:opened,opening_usd:0,opening_lbp:0},...(otherShiftOpen?[{id:'s2',user_id:'c2',user_name:'Other',status:'open',opened_at:opened}]:[])],
 orders:[{id:'o-table',number:7,type:'table',table_id:'table-3',status:'open',created_by_name:'Maya',lines:[line]},{id:'o-counter',number:8,type:'counter',status:'open',lines:[line]},{id:'o-paid',number:9,type:'table',table_id:'table-3',status:'paid',lines:[line]}]}}
test('closing the last open shift voids tables left open, keeps them in history and audits them',()=>{
 const s=fixture(),out=closeShift(s,user,{shift_id:'s1',closing_usd:'0',closing_lbp:'0'},closed);
 const t=s.orders.find(o=>o.id==='o-table');
 assert.equal(t.status,'void');assert.equal(t.void.auto,true);assert.match(t.void.reason,/shift close/);
 assert.equal(s.orders.find(o=>o.id==='o-counter').status,'open','only table orders are auto-closed');
 assert.equal(s.orders.find(o=>o.id==='o-paid').status,'paid');
 assert.deepEqual(out.report.auto_closed_tables.map(o=>[o.number,o.table_name,o.total_cents]),[[7,'Table 3',1444]]);
 assert.ok(out.report.warnings.some(w=>/Auto-closed 1 table/.test(w)));
 assert.ok(s.audit.some(a=>a.type==='order_voided'&&a.order_id==='o-table'&&a.auto));
 assert.equal(out.report.order_count,0,'voided tables are not counted as sales');
});
test('tables stay open while another shift is still open',()=>{
 const s=fixture(true),out=closeShift(s,user,{shift_id:'s1',closing_usd:'0',closing_lbp:'0'},closed);
 assert.equal(s.orders.find(o=>o.id==='o-table').status,'open');assert.equal(out.report.auto_closed_tables,undefined);
});
