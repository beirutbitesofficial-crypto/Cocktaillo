'use client';
import {useEffect,useId,useRef,useState} from 'react';

export default function BarcodeField({value,onChange,label='Scan Product Code',focusRequestKey=0}){
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState('');
  const reactId=useId();
  const readerId=useRef(`product-reader-${reactId.replace(/:/g,'')}`);
  const scanner=useRef(null);
  const inputRef=useRef(null);

  async function start(){
    setOpen(true);setStatus('Starting camera…');
    try{
      const {Html5Qrcode}=await import('html5-qrcode');
      await new Promise(resolve=>setTimeout(resolve,50));
      const instance=new Html5Qrcode(readerId.current,{verbose:false});
      scanner.current=instance;
      await instance.start({facingMode:'environment'},{fps:12,qrbox:{width:280,height:150},aspectRatio:1.777},decoded=>{
        const code=String(decoded||'').trim().replace(/\s+/g,'');
        if(!code)return;
        onChange(code);setStatus(`✓ ${code}`);
        if(navigator.vibrate)navigator.vibrate(80);
        void stop(450);
      },()=>{});
      setStatus('Point the camera at the product barcode.');
    }catch(error){setStatus(`Camera unavailable: ${error.message}`)}
  }

  async function stop(delay=0){
    if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
    const instance=scanner.current;scanner.current=null;
    if(instance){try{await instance.stop()}catch{}try{await instance.clear()}catch{}}
    setOpen(false);
  }

  useEffect(()=>{
    if(!focusRequestKey)return;
    const timer=setTimeout(()=>{inputRef.current?.focus();inputRef.current?.select()},120);
    return()=>clearTimeout(timer);
  },[focusRequestKey]);

  useEffect(()=>()=>{const instance=scanner.current;if(instance){instance.stop().catch(()=>{}).finally(()=>instance.clear().catch(()=>{}))}},[]);

  return <div className="field barcodeField barcodeFieldPrimary">
    <label>{label}</label>
    <div className="barcodeFieldRow"><input ref={inputRef} className="input" value={value||''} onChange={e=>onChange(e.target.value.replace(/\s+/g,''))} placeholder="Click here, then scan with the barcode machine" inputMode="numeric" autoComplete="off"/><button type="button" className="btn btnPrimary" onClick={start}>📷 Scan Code</button></div>
    <small>{value?`Current code: ${value} · Scan again to replace it.`:'Scan with the USB barcode machine, or tap Scan Code to use the phone/tablet camera. The code fills in automatically.'}</small>
    {open&&<div className="modalBackdrop"><div className="modal barcodeCameraModal"><strong>Scan Product Code</strong><div id={readerId.current} className="phoneCamera"/><div className="barcodeStatus">{status}</div><button type="button" className="btn btnSoft" onClick={()=>void stop()}>Cancel</button></div></div>}
  </div>;
}
