# Planifie une sauvegarde MenuGo (Windows Task Scheduler)
# Exemple : tous les jours a 02:00
# Action : powershell.exe -ExecutionPolicy Bypass -File "...\backend\scripts\backup.ps1"

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Split-Path -Parent $ScriptDir

Set-Location $BackendDir
Write-Host "[MenuGo backup] Demarrage depuis $BackendDir"
npm run backup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "[MenuGo backup] Termine."
