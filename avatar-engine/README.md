# ZEREOS AI Shorts — real-person avatar worker

This is a separate GPU worker for **actual audio-driven face animation**, not the browser's approximate audio-level mouth movement.

## What it does

- Accepts a portrait photo or a source video plus a real narration/audio file.
- Uses MuseTalk 1.5 to synthesize lip movement from the audio.
- Returns an MP4 only after the engine has generated and validated an output file.
- Keeps uploads in a temporary job folder and removes them after the response is sent.
- Requires no paid inference API key.

## Honest limitations

- This worker is separate from the static GitHub Pages website. GitHub Pages cannot run PyTorch/CUDA inference.
- Actual generation requires an NVIDIA CUDA GPU, FFmpeg, Python/PyTorch dependencies and model weights. A normal free static site or standard CPU web host cannot provide this.
- A still photo is made into a base video before lip-sync; this can animate the mouth but does not create full-body movement or natural head motion. A source video preserves its original body/head movement while MuseTalk alters the mouth region.
- Arabic audio can be passed as audio input, but quality and synchronization must be tested with real Arabic samples before claiming production quality.
- The endpoint returns a completed MP4 synchronously; long jobs may need a queued job system and persistent output storage for production.
- Only upload media you own or have permission to use, and do not present generated footage as authentic recordings of a person.

## License notes

MuseTalk's code is MIT-licensed. Its README states that model weights are available for commercial and non-commercial use, but each third-party model dependency must follow its own license. Review current upstream notices and weight sources before distributing a production image. Upstream test data has separate non-commercial research restrictions; this worker does not bundle test data.

Upstream: https://github.com/TMElyralab/MuseTalk

## Model setup

The Docker image intentionally does not bundle the large model weights. Keep the weights on a persistent disk and mount them into the container. The upstream MuseTalk download script retrieves several checkpoints from Hugging Face and Google Drive; downloads can be large and must complete successfully.

```bash
cd avatar-engine
docker build -t zereos-avatar-worker .
mkdir -p models
# Download upstream model files into the persistent host folder.
docker run --rm -it --entrypoint bash -v "$PWD/models:/opt/MuseTalk/models" zereos-avatar-worker -lc "cd /opt/MuseTalk && bash download_weights.sh"
```

Before public deployment, review each model dependency's license and the current upstream download instructions. Do not put weights or access tokens into Git.

## Run

Use a long random token that is kept private. On Linux, generate one with openssl rand -hex 32; pass it to the container via an environment variable, not a committed file. Keep the downloaded model directory mounted so restarts do not erase it.

```bash
export AVATAR_WORKER_TOKEN='replace-with-a-long-random-secret'
docker run --gpus all --rm -p 7860:7860 \
  -v "$PWD/models:/opt/MuseTalk/models" \
  -e MUSE_TALK_ROOT=/opt/MuseTalk \
  -e MUSE_TALK_WEIGHTS=/opt/MuseTalk/models \
  -e AVATAR_WORKER_TOKEN="$AVATAR_WORKER_TOKEN" \
  -e AVATAR_ALLOWED_ORIGINS=https://arkanws513-spec.github.io \
  zereos-avatar-worker
```

Enter the same token in the studio; never publish it in source control. Configure AVATAR_ALLOWED_ORIGINS to the exact website origin. Check readiness at http://localhost:7860/api/health. A successful response must report ready=true and gpu_available=true. Readiness also checks the VAE, Whisper, DWPose, face parsing, and SyncNet files—not just the main MuseTalk checkpoint.

## API

POST /api/avatar/generate as multipart form data:

- source: .jpg, .jpeg, .png, .webp, .mp4, .mov, .webm or .mkv
- audio: .wav, .mp3, .m4a, .aac, .ogg, .flac or .webm
- fps: 20, 24, 25 or 30

Response: an MP4 file. A nonzero error response means no successful output was produced.
