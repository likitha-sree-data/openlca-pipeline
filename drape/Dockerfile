# Drape: one image for a Hugging Face Docker Space (CPU basic), port 7860.
# Stage 1 builds the React app; stage 2 serves it from FastAPI with the models prefetched.

FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim-bookworm AS app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    HOME=/home/user HF_HOME=/home/user/.cache/huggingface U2NET_HOME=/home/user/.u2net \
    OMP_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
    ENVIRONMENT=production STATIC_DIR=/app/frontend/dist PORT=7860
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 user
WORKDIR /app
COPY backend/requirements.txt backend/requirements-ml.txt backend/
RUN pip install -r backend/requirements.txt && pip install -r backend/requirements-ml.txt
COPY --chown=user backend/ backend/
COPY --chown=user supabase/ supabase/
COPY --chown=user study/ study/
COPY --from=web --chown=user /web/dist frontend/dist
USER user
# Download model weights now so the first request does not wait for them.
RUN cd backend && python scripts/prefetch_models.py --allow-missing
EXPOSE 7860
CMD ["sh", "/app/backend/scripts/start.sh"]
