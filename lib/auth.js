import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { readState, publicUser } from './store.js';

const COOKIE='cocktaillo_session';
const configuredSecret=String(process.env.POS_SESSION_SECRET||'').trim();
const safeConfiguredSecret=configuredSecret.length>=32?configuredSecret:'';
const sessionSecret=safeConfiguredSecret||`${crypto.randomUUID()}-${crypto.randomUUID()}`;
if(process.env.NODE_ENV==='production'&&!safeConfiguredSecret){console.warn('[Cocktaillo] POS_SESSION_SECRET is missing or shorter than 32 characters. A secure temporary session secret is being used, so users will need to sign in again after a server restart.');}
const secret=()=>new TextEncoder().encode(sessionSecret);
export async function authenticate(username,password){const s=await readState();const u=s.users.find(x=>x.username===String(username||'').trim().toLowerCase()&&x.active);if(!u||!(await bcrypt.compare(String(password||''),u.password_hash)))return null;return publicUser(u)}
export async function makeToken(user){return new SignJWT({id:user.id,role:user.role,username:user.username,name:user.name}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('14d').sign(secret())}
export async function getUser(){try{const jar=await cookies();const token=jar.get(COOKIE)?.value;if(!token)return null;const {payload}=await jwtVerify(token,secret());const s=await readState();const u=s.users.find(x=>x.id===payload.id&&x.active);return u?publicUser(u):null}catch{return null}}
export async function setSession(user){const jar=await cookies();jar.set(COOKIE,await makeToken(user),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:14*86400})}
export async function clearSession(){const jar=await cookies();jar.set(COOKIE,'',{httpOnly:true,path:'/',maxAge:0})}
export function allow(user,...roles){return user&&roles.includes(user.role)}
