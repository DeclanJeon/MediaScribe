# 🎙️ MediaScribe

<p align="center">
  <img src="assets/app-icon-256.png" alt="MediaScribe Logo" width="120"/>
  <br/>
  <b>faster-whisper 기반 실시간 음성/영상 텍스트 추출 데스크톱 앱</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-191970?logo=electron&logoColor=white"/>
  <img src="https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/faster--whisper-FF6F00?logo=openai&logoColor=white"/>
  <img src="https://img.shields.io/badge/License-ADD_YOURS-333333?logo=unlicense&logoColor=white"/>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue?logo=windows&logoColor=white"/>
  <img src="https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white"/>
  <img src="https://img.shields.io/badge/platform-Linux-FCC624?logo=linux&logoColor=black"/>
</p>

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/<OWNER>/<REPO>/ci.yml?label=CI&branch=main"/>
  <img src="https://img.shields.io/github/actions/workflow/status/<OWNER>/<REPO>/release-version.yml?label=Release%20Version&branch=main"/>
  <img src="https://img.shields.io/github/v/release/<OWNER>/<REPO>?label=Latest%20Version"/>
  <img src="https://img.shields.io/github/downloads/<OWNER>/<REPO>/total?label=Downloads"/>
</p>

<p align="center">
  <a href="https://github.com/<OWNER>/<REPO>/releases"><img src="https://img.shields.io/badge/GitHub-Release-181717?logo=github&logoColor=white"/></a>
  <a href="https://github.com/<OWNER>/<REPO>/issues"><img src="https://img.shields.io/github/issues/<OWNER>/<REPO>?label=Issues&color=yellow"/></a>
  <a href="https://github.com/<OWNER>/<REPO>/stargazers"><img src="https://img.shields.io/github/stars/<OWNER>/<REPO>?style=social"/></a>
</p>

> **MediaScribe**는 오디오/영상 파일을 빠르고 안정적으로 텍스트로 변환하는 Electron + Next.js 데스크톱 앱입니다.
> 더블 클릭/드래그앤드롭으로 파일을 추가하면, 전사 진행률/실시간 부분 텍스트/상세 로그를 확인하고 TXT 또는 SRT로 저장할 수 있습니다.

---

## ✨ 핵심 스크린샷

<p align="center">
  <img src="./desktop_capture.png" width="46%" alt="MediaScribe desktop UI"/>
  <img src="./desktop_with_app.png" width="46%" alt="MediaScribe running"/>
</p>

<p align="center">
  <img src="./desktop_with_app_focus.png" width="46%" alt="MediaScribe focused view"/>
</p>

---

## 🚀 주요 기능

- ✅ **Drag & drop / 파일 선택**으로 음성/영상 업로드
- ✅ **faster-whisper** 기반 전사 파이프라인
- ✅ 파일별 진행률 + 전체 진행률 표시
- ✅ **실시간 텍스트 스트리밍** 및 타임라인 로그
- ✅ **필터 가능한 상세 로그 뷰**
- ✅ **TXT / SRT** 결과 저장
- ✅ **엔진 상태 점검 + 복구 가이드**
- ✅ **로그 저장 및 실패 진단**
- ✅ **Windows 전용 실행형 + 설치형** 배포 지원
- ✅ GitHub Actions 기반 멀티 OS CI/CD + semantic-release

---

## 🧩 아키텍처 한눈에 보기

```text
Desktop (Electron)
  ├─ Next.js UI (app/)
  │    - 파일 업로드/진행률/로그/설정 화면
  ├─ IPC 브리지 (electron/main.cjs, preload)
  ├─ Whisper 오케스트레이션 (lib/*.cjs)
  │    - 프로세스/로그/진척률 파싱
  └─ faster-whisper 런타임 (번들된 WhisperTranscriber + 선택적 offline bundle + 첫 실행 자동 부트스트랩)
         └─ 결과 TXT / SRT 생성
```

---

## 🧰 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Desktop Shell**: Electron 37, electron-builder
- **Transcription**: faster-whisper (Python backend)
- **Build/Test**: Node.js 20+, npm, ESLint, Node.js test runner
- **Release**: GitHub Actions, semantic-release, GH Release

---

## 📦 설치 및 실행

### 1) 저장소 클론

```bash
git clone <repo-url>
cd <repo-dir>
```

### 2) 의존성 설치

```bash
npm install
```

### 3) 앱 실행

```bash
npm run desktop
```

### 4) 웹 UI만 실행

```bash
npm run dev
```

### 4) 오프라인 설치본 사용

오프라인 설치본을 만들려면 `WhisperTranscriber/offline/` 아래에 아래 파일들을 미리 넣어야 합니다.

```text
WhisperTranscriber/offline/
├─ python/
│  └─ python-3.12.9-amd64.exe
├─ wheelhouse/
│  └─ *.whl (faster-whisper + dependencies)
└─ model-cache/
   └─ Whisper 모델 캐시
```

