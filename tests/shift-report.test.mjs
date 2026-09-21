import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {closeShift,buildShiftWorkbook,cashAmount} from '../lib/shift-report.js';
import {deliverShiftReport,sendShiftTemplate,shiftTemplateMessage} from '../lib/shift-delivery.js';
import {refundAmountForItems} from '../lib/refunds.js';
import printer from '../print-agent/print-layout.js';
const user={id:'cashier1',name:'Cashier 1'},opened='2026-09-19T22:00:00.000Z',closed='2026-09-20T03:00:00.000Z';
function fixture(){return {settings:{customer_printer_name:'Customer Receipt'},tables:[],orders:[],audit:[],inventory:[{id:'i',name:'Orange',quantity:8,unit:'kg'}],shifts:[{id:'s1',user_id:user.id,user_name:user.name,status:'open',opened_at:opened,opening_usd:100,opening_lbp:1000000},{id:'s2',user_id:'cashier2',user_name:'Cashier 2',status:'open',opened_at:opened,opening_usd:0,opening_lbp:0}],receipts:[{id:'r1',order_id:'o1',number:101,shift_id:'s1',cashier:user.name,created_at:'2026-09-19T23:00:00.000Z',items:[{menu_item_id:'orange',name_en:'Orange juice',name_ar:'عصير برتقال',quantity:2,price_cents:500,note:'without ice',addons:[]}],totals:{subtotal_equivalent_cents:1000,discount_cents:100,total_equivalent_cents:900},payment:{usd_cents:1000,lbp:89500,rate:89500},change_payment:{usd_cents:0,lbp:179000}},{id:'r2',order_id:'o2',number:102,shift_id:'s1',created_at:'2026-09-20T02:00:00.000Z',items:[{menu_item_id:'oreo',name_en:'Oreo',quantity:1,price_cents:700}],totals:{total_equivalent_cents:700},payment:{usd_cents:2000,lbp:0,rate:89500},change_payment:{usd_cents:1300,lbp:0}},{id:'r3',order_id:'o3',shift_id:'s2',created_at:closed,totals:{total_equivalent_cents:50000},payment:{usd_cents:50000}}],refunds:[{id:'rf',shift_id:'s1',order_id:'older-order',order_number:12,at:closed,amount_cents:200,payment:{usd_cents:200,lbp:0},items:[{menu_item_id:'old',name_en:'Old sale',quantity:1}],reason:'Returned'}],expenses:[{id:'e1',paid_from:'cash_drawer',shift_id:'s1',created_at:closed,currency:'USD',amount:3},{id:'e2',paid_from:'cash_drawer',shift_id:'s2',created_at:closed,currency:'USD',amount:100}]}}
const counts={shift_id:'s1',closing_usd:'112.00',closing_lbp:'910500'};
test('shift snapshot crosses midnight, isolates cashiers, separates discounts/refunds/change and is immutable',()=>{
 const s=fixture(),out=closeShift(s,user,counts,closed),r=out.report;
 assert.equal(r.order_count,2);assert.equal(r.gross_total_cents,1700);assert.equal(r.discount_total_cents,100);assert.equal(r.sales_total_cents,1600);assert.equal(r.net_total_cents,1400);
 assert.equal(r.cash.expected_usd_cents,11200);assert.equal(r.cash.expected_lbp,910500);assert.equal(r.cash.variance_usd_cents,0);assert.equal(r.cash.variance_lbp,0);
 assert.equal(r.refunds[0].order_id,'older-order');assert.equal(r.inventory[0].quantity,8);
 s.receipts[0].items[0].quantity=999;s.inventory[0].quantity=0;s.settings.exchange_rate=1;
 assert.equal(r.receipts[0].items[0].quantity,2);assert.equal(r.inventory[0].quantity,8);
 const retry=closeShift(s,user,{...counts,closing_usd:999},closed);assert.equal(retry.report,r);assert.equal(retry.shift.closing_usd,112);assert.equal(s.print_jobs.length,1);assert.equal(s.report_deliveries.length,1);
 s.shifts.push({id:'new',user_id:user.id,status:'open'});closeShift(s,user,counts,closed);assert.equal(s.shifts.at(-1).status,'open');
 const wb=XLSX.read(buildShiftWorkbook(r).buffer,{type:'buffer'}),rows=XLSX.utils.sheet_to_json(wb.Sheets['Cash Reconciliation']);assert.equal(rows.find(r=>r.Entry==='expected').USD,112);assert.equal(rows.find(r=>r.Entry==='expected').LBP,910500);
 const print=s.print_jobs[0];assert.equal(print.open_drawer,false);assert.equal(print.receipt_snapshot.total_cents,1400);const text=printer.receiptEscpos(print.receipt_snapshot).toString('ascii');assert.match(text,/Orange juice/);assert.match(text,/without ice/);assert.match(text,/112.00/);assert.match(text,/910500/);assert.match(text,/RECORDED STOCK/);
});
test('invalid counts, duplicate receipts and ambiguous legacy drawer expenses stop closing',()=>{
 for(const amount of ['',null,'NaN','Infinity','-1','1.001','1e3'])assert.throws(()=>cashAmount(amount,'USD'));
 assert.throws(()=>cashAmount('2.5','LBP'));assert.equal(cashAmount('0','USD'),0);
 let s=fixture();s.receipts.push(structuredClone(s.receipts[0]));assert.throws(()=>closeShift(s,user,counts,closed),/Duplicate/);assert.equal(s.shifts[0].status,'open');
 s=fixture();delete s.expenses[0].shift_id;assert.throws(()=>closeShift(s,user,counts,closed),/overlaps/);
 assert.throws(()=>closeShift(fixture(),user,{closing_usd:0,closing_lbp:0},closed),/shift ID/);
});
test('concurrent delivery attempts send once; accepted does not mean delivered',async()=>{
 const s=fixture();closeShift(s,user,counts,closed);const mutate=async fn=>structuredClone(fn(s));let sent=0;
 const send=async()=>{sent++;await new Promise(resolve=>setTimeout(resolve,10));return {status:'accepted',message_id:'wamid-test'}};
 await Promise.all([deliverShiftReport('s1',{mutate,send}),deliverShiftReport('s1',{mutate,send})]);assert.equal(sent,1);assert.equal(s.report_deliveries[0].status,'accepted');await deliverShiftReport('s1',{mutate,send,retry:true});assert.equal(sent,1);
});
test('uncertain delivery is never blindly retried; explicit failed delivery can retry',async()=>{
 const s=fixture();closeShift(s,user,counts,closed);const mutate=async fn=>structuredClone(fn(s));let sent=0;const send=async()=>{sent++;throw new Error('timeout')};
 await deliverShiftReport('s1',{mutate,send});await deliverShiftReport('s1',{mutate,send,retry:true});assert.equal(sent,1);assert.equal(s.report_deliveries[0].status,'uncertain');
 s.report_deliveries[0].status='failed';await deliverShiftReport('s1',{mutate,send:async()=>({status:'accepted',message_id:'ok'}),retry:true});assert.equal(s.report_deliveries[0].status,'accepted');
});
test('WhatsApp config is explicit, uses frozen summary and handles provider errors without real messages',async()=>{
 const r=closeShift(fixture(),user,counts,closed).report,env={WHATSAPP_ACCESS_TOKEN:'test',WHATSAPP_PHONE_NUMBER_ID:'123',MANAGER_WHATSAPP_NUMBER:'9613000000',WHATSAPP_SHIFT_TEMPLATE:'closing',WHATSAPP_TEMPLATE_LANGUAGE:'en_US',PUBLIC_APP_URL:'https://pos.example'};
 assert.equal((await sendShiftTemplate(r,{env:{}})).status,'not_configured');
 const payload=shiftTemplateMessage(r,env);assert.equal(payload.type,'template');assert.match(payload.template.components[0].parameters[1].text,/expected USD 112.00/);assert.match(payload.template.components[0].parameters[2].text,/shift_id=s1/);
 assert.equal((await sendShiftTemplate(r,{env,fetcher:async()=>new Response(JSON.stringify({messages:[{id:'ok'}]}))})).status,'accepted');
 assert.equal((await sendShiftTemplate(r,{env,fetcher:async()=>new Response('{}',{status:400})})).status,'failed');
 assert.equal((await sendShiftTemplate(r,{env,fetcher:async()=>{throw new Error('timeout')}})).status,'uncertain');
});
test('partial refunds reject duplicate quantities and preserve the exact discounted remainder',()=>{
 const order={id:'o',lines:[{id:'l',quantity:3,price_cents:100,addons:[{price_lbp:100,quantity:1}]}]},s={receipts:[{order_id:'o',totals:{total_equivalent_cents:271,subtotal_equivalent_cents:300}}],refunds:[]};
 assert.throws(()=>refundAmountForItems(s,order,[{line_id:'l',quantity:1},{line_id:'l',quantity:1}]),/duplicate/);
 assert.throws(()=>refundAmountForItems(s,order,[{line_id:'l',quantity:NaN}]),/quantity/);
 const amounts=[];for(let i=0;i<3;i++){const out=refundAmountForItems(s,order,[{line_id:'l',quantity:1}]);amounts.push(out.amount_cents);s.refunds.push({order_id:'o',...out})}assert.deepEqual(amounts,[90,91,90]);assert.equal(amounts.reduce((a,b)=>a+b),271);
});
