'use client';
import { useEffect } from 'react';
export default function UiBridge(){useEffect(()=>{const saved=localStorage.getItem('cocktaillo-dir');if(saved)document.documentElement.dir=saved;const click=e=>{const b=e.target.closest?.('button');if(!b||b.textContent.trim()!=='عربي')return;const next=document.documentElement.dir==='rtl'?'ltr':'rtl';document.documentElement.dir=next;localStorage.setItem('cocktaillo-dir',next);b.textContent=next==='rtl'?'English':'عربي'};document.addEventListener('click',click);return()=>document.removeEventListener('click',click)},[]);return null}
