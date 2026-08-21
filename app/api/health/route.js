import { NextResponse } from 'next/server';
export async function GET(){return NextResponse.json({ok:true,app:'Cocktaillo POS',version:'1.0.0',time:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
