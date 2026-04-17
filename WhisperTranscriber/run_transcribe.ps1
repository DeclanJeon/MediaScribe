param(
    [string]$InputFile = '',
    [string]$InputDir = '',
    [string]$OutputDir = '',
    [string]$Model = 'small',
    [string]$Language = '',
    [string]$Task = 'transcribe',
    [string]$OutputFormat = 'srt',
    [string]$Device = 'auto',
    [string]$ComputeType = '',
    [int]$BeamSize = 1,
    [switch]$NoVadFilter,
    [switch]$Offline,
    [string]$WheelhouseDir = '',
    [string]$ModelCacheDir = ''
)

$ErrorActionPreference = 'Stop'

function Set-OfflineCacheEnvironment {
    param(
        [string]$CacheRoot,
        [switch]$EnableOffline
    )

    if (-not $CacheRoot) {
        return
    }

    New-Item -ItemType Directory -Path $CacheRoot -Force | Out-Null
    $hubCache = Join-Path $CacheRoot 'hub'
    $transformersCache = Join-Path $CacheRoot 'transformers'
    New-Item -ItemType Directory -Path $hubCache, $transformersCache -Force | Out-Null

    $env:HF_HOME = $CacheRoot
    $env:HUGGINGFACE_HUB_CACHE = $hubCache
    $env:TRANSFORMERS_CACHE = $transformersCache

    if ($EnableOffline) {
        $env:HF_HUB_OFFLINE = '1'
        $env:TRANSFORMERS_OFFLINE = '1'
    }
}

function Ensure-FasterWhisperInstalled {
    param(
        [string]$PythonExe,
        [string]$Wheelhouse,
        [switch]$EnableOffline
    )

    cmd.exe /c "`"$PythonExe`" -c `"import faster_whisper`" 1>nul 2>nul"
    if ($LASTEXITCODE -eq 0) {
        return
    }

    if ($EnableOffline -and -not $Wheelhouse) {
        throw 'Offline mode requires a wheelhouse directory before faster-whisper can be installed.'
    }
    if ($Wheelhouse -and -not (Test-Path $Wheelhouse)) {
        throw "Offline wheelhouse not found: $Wheelhouse"
    }

    $pipArgs = @('-m', 'pip', 'install', '--upgrade')
    if ($EnableOffline) {
        $pipArgs += '--no-index'
    }
    if ($Wheelhouse) {
        $pipArgs += @('--find-links', $Wheelhouse)
    }
    $pipArgs += 'faster-whisper'

    Write-Host ('faster-whisper module not found. Installing it now' + ($(if ($EnableOffline) { ' from the local wheelhouse...' } else { '...' }))) -ForegroundColor Yellow
    & $PythonExe @pipArgs
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to install faster-whisper automatically. Run install_whisper_windows.bat and try again.'
    }

    cmd.exe /c "`"$PythonExe`" -c `"import faster_whisper`" 1>nul 2>nul"
    if ($LASTEXITCODE -ne 0) {
        throw 'faster-whisper is still unavailable after installation. Run install_whisper_windows.bat and try again.'
    }
}

function Warm-DefaultModelCache {
    param(
        [string]$PythonExe,
        [string]$ScriptPath,
        [string]$Wheelhouse,
        [switch]$EnableOffline,
        [string]$ModelName = 'small'
    )

    if (-not (Test-Path $PythonExe) -or -not (Test-Path $ScriptPath)) {
        Write-Host 'Skipping default model cache priming because the runtime or script is missing.' -ForegroundColor DarkGray
        return
    }

    Write-Host "Priming Whisper cache for the default model ($ModelName)..." -ForegroundColor Yellow
    if ($EnableOffline) {
        if ($Wheelhouse -and (Test-Path $Wheelhouse)) {
            & $PythonExe $ScriptPath --prime-model $ModelName --model-cache-dir $Wheelhouse --offline
        } else {
            & $PythonExe $ScriptPath --prime-model $ModelName --offline
        }
    } else {
        & $PythonExe $ScriptPath --prime-model $ModelName
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Model cache priming failed; continuing with transcription.' -ForegroundColor DarkYellow
        return
    }

    Write-Host "Whisper cache primed for $ModelName." -ForegroundColor Green
}

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $baseDir 'venv\Scripts\python.exe'
$ffmpegBin = Join-Path $baseDir 'tools\ffmpeg\bin'
$transcribeScript = Join-Path $baseDir 'transcribe_media.py'

if (-not $InputDir) {
    $InputDir = Join-Path $baseDir 'input_audio'
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $baseDir 'output_text'
}

if (Test-Path (Join-Path $ffmpegBin 'ffmpeg.exe')) {
    $env:Path = "$ffmpegBin;$env:Path"
}

if (-not (Test-Path $venvPython)) {
    throw 'Virtual environment not found. Run install_whisper_windows.bat first.'
}
if (-not (Test-Path $transcribeScript)) {
    throw "Transcription script not found: $transcribeScript"
}

Set-OfflineCacheEnvironment -CacheRoot $ModelCacheDir -EnableOffline:$Offline
Ensure-FasterWhisperInstalled -PythonExe $venvPython -Wheelhouse $WheelhouseDir -EnableOffline:$Offline
Warm-DefaultModelCache -PythonExe $venvPython -ScriptPath $transcribeScript -Wheelhouse $WheelhouseDir -EnableOffline:$Offline -ModelName $Model

New-Item -ItemType Directory -Path $InputDir, $OutputDir -Force | Out-Null

$arguments = @(
    $transcribeScript,
    '--input-dir', $InputDir,
    '--output-dir', $OutputDir,
    '--model', $Model,
    '--task', $Task,
    '--output-format', $OutputFormat,
    '--device', $Device,
    '--beam-size', "$BeamSize"
)

if ($InputFile) {
    $resolvedInput = $InputFile
    if (-not [System.IO.Path]::IsPathRooted($resolvedInput)) {
        $resolvedInput = Join-Path $baseDir $resolvedInput
    }
    $arguments += @('--input-file', $resolvedInput)
}

if ($ComputeType) {
    $arguments += @('--compute-type', $ComputeType)
}

if ($Language) {
    $arguments += @('--language', $Language)
}

if ($NoVadFilter) {
    $arguments += '--no-vad-filter'
}

& $venvPython @arguments
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Transcription finished with errors.' -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nAll jobs finished. Output folder: $OutputDir" -ForegroundColor Green
