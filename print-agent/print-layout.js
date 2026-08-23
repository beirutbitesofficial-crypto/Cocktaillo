const logoRaster=require('./logo-raster.js');

const W=42;
const ITEM_W=27;
const QTY_W=4;
const PRICE_W=11;
const COMMAND={
  init:Buffer.from([0x1b,0x40]),
  openDrawer:Buffer.from([0x1b,0x70,0x00,0x19,0xfa]),
  left:Buffer.from([0x1b,0x61,0x00]),
  center:Buffer.from([0x1b,0x61,0x01]),
  boldOn:Buffer.from([0x1b,0x45,0x01]),
  boldOff:Buffer.from([0x1b,0x45,0x00]),
  normal:Buffer.from([0x1d,0x21,0x00]),
  double:Buffer.from([0x1d,0x21,0x11]),
  doubleHeight:Buffer.from([0x1d,0x21,0x01]),
  reverseOn:Buffer.from([0x1d,0x42,0x01]),
  reverseOff:Buffer.from([0x1d,0x42,0x00]),
  feedAndCut:Buffer.from([0x1b,0x64,0x05,0x1d,0x56,0x00]),
};

function clean(value){return String(value??'').normalize('NFKD').replace(/[^\x20-\x7E]/g,'').replace(/\s+/g,' ').trim()}
function money(cents){return `$${(Number(cents||0)/100).toFixed(2)}`}
function lbp(value){return `${Math.round(Number(value||0)).toLocaleString('en-US')} LBP`}
function rule(character='-'){return character.repeat(W)}
function wrap(value,width){
  const text=clean(value);if(!text)return [''];
  const words=text.split(' '),lines=[];let current='';
  for(const word of words){
    if(word.length>width){if(current){lines.push(current);current=''};for(let i=0;i<word.length;i+=width)lines.push(word.slice(i,i+width));continue}
    const next=current?`${current} ${word}`:word;
    if(next.length>width){lines.push(current);current=word}else current=next;
  }
  if(current)lines.push(current);return lines.length?lines:[''];
}
function pair(left,right=''){
  const half=(W-2)/2,leftText=clean(left),rightText=clean(right);
  if(leftText.length>half||rightText.length>half)throw new RangeError('Pair column overflow');
  return leftText.padEnd(half+2)+rightText.padStart(half);
}
function pairRows(left,right=''){
  const half=(W-2)/2,leftText=clean(left),rightText=clean(right);
  if(leftText.length<=half&&rightText.length<=half)return [pair(leftText,rightText)];
  return wrap(rightText?`${leftText}  ${rightText}`:leftText,W);
}
function itemRow(item='',quantity='',price=''){
  const itemText=clean(item),quantityText=clean(quantity),priceText=clean(price);
  if(itemText.length>ITEM_W)throw new RangeError('Item column overflow');
  if(quantityText.length>QTY_W)throw new RangeError('Quantity column overflow');
  if(priceText.length>PRICE_W)throw new RangeError('Price column overflow');
  return itemText.padEnd(ITEM_W)+quantityText.padStart(QTY_W)+priceText.padStart(PRICE_W);
}
function itemRows(item='',quantity='',price=''){
  const nameLines=wrap(item,ITEM_W),quantityText=clean(quantity),priceText=clean(price),quantityFits=quantityText.length<=QTY_W,priceFits=priceText.length<=PRICE_W;
  const rows=[itemRow(nameLines[0],quantityFits?quantityText:'',priceFits?priceText:'')];
  for(const continuation of nameLines.slice(1))rows.push(itemRow(continuation,'',''));
  if(!quantityFits)for(const line of wrap(`QTY: ${quantityText}`,W))rows.push(line);
  if(!priceFits)for(const line of wrap(`PRICE: ${priceText}`,W))rows.push(line.padStart(W));
  return rows;
}
function dateParts(value){
  const parsed=new Date(value||Date.now()),date=Number.isNaN(parsed.getTime())?new Date():parsed;
  return {date:date.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}),time:date.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})};
}
function orderType(value){return ({table:'DINE IN',takeaway:'TAKEAWAY',delivery:'DELIVERY',self_service:'SELF SERVICE',split_bill:'SPLIT BILL'})[value]||clean(value).toUpperCase()||'ORDER'}
function receiptNumber(value){const number=clean(value);return /^CTL-/i.test(number)?number:`CTL-${number||'--'}`}
function tableLabel(value){const table=clean(value);if(!table)return '';return /^table\b/i.test(table)?table:`Table: ${table}`}
function qrCommands(value){
  const data=Buffer.from(String(value||''),'utf8'),len=data.length+3,pL=len&255,pH=(len>>8)&255;
  return Buffer.concat([Buffer.from([0x1d,0x28,0x6b,0x04,0x00,0x31,0x41,0x32,0x00]),Buffer.from([0x1d,0x28,0x6b,0x03,0x00,0x31,0x43,0x06]),Buffer.from([0x1d,0x28,0x6b,0x03,0x00,0x31,0x45,0x31]),Buffer.from([0x1d,0x28,0x6b,pL,pH,0x31,0x50,0x30]),data,Buffer.from([0x1d,0x28,0x6b,0x03,0x00,0x31,0x51,0x30])]);
}
function getLogoRaster(){return logoRaster}
function writer(chunks){return value=>chunks.push(Buffer.from(String(value),'ascii'))}

