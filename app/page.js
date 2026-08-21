import { redirect } from 'next/navigation';
import { getUser } from '../lib/auth.js';
import Workspace from './workspace.js';
export default async function Home(){const user=await getUser();if(!user)redirect('/login');return <Workspace initialUser={user}/>}
