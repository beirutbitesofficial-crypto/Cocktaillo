import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { readState, publicUser } from './store.js';

const COOKIE='cocktaillo_session';
const configuredSecret=String(process.env.POS_SESSION_SECRET||'').trim();
const safeConfiguredSecret=configuredSecret.length>=32?configuredSecret:'';
const dataFile=process.env.POS_DATA_FILE||path.join(process.cwd(),'.data','cocktaillo.json');
const secretFile=process.env.POS_SESSION_SECRET_FILE||path.join(path.dirname(dataFile),'.session-secret');
let secretPromise=null;

async function loadOrCreateSessionSecret(){
  if(safeConfiguredSecret)return safeConfiguredSecret;
  await mkdir(path.dirname(secretFile),{recursive:true});
  try{
    const existing=String(await readFile(secretFile,'utf8')).trim();
    if(existing.length>=32)return existing;
    throw new Error('Persisted POS session secret is invalid.');
  }catch(e){
    if(e?.code!=='ENOENT')throw e;
  }
  const generated=`${crypto.randomUUID()}-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  try{
    const handle=await open(secretFile,'wx',0o600);
    try{await handle.writeFile(generated,'utf8')}finally{await handle.close()}
    if(process.env.NODE_ENV==='production')console.warn('[Cocktaillo] POS_SESSION_SECRET is not configured. A secure persisted session secret was generated next to the POS data file.');
    return generated;
  }catch(e){
    if(e?.code!=='EEXIST')throw e;
    const existing=String(await readFile(secretFile,'utf8')).trim();
    if(existing.length<32)throw new Error('Persisted POS session secret is invalid.');
    return existing;
  }
}
async function secret(){
  if(!secretPromise)secretPromise=loadOrCreateSessionSecret().then(value=>new TextEncoder().encode(value));
  return secretPromise;
}

export async function authenticate(username,password){const s=await readState();const u=s.users.find(x=>x.username===String(username||'').trim().toLowerCase()&&x.active);if(!u||!(await bcrypt.compare(String(password||''),u.password_hash)))return null;return publicUser(u)}
export async function makeToken(user){return new SignJWT({id:user.id,role:user.role,username:user.username,name:user.name}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('14d').sign(await secret())}
export async function getUser(){try{const jar=await cookies();const token=jar.get(COOKIE)?.value;if(!token)return null;const {payload}=await jwtVerify(token,await secret());const s=await readState();const u=s.users.find(x=>x.id===payload.id&&x.active);return u?publicUser(u):null}catch{return null}}
export async function setSession(user){const jar=await cookies();jar.set(COOKIE,await makeToken(user),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:14*86400})}
export async function clearSession(){const jar=await cookies();jar.set(COOKIE,'',{httpOnly:true,path:'/',maxAge:0})}
export function allow(user,...roles){return user&&roles.includes(user.role)}
