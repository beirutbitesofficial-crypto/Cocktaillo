'use client';
import {useEffect,useRef,useState} from 'react';
import {Input,PageHeader,Stat,fmt,post,usd} from './ui.js';
export default function ShiftWorkspace({data,reload,language='en'}){
  const [usdValue,setUsdValue]=useState(''),[lbpValue,setLbpValue]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const lock=useRef(false),deliveryLock=useRef(false),ar=language==='ar',t=(en,arabic)=>ar?arabic:en;
  const open=(data.shifts||[]).find(s=>s.user_id===data.user.id&&s.status==='open');
  const summary=open&&data.cashier_shift_summary?.shift_id===open.id?data.cashier_shift_summary:null;
  const deliveries=data.report_deliveries||[],reports=(data.shifts||[]).filter(s=>s.status==='closed').slice().reverse();
  const statusText=status=>({pending:t('Waiting to send','بانتظار الإرسال'),sending:t('Sending','جارٍ الإرسال'),not_configured:t('WhatsApp setup required','واتساب بحاجة للربط'),accepted:t('Accepted by WhatsApp; delivery not confirmed','واتساب قبل الرسالة؛ الوصول بعده مش مؤكّد'),sent:t('Sent; delivery not confirmed','انبعث؛ الوصول بعده مش مؤكّد'),delivered:t('Delivered','وصل'),read:t('Read','انقرت'),failed:t('Failed — manager can retry','فشل الإرسال — المدير فيه يعيد المحاولة'),uncertain:t('Unconfirmed — check WhatsApp before resending','غير مؤكّد — تأكّد من واتساب قبل إعادة الإرسال')}[status]||status);
  // Recover a saved but unstarted delivery after a browser/server interruption.
  useEffect(()=>{const d=deliveries.find(d=>['pending','sending'].includes(d.status));if(!d||deliveryLock.current)return;deliveryLock.current=true;post('/api/shift-report',{shift_id:d.shift_id}).catch(()=>{}).finally(()=>{deliveryLock.current=false})},[data]);
  async function act(){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{
    if(open){const out=await post('/api/shift-close',{shift_id:open.id,closing_usd:usdValue,closing_lbp:lbpValue});setMessage(t(`Shift saved. ${out.report.order_count} orders. Print queued. WhatsApp: `,`انحفظ الشيفت. ${out.report.order_count} طلبات. الورقة بانتظار الطباعة. واتساب: `)+statusText(out.whatsapp.status))}
    else await post('/api/actions',{action:'open_shift',opening_usd:usdValue,opening_lbp:lbpValue});
    setUsdValue('');setLbpValue('');await reload();
  }catch(e){setMessage(e.message)}finally{lock.current=false;setBusy(false)}}
  async function retry(id){if(lock.current)return;lock.current=true;setBusy(true);try{const out=await post('/api/shift-report',{shift_id:id,retry:true});setMessage(statusText(out.delivery.status));await reload()}catch(e){setMessage(e.message)}finally{lock.current=false;setBusy(false)}}
  return <><PageHeader title={t('Shift closing reports','تقارير إقفال الشيفت')} sub={t('Saved orders, item counts and cash reconciliation in USD and LBP.','طلبات محفوظة وجردة أصناف ومطابقة الصندوق بالدولار واللبناني.')}/>
    <div className="cards"><Stat label={t('Status','الحالة')} value={open?t('OPEN','مفتوح'):t('CLOSED','مقفل')}/><Stat label={t('Opening USD','افتتاح بالدولار')} value={usd(Math.round(Number(open?.opening_usd||0)*100))}/><Stat label={t('Opening LBP','افتتاح باللبناني')} value={`${fmt(open?.opening_lbp||0)} LBP`}/>{data.user.role==='cashier'&&open&&<><Stat label={t('Recorded sales','المبيعات المسجّلة')} value={usd(summary?.sales_cents||0)}/><Stat label={t('Estimated cash USD','الصندوق المتوقّع بالدولار')} value={usd(Math.round(Number(summary?.expected_usd||0)*100))}/><Stat label={t('Estimated cash LBP','الصندوق المتوقّع باللبناني')} value={`${fmt(summary?.expected_lbp||0)} LBP`}/></>}</div>
    <div className="card section" style={{maxWidth:760}}><h2>{open?t('Close current shift','إقفال الشيفت الحالي'):t('Open shift','فتح شيفت')}</h2><p>{open?t('Count the physical cash separately in both currencies. The live estimated cash above includes opening cash, paid receipts, returned change, refunds and drawer expenses. Enter zero for an empty currency. The saved report excludes unpaid orders.','عدّ الموجود بالصندوق بكل عملة لحالها. الصندوق المتوقّع فوق بينحسب من رصيد الافتتاح، الإيصالات المدفوعة، الباقي المرجوع، المرتجعات ومصاريف الصندوق. اكتب صفر إذا ما في مصاري بهالعملة. الطلبات غير المدفوعة ما بتدخل بحساب الصندوق.'):t('Enter the opening cash in both currencies.','دخل رصيد افتتاح الصندوق بكل عملة.')}</p>
      <div className="formGrid"><Input label={open?t('Counted USD','المعدود بالدولار'):t('Opening USD','افتتاح بالدولار')} value={usdValue} onChange={setUsdValue}/><Input label={open?t('Counted LBP','المعدود باللبناني'):t('Opening LBP','افتتاح باللبناني')} value={lbpValue} onChange={setLbpValue}/></div>
      <button disabled={busy||usdValue.trim()===''||lbpValue.trim()===''} className="btn btnPrimary" style={{marginTop:16}} onClick={act}>{busy?t('Saving…','جارٍ الحفظ…'):open?t('Close, save and print','إقفال وحفظ وطباعة'):t('Open shift','فتح الشيفت')}</button>
      {message&&<p role="status">{message}</p>}
    </div>
    <div className="section list">{reports.map(s=>{const delivery=deliveries.find(d=>d.shift_id===s.id),job=(data.print_jobs||[]).find(j=>j.shift_id===s.id);return <div className="card" key={s.id}>
      <strong>{s.user_name}</strong><p>{new Date(s.opened_at).toLocaleString(ar?'ar-LB':'en-GB')} — {new Date(s.closed_at).toLocaleString(ar?'ar-LB':'en-GB')}</p>
      <p>{t('Expected','المتوقّع')}: {usd(Math.round(Number(s.expected_usd||0)*100))} / {fmt(s.expected_lbp||0)} LBP</p>
      <p>{t('Counted','المعدود')}: {usd(Math.round(Number(s.closing_usd||0)*100))} / {fmt(s.closing_lbp||0)} LBP</p>
      <p>{t('Variance','الفرق')}: {usd(Math.round(Number(s.variance_usd||0)*100))} / {fmt(s.variance_lbp||0)} LBP</p>
      {delivery&&<p>WhatsApp: {statusText(delivery.status)}</p>}
      {job&&<p>{t('Printer','الطابعة')}: {job.status==='printed'?t('Printed','انطبعت'):job.status==='failed'?t('Printing failed — check cashier printer','فشلت الطباعة — افحص طابعة الكاشير'):t('Queued / printing','بانتظار الطباعة / جارٍ الطباعة')}</p>}
      {s.report_id&&<a className="btn btnSoft" href={`/shift-report?shift_id=${encodeURIComponent(s.id)}`}>{t('View detailed report','عرض التقرير المفصّل')}</a>}
      {data.user.role==='manager'&&delivery&&['not_configured','failed'].includes(delivery.status)&&<button className="btn btnSoft" style={{marginInlineStart:8,marginTop:8}} disabled={busy} onClick={()=>retry(s.id)}>{t('Retry WhatsApp','إعادة إرسال واتساب')}</button>}
    </div>})}</div>
  </>
}
