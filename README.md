# MediaScribe

MediaScribe is an Electron + Next.js desktop app for extracting text from audio/video with faster-whisper.

한국어 사용자를 위한 faster-whisper 기반 음성/영상 텍스트 추출 데스크톱 앱입니다. 실시간 로그, 실시간 부분 텍스트, TXT/SRT 저장, 엔진 상태 점검/복구, 설치형/포터블 배포를 지원합니다.

## Highlights

- Drag & drop or file picker for audio/video inputs
- faster-whisper based transcription pipeline
- TXT + SRT export
- Live progress, live transcript stream, detailed logs, timeline
- Engine health check and repair flow
- Windows portable + NSIS installer builds
- CI on macOS / Windows / Linux
- Automatic versioning and GitHub Releases on push to `main`

## Tech Stack

- Next.js 15
- Electron 37
- Node.js 20+
- faster-whisper (Python backend)
- electron-builder
- GitHub Actions + semantic-release

## Features

### Transcription UX
- 파일별 진행률 / 전체 진행률
- 실시간 부분 텍스트 스트림 표시
- 실시간 로그 / 타임라인 / 필터
- TXT / SRT 결과 저장
- 로그 파일 저장

### Reliability
- faster-whisper 설치 상태 점검
- 의존성 누락 시 복구 플로우 지원
- cp949 환경에서도 유니코드 안전 로그 처리
- 구조화된 tagged JSON 로그로 Electron ↔ Python 연결

### Distribution
- Windows portable executable
- Windows NSIS installer
- GitHub Actions multi-OS CI
- GitHub Release asset publishing for Windows / macOS / Linux

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the web UI

```bash
npm run dev
```

### 3. Run the desktop app

```bash
npm run desktop
```

## Scripts

### Development

```bash
npm test
npm run lint
npm run build:web
npm run desktop
```

### Packaging

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

Windows aliases:

```bash
npm run dist
npm run dist:portable
npm run dist:installer
```

## Release Automation

This repository is configured so that pushes to `main` can automatically create a new semantic version and GitHub Release.

### How versioning works

- `feat:` -> minor version bump
- `fix:` -> patch version bump
- `perf:` -> patch version bump
- `BREAKING CHANGE:` or `feat!:` / `fix!:` -> major version bump

### Required commit style

Use Conventional Commits:

```text
feat: add batch export button
fix: prevent unicode log crash on Windows
chore: update CI cache key
feat!: change output pipeline contract
```

### GitHub Actions workflows

- `.github/workflows/ci.yml`
  - Runs `npm ci`, `npm test`, `npm run lint`, `npm run build:web`
  - Runs on macOS / Windows / Linux

- `.github/workflows/release-version.yml`
  - Runs on push to `main`
  - Executes `semantic-release`
  - Updates `package.json`, `package-lock.json`, `CHANGELOG.md`
  - Creates git tag + GitHub Release automatically

- `.github/workflows/release-assets.yml`
  - Runs after a GitHub Release is published
  - Builds OS-specific artifacts on native runners
  - Uploads release assets to the matching release

## Expected Release Artifacts

### Windows
- `MediaScribe-Portable.exe`
- `MediaScribe-Setup.exe`
- `MediaScribe-Setup.exe.blockmap`

### macOS
- `MediaScribe-macOS-<arch>.dmg`
- `MediaScribe-macOS-<arch>.zip`

### Linux
- `MediaScribe-linux-<arch>.AppImage`
- `MediaScribe-linux-<arch>.deb`

## Project Structure

```text
MediaScribe/
├─ app/                      # Next.js app router UI
├─ electron/                 # Electron main/preload process
├─ lib/                      # shared desktop helpers and parsers
├─ tests/                    # node:test based regression tests
├─ assets/                   # icons and build resources
├─ .github/workflows/        # CI/CD workflows
├─ .releaserc.json           # semantic-release configuration
└─ package.json              # scripts, electron-builder, release config
```

## Notes About Cross-Platform Support

The CI/CD pipeline is set up for macOS, Windows, and Linux builds.

Current bundled transcription backend is still Windows-first because the sibling `WhisperTranscriber` runtime currently ships with Windows-oriented helper scripts and virtual environment layout.

That means:
- CI/CD and release automation are multi-OS ready
- Electron packaging is multi-OS ready
- Full native transcription runtime on macOS/Linux may still require a platform-native WhisperTranscriber backend bundle in the future

If you want true runtime parity on macOS/Linux, the next step is to replace the Windows-only runner assumptions (`run_transcribe.ps1`, `venv/Scripts/python.exe`, `install_whisper_windows.bat`) with a platform-aware backend launcher.

## Windows Build Notes

- The app bundles `../WhisperTranscriber` during packaging
- If Windows packaging fails because files are locked, close running packaged app processes and rebuild
- WSL may not always be ideal for final Windows packaging; Windows PowerShell verification is recommended

## Changelog

Release notes and version history are maintained automatically in `CHANGELOG.md`.

## License

Add your preferred license here.
