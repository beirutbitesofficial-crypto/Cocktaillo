// Run after npm run build. All records are isolated in a temporary data file.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const dir=await mkdtemp(join(tmpdir(),'cocktaillo-http-'));
process.env.POS_DATA_FILE=join(dir,'pos.json');
const {mutateState}=await import('../lib/store.js');
const bcrypt=(await import('bcryptjs')).default;
await mutateState(async s=>{s.website_menu_synced_at=new Date().toISOString();for(const [id,role] of [['cashier','cashier'],['waiter1','waiter'],['waiter2','waiter']])s.users.push({id,name:id,username:id,role,active:true,password_hash:await bcrypt.hash('test-only',4)});s.menu.push({id:'test-oreo',name_en:'Test Oreo',name_ar:'أوريو تجريبي',category:'Cold Beverage',subcategory:'Frappe',station:'bar',price_cents:700,available:true});});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3187'],{env:{...process.env,POS_SESSION_SECRET:'local-test-secret-only-not-for-production-123456789'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const base='http://127.0.0.1:3187';
async function post(path,body,cookie){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});const d=await r.json();assert.ok(r.ok,`${path}: ${JSON.stringify(d)}`);return {d,cookie:r.headers.get('set-cookie')?.split(';')[0]}}
try{
 for(let i=0;i<100;i++){try{await fetch(base+'/api/health');break}catch{await new Promise(r=>setTimeout(r,100))}}
 const c=(await post('/api/auth/login',{username:'cashier',password:'test-only'})).cookie;
 const w1=(await post('/api/auth/login',{username:'waiter1',password:'test-only'})).cookie;
 const w2=(await post('/api/auth/login',{username:'waiter2',password:'test-only'})).cookie;
 await post('/api/actions',{action:'open_shift',opening_usd:100,opening_lbp:0},c);
 const b={request_id:'a',type:'table',table_id:'table-1',lines:[{menu_item_id:'test-oreo',quantity:1}]};
 const orders=await Promise.all([post('/api/orders',b,w1),post('/api/orders',{...b,request_id:'b'},w2),post('/api/orders',b,w1)]);
 const id=orders[0].d.order.id;assert.ok(orders.every(o=>o.d.order.id===id));
 let boot=await(await fetch(base+'/api/bootstrap',{headers:{cookie:c}})).json();assert.equal(boot.orders.find(o=>o.id===id).lines.length,2);
 const claims=await Promise.all([post('/api/print-jobs',{action:'claim-next',destinations:['bar']},c),post('/api/print-jobs',{action:'claim-next',destinations:['bar']},c)]);
 assert.notEqual(claims[0].d.job.id,claims[1].d.job.id);
 assert.ok(claims.every(x=>x.d.ticket.lines[0].category_ar==='فرابيه'));
 for(const claim of claims){const j=claim.d.job;assert.equal((await post('/api/print-jobs',{action:'claim',job_id:j.id},c)).d.should_print,false);await post('/api/print-jobs',{action:'status',job_id:j.id,claim_token:j.claim_token,status:'printed'},c);}
 assert.equal((await post('/api/print-jobs',{action:'claim-next',destinations:['bar']},c)).d.job,null);
 const pays=await Promise.all([post('/api/actions',{action:'pay_order',order_id:id,usd:20,lbp:0,change_currency:'USD'},c),post('/api/actions',{action:'pay_order',order_id:id,usd:20,lbp:0,change_currency:'USD'},c)]);
 assert.equal(pays[0].d.receipt.id,pays[1].d.receipt.id);
 const close=await post('/api/shift-close',{closing_usd:114,closing_lbp:0},c);assert.equal(close.d.shift.expected_usd,114);assert.equal(close.d.shift.variance_usd,0);
 // Optional local UI smoke using an installed Playwright package.
 if(process.env.PLAYWRIGHT_MODULE){
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE);const browser=await chromium.launch({headless:true});
  try{const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'cocktaillo_session',value:w1.split('=')[1],domain:'127.0.0.1',path:'/'}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await post('/api/actions',{action:'open_shift',opening_usd:0,opening_lbp:0},c);await page.goto(base);await page.getByPlaceholder('فتّش عن صنف أو قسم…').fill('Test Oreo');await page.locator('.menuItem').click();await page.getByLabel('ملاحظة للصنف').fill('بلا تلج');await page.locator('.tableBtn').filter({hasText:'Table 2'}).first().click();assert.equal(await page.getByLabel('ملاحظة للصنف').count(),0);await page.locator('.tableBtn').filter({hasText:/^Table 1\b/}).first().click();assert.equal(await page.getByLabel('ملاحظة للصنف').inputValue(),'بلا تلج');assert.equal(await page.locator('.totals').count(),0);await page.getByRole('button',{name:/إرسال الطلب/}).click();await page.getByRole('status').filter({hasText:'تم إرسال الطلب'}).waitFor();assert.deepEqual(errors,[]);console.log('Mobile waiter UI passed: table drafts, notes, hidden totals and successful send.');}finally{await browser.close()}
 }
 console.log('HTTP smoke passed: concurrent waiters, retry deduplication, independent printer claims, duplicate payment and shift close.');
}catch(e){console.error(logs);throw e}finally{if(server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r))};await rm(dir,{recursive:true,force:true})}
