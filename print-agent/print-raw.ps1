param([Parameter(Mandatory=$true)][string]$PrinterName,[string]$Base64)
$source=@"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public class DOCINFOA { [MarshalAs(UnmanagedType.LPStr)] public string pDocName; [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
 [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
 [DllImport("winspool.Drv", EntryPoint="ClosePrinter")] public static extern bool ClosePrinter(IntPtr hPrinter);
 [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
 [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool EndDocPrinter(IntPtr hPrinter);
 [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool StartPagePrinter(IntPtr hPrinter);
 [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool EndPagePrinter(IntPtr hPrinter);
 [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
 public static void Send(string printerName, byte[] bytes) {
  IntPtr h; if(!OpenPrinter(printerName,out h,IntPtr.Zero)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"OpenPrinter failed");
  try { var d=new DOCINFOA(){pDocName="Cocktaillo Receipt",pDataType="RAW"}; if(!StartDocPrinter(h,1,d)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"StartDocPrinter failed");
   try { if(!StartPagePrinter(h)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"StartPagePrinter failed"); IntPtr p=Marshal.AllocCoTaskMem(bytes.Length); try { Marshal.Copy(bytes,0,p,bytes.Length); int written; if(!WritePrinter(h,p,bytes.Length,out written)||written!=bytes.Length) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),"WritePrinter failed"); } finally { Marshal.FreeCoTaskMem(p); } EndPagePrinter(h); } finally { EndDocPrinter(h); }
  } finally { ClosePrinter(h); }
 }
}
"@
Add-Type -TypeDefinition $source -ErrorAction Stop
if([string]::IsNullOrWhiteSpace($Base64)){$Base64=[Console]::In.ReadToEnd()}
$bytes=[Convert]::FromBase64String($Base64)
[RawPrinter]::Send($PrinterName,$bytes)
Write-Output '{"ok":true}'
