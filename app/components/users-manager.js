'use client';
import {useState} from 'react';
import {Input,PageHeader,post} from './ui.js';

const blank={name:'',username:'',password:'',role:'waiter',active:true};
export default function UsersManager({data,reload}){
 const[form,setForm]=useState(blank),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false);
 async function add(){setBusy(true);try{await post('/api/actions',{action:'add_user',...form});setForm(blank);await reload()}catch(e){alert(e.message)}finally{setBusy(false)}}
 function beginEdit(u){setEditing({id:u.id,name:u.name,username:u.username,password:'',role:u.role,active:u.active})}
 async function saveEdit(){if(!editing)return;setBusy(true);try{await post('/api/actions',{action:'update_user',...editing});setEditing(null);await reload()}catch(e){alert(e.message)}finally{setBusy(false)}}
 async function remove(u){if(u.id===data.user.id)return alert('You cannot delete your own Manager account.');if(!confirm(`Delete ${u.name} (${u.username}) permanently?`))return;setBusy(true);try{await post('/api/actions',{action:'delete_user',id:u.id});if(editing?.id===u.id)setEditing(null);await reload()}catch(e){alert(e.message)}finally{setBusy(false)}}
 return <><PageHeader title="Users Management" sub="Create, edit, deactivate, reset passwords or delete staff accounts."/>
 <div className="card formGrid">
  <Input label="Full name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
  <Input label="Username" value={form.username} onChange={v=>setForm({...form,username:v})}/>
  <Input label="Password" type="password" value={form.password} onChange={v=>setForm({...form,password:v})}/>
  <div className="field"><label>Role</label><select className="input" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="waiter">Waiter</option><option value="cashier">Cashier</option><option value="manager">Manager</option></select></div>
  <button className="btn btnPrimary" disabled={busy} onClick={add}>Add User</button>
 </div>
 <div className="section list">{(data.users||[]).map(u=><div className="listRow" key={u.id}><div className="grow"><strong>{u.name}</strong><small style={{display:'block',color:'var(--muted)'}}>@{u.username} · {u.role} · {u.active?'Active':'Inactive'}{u.id===data.user.id?' · Current account':''}</small></div><button className="btn btnSoft" onClick={()=>beginEdit(u)}>Edit</button>{u.id!==data.user.id&&<button className="btn btnDanger" disabled={busy} onClick={()=>remove(u)}>Delete</button>}</div>)}</div>
 {editing&&<div className="modalBackdrop"><div className="modal"><PageHeader title={`Edit ${editing.name}`} sub="Change profile, role, status or set a new password."/><div className="formGrid"><Input label="Full name" value={editing.name} onChange={v=>setEditing({...editing,name:v})}/><Input label="Username" value={editing.username} onChange={v=>setEditing({...editing,username:v})}/><Input label="New password (optional)" type="password" value={editing.password} onChange={v=>setEditing({...editing,password:v})}/><div className="field"><label>Role</label><select className="input" value={editing.role} disabled={editing.id===data.user.id} onChange={e=>setEditing({...editing,role:e.target.value})}><option value="waiter">Waiter</option><option value="cashier">Cashier</option><option value="manager">Manager</option></select></div><div className="field"><label>Status</label><select className="input" value={editing.active?'active':'inactive'} disabled={editing.id===data.user.id} onChange={e=>setEditing({...editing,active:e.target.value==='active'})}><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div><div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:14}}><button className="btn btnSoft" onClick={()=>setEditing(null)}>Cancel</button><button className="btn btnPrimary" disabled={busy} onClick={saveEdit}>Save Changes</button></div></div></div>}
 </>;
}
