'use client';
import {useEffect,useRef,useState} from 'react';

export default function PhoneBarcodeScanner({token}){
  const readerId=useRef(`reader-${Math.random().toString(36).slice(2)}`);
  const scanner=useRef(null);
  const [status,setStatus]=useState('Tap Start Camera to scan products.');
  const [running,setRunning]=useState(false);
  const [manual,setManual]=useState('');
  const last=useRef({code:'',at:0});

  async function send(code){
    const barcode=String(code||'').trim().replace(/\s+/g,'');
    if(!barcode)return;
    const now=Date.now();
    if(last.current.code===barcode&&now-last.current.at<900)return;
    last.current={code:barcode,at:now};
    try{
      const r=await fetch('/api/scanner-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'push',token,barcode})});
      const out=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(out.error||'Could not send barcode.');
      setStatus(`✓ Sent ${barcode}`);
      if(navigator.vibrate)navigator.vibrate(80);
    }catch(error){setStatus(`✕ ${error.message}`)}
  }

  async function start(){
    if(running)return;
    try{
      const {Html5Qrcode}=await import('html5-qrcode');
      const instance=new Html5Qrcode(readerId.current,{verbose:false});
      scanner.current=instance;
      await instance.start({facingMode:'environment'},{fps:12,qrbox:{width:280,height:150},aspectRatio:1.777},decoded=>void send(decoded),()=>{});
      setRunning(true);setStatus('Camera ready — point it at a product barcode.');
    }catch(error){setStatus(`Camera unavailable: ${error.message}`)}
  }

  async function stop(){
    const instance=scanner.current;
    scanner.current=null;
    if(instance){try{await instance.stop()}catch{}try{await instance.clear()}catch{}}
    setRunning(false);setStatus('Camera stopped.');
  }

  useEffect(()=>()=>{const instance=scanner.current;if(instance){instance.stop().catch(()=>{}).finally(()=>instance.clear().catch(()=>{}))}},[]);

  return <main className="phoneScannerPage">
    <div className="phoneScannerCard">
      <div className="phoneScannerBrand"><div className="miniMark">C</div><div><strong>Cocktaillo</strong><small>Cashier Phone Scanner</small></div></div>
      <div id={readerId.current} className="phoneCamera"/>
      <div className={`scannerStatus ${status.startsWith('✕')?'bad':'good'}`}>{status}</div>
      <div className="scannerActions">
        {!running?<button className="btn btnPrimary" onClick={start}>Start Camera</button>:<button className="btn btnDanger" onClick={stop}>Stop Camera</button>}
      </div>
      <div className="manualScan">
        <label>Manual barcode fallback</label>
        <div><input className="input" inputMode="numeric" value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){void send(manual);setManual('')}}} placeholder="Type barcode"/><button className="btn btnSoft" onClick={()=>{void send(manual);setManual('')}}>Send</button></div>
      </div>
      <small className="scannerHint">Keep this page open while the cashier POS is paired. Each successful scan is sent directly to that cashier session.</small>
    </div>
  </main>;
}
