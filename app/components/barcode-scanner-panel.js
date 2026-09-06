'use client';
import {useEffect,useRef,useState} from 'react';

function clean(value){return String(value||'').trim().replace(/\s+/g,'')}
function feedback(ok){
  try{
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(AudioCtx){const ctx=new AudioCtx(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=ok?880:220;gain.gain.value=.06;osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.08);setTimeout(()=>ctx.close().catch(()=>{}),180)}
  }catch{}
  if(navigator.vibrate)navigator.vibrate(ok?60:[90,50,90]);
}

export default function BarcodeScannerPanel({menu,onBarcode,disabled=false}){
  const [manual,setManual]=useState('');
  const [status,setStatus]=useState('USB scanner ready. Scan a barcode or connect a phone.');
  const [session,setSession]=useState(null);
  const [qr,setQr]=useState('');
  const [pairing,setPairing]=useState(false);
  const lastSeq=useRef(0);
  const buffer=useRef('');
  const lastKey=useRef(0);

  async function resolve(code,source='scanner'){
    const barcode=clean(code);
    if(!barcode||disabled)return;
    const item=(menu||[]).find(x=>clean(x.barcode)===barcode&&x.available!==false&&!x.deleted);
    if(!item){setStatus(`✕ Product not found: ${barcode}`);feedback(false);return}
    onBarcode(item,barcode,source);
    setStatus(`✓ ${item.name_en} · ${barcode}`);
    feedback(true);
  }

  useEffect(()=>{
    function keydown(event){
      const tag=event.target?.tagName;
      const editable=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||event.target?.isContentEditable;
      if(editable)return;
      const now=Date.now();
      if(event.key==='Enter'){
        const code=buffer.current;
        buffer.current='';lastKey.current=0;
        if(code.length>=3){event.preventDefault();void resolve(code,'usb')}
        return;
      }
      if(event.key.length!==1)return;
      if(lastKey.current&&now-lastKey.current>120)buffer.current='';
      buffer.current+=event.key;
      lastKey.current=now;
      if(buffer.current.length>128)buffer.current=buffer.current.slice(-128);
    }
    window.addEventListener('keydown',keydown,true);
    return()=>window.removeEventListener('keydown',keydown,true);
  },[menu,disabled]);

  useEffect(()=>{
    if(!session?.id)return;
    let stopped=false;
    async function poll(){
      try{
        const r=await fetch(`/api/scanner-session?id=${encodeURIComponent(session.id)}&after=${lastSeq.current}`,{cache:'no-store'});
        const out=await r.json().catch(()=>({}));
        if(!r.ok){if(out.expired&&!stopped){setStatus('Phone scanner session expired.');setSession(null);setQr('')}return}
        for(const scan of out.scans||[]){lastSeq.current=Math.max(lastSeq.current,Number(scan.seq||0));await resolve(scan.barcode,'phone')}
      }catch{}
    }
    void poll();
    const timer=setInterval(()=>void poll(),900);
    return()=>{stopped=true;clearInterval(timer)};
  },[session?.id,menu,disabled]);

  async function connectPhone(){
    if(pairing)return;
    setPairing(true);
    try{
      const r=await fetch('/api/scanner-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create'})});
      const out=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(out.error||'Could not create scanner session.');
      lastSeq.current=0;setSession(out);
      const QRCode=(await import('qrcode')).default;
      setQr(await QRCode.toDataURL(out.scan_url,{width:230,margin:1,errorCorrectionLevel:'M'}));
      setStatus('Phone scanner paired. Keep this cashier screen open.');
    }catch(error){setStatus(`✕ ${error.message}`)}finally{setPairing(false)}
  }

  async function disconnect(){
    const id=session?.id;
    setSession(null);setQr('');lastSeq.current=0;
    if(id)fetch('/api/scanner-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close',id})}).catch(()=>{});
    setStatus('Phone scanner disconnected. USB scanner is still ready.');
  }

  async function copyLink(){
    if(!session?.scan_url)return;
    try{await navigator.clipboard.writeText(session.scan_url);setStatus('Phone scanner link copied.')}catch{setStatus('Could not copy link automatically.')}
  }

  return <div className="barcodePanel card">
    <div className="barcodePanelHead">
      <div><strong>Barcode Scanner</strong><small>USB scanner + paired phone camera</small></div>
      <span className={`scannerDot ${session?'online':''}`}>{session?'PHONE CONNECTED':'USB READY'}</span>
    </div>
    <div className="barcodeManual">
      <input className="input" value={manual} disabled={disabled} onChange={e=>setManual(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){void resolve(manual,'manual');setManual('')}}} placeholder="Scan or enter barcode…" inputMode="numeric"/>
      <button className="btn btnSoft" disabled={disabled||!manual} onClick={()=>{void resolve(manual,'manual');setManual('')}}>Add</button>
    </div>
    <div className={`barcodeStatus ${status.startsWith('✕')?'bad':''}`}>{status}</div>
    {!session?<button className="btn btnSoft" disabled={disabled||pairing} onClick={connectPhone}>{pairing?'Creating session…':'Connect Phone Scanner'}</button>:<div className="phonePairBox">
      {qr&&<img src={qr} alt="Pair phone scanner QR code" className="pairQr"/>}
      <div><strong>Scan this QR with the phone</strong><small>It opens a temporary camera scanner linked only to this cashier session.</small><div className="pairActions"><button className="btn btnSoft" onClick={copyLink}>Copy Link</button><button className="btn btnDanger" onClick={disconnect}>Disconnect</button></div></div>
    </div>}
  </div>;
}
