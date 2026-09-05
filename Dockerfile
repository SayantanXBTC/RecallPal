FROM python:3.11-slim

# System deps for OpenCV + insightface (ONNX runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the insightface bundle at build time so cold boots do not
# race the OOM killer during a 300 MB (buffalo_l) or 16 MB (buffalo_sc)
# runtime download. Default bundle is buffalo_sc — small, single-model,
# fits comfortably in 512 MB RAM alongside gunicorn + numpy + onnxruntime.
ARG INSIGHTFACE_MODEL=buffalo_sc
ENV INSIGHTFACE_MODEL=${INSIGHTFACE_MODEL}
RUN python -c "from insightface.app import FaceAnalysis; \
    a = FaceAnalysis(name='${INSIGHTFACE_MODEL}'); a.prepare(ctx_id=-1)"

COPY . .

ENV FLASK_DEBUG=false
ENV KMP_DUPLICATE_LIB_OK=TRUE
# Cap thread pools — onnxruntime + OpenBLAS otherwise spawn one thread
# per CPU and blow past the 512 MB Render Free tier.
ENV OMP_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV ORT_DISABLE_ALL_OPTIMIZATION=0

EXPOSE 8000

# One worker keeps peak RAM low; threads give in-process concurrency for
# I/O-bound Supabase calls. Increase WEB_CONCURRENCY only after moving
# off the Free tier (Starter = 2 GB, safe with 2 workers).
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:8000 --workers ${WEB_CONCURRENCY:-1} --threads ${WEB_THREADS:-4} --timeout 120 --graceful-timeout 30"]
