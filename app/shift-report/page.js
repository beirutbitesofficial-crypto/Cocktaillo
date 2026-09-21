import {getUser,allow} from '../../lib/auth.js';
import {readState} from '../../lib/store.js';
import LoginForm from '../login/login-form.js';
import ReportView from './report-view.js';
export default async function ShiftReportPage({searchParams}){
  const params=await searchParams,id=String(params.shift_id||''),user=await getUser();
  if(!user)return <main className="loginPage"><LoginForm nextHref={`/shift-report?shift_id=${encodeURIComponent(id)}`}/></main>;
  const s=await readState(),report=(s.shift_reports||[]).find(r=>r.shift_id===id);
  if(!allow(user,'manager','cashier')||!report||(user.role!=='manager'&&report.user_id!==user.id))return <main className="loginPage">التقرير غير متاح لهذا الحساب / Report unavailable for this account.</main>;
  return <ReportView report={report}/>;
}
