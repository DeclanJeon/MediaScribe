param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $baseDir 'venv\Scripts\python.exe'

if (Test-Path $pythonExe) {
    Write-Host 'WhisperTranscriber runtime already exists. MediaScribe will use it automatically.' -ForegroundColor Green
    exit 0
}

Write-Host 'MediaScribe now bootstraps Python and faster-whisper automatically on first launch.' -ForegroundColor Yellow
Write-Host "Bundle location: $baseDir" -ForegroundColor DarkGray
if (-not $Quiet) {
    Write-Host '실행 중인 앱에서 자동 복구를 진행하세요.' -ForegroundColor Yellow
}
exit 0
