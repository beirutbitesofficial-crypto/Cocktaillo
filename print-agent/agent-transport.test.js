'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {receiptEscpos}=require('./print-layout.js');

const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8');
const standalone=read('standalone.js');
const server=read('server.js');
const rawHelper=read('print-raw.ps1');
const arabicRenderer=read('arabic-ticket.js');
const printClient=fs.readFileSync(path.join(__dirname,'..','app','components','print-client.js'),'utf8');
const printJobsRoute=fs.readFileSync(path.join(__dirname,'..','app','api','print-jobs','route.js'),'utf8');
const ordersRoute=fs.readFileSync(path.join(__dirname,'..','app','api','orders','route.js'),'utf8');
const settingsPanel=fs.readFileSync(path.join(__dirname,'..','app','components','settings-panel.js'),'utf8');
const store=fs.readFileSync(path.join(__dirname,'..','lib','store.js'),'utf8');
const actionsRoute=fs.readFileSync(path.join(__dirname,'..','app','api','actions','route.js'),'utf8');
const websiteMenu=fs.readFileSync(path.join(__dirname,'..','lib','alqaima-menu.js'),'utf8');
const installer=read('install-windows.ps1');

test('standalone EXE streams large customer payloads through stdin',()=>{
  const payload=receiptEscpos({
    order_number:1,type:'takeaway',created_at:'2026-08-23T12:00:00.000Z',cashier:'Test',
    items:[{name:'Cappuccino',quantity:1,line_total_cents:500,addons:[]}],
    subtotal_cents:500,total_cents:500,payment_method:'USD',paid_usd_cents:500,change_cents:0,
    instagram_url:'https://www.instagram.com/cocktaillorestocafe',instagram_handle:'@cocktaillorestocafe',
  });
  assert.ok(payload.length>8000,'fixture must remain large enough to catch command-line regressions');
  assert.ok(standalone.includes('[Console]::In.ReadToEnd()'));
  assert.ok(standalone.includes("stdio:['pipe','ignore','pipe']"));
  assert.ok(standalone.includes("p.stdin.end(buffer.toString('base64'))"));
  assert.ok(!standalone.includes("FromBase64String('${buffer.toString('base64')}')"),'payload must never be embedded in -EncodedCommand');
});

test('source agent and raw helper also accept payload bytes on stdin',()=>{
  assert.ok(server.includes("stdio:['pipe','ignore','pipe']"));
  assert.ok(server.includes("p.stdin.end(buffer.toString('base64'))"));
  assert.ok(!server.includes("'-Base64',buffer.toString('base64')"));
  assert.ok(rawHelper.includes('[Console]::In.ReadToEnd()'));
  assert.ok(!rawHelper.includes('[Parameter(Mandatory=$true)][string]$Base64'));
});

test('both agent entry points await the Windows Arabic raster renderer for Bar and Hookah jobs',()=>{
  for(const source of [standalone,server]){
    assert.ok(source.includes("const {renderArabicTicket}=require('./arabic-ticket.js')"));
    assert.ok(source.includes("b.destination==='hookah'?'hookah'"));
    assert.ok(source.includes("(destination==='bar'||destination==='hookah')?await renderArabicTicket"));
  }
  assert.ok(arabicRenderer.includes('DirectionRightToLeft'));
  assert.ok(arabicRenderer.includes('CocktailloRasterEncoder'));
  assert.ok(arabicRenderer.includes('maxRowsPerCommand = 512'));
});

test('paid receipt drawer policy is preserved from checkout to both agent entry points',()=>{
  assert.ok(printJobsRoute.includes("open_drawer:mode==='automatic'"));
  assert.ok(printJobsRoute.includes("if(existing.status!=='printed')existing.open_drawer=true"));
  assert.ok(printClient.includes("open_drawer:bundle.job?.open_drawer===true"));
  for(const source of [standalone,server]){
    assert.ok(source.includes("receiptEscpos(b.receipt||{},{openDrawer:destination==='customer'&&b.open_drawer===true})"));
    assert.ok(source.includes("version:'2.5.0'"));
  }
});

test('Hookah lines are isolated from Bar and routed to the exact HOOKAH printer',()=>{
  assert.ok(store.includes("hookah_printer_name:'HOOKAH'"));
  assert.ok(store.includes("if(next.category==='Hookah'&&!next.deleted)next.station='hookah'"));
  assert.ok(ordersRoute.includes('const stationLines={bar:[],kitchen:[],hookah:[]}'));
  assert.ok(ordersRoute.includes("const station=item.category==='Hookah'?'hookah'"));
  assert.ok(ordersRoute.includes("for(const station of ['bar','kitchen','hookah'])"));
  assert.ok(ordersRoute.includes("destination:station"));
  assert.ok(ordersRoute.includes("state.settings.hookah_printer_name||'HOOKAH'"));
  assert.ok(printJobsRoute.includes("x==='bar'||x==='hookah'||x==='customer'"));
  assert.ok(printClient.includes("DEFAULT_HOOKAH_PRINTER='HOOKAH'"));
  assert.ok(printClient.includes("destination==='hookah'?settings.hookahPrinter"));
  assert.ok(settingsPanel.includes('<label>Hookah printer</label>'));
  assert.ok(printClient.includes("if(!['bar','hookah','customer'].includes(destination))"));
  assert.ok(printJobsRoute.includes("if(job.destination!=='customer')throw new Error('Unsupported print destination.')"));
  assert.ok(actionsRoute.includes("destination:'hookah'"));
  assert.ok(actionsRoute.includes("kind:'VOID'"));
  assert.ok(websiteMenu.includes("/hookah/i.test(category)?'hookah'"));
});

test('existing Agent configuration gains HOOKAH without losing saved printer mappings',()=>{
  for(const source of [standalone,server]){
    assert.ok(source.includes("printers:{...defaults.printers,...(saved.printers||{})}"));
    assert.ok(source.includes("hookah:'HOOKAH'"));
  }
  assert.ok(installer.includes("PSObject.Properties['hookah']"));
  assert.ok(installer.includes("Add-Member -MemberType NoteProperty -Name hookah -Value 'HOOKAH'"));
});
