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
    [switch]$NoVadFilter
)

$ErrorActionPreference = 'Stop'

function Ensure-FasterWhisperInstalled {
    param([string]$PythonExe)

    cmd.exe /c "`"$PythonExe`" -c `"import faster_whisper`" 1>nul 2>nul"
    if ($LASTEXITCODE -eq 0) {
        return
    }

    Write-Host 'faster-whisper module not found. Installing it now...' -ForegroundColor Yellow
    & $PythonExe -m pip install --upgrade faster-whisper
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to install faster-whisper automatically. Run install_whisper_windows.bat and try again.'
    }

    cmd.exe /c "`"$PythonExe`" -c `"import faster_whisper`" 1>nul 2>nul"
    if ($LASTEXITCODE -ne 0) {
        throw 'faster-whisper is still unavailable after installation. Run install_whisper_windows.bat and try again.'
    }
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

Ensure-FasterWhisperInstalled -PythonExe $venvPython

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
