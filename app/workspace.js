'use client';
import { useEffect,useState } from 'react';import { useRouter } from 'next/navigation';import { CounterWorkspace,TablesWorkspace } from './components/order-workspace.js';import ShiftWorkspace from './components/shift-workspace.js';import RecipeManager from './components/recipe-manager.js';import ExcelReports from './components/excel-reports.js';import SettingsPanel from './components/settings-panel.js';import UsersManager from './components/users-manager.js';import StationWorkspace from './components/station-workspace.js';import OperationsCenter from './components/operations-center.js';import ExpensesManager from './components/expenses-manager.js';import FinanceCenter from './components/finance-center.js';import ReceiptsPanel from './components/receipts-panel.js';import TableAdmin from './components/table-admin.js';import MenuAdmin from './components/menu-admin.js';import ManagerDashboard from './components/manager-dashboard.js';import WebsiteOrderNotifier from './components/website-order-notifier.js';import OnlineOrders from './components/online-orders.js';import {installPrintBridgeInterceptor,startCentralPrintWorker} from './components/print-client.js';import { Inventory } from './components/manager-modules.js';import {observeArabicUi,restoreEnglishUi} from './i18n.js';
const roleTabs={waiter:[['tables','▦','Tables'],['tableadmin','▦','Table Setup']],cashier:[['counter','＋','New Order'],['online','◎','Online Orders'],['tables','▦','Tables'],['tableadmin','▦','Table Setup'],['shift','◷','My Shift'],['receipts','▤','Receipts'],['menu','☷','Menu'],['recipes','≋','Recipes']],manager:[['dashboard','⌂','Dashboard'],['counter','＋','New Order'],['tables','▦','Tables'],['ops','✓','Operations'],['tableadmin','▦','Table Setup'],['shift','◷','Shifts'],['inventory','◫','Inventory'],['recipes','≋','Recipes'],['expenses','↘','Expenses'],['reports','⌁','Finance'],['excel','▤','Excel Reports'],['receipts','▤','Receipts'],['users','♙','Users'],['menu','☷','Menu'],['settings','⚙','Settings'],['bar','◉','Bar'],['kitchen','◌','Kitchen']]};
const navAr={Dashboard:'لوحة التحكم','New Order':'طلب جديد','Online Orders':'الطلبات الأونلاين',Tables:'الطاولات','Table Setup':'إعداد الطاولات','My Shift':'دوامي',Receipts:'الإيصالات',Menu:'القائمة',Recipes:'الوصفات',Operations:'العمليات',Shifts:'الدوامات',Inventory:'المخزون',Expenses:'المصاريف',Finance:'المالية','Excel Reports':'تقارير Excel',Users:'المستخدمون',Settings:'الإعدادات',Bar:'البار',Kitchen:'المطبخ'};
const roleAr={waiter:'نادل',cashier:'كاشير',manager:'مدير'};
export default function Workspace({initialUser}){
  const router=useRouter(),[data,setData]=useState(null),[tab,setTab]=useState(initialUser.role==='waiter'?'tables':initialUser.role==='cashier'?'counter':'dashboard'),[error,setError]=useState(''),[language,setLanguage]=useState('en');
  const languageKey=`cocktaillo-language:${initialUser.id}`;
  function toggleLanguage(){setLanguage(current=>{const next=current==='ar'?'en':'ar';try{localStorage.setItem(languageKey,next)}catch{}return next})}
  async function load(){
    try{
      const r=await fetch('/api/bootstrap',{cache:'no-store'});
      if(r.status===401){
        setError('Session verification failed. Retrying automatically — your POS screen will stay open.');
        return;
      }
      const d=await r.json().catch(()=>({}));
      if(!r.ok){setError(d.error||'Could not refresh POS data. Retrying automatically.');return}
      setError('');setData(d);
    }catch{
      setError('Connection interrupted. The POS will reconnect automatically; do not refresh or close the order screen.');
    }
  }
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});router.replace('/login');router.refresh()}
  useEffect(()=>{try{const saved=localStorage.getItem(languageKey);if(saved==='ar'||saved==='en')setLanguage(saved)}catch{}},[languageKey]);
  useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr'},[language]);
  useEffect(()=>{if(!data)return;let stop=()=>{};const frame=requestAnimationFrame(()=>{const root=document.querySelector('.app');if(language==='ar')stop=observeArabicUi(root);else restoreEnglishUi(root)});return()=>{cancelAnimationFrame(frame);stop()}},[language,data,tab]);
  useEffect(()=>installPrintBridgeInterceptor(),[]);
  useEffect(()=>{if(initialUser.role==='cashier')return startCentralPrintWorker()},[initialUser.role]);
  useEffect(()=>{
    void load();
    const timer=setInterval(()=>void load(),5000);
    const reconnect=()=>void load();
    window.addEventListener('online',reconnect);
    window.addEventListener('focus',reconnect);
    return()=>{clearInterval(timer);window.removeEventListener('online',reconnect);window.removeEventListener('focus',reconnect)};
  },[]);
  useEffect(()=>{if(data?.settings?.theme)document.documentElement.dataset.theme=data.settings.theme},[data?.settings?.theme]);
  if(!data)return <div className="loading">{language==='ar'?'عم نحمّل نظام Cocktaillo POS…':'Loading Cocktaillo POS…'}{error&&<div className="error" style={{marginTop:12}}>{error}</div>}</div>;
  const tabs=roleTabs[data.user.role],labelFor=label=>language==='ar'?(navAr[label]||label):label;
  return <div className="app" dir={language==='ar'?'rtl':'ltr'} data-language={language}><header className="topbar"><div className="topBrand"><div className="miniMark">C</div><strong>Cocktaillo</strong><span>{language==='ar'?(roleAr[data.user.role]||data.user.role):data.user.role}</span></div><div className="topActions"><button onClick={logout}>{language==='ar'?'تسجيل الخروج':'Log out'}</button><button onClick={toggleLanguage}>{language==='ar'?'English':'عربي'}</button></div></header><aside className="desktopNav">{tabs.map(([id,icon,label])=><button key={id} className={`navItem ${tab===id?'active':''}`} onClick={()=>setTab(id)}><span>{icon}</span>{labelFor(label)}</button>)}</aside><main className="main">{error&&<div className="error">{error}</div>}<ActiveModule tab={tab} data={data} reload={load} language={language}/></main><WebsiteOrderNotifier data={data} reload={load}/><nav className="mobileNav">{tabs.map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><span>{icon}</span>{labelFor(label)}</button>)}</nav></div>}
