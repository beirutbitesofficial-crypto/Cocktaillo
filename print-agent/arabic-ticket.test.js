'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {buildArabicTicketDocument,renderArabicTicket,__test}=require('./arabic-ticket.js');

const fixture={
  kind:'NEW',
  order_number:1028,
  table:'Table 05',
  staff_name:'Mira',
  created_at:'2026-08-23T17:45:00.000Z',
  lines:[{
    name_en:'Fresh Cocktail Juice',
    name_ar:'عصير كوكتيل طازج',
    quantity:2,
    addons:[{name_en:'Extra Strawberry',name_ar:'فراولة إضافية',quantity:1}],
    note:'بدون ثلج وخليه بارد كتير',
  }],
};

function textLines(document){
  return document.blocks.filter(block=>block.type==='text').map(block=>block.text);
}

test('Arabic Bar document prefers Arabic item data and translates every production label',()=>{
  const document=buildArabicTicketDocument(fixture),text=textLines(document);
  assert.equal(document.width,576);
  assert.equal(__test.PAPER_WIDTH,576);
  for(const marker of ['طلب بار جديد','كوكتايلو - البار','طلب رقم 1028','طاولة 05','الويتر: Mira','2 × عصير كوكتيل طازج','+ إضافة: فراولة إضافية × 1','ملاحظة: بدون ثلج وخليه بارد كتير','حضّر الطلب الآن']){
    assert.ok(text.includes(marker),'missing '+marker);
  }
  assert.ok(!text.some(line=>line.includes('Fresh Cocktail Juice')),'English item name must not replace available Arabic');
  assert.ok(document.blocks.some(block=>block.inverse&&block.text==='ملاحظة: بدون ثلج وخليه بارد كتير'));
});

test('Arabic Hookah document uses Hookah labels and keeps only its supplied order lines',()=>{
  const document=buildArabicTicketDocument({...fixture,station:'hookah',lines:[{name_en:'Two Apples',name_ar:'تفاحتين فاخر',quantity:1,addons:[],note:'خفيفة'}]}),text=textLines(document);
  for(const marker of ['طلب أراكيل جديد','كوكتايلو - الأراكيل','1 × تفاحتين فاخر','ملاحظة: خفيفة','حضّر الطلب الآن']){
    assert.ok(text.includes(marker),'missing '+marker);
  }
  assert.ok(!text.includes('طلب بار جديد'));
  assert.ok(!text.includes('كوكتايلو - البار'));
  assert.ok(!text.some(line=>line.includes('عصير كوكتيل طازج')),'Bar lines must not appear on a Hookah-only ticket');
});

test('Arabic Bar document keeps safe fallbacks and makes void tickets unmistakable',()=>{
  const document=buildArabicTicketDocument({kind:'VOID',order_number:9,lines:[{name_en:'Cappuccino',quantity:1,note:'Customer changed mind'}]}),text=textLines(document);
  for(const marker of ['إلغاء طلب البار','طلب رقم 9','كاونتر','1 × Cappuccino','ملاحظة: Customer changed mind','لا تحضّر الطلب']){
    assert.ok(text.includes(marker),'missing '+marker);
  }
  assert.equal(__test.arabicTableLabel('VIP 1'),'الطاولة: VIP 1');
  assert.equal(__test.arabicTableLabel('طاولة 7'),'طاولة 7');
});

test('Arabic Hookah void ticket is unmistakable',()=>{
  const document=buildArabicTicketDocument({station:'hookah',kind:'VOID',order_number:17,table:'Table 2',lines:[{name_ar:'ليمون ونعنع',quantity:1,addons:[],note:'إلغاء: الزبون غيّر رأيه'}]}),text=textLines(document);
  for(const marker of ['إلغاء طلب أراكيل','كوكتايلو - الأراكيل','طلب رقم 17','طاولة 2','1 × ليمون ونعنع','ملاحظة: إلغاء: الزبون غيّر رأيه','لا تحضّر الطلب']){
    assert.ok(text.includes(marker),'missing '+marker);
  }
  assert.ok(!text.includes('إلغاء طلب البار'));
});

test('Windows renderer emits chunked 576-dot ESC/POS raster data and a cut command',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const output=await renderArabicTicket(fixture),raster=Buffer.from([0x1d,0x76,0x30,0x00]);
  assert.deepEqual(output.subarray(0,2),Buffer.from([0x1b,0x40]));
  const index=output.indexOf(raster);
  assert.ok(index>=0,'missing raster command');
  assert.equal(output[index+4],72,'576 dots must be encoded as 72 bytes per row');
  assert.equal(output[index+5],0);
  assert.ok(output.includes(Buffer.from([0x1d,0x56,0x00])),'missing cut command');
  assert.ok(output.length>20000,'Arabic ticket raster should contain visible content');
});
