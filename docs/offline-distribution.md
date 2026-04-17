# Offline distribution support

MediaScribe now has an explicit offline deployment shape. The application can run with pre-seeded local assets instead of fetching Python or packages from the internet.

## Offline mode

Enable offline mode with either:
- command line flag: `--offline`
- environment variable: `MEDIASCRIBE_OFFLINE=1`
- compatibility env var: `WHISPERTRANSCRIBER_OFFLINE=1`

When offline mode is enabled, the runtime will not:
- download the Python installer from python.org
- fall back to internet-based `pip install`
- attempt online Hugging Face model downloads if a local cache is provided

## Required pre-seeded layout

Bundle the following under `WhisperTranscriber/offline/`:

- `python/python-3.12.9-amd64.exe`
  - local Python installer for the exact runtime version used by the app
- `wheelhouse/`
  - local `.whl` files for `faster-whisper` and its dependencies
- `model-cache/`
  - pre-downloaded Whisper model cache content

The repository includes placeholder README files for each directory, but not the large binary/model payloads themselves.

## Packaging behavior

The Electron bundle already copies the full `WhisperTranscriber/` tree into app resources, so any populated `offline/` subtree will be shipped with the installer.

The release workflow also exposes a standalone offline bundle zip when those files exist, so release artifacts can be mirrored into an air-gapped environment.

## What to seed before air-gapped deployment

At minimum:
1. Put the Python installer into `WhisperTranscriber/offline/python/`
2. Populate `WhisperTranscriber/offline/wheelhouse/` with wheels
3. Pre-fill `WhisperTranscriber/offline/model-cache/` with the Whisper model you plan to use
4. Build the installer or portable app from the repository

If any of the required offline assets are missing, the app now fails with a clear error instead of silently trying the network.
