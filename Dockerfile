# ProbeAI API — backend only.
#
# The React frontend deploys separately to Vercel, so nothing static is built
# or served here. This image is the FastAPI service and its vector index.

FROM python:3.12-slim

# Deliberately not python:3.14 — chromadb and onnxruntime ship prebuilt wheels
# for 3.12, and on newer interpreters pip falls back to building from source,
# which fails on a slim image with no toolchain.

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/app

# Non-root, and HOME fixed explicitly because Chroma caches its embedding model
# under $HOME/.cache — the build and the runtime must agree on that path or the
# model baked in below would be invisible at startup and downloaded again.
RUN useradd --create-home --home-dir /home/app --shell /bin/bash app

WORKDIR /app

# Dependencies first so edits to source do not invalidate the install layer.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

USER app

# Bake the all-MiniLM-L6-v2 ONNX model (~79MB) into the image.
#
# Chroma downloads this lazily on first embed, not at install. Without this
# step a cold Render boot fetches 79MB before serving, and if that download is
# slow or blocked the vector store silently falls back to keyword retrieval —
# a service that looks healthy while quietly running without embeddings.
RUN python -c "\
from chromadb.utils import embedding_functions; \
ef = embedding_functions.DefaultEmbeddingFunction(); \
v = ef(['warm the onnx model cache']); \
print('embedding model cached, dims =', len(v[0]))"

COPY --chown=app:app backend/ ./backend/

EXPOSE 8000

# One worker on purpose. Sessions live in process memory, so with two workers
# requests round-robin and a session created on worker A is invisible to worker
# B — an interview would fail on its second turn. Scaling past one worker means
# switching SESSION_BACKEND to a shared store first.
#
# Shell form so ${PORT} is expanded; Render injects it and it is not 8000.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir backend --workers 1
