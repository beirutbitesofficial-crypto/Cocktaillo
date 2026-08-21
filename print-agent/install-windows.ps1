$ErrorActionPreference='Stop'
$AgentDir=Split-Path -Parent $MyInvocation.MyCommand.Path
if(-not (Get-Command node -ErrorAction SilentlyContinue)){throw 'Node.js 20+ is required. Install Node.js LTS first.'}
Set-Location $AgentDir
if(-not (Test-Path '.\config.json')){node .\server.js; Start-Sleep -Seconds 1; Get-Process node -ErrorAction SilentlyContinue | Where-Object {$_.Path -like '*node.exe'} | Out-Null}
$Action=New-ScheduledTaskAction -Execute 'node.exe' -Argument ('"'+(Join-Path $AgentDir 'server.js')+'"') -WorkingDirectory $AgentDir
$Trigger=New-ScheduledTaskTrigger -AtLogOn
$Principal=New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$Settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'Cocktaillo Print Agent' -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null
Start-ScheduledTask -TaskName 'Cocktaillo Print Agent'
Write-Host ''
Write-Host 'Cocktaillo Print Agent installed and started.' -ForegroundColor Green
Write-Host 'Open config.json and copy the token into POS Settings -> Customer Receipt Printer.' -ForegroundColor Yellow
Get-Content .\config.json
