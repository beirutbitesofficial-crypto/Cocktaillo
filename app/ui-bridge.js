'use client';
import { useEffect } from 'react';
// Language and direction are owned by the workspace; clear the legacy global toggle state so it cannot fight React.
export default function UiBridge(){useEffect(()=>{try{localStorage.removeItem('cocktaillo-dir')}catch{}},[]);return null}
