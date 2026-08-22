'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm(){
  const r=useRouter();
  const[username,setUsername]=useState('');
  const[password,setPassword]=useState('');
  const[error,setError]=useState('');
  const[busy,setBusy]=useState(false);

  async function submit(e){
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    setError('');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password}),signal:controller.signal});
      const data=await res.json().catch(()=>({}));
      if(!res.ok){setError(data.error||'Login failed. Please retry.');return}
      r.replace('/');
      r.refresh();
    }catch(err){
      setError(err?.name==='AbortError'?'Login server is not responding. Please retry.':'Could not reach the login server. Please retry.');
    }finally{
      clearTimeout(timeout);
      setBusy(false);
    }
  }

  return <form className="loginCard" onSubmit={submit}><div className="brandLockup"><img src="/cocktaillo-logo.svg" alt="Cocktaillo Resto Cafe" style={{width:'100%',maxWidth:330,height:'auto'}}/></div><label>Username</label><input className="input" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" placeholder="Enter username"/><label>Password</label><input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter password"/>{error&&<div className="error">{error}</div>}<button className="btn btnPrimary" disabled={busy}>{busy?'Signing in…':'Sign in to Cocktaillo'}</button></form>;
}