오프라인 모드는 다음 중 하나로 활성화할 수 있습니다.

```bash
npm run desktop -- --offline
# 또는
set MEDIASCRIBE_OFFLINE=1
```

오프라인 모드에서는 온라인 다운로드를 수행하지 않습니다.
- Python 설치 파일은 로컬 `offline/python/` 경로에서만 찾습니다.
- `pip` 는 로컬 `offline/wheelhouse/` 만 사용합니다.
- 모델은 로컬 `offline/model-cache/` 가 미리 채워져 있어야 합니다.

> ⚠️ 참고: Windows 전사 런타임 번들 구조(`WhisperTranscriber`)는 현재 Windows 중심입니다.

---

## 🧪 개발 스크립트

```bash
npm test            # 테스트
npm run lint        # 정적 분석
npm run build:web   # Next.js 빌드
npm run desktop     # Electron 앱 실행

# Windows 배포
npm run dist            # portable + nsis 동시
npm run dist:portable   # Portable exe
npm run dist:installer  # NSIS 설치판
npm run dist:win        # 기본 윈도우 배포

# 기타 플랫폼
npm run dist:mac
npm run dist:linux
```

---

## 🧪 릴리스/배포 자동화

### CI (`.github/workflows/ci.yml`)
- `main` 브랜치 푸시 및 PR에서 자동 실행
- `npm ci` → `npm test` → `npm run lint` → `npm run build:web`

### 버전 릴리스 (`.github/workflows/release-version.yml`)
- `main` 브랜치 push 시 자동 `semantic-release`
- 변경사항 반영: `package.json`, `package-lock.json`, `CHANGELOG.md`
- Git tag + GitHub Release 자동 생성

### 릴리스 자산 업로드 (`.github/workflows/release-assets.yml`)
- Release published 이벤트 시 OS별로 빌드
- GitHub Release에 배포 파일 업로드
- Windows 릴리스에는 `MediaScribe-offline-bundle.zip` 이 함께 올라가며, 이 파일을 미러링해서 air-gapped 환경에 전달할 수 있습니다.

### 커밋 규칙 (Conventional Commits)

```text
feat: add batch export button
fix: prevent unicode log crash on Windows
chore: update CI cache key
feat!: change output pipeline contract
```

---

## 🗂️ 프로젝트 구조

```text
MediaScribe/
├─ app/                      # Next.js app router UI
├─ electron/                 # Electron main/preload
├─ lib/                      # desktop helper, logging, progress parser
├─ tests/                    # Node test suite
├─ assets/                   # 아이콘, 빌드 리소스
├─ scripts/                  # icons 생성/클린 스크립트
├─ .github/workflows/        # CI & 릴리스 파이프라인
├─ .releaserc.json          # semantic-release 설정
├─ package.json              # 스크립트 및 electron-builder config
└─ metadata.json             # 앱 메타데이터
```

---

## 🛠️ 현재 한계와 향후 계획

- 현재 번들링은 `WhisperTranscriber`의 Windows 지향 스크립트(`.bat/.ps1`, `venv/Scripts/python.exe`)에 맞춰져 있습니다.
- 유저 PC에 Python이 없거나 `faster-whisper`가 빠진 경우, 앱이 첫 실행/복구 과정에서 `WhisperTranscriber`를 사용자 데이터 폴더로 복사한 뒤 Python 런타임과 의존성을 자동 설치합니다. 오프라인 모드에서는 이 동작이 온라인 다운로드 없이 로컬 `offline/` 번들만 사용하도록 바뀝니다.
- macOS/Linux는 멀티 OS 빌드는 가능하지만, **동일한 런타임 성능/호환성**을 위한 플랫폼별 백엔드 정비가 남아 있습니다.

---

## 🤝 기여하기

1. Issue/Feature 요청 작성
2. Fork 후 feature 브랜치 생성
3. 코드 작성 및 테스트 통과
4. PR 생성 (`feat:` / `fix:` 등 Conventional Commit 권장)

---

## 📜 라이선스

라이선스는 추후 등록 예정입니다 (`LICENSE` 파일을 프로젝트 루트에 추가해 주세요).

---

## 🙌 감사 메시지

이 프로젝트는 `faster-whisper`, `Electron`, `Next.js`, `semantic-release`, `GitHub Actions` 생태계를 활용해 만들어졌습니다.

---

## 🌐 Repository Badges (발행 전 바인딩 필요)

아래 배지들은 실제 저장소 `<OWNER>/<REPO>`로 바꾸면 바로 동작합니다.

- `https://img.shields.io/github/v/release/<OWNER>/<REPO>`
- `https://img.shields.io/github/actions/workflow/status/<OWNER>/<REPO>/ci.yml`
- `https://img.shields.io/github/stars/<OWNER>/<REPO>`
- `https://img.shields.io/github/license/<OWNER>/<REPO>`


