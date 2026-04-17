from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Callable, Iterable, Sequence

SUPPORTED_EXTENSIONS = {
    ".aac",
    ".avi",
    ".flac",
    ".m4a",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ogg",
    ".wav",
    ".webm",
    ".wma",
}
DEFAULT_OUTPUT_FORMATS = ("srt",)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="backslashreplace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract text from audio/video files with faster-whisper."
    )
    parser.add_argument("--input-file", default="")
    parser.add_argument("--input-dir", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="")
    parser.add_argument("--task", default="transcribe", choices=("transcribe", "translate"))
    parser.add_argument("--output-format", default="srt")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--compute-type", default="")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--no-vad-filter", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def default_compute_type(device: str) -> str:
    normalized = (device or "auto").strip().lower()
    if normalized == "cuda":
        return "float16"
    return "int8"


def normalize_language(language: str | None) -> str | None:
    if not language:
        return None
    value = language.strip()
    mapping = {
        "korean": "ko",
        "english": "en",
        "japanese": "ja",
        "chinese": "zh",
    }
    return mapping.get(value.lower(), value)


def resolve_language_override(task: str, language: str | None) -> str | None:
    normalized_task = (task or "transcribe").strip().lower()
    if normalized_task == "translate":
        return normalize_language(language)
    return None


def normalize_output_formats(output_format: str | Sequence[str] | None) -> tuple[str, ...]:
    if not output_format:
        return DEFAULT_OUTPUT_FORMATS
    if isinstance(output_format, str):
        tokens = [token.strip().lower() for token in output_format.split(",")]
    else:
        tokens = [str(token).strip().lower() for token in output_format]
    formats = tuple(token for token in tokens if token)
    if not formats:
        return DEFAULT_OUTPUT_FORMATS
    invalid = [fmt for fmt in formats if fmt not in {"srt", "txt"}]
    if invalid:
        raise ValueError(f"Unsupported output format: {', '.join(invalid)}")
    return formats


def is_supported_media_file(path: Path) -> bool:
    return path.suffix.lower() in SUPPORTED_EXTENSIONS


def collect_media_files(
    input_file: str | Path | None = None,
    input_dir: str | Path | None = None,
) -> list[Path]:
    if input_file:
        path = Path(input_file).expanduser().resolve()
        if not path.exists():
            raise FileNotFoundError(f"Input file not found: {path}")
        if not is_supported_media_file(path):
            raise ValueError(f"Unsupported extension: {path.suffix}")
        return [path]

    directory = Path(input_dir).expanduser().resolve() if input_dir else Path.cwd()
    directory.mkdir(parents=True, exist_ok=True)
    return sorted(
        [path for path in directory.iterdir() if path.is_file() and is_supported_media_file(path)],
        key=lambda item: item.name.lower(),
    )


def format_timestamp(seconds: float) -> str:
    millis = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(millis, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, remainder = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{remainder:03d}"


def build_srt_content(segments: Sequence[dict[str, object]]) -> str:
    blocks = []
    for index, segment in enumerate(segments, start=1):
        blocks.append(
            "\n".join(
                [
                    str(index),
                    f"{format_timestamp(float(segment['start']))} --> {format_timestamp(float(segment['end']))}",
                    str(segment["text"]),
                ]
            )
        )
    return "\n\n".join(blocks).strip() + ("\n" if blocks else "")


def build_txt_content(segments: Sequence[dict[str, object]]) -> str:
    texts = [str(segment["text"]) for segment in segments if str(segment["text"]).strip()]
    return ("\n".join(texts) + "\n") if texts else ""


def write_outputs(media_path: Path, output_dir: Path, segments: Sequence[dict[str, object]], output_formats: Sequence[str]) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, str] = {}
    for fmt in output_formats:
        destination = output_dir / f"{media_path.stem}.{fmt}"
        if fmt == "srt":
            destination.write_text(build_srt_content(segments), encoding="utf-8")
        elif fmt == "txt":
            destination.write_text(build_txt_content(segments), encoding="utf-8")
        else:
            raise ValueError(f"Unsupported output format: {fmt}")
        written[fmt] = str(destination)
    return written


def build_model(model_name: str, device: str, compute_type: str):
    from faster_whisper import WhisperModel

    return WhisperModel(model_name, device=device, compute_type=compute_type)


def emit_transcript_line(media_path: Path, segment: dict[str, object]) -> None:
    payload = {
        "file_name": media_path.name,
        "start": float(segment["start"]),
        "end": float(segment["end"]),
        "text": str(segment["text"]),
    }
    print(f"TRANSCRIPT_LINE|{json.dumps(payload, ensure_ascii=True)}", flush=True)


def emit_app_event(event_type: str, **payload: object) -> None:
    event_payload = {"type": event_type, **payload}
    print(f"APP_EVENT|{json.dumps(event_payload, ensure_ascii=True)}", flush=True)


