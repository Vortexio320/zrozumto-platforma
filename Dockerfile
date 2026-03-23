# Stage 1: Build React frontend
FROM node:22-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build
# Vite outputs to /build/static (outDir: '../static')

# Stage 2: Python runtime
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    texlive-latex-base \
    texlive-pictures \
    texlive-latex-extra \
    texlive-fonts-recommended \
    lmodern \
    cm-super \
    poppler-data \
    pdf2svg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY README.md ./

# Copy Vite build output as the static directory
COPY --from=frontend-build /build/static ./static

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