function receiptEscpos(receipt={},options={}){
  const chunks=[COMMAND.init];if(options.openDrawer===true)chunks.push(COMMAND.openDrawer);chunks.push(COMMAND.center,COMMAND.normal),txt=writer(chunks),stamp=dateParts(receipt.created_at),logo=getLogoRaster(),displayTable=tableLabel(receipt.table);
  if(logo){chunks.push(logo);txt('\n')}else{chunks.push(COMMAND.boldOn,COMMAND.double);txt('COCKTAILLO\n');chunks.push(COMMAND.normal,COMMAND.boldOff);txt('RESTO - CAFE\n')}
  chunks.push(COMMAND.boldOn,COMMAND.double);txt('CUSTOMER RECEIPT\n');chunks.push(COMMAND.normal,COMMAND.boldOff,COMMAND.left);txt(rule('=')+'\n');
  for(const row of pairRows(`Receipt: ${receiptNumber(receipt.order_number)}`,displayTable))txt(row+'\n');
  for(const row of pairRows(`Date: ${stamp.date}`,`Time: ${stamp.time}`))txt(row+'\n');
  for(const row of pairRows(`Type: ${orderType(receipt.type)}`,`Cashier: ${receipt.cashier||'-'}`))txt(row+'\n');
  txt(rule('-')+'\n');chunks.push(COMMAND.boldOn);txt(itemRow('ITEM','QTY','PRICE')+'\n');chunks.push(COMMAND.boldOff);txt(rule('-')+'\n');
  for(const item of receipt.items||[]){
    const quantity=Math.max(1,Number(item.quantity||1));
    for(const row of itemRows(item.name||'Item',quantity,money(item.line_total_cents)))txt(row+'\n');
    for(const addon of item.addons||[]){
      const addonQty=Math.max(1,Number(addon.quantity||1)),addonTotal=Number(addon.price_lbp||0)*addonQty*quantity;
      for(const row of itemRows(`+ ${addon.name||'Add-on'} x${addonQty}`,'',addonTotal?lbp(addonTotal):''))txt(row+'\n');
    }
  }
  txt(rule('-')+'\n');for(const row of itemRows('Subtotal','',money(receipt.subtotal_cents)))txt(row+'\n');
  if(Number(receipt.discount_cents||0)>0)for(const row of itemRows('Discount','',`-${money(receipt.discount_cents)}`))txt(row+'\n');
  txt(rule('=')+'\n');chunks.push(COMMAND.center,COMMAND.boldOn,COMMAND.double);txt(`TOTAL ${money(receipt.total_cents)}\n`);chunks.push(COMMAND.normal,COMMAND.boldOff,COMMAND.left);txt(rule('=')+'\n');
  for(const row of pairRows('Payment',receipt.payment_method||'-'))txt(row+'\n');
  if(Number(receipt.paid_usd_cents||0)>0)for(const row of pairRows('Paid USD',money(receipt.paid_usd_cents)))txt(row+'\n');
  if(Number(receipt.paid_lbp||0)>0){for(const row of pairRows('Paid LBP',lbp(receipt.paid_lbp)))txt(row+'\n');if(Number(receipt.exchange_rate||0)>0)for(const row of pairRows('Rate',lbp(receipt.exchange_rate)+' / USD'))txt(row+'\n')}
  chunks.push(COMMAND.boldOn);for(const row of pairRows('CHANGE',money(receipt.change_cents)))txt(row+'\n');chunks.push(COMMAND.boldOff);
  txt(rule('-')+'\n');chunks.push(COMMAND.center,COMMAND.boldOn);txt('SCAN & FOLLOW US\n');chunks.push(COMMAND.boldOff);
  if(receipt.instagram_url){chunks.push(qrCommands(receipt.instagram_url));txt('\n'+clean(receipt.instagram_handle||'@cocktaillorestocafe')+'\n')}
  txt(rule('-')+'\n');
  const footer=clean(receipt.footer)||'Thank you for visiting Cocktaillo';for(const line of wrap(footer,W))txt(line+'\n');
  chunks.push(COMMAND.boldOn);txt('WE HOPE TO SEE YOU AGAIN!\n');chunks.push(COMMAND.boldOff,COMMAND.feedAndCut);return Buffer.concat(chunks);
}

