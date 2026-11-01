'use client';
import {useState} from 'react';
import {Input,PageHeader,post,usd} from './ui.js';

// Cashier screen for discounting an open order. Percent discounts apply directly;
// fixed USD discounts still need the manager PIN (enforced by the server).
export default function DiscountPanel({data,reload,language='en'}){
  const ar=language==='ar',t=(en,arabic)=>ar?arabic:en;
  const [form,setForm]=useState({order_id:'',type:'percent',value:''}),[pin,setPin]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const open=(data.orders||[]).filter(o=>['open','pending_payment'].includes(o.status));
  const tableName=o=>o.type==='table'?(data.tables.find(x=>x.id===o.table_id)?.name||t('Table','طاولة')):t('Takeaway','سفري');
  async function apply(){
    if(!form.order_id)return setMessage('✗ '+t('Choose an order.','اختار طلب.'));
    setBusy(true);setMessage('');
    try{await post('/api/actions',{action:'apply_discount',order_id:form.order_id,discount_type:form.type,value:form.value,manager_pin:pin});setPin('');setForm({...form,value:''});setMessage('✓ '+t('Discount applied.','انطبق الخصم.'));await reload()}
    catch(e){setMessage('✗ '+e.message)}finally{setBusy(false)}
  }
  return <>
    <PageHeader title={t('Discounts','الخصومات')} sub={t('Discount an open order. Fixed USD discounts need the manager PIN.','خصم على طلب مفتوح. الخصم بمبلغ ثابت بدّو رمز المدير.')}/>
    <div className="card" style={{maxWidth:820}}><h3>{t('Discount open order','خصم على طلب مفتوح')}</h3>
      <div className="formGrid">
        <div className="field"><label>{t('Order','الطلب')}</label><select className="input" value={form.order_id} onChange={e=>setForm({...form,order_id:e.target.value})}><option value="">{t('Choose order…','اختار الطلب…')}</option>{open.map(o=><option key={o.id} value={o.id}>#{o.number} · {tableName(o)} · {usd(o.totals?.total_equivalent_cents||0)}{o.discount?` · ${o.discount.type==='percent'?o.discount.value+'%':'$'+o.discount.value}`:''}</option>)}</select></div>
        <div className="field"><label>{t('Type','النوع')}</label><select className="input" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="percent">{t('Percent %','نسبة %')}</option><option value="fixed">{t('Fixed USD','مبلغ ثابت بالدولار')}</option></select></div>
        <Input label={form.type==='percent'?t('Percent (0–100)','النسبة (0–100)'):t('Amount USD','المبلغ بالدولار')} value={form.value} onChange={v=>setForm({...form,value:v})}/>
        {form.type==='fixed'&&<Input label={t('Manager PIN','رمز المدير')} type="password" value={pin} onChange={setPin}/>}
      </div>
      <button className="btn btnPrimary" style={{marginTop:12}} disabled={busy||!form.order_id||form.value===''} onClick={apply}>{t('Apply Discount','تطبيق الخصم')}</button>
      {message&&<p role="status" style={{marginTop:10,fontWeight:700,color:message.startsWith('✗')?'var(--danger, #c0392b)':'var(--text)'}}>{message}</p>}
      {!open.length&&<p style={{color:'var(--muted)',marginTop:10}}>{t('No open orders.','ما في طلبات مفتوحة.')}</p>}
    </div>
  </>;
}
