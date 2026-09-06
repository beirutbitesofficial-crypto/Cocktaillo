import PhoneBarcodeScanner from '../../components/phone-barcode-scanner.js';

export const metadata={title:'Cocktaillo Phone Scanner',robots:{index:false,follow:false}};

export default async function ScannerPage({params}){
  const {token}=await params;
  return <PhoneBarcodeScanner token={token}/>;
}
