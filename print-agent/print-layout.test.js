'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {receiptEscpos,ticketEscpos,orderType,receiptNumber,__test}=require('./print-layout.js');
const logoRaster=require('./logo-raster.js');

const containsBytes=(buffer,bytes)=>buffer.includes(Buffer.from(bytes));

const receiptFixture={
  order_number:1028,
  type:'table',
  table:'Table 05',
  created_at:'2026-08-23T17:45:00.000Z',
  cashier:'Mira',
  items:[
    {name:'Cappuccino',quantity:2,line_total_cents:800,addons:[]},
    {name:'Crispy Chicken Burger With A Very Long Name',quantity:1,line_total_cents:1100,addons:[{name:'Extra cheese',quantity:1,price_lbp:50000}]},
  ],
  subtotal_cents:1900,
  discount_cents:100,
  total_cents:1800,
  payment_method:'USD + LBP',
  paid_usd_cents:1000,
  paid_lbp:895000,
  exchange_rate:89500,
  change_cents:200,
  footer:'Thank you for visiting Cocktaillo. We hope to welcome you again soon.',
  instagram_url:'https://www.instagram.com/cocktaillorestocafe',
  instagram_handle:'@cocktaillorestocafe',
};

test('customer receipt contains the polished structure, logo and QR',()=>{
  const output=receiptEscpos(receiptFixture),text=output.toString('latin1');
  assert.deepEqual(output.subarray(0,2),Buffer.from([0x1b,0x40]));
  assert.ok(containsBytes(output,[0x1d,0x76,0x30,0x00]),'missing raster logo command');
  assert.ok(containsBytes(output,[0x1d,0x28,0x6b]),'missing native QR command');
  assert.ok(containsBytes(output,[0x1d,0x56,0x00]),'missing cut command');
  for(const marker of ['CUSTOMER RECEIPT','CTL-1028','Table 05','ITEM','QTY','PRICE','Cappuccino','Crispy Chicken Burger','Subtotal','Discount','TOTAL $18.00','Payment','USD + LBP','CHANGE','$2.00','SCAN & FOLLOW US','@cocktaillorestocafe','WE HOPE TO SEE YOU AGAIN!'])assert.ok(text.includes(marker),`missing ${marker}`);
});

test('receipt helpers preserve the safe 42-column paper width',()=>{
  assert.equal(__test.W,42);
  assert.equal(__test.itemRow('Classic Burger','2','$20.00').length,42);
  assert.equal(__test.pair('Receipt: CTL-1028','Table: 05').length,42);
  const lines=__test.wrap('A very long item name that must wrap cleanly without being cut off by the printer',27);
  assert.ok(lines.length>1);
  assert.ok(lines.every(line=>line.length<=27));
  assert.equal(orderType('table'),'DINE IN');
  assert.equal(orderType('split_bill'),'SPLIT BILL');
  assert.equal(receiptNumber('1028'),'CTL-1028');
});

test('large LBP add-on totals keep every leading digit',()=>{
  const output=receiptEscpos({
    order_number:77,type:'takeaway',created_at:'2026-08-23T12:00:00.000Z',cashier:'Mira',
    items:[{name:'Party Cocktail',quantity:10,line_total_cents:10000,addons:[{name:'Premium add-on',quantity:1,price_lbp:100000}]}],
    subtotal_cents:10000,total_cents:10000,payment_method:'USD',paid_usd_cents:10000,change_cents:0,
  }).toString('latin1');
  assert.ok(output.includes('1,000,000 LBP'));
  assert.ok(__test.itemRows('Premium add-on','', '1,000,000 LBP').every(row=>row.length<=42));
  assert.throws(()=>__test.itemRow('Premium add-on','', '1,000,000 LBP'),/Price column overflow/);
});

test('bar ticket makes order, items, add-ons and notes prominent without truncation',()=>{
  const output=ticketEscpos({
    kind:'NEW',order_number:1028,table:'Table 05',staff_name:'Mira',created_at:'2026-08-23T17:45:00.000Z',
    lines:[{name_en:'Fresh Cocktail Juice With Extra Long Description',quantity:2,addons:[{name_en:'Extra Strawberry',quantity:1}],note:'No ice and make it extra cold please'}],
  }),text=output.toString('latin1');
  for(const marker of ['BAR TICKET','COCKTAILLO - BAR','ORDER #1028','TABLE 05','SENT BY: MIRA','2 x FRESH COCKTAIL','DESCRIPTION','+ ADD: EXTRA STRAWBERRY x1','*** NOTE ***','NO ICE AND MAKE IT EXTRA COLD','MAKE NOW'])assert.ok(text.includes(marker),`missing ${marker}`);
  assert.ok(containsBytes(output,[0x1d,0x21,0x01]),'items should use double-height type');
  assert.ok(containsBytes(output,[0x1d,0x42,0x01]),'important blocks should use reverse print');
  assert.ok(containsBytes(output,[0x1d,0x56,0x00]),'missing cut command');
});

test('void Bar ticket is unmistakable and counter orders have a location',()=>{
  const text=ticketEscpos({kind:'VOID',order_number:9,lines:[{name_en:'Cappuccino',quantity:1,note:'Customer changed mind'}]}).toString('latin1');
  for(const marker of ['!!! VOID !!!','ORDER #9','COUNTER','1 x CAPPUCCINO','DO NOT MAKE'])assert.ok(text.includes(marker),`missing ${marker}`);
});

test('embedded printer logo is a centered 384-dot raster asset',()=>{
  assert.ok(Buffer.isBuffer(logoRaster));
  assert.deepEqual(logoRaster.subarray(0,4),Buffer.from([0x1d,0x76,0x30,0x00]));
  assert.equal(logoRaster[4]+(logoRaster[5]<<8),48);
  assert.equal((logoRaster[4]+(logoRaster[5]<<8))*8,384);
  assert.ok(logoRaster.length>8000);
});
