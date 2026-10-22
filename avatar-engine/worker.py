"""GPU worker for real audio-driven portrait video generation using MuseTalk.

Accepts a source photo or video plus audio and returns a rendered MP4.
Requires a CUDA GPU, FFmpeg, and a separately installed MuseTalk checkout
with model weights. Never reports success unless an MP4 exists.
"""
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

import yaml
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from fastapi.middleware.cors import CORSMiddleware
import secrets

ENGINE_ROOT = Path(os.environ.get("MUSE_TALK_ROOT", "/opt/MuseTalk")).resolve()
WEIGHTS_ROOT = Path(os.environ.get("MUSE_TALK_WEIGHTS", ENGINE_ROOT / "models")).resolve()
MAX_UPLOAD_BYTES = int(os.environ.get("AVATAR_MAX_UPLOAD_BYTES", str(200 * 1024 * 1024)))
ALLOWED_VIDEO = {".mp4", ".mov", ".webm", ".mkv"}
ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".webm"}

app = FastAPI(title="ZEREOS Real Avatar Worker", version="0.1.0")
ALLOWED_ORIGINS = [x.strip() for x in os.environ.get(
    "AVATAR_ALLOWED_ORIGINS",
    "https://arkanws513-spec.github.io,http://localhost:8080,http://127.0.0.1:8080"
).split(",") if x.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-Worker-Token"],
)


def require_worker_token(supplied: str | None):
    expected = os.environ.get("AVATAR_WORKER_TOKEN", "").strip()
    if not expected:
        raise HTTPException(503, "العامل غير مؤمّن بعد: اضبط AVATAR_WORKER_TOKEN قبل تفعيل التوليد.")
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(401, "رمز الوصول للعامل غير صحيح.")


def run_checked(args: list[str], timeout: int = 3600):
    try:
        result = subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "انتهت مهلة معالجة الفيديو. جرّب ملفًا أقصر.") from exc
    if result.returncode:
        detail = (result.stderr or result.stdout or "Engine failed")[-3500:]
        raise HTTPException(500, "فشل محرك الفيديو: " + detail)
    return result


def validate_suffix(filename: str, allowed: set[str], label: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(415, f"صيغة {label} غير مدعومة: {suffix or 'بدون امتداد'}")
    return suffix


async def save_upload(upload: UploadFile, destination: Path, allowed: set[str], label: str) -> Path:
    suffix = validate_suffix(upload.filename or "", allowed, label)
    path = destination.with_suffix(suffix)
    total = 0
    with path.open("wb") as output:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_UPLOAD_BYTES:
                output.close()
                path.unlink(missing_ok=True)
                raise HTTPException(413, f"حجم الملف أكبر من الحد ({MAX_UPLOAD_BYTES // (1024 * 1024)} MB).")
            output.write(chunk)
    if total == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"ملف {label} فارغ.")
    return path


def engine_readiness():
    required_paths = [
        ENGINE_ROOT / "scripts" / "inference.py",
        WEIGHTS_ROOT / "musetalkV15" / "unet.pth",
        WEIGHTS_ROOT / "musetalkV15" / "musetalk.json",
        WEIGHTS_ROOT / "whisper" / "config.json",
        WEIGHTS_ROOT / "whisper" / "pytorch_model.bin",
        WEIGHTS_ROOT / "sd-vae" / "config.json",
        WEIGHTS_ROOT / "sd-vae" / "diffusion_pytorch_model.bin",
        WEIGHTS_ROOT / "dwpose" / "dw-ll_ucoco_384.pth",
        WEIGHTS_ROOT / "face-parse-bisent" / "79999_iter.pth",
        WEIGHTS_ROOT / "face-parse-bisent" / "resnet18-5c106cde.pth",
        WEIGHTS_ROOT / "syncnet" / "latentsync_syncnet.pt",
    ]
    missing = [str(p) for p in required_paths if not p.exists()]
    if shutil.which("ffmpeg") is None:
        missing.append("ffmpeg executable")
    return (not missing, "ready" if not missing else "Missing model/runtime files: " + ", ".join(missing))


