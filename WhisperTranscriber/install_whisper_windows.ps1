param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $baseDir 'venv\Scripts\python.exe'
$transcribeScript = Join-Path $baseDir 'transcribe_media.py'

function Invoke-ModelCachePrime {
    param(
        [string]$PythonExe,
        [string]$ScriptPath,
        [string]$ModelName = 'small'
    )

    if (-not (Test-Path $PythonExe)) {
        Write-Host 'Python runtime is not available yet; skipping model cache priming.' -ForegroundColor DarkGray
        return
    }

    if (-not (Test-Path $ScriptPath)) {
        Write-Host "Model priming script not found: $ScriptPath" -ForegroundColor DarkYellow
        return
    }

    Write-Host "Priming Whisper cache for the default model ($ModelName)..." -ForegroundColor Yellow
    & $PythonExe $ScriptPath --prime-model $ModelName
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Model cache priming failed; continuing without blocking installation.' -ForegroundColor DarkYellow
        return
    }

    Write-Host "Whisper cache primed for $ModelName." -ForegroundColor Green
}

if (Test-Path $pythonExe) {
    Write-Host 'WhisperTranscriber runtime already exists. MediaScribe will use it automatically.' -ForegroundColor Green
} else {
    Write-Host 'MediaScribe now bootstraps Python and faster-whisper automatically on first launch.' -ForegroundColor Yellow
}

Write-Host "Bundle location: $baseDir" -ForegroundColor DarkGray
if (-not $Quiet) {
    Write-Host '실행 중인 앱에서 자동 복구를 진행하세요.' -ForegroundColor Yellow
}

Invoke-ModelCachePrime -PythonExe $pythonExe -ScriptPath $transcribeScript -ModelName 'small'
exit 0
