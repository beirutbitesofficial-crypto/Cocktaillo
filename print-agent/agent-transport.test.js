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

test('both agent entry points await the Windows Arabic raster renderer for Bar jobs',()=>{
  for(const source of [standalone,server]){
    assert.ok(source.includes("const {renderArabicTicket}=require('./arabic-ticket.js')"));
    assert.ok(source.includes("destination==='bar'?await renderArabicTicket"));
  }
  assert.ok(arabicRenderer.includes('DirectionRightToLeft'));
  assert.ok(arabicRenderer.includes('CocktailloRasterEncoder'));
  assert.ok(arabicRenderer.includes('maxRowsPerCommand = 512'));
});
