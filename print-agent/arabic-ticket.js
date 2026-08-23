'use strict';

const {spawn}=require('node:child_process');

const PAPER_WIDTH=576;
const MAX_CANVAS_HEIGHT=16000;
const RASTER_COMMAND=Buffer.from([0x1d,0x76,0x30,0x00]);

function cleanText(value){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
}

function dateParts(value){
  const parsed=new Date(value||Date.now()),date=Number.isNaN(parsed.getTime())?new Date():parsed;
  return {
    date:date.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric'}),
    time:date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}),
  };
}

function arabicTableLabel(value){
  const table=cleanText(value);
  if(!table)return 'كاونتر';
  if(/^طاولة\b/u.test(table))return table;
  const english=table.match(/^table\s*[:#-]?\s*(.+)$/i);
  return english?'طاولة '+english[1]:'الطاولة: '+table;
}

function textBlock(text,{size=26,bold=false,align='right',rtl=true,inverse=false,top=5,bottom=5,indent=0}={}){
  return {type:'text',text:cleanText(text),size,bold,align,rtl,inverse,top,bottom,indent};
}

function ruleBlock(){return {type:'rule',top:7,bottom:7}}

function buildArabicTicketDocument(ticket={}){
  const kind=cleanText(ticket.kind||'NEW').toUpperCase(),isVoid=kind==='VOID',stamp=dateParts(ticket.created_at);
  const orderNumber=cleanText(ticket.order_number||'--'),staff=cleanText(ticket.staff_name||''),blocks=[];
  blocks.push(textBlock(isVoid?'إلغاء طلب البار':'طلب بار جديد',{size:38,bold:true,align:'center',inverse:true,top:12,bottom:12}));
  blocks.push(textBlock('كوكتايلو - البار',{size:28,bold:true,align:'center',top:10,bottom:3}));
  blocks.push(textBlock('طلب رقم '+orderNumber,{size:36,bold:true,align:'center',top:5,bottom:2}));
  blocks.push(textBlock(arabicTableLabel(ticket.table),{size:38,bold:true,align:'center',top:2,bottom:6}));
  blocks.push(textBlock(stamp.date+'   '+stamp.time,{size:23,bold:true,align:'center',rtl:false,top:3,bottom:4}));
  if(staff)blocks.push(textBlock('الويتر: '+staff,{size:25,bold:true,top:3,bottom:5}));
  blocks.push(ruleBlock());
  for(const item of Array.isArray(ticket.lines)?ticket.lines:[]){
    const quantity=Math.max(1,Number(item.quantity||1)),name=cleanText(item.name_ar||item.name_en||'صنف');
    blocks.push(textBlock(quantity+' × '+name,{size:36,bold:true,top:8,bottom:6}));
    for(const addon of Array.isArray(item.addons)?item.addons:[]){
      const addonQty=Math.max(1,Number(addon.quantity||1)),addonName=cleanText(addon.name_ar||addon.name_en||'إضافة');
      blocks.push(textBlock('+ إضافة: '+addonName+' × '+addonQty,{size:27,bold:true,top:3,bottom:3,indent:20}));
    }
    const note=cleanText(item.note||'');
    if(note)blocks.push(textBlock('ملاحظة: '+note,{size:31,bold:true,inverse:true,top:8,bottom:8}));
    blocks.push(ruleBlock());
  }
  blocks.push(textBlock(isVoid?'لا تحضّر الطلب':'حضّر الطلب الآن',{size:40,bold:true,align:'center',inverse:true,top:13,bottom:13}));
  return {width:PAPER_WIDTH,max_height:MAX_CANVAS_HEIGHT,blocks};
}

const POWERSHELL_RENDER_SCRIPT=String.raw`
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[System.Text.ASCIIEncoding]::new()
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class CocktailloRasterEncoder
{
    public static byte[] Encode(Bitmap bitmap, int requestedHeight)
    {
        int width = bitmap.Width;
        int height = Math.Max(1, Math.Min(requestedHeight, bitmap.Height));
        int widthBytes = (width + 7) / 8;
        Rectangle rectangle = new Rectangle(0, 0, width, height);
        BitmapData locked = bitmap.LockBits(rectangle, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        try
        {
            int absoluteStride = Math.Abs(locked.Stride);
            byte[] source = new byte[absoluteStride * height];
            Marshal.Copy(locked.Scan0, source, 0, source.Length);
            using (MemoryStream output = new MemoryStream())
            {
                output.WriteByte(0x1b);
                output.WriteByte(0x40);
                const int maxRowsPerCommand = 512;
                for (int top = 0; top < height; top += maxRowsPerCommand)
                {
                    int rows = Math.Min(maxRowsPerCommand, height - top);
                    output.WriteByte(0x1d);
                    output.WriteByte(0x76);
                    output.WriteByte(0x30);
                    output.WriteByte(0x00);
                    output.WriteByte((byte)(widthBytes & 0xff));
                    output.WriteByte((byte)((widthBytes >> 8) & 0xff));
                    output.WriteByte((byte)(rows & 0xff));
                    output.WriteByte((byte)((rows >> 8) & 0xff));
                    byte[] raster = new byte[widthBytes * rows];
                    for (int localY = 0; localY < rows; localY++)
                    {
                        int y = top + localY;
                        int sourceRow = locked.Stride >= 0 ? y * absoluteStride : (height - 1 - y) * absoluteStride;
                        int targetRow = localY * widthBytes;
                        for (int x = 0; x < width; x++)
                        {
                            int pixel = sourceRow + (x * 3);
                            int blue = source[pixel];
                            int green = source[pixel + 1];
                            int red = source[pixel + 2];
                            int luminance = ((red * 299) + (green * 587) + (blue * 114)) / 1000;
                            if (luminance < 205) raster[targetRow + (x >> 3)] |= (byte)(0x80 >> (x & 7));
                        }
                    }
                    output.Write(raster, 0, raster.Length);
                }
                output.WriteByte(0x1b);
                output.WriteByte(0x64);
                output.WriteByte(0x05);
                output.WriteByte(0x1d);
                output.WriteByte(0x56);
                output.WriteByte(0x00);
                return output.ToArray();
            }
        }
        finally
        {
            bitmap.UnlockBits(locked);
        }
    }
}
'@

$document=[Console]::In.ReadToEnd() | ConvertFrom-Json
$width=[int]$document.width
$maxHeight=[int]$document.max_height
$bitmap=[System.Drawing.Bitmap]::new($width,$maxHeight,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics=[System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.PageUnit=[System.Drawing.GraphicsUnit]::Pixel
  $graphics.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $margin=20
  [single]$y=10
  foreach($block in @($document.blocks)) {
    [single]$top=[single]($block.top)
    [single]$bottom=[single]($block.bottom)
    $y += $top
    if([string]$block.type -eq 'rule') {
      $pen=[System.Drawing.Pen]::new([System.Drawing.Color]::Black,3)
      try { $graphics.DrawLine($pen,$margin,$y,$width-$margin,$y) } finally { $pen.Dispose() }
      $y += 3 + $bottom
      continue
    }
    $style=if([bool]$block.bold){[System.Drawing.FontStyle]::Bold}else{[System.Drawing.FontStyle]::Regular}
    $font=[System.Drawing.Font]::new('Tahoma',[single]$block.size,$style,[System.Drawing.GraphicsUnit]::Pixel)
    $format=[System.Drawing.StringFormat]::new()
    try {
      $format.Trimming=[System.Drawing.StringTrimming]::Word
      if([bool]$block.rtl){$format.FormatFlags=[System.Drawing.StringFormatFlags]::DirectionRightToLeft}
      if([string]$block.align -eq 'center'){$format.Alignment=[System.Drawing.StringAlignment]::Center}
      elseif([string]$block.align -eq 'left'){$format.Alignment = if([bool]$block.rtl){[System.Drawing.StringAlignment]::Far}else{[System.Drawing.StringAlignment]::Near}}
      else {$format.Alignment = if([bool]$block.rtl){[System.Drawing.StringAlignment]::Near}else{[System.Drawing.StringAlignment]::Far}}
      $format.LineAlignment=[System.Drawing.StringAlignment]::Near
      [single]$indent=[single]($block.indent)
      [single]$contentWidth=$width-(2*$margin)-$indent
      $measureArea=[System.Drawing.SizeF]::new($contentWidth,$maxHeight-$y)
      $measured=$graphics.MeasureString([string]$block.text,$font,$measureArea,$format)
      [single]$textHeight=[Math]::Ceiling([Math]::Max($font.Height,$measured.Height))+4
      [single]$blockHeight=$textHeight+$bottom
      if($y+$blockHeight+20 -ge $maxHeight){throw 'Arabic Bar ticket is too long to render.'}
      [single]$x=$margin
      $rectangle=[System.Drawing.RectangleF]::new($x,$y,$contentWidth,$textHeight)
      $brush=if([bool]$block.inverse){[System.Drawing.Brushes]::White}else{[System.Drawing.Brushes]::Black}
      if([bool]$block.inverse){$graphics.FillRectangle([System.Drawing.Brushes]::Black,0,$y-2,$width,$textHeight+4)}
      $graphics.DrawString([string]$block.text,$font,$brush,$rectangle,$format)
      $y += $blockHeight
    }
    finally {
      $format.Dispose()
      $font.Dispose()
    }
  }
  $height=[int][Math]::Ceiling($y+12)
  $bytes=[CocktailloRasterEncoder]::Encode($bitmap,$height)
  [Console]::Write([Convert]::ToBase64String($bytes))
}
finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
`;

function renderArabicTicket(ticket={},options={}){
  if(process.platform!=='win32')return Promise.reject(new Error('Arabic Bar ticket raster rendering requires Windows.'));
  const spawnProcess=options.spawnProcess||spawn,document=buildArabicTicketDocument(ticket);
  const encoded=Buffer.from(POWERSHELL_RENDER_SCRIPT,'utf16le').toString('base64');
  return new Promise((resolve,reject)=>{
    const processHandle=spawnProcess('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',encoded],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='',settled=false;
    const finishError=error=>{if(settled)return;settled=true;reject(error)};
    processHandle.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16*1024*1024){processHandle.kill();finishError(new Error('Arabic Bar ticket raster output is too large.'))}});
    processHandle.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>1024*1024){processHandle.kill();finishError(new Error('Arabic Bar ticket renderer returned too much error output.'))}});
    processHandle.on('error',finishError);
    processHandle.on('close',code=>{
      if(settled)return;
      if(code!==0)return finishError(new Error(stderr.trim()||'Arabic Bar ticket renderer exited '+code));
      try{
        const output=Buffer.from(stdout.trim(),'base64');
        if(output.length<20||output[0]!==0x1b||output[1]!==0x40||!output.includes(RASTER_COMMAND))throw new Error('Arabic Bar ticket renderer returned invalid ESC/POS data.');
        settled=true;
        resolve(output);
      }catch(error){finishError(error)}
    });
    processHandle.stdin.on('error',error=>{if(error.code!=='EPIPE')finishError(error)});
    processHandle.stdin.end(JSON.stringify(document),'utf8');
  });
}

module.exports={buildArabicTicketDocument,renderArabicTicket,__test:{PAPER_WIDTH,MAX_CANVAS_HEIGHT,arabicTableLabel,cleanText,POWERSHELL_RENDER_SCRIPT}};
