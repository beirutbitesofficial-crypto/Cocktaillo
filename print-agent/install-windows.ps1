$ErrorActionPreference='Stop'
$AgentDir=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 20+ is required. Install Node.js LTS first.'}
Set-Location $AgentDir
if(-not (Test-Path '.\config.json')){
  $bytes=New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $token=([System.BitConverter]::ToString($bytes)).Replace('-','').ToLowerInvariant()
  $config=[ordered]@{port=17483;token=$token;allowed_origins=@('https://indigo-ape-952022.hostingersite.com','http://localhost:3000');printers=[ordered]@{customer='Customer Receipt';kitchen='Kitchen Printer';bar='Bar Printer';hookah='HOOKAH'}}
  $config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 '.\config.json'
}else{
  $config=Get-Content -LiteralPath '.\config.json' -Raw | ConvertFrom-Json
  if(-not $config.printers){$config | Add-Member -MemberType NoteProperty -Name printers -Value ([pscustomobject]@{})}
  if(-not $config.printers.PSObject.Properties['hookah']){$config.printers | Add-Member -MemberType NoteProperty -Name hookah -Value 'HOOKAH'}
  $config | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 '.\config.json'
}
$Node=(Get-Command node).Source
$Action=New-ScheduledTaskAction -Execute $Node -Argument ('"'+(Join-Path $AgentDir 'server.js')+'"') -WorkingDirectory $AgentDir
$Trigger=New-ScheduledTaskTrigger -AtLogOn
$Principal=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$Settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'Cocktaillo Print Agent' -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
Start-ScheduledTask -TaskName 'Cocktaillo Print Agent'
Start-Sleep -Seconds 2
Write-Host ''
Write-Host 'Cocktaillo Print Agent installed and started.' -ForegroundColor Green
Write-Host 'Copy the token below into POS Settings -> Customer Receipt Printer.' -ForegroundColor Yellow
Get-Content .\config.json