@app.get("/api/health")
def health():
    ready, detail = engine_readiness()
    try:
        import torch
        gpu = torch.cuda.is_available()
        gpu_name = torch.cuda.get_device_name(0) if gpu else None
    except Exception:
        gpu, gpu_name = False, None
    return {"ok": True, "engine": "MuseTalk 1.5", "ready": ready, "detail": detail,
            "gpu_available": gpu, "gpu_name": gpu_name,
            "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024)}


@app.post("/api/avatar/generate")
async def generate(
    x_worker_token: str | None = Header(default=None, alias="X-Worker-Token"),
    source: UploadFile = File(..., description="A person's photo or source video"),
    audio: UploadFile = File(..., description="Recorded narration / voice track"),
    fps: int = Form(25),
):
    require_worker_token(x_worker_token)
    ready, detail = engine_readiness()
    if not ready:
        raise HTTPException(503, detail)
    try:
        import torch
        if not torch.cuda.is_available():
            raise HTTPException(503, "يلزم تشغيل العامل على جهاز مزود بـ NVIDIA CUDA GPU.")
    except ImportError as exc:
        raise HTTPException(503, "PyTorch غير مثبت في بيئة المحرك.") from exc
    if fps not in (20, 24, 25, 30):
        raise HTTPException(400, "معدل الإطارات المسموح: 20 أو 24 أو 25 أو 30.")
    source_suffix = validate_suffix(source.filename or "", ALLOWED_VIDEO | ALLOWED_IMAGE, "الصورة/الفيديو")
    job_dir = Path(tempfile.mkdtemp(prefix="zereos-avatar-"))
    try:
        source_path = await save_upload(source, job_dir / "source", ALLOWED_VIDEO | ALLOWED_IMAGE, "الصورة/الفيديو")
        audio_path = await save_upload(audio, job_dir / "narration", ALLOWED_AUDIO, "الصوت")
        input_video = source_path
        if source_suffix in ALLOWED_IMAGE:
            # A looped still image has no finite duration; probe the audio explicitly
            # instead of relying on ffmpeg -shortest when the output has no audio stream.
            probe = run_checked([
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path)
            ], timeout=60)
            try:
                duration = float(probe.stdout.strip())
            except (TypeError, ValueError) as exc:
                raise HTTPException(400, "تعذر تحديد مدة ملف الصوت.") from exc
            if duration <= 0 or duration > 600:
                raise HTTPException(400, "مدة الصوت يجب أن تكون أكبر من صفر ولا تتجاوز 10 دقائق.")
            input_video = job_dir / "source_base.mp4"
            run_checked([
                "ffmpeg", "-y", "-loop", "1", "-i", str(source_path),
                "-vf", "scale=trunc(min(1280\\,iw)/2)*2:-2",
                "-r", str(fps), "-t", str(duration), "-tune", "stillimage",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", str(input_video)
            ], timeout=180)
        config_path = job_dir / "inference.yaml"
        with config_path.open("w", encoding="utf-8") as handle:
            yaml.safe_dump({"job": {"video_path": str(input_video), "audio_path": str(audio_path),
                                    "result_name": "rendered.mp4", "bbox_shift": 0}},
                           handle, allow_unicode=True)
        result_dir = job_dir / "results"
        command = [
            "python", str(ENGINE_ROOT / "scripts" / "inference.py"),
            "--inference_config", str(config_path), "--result_dir", str(result_dir),
            "--unet_model_path", str(WEIGHTS_ROOT / "musetalkV15" / "unet.pth"),
            "--unet_config", str(WEIGHTS_ROOT / "musetalkV15" / "musetalk.json"),
            "--whisper_dir", str(WEIGHTS_ROOT / "whisper"),
            "--version", "v15", "--fps", str(fps), "--use_float16",
        ]
        run_checked(command, timeout=7200)
        output_path = result_dir / "v15" / "rendered.mp4"
        if not output_path.is_file() or output_path.stat().st_size < 10_000:
            raise HTTPException(500, "انتهى المحرك دون إنشاء ملف MP4 صالح.")
        download_path = job_dir / ("zereos-avatar-" + uuid.uuid4().hex[:8] + ".mp4")
        shutil.copy2(output_path, download_path)
        return FileResponse(download_path, media_type="video/mp4", filename="zereos-avatar.mp4",
                            background=BackgroundTask(shutil.rmtree, job_dir, ignore_errors=True))
    except HTTPException:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(500, f"تعذر إنشاء الفيديو: {type(exc).__name__}: {exc}") from exc
