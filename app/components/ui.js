'use client';
export const usd=c=>`$${((Number(c)||0)/100).toFixed(2)}`;
export const fmt=n=>Number(n||0).toLocaleString();
export function PageHeader({title,sub,action}){return <div className="pageTitle"><div><h1>{title}</h1>{sub&&<p>{sub}</p>}</div>{action}</div>}
export function Stat({label,value}){return <div className="card stat"><label>{label}</label><strong>{value}</strong></div>}
export function Input({label,value,onChange,type='text',placeholder=''}){return <div className="field"><label>{label}</label><input className="input" type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></div>}
export async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
