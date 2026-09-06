import './globals.css';
import './theme.css';
import UiBridge from './ui-bridge.js';
export const metadata={title:'Cocktaillo POS',description:'Professional resto-cafe point of sale',manifest:'/manifest.webmanifest',applicationName:'Cocktaillo POS',appleWebApp:{capable:true,title:'Cocktaillo POS',statusBarStyle:'default'},icons:{icon:'/cocktaillo-logo.svg',apple:'/cocktaillo-logo.svg'}};
export const viewport={themeColor:'#123f2b',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}){return <html lang="en" dir="ltr"><body><UiBridge/>{children}</body></html>}