function ticketEscpos(ticket={}){
  const chunks=[COMMAND.init,COMMAND.center,COMMAND.normal],txt=writer(chunks),stamp=dateParts(ticket.created_at),kind=clean(ticket.kind||'NEW').toUpperCase();
  chunks.push(COMMAND.boldOn,COMMAND.reverseOn,COMMAND.double);txt(kind==='VOID'?'!!! VOID !!!\n':'BAR TICKET\n');chunks.push(COMMAND.reverseOff,COMMAND.normal);txt('COCKTAILLO - BAR\n');
  chunks.push(COMMAND.boldOn,COMMAND.double);txt(`ORDER #${clean(ticket.order_number||'--')}\n`);txt(`${(clean(ticket.table)||'COUNTER').toUpperCase()}\n`);chunks.push(COMMAND.normal,COMMAND.boldOff);
  txt(`${stamp.date}  ${stamp.time}\n`);if(ticket.staff_name)txt(`SENT BY: ${clean(ticket.staff_name).toUpperCase()}\n`);txt(rule('=')+'\n');chunks.push(COMMAND.left);
  for(const item of ticket.lines||[]){
    const quantity=Math.max(1,Number(item.quantity||1)),name=(clean(item.name_en||item.name_ar||'Item')||'Item').toUpperCase();
    chunks.push(COMMAND.boldOn,COMMAND.doubleHeight);for(const line of wrap(`${quantity} x ${name}`,W))txt(line+'\n');chunks.push(COMMAND.normal,COMMAND.boldOff);
    for(const addon of item.addons||[]){const addonQty=Math.max(1,Number(addon.quantity||1)),addonName=(clean(addon.name_en||addon.name_ar||'Add-on')||'Add-on').toUpperCase();chunks.push(COMMAND.boldOn);for(const line of wrap(`+ ADD: ${addonName} x${addonQty}`,W))txt(line+'\n');chunks.push(COMMAND.boldOff)}
    const note=clean(item.note||'');if(note){txt('\n');chunks.push(COMMAND.center,COMMAND.reverseOn,COMMAND.boldOn);txt('*** NOTE ***\n');chunks.push(COMMAND.reverseOff,COMMAND.left,COMMAND.doubleHeight);for(const line of wrap(note.toUpperCase(),W))txt(line+'\n');chunks.push(COMMAND.normal,COMMAND.boldOff);txt('\n')}
    txt(rule('-')+'\n');
  }
  chunks.push(COMMAND.center,COMMAND.boldOn,COMMAND.reverseOn,COMMAND.double);txt(kind==='VOID'?'DO NOT MAKE\n':'MAKE NOW\n');chunks.push(COMMAND.reverseOff,COMMAND.normal,COMMAND.boldOff,COMMAND.feedAndCut);return Buffer.concat(chunks);
}

module.exports={receiptEscpos,ticketEscpos,orderType,receiptNumber,__test:{W,wrap,pair,pairRows,itemRow,itemRows,tableLabel}};
