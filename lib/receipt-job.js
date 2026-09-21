// Commit the receipt print job with the payment, so a lost browser response cannot lose the paper.
export function queuePaidReceipt(state,receipt,now=new Date().toISOString()){
  const jobs=state.print_jobs??=[];
  const existing=jobs.find(j=>j.receipt_id===receipt.id&&j.destination==='customer'&&j.mode==='automatic');
  if(existing)return existing;
  const job={id:`print-paid-${receipt.id}`,receipt_id:receipt.id,order_id:receipt.order_id,order_number:receipt.number,destination:'customer',mode:'automatic',open_drawer:true,status:'pending',printer_name:state.settings.customer_printer_name||'Customer Receipt',created_at:now,updated_at:now,attempts:0,requested_by:receipt.cashier};
  jobs.push(job);return job;
}
