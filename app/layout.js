import './globals.css';
export const metadata={title:'Cocktaillo POS',description:'Professional resto-cafe point of sale'};
export const viewport={themeColor:'#123f2b',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function RootLayout({children}){return <html lang="en"><body>{children}</body></html>}
