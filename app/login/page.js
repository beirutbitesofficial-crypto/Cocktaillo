import { redirect } from 'next/navigation';
import { getUser } from '../../lib/auth.js';
import LoginForm from './login-form.js';
export default async function LoginPage(){if(await getUser())redirect('/');return <main className="loginPage"><LoginForm/></main>}
