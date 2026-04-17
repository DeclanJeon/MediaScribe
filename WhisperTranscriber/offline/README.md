# Offline bundle seed

이 디렉터리는 완전 오프라인 설치본을 위한 사전 주입(pre-seed) 영역입니다.

필수 항목:
- `python/python-3.12.9-amd64.exe` 또는 호환되는 로컬 Python 설치 파일
- `wheelhouse/` 안의 `faster-whisper` 및 의존성 `.whl` 파일
- `model-cache/` 안의 Hugging Face / faster-whisper 모델 캐시

이 저장소에는 큰 바이너리나 모델 파일을 포함하지 않습니다. 릴리스/패키징 파이프라인은 이 구조를 함께 묶을 수 있도록만 준비되어 있습니다.
