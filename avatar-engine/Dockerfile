FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    MUSE_TALK_ROOT=/opt/MuseTalk \
    MUSE_TALK_WEIGHTS=/opt/MuseTalk/models \
    AVATAR_MAX_UPLOAD_BYTES=209715200 \
    AVATAR_ALLOWED_ORIGINS=https://arkanws513-spec.github.io

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git git-lfs libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone --depth 1 https://github.com/TMElyralab/MuseTalk.git /opt/MuseTalk && \
    pip install --no-cache-dir -r /opt/MuseTalk/requirements.txt && \
    pip install --no-cache-dir fastapi==0.115.12 'uvicorn[standard]==0.34.0' python-multipart==0.0.20 PyYAML==6.0.2

COPY worker.py /app/worker.py
WORKDIR /app
EXPOSE 7860
CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "7860"]