def materialize_segments(
    raw_segments: Iterable[object],
    on_segment: Callable[[dict[str, object]], None] | None = None,
) -> list[dict[str, object]]:
    segments: list[dict[str, object]] = []
    for segment in raw_segments:
        text = getattr(segment, "text", "").strip()
        if not text:
            continue
        normalized = {
            "start": float(getattr(segment, "start", 0.0)),
            "end": float(getattr(segment, "end", 0.0)),
            "text": text,
        }
        segments.append(normalized)
        if on_segment is not None:
            on_segment(normalized)
    return segments


def should_retry_without_vad(media_path: Path, task: str, vad_filter: bool, segments: Sequence[dict[str, object]]) -> bool:
    if not vad_filter:
        return False
    if segments:
        return False
    if (task or "transcribe").strip().lower() != "transcribe":
        return False
    return media_path.suffix.lower() in {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav", ".wma"}


def transcribe_once(
    model,
    media_path: Path,
    language: str | None,
    task: str,
    beam_size: int,
    vad_filter: bool,
    on_segment: Callable[[dict[str, object]], None] | None = None,
):
    segments_iter, info = model.transcribe(
        str(media_path),
        language=resolve_language_override(task, language),
        task=task,
        beam_size=beam_size,
        vad_filter=vad_filter,
    )
    return materialize_segments(segments_iter, on_segment=on_segment), info


def transcribe_file(
    media_path: str | Path,
    output_dir: str | Path,
    model_name: str,
    language: str | None,
    task: str,
    output_formats: Sequence[str],
    device: str = "auto",
    compute_type: str | None = None,
    beam_size: int = 1,
    vad_filter: bool = True,
):
    media_path = Path(media_path).expanduser().resolve()
    output_dir = Path(output_dir).expanduser().resolve()
    selected_compute_type = compute_type or default_compute_type(device)
    model = build_model(model_name=model_name, device=device, compute_type=selected_compute_type)
    segments, info = transcribe_once(
        model=model,
        media_path=media_path,
        language=language,
        task=task,
        beam_size=beam_size,
        vad_filter=vad_filter,
        on_segment=lambda segment: emit_transcript_line(media_path, segment),
    )
    vad_retry_used = False
    vad_filter_used = vad_filter
    if should_retry_without_vad(media_path, task, vad_filter, segments):
        fallback_segments, fallback_info = transcribe_once(
            model=model,
            media_path=media_path,
            language=language,
            task=task,
            beam_size=beam_size,
            vad_filter=False,
            on_segment=lambda segment: emit_transcript_line(media_path, segment),
        )
        if fallback_segments:
            segments = fallback_segments
            info = fallback_info
            vad_retry_used = True
            vad_filter_used = False
            emit_app_event("vad_retry", file_name=media_path.name)
    outputs = write_outputs(media_path, output_dir, segments, output_formats)
    return {
        "media_path": str(media_path),
        "detected_language": getattr(info, "language", normalize_language(language) or "unknown"),
        "language_probability": getattr(info, "language_probability", None),
        "segments": segments,
        "outputs": outputs,
        "compute_type": selected_compute_type,
        "vad_retry_used": vad_retry_used,
        "vad_filter_used": vad_filter_used,
    }


def main() -> int:
    args = parse_args()
    base_dir = Path(__file__).resolve().parent
    input_dir = Path(args.input_dir) if args.input_dir else base_dir / "input_audio"
    output_dir = Path(args.output_dir) if args.output_dir else base_dir / "output_text"

    files = collect_media_files(input_file=args.input_file or None, input_dir=input_dir)
    if not files:
        print(f"No media files found in: {input_dir}")
        print('Put files into input_audio or run run_transcribe.bat "path\\to\\file.mp4"')
        return 0

    output_formats = normalize_output_formats(args.output_format)
    failure_count = 0

    for media_path in files:
        emit_app_event("file_processing", file_name=media_path.name)
        try:
            result = transcribe_file(
                media_path=media_path,
                output_dir=output_dir,
                model_name=args.model,
                language=args.language,
                task=args.task,
                output_formats=output_formats,
                device=args.device,
                compute_type=args.compute_type or None,
                beam_size=args.beam_size,
                vad_filter=not args.no_vad_filter,
            )
            emit_app_event(
                "detected_language",
                file_name=media_path.name,
                detected_language=result["detected_language"],
                language_probability=result["language_probability"],
            )
            emit_app_event("file_done", file_name=media_path.name, outputs=result["outputs"])
        except Exception as exc:
            failure_count += 1
            emit_app_event("file_failed", file_name=media_path.name, error=str(exc))

    emit_app_event(
        "summary",
        completed=len(files) - failure_count,
        failed=failure_count,
        output_dir=str(output_dir),
    )
    return 1 if failure_count else 0


if __name__ == "__main__":
    raise SystemExit(main())