function ActiveModule({tab,data,reload,language}){if(tab==='counter')return <CounterWorkspace data={data} reload={reload} language={language}/>;if(tab==='online')return <OnlineOrders data={data} reload={reload}/>;if(tab==='tables')return <TablesWorkspace data={data} reload={reload} waiter={data.user.role==='waiter'} language={language}/>;if(tab==='ops')return <OperationsCenter data={data} reload={reload}/>;if(tab==='tableadmin')return <TableAdmin data={data} reload={reload}/>;if(tab==='shift')return <ShiftWorkspace data={data} reload={reload}/>;if(tab==='dashboard')return <ManagerDashboard data={data}/>;if(tab==='inventory')return <Inventory data={data} reload={reload}/>;if(tab==='recipes')return <RecipeManager data={data} reload={reload}/>;if(tab==='expenses')return <ExpensesManager data={data} reload={reload}/>;if(tab==='reports')return <FinanceCenter data={data}/>;if(tab==='excel')return <ExcelReports reload={reload}/>;if(tab==='receipts')return <ReceiptsPanel data={data}/>;if(tab==='users')return <UsersManager data={data} reload={reload}/>;if(tab==='menu')return <MenuAdmin data={data} reload={reload}/>;if(tab==='settings')return <SettingsPanel data={data} reload={reload}/>;if(tab==='bar'||tab==='kitchen')return <StationWorkspace data={data} reload={reload} station={tab}/>;return null}
