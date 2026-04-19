#!/usr/bin/env bash
# Run the full app locally: Podman (Postgres + MinIO), backend API, frontend.
# Usage: ./run.sh   (from repo root)
# Prerequisites: Podman (with podman compose), Python 3.12+, Node.js, pip, npm

set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[1/5] Starting Podman (Postgres + MinIO)..."
podman compose -f podman-compose.yml up -d

echo "[2/5] Waiting for Postgres to be ready..."
sleep 5

# Ensure backend .env exists (use defaults matching podman-compose.yml)
BACKEND_ENV="$ROOT/backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
  echo "[2b] Creating backend/.env from defaults..."
  cat > "$BACKEND_ENV" << 'EOF'
DATABASE_URL=postgresql://user:pass@127.0.0.1:5434/appdb
MINIO_ENDPOINT=localhost:9002
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_DESIGNS=designs
MINIO_BUCKET_IMAGES=images
MINIO_USE_SSL=false
DETECTION_WEBHOOK_SECRET=dev-webhook-secret
EOF
fi

echo "[3/5] Backend: venv and dependencies..."
cd "$ROOT/backend"
if [ ! -d "venv" ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt

echo "[3b/5] Ollama (optional): checking for Ollama..."
OLLAMA_PID=""
if command -v ollama &>/dev/null; then
  if ! pgrep -x ollama &>/dev/null; then
    echo "  Starting Ollama in background..."
    ollama serve &>/dev/null &
    OLLAMA_PID=$!
    sleep 3
  else
    echo "  Ollama already running."
  fi
  echo "  Pulling qwen2.5vl:7b (skipped if already present)..."
  ollama pull qwen2.5vl:7b &>/dev/null &
else
  echo "  Ollama not installed — VLM detection will use mock responses."
  echo "  Install from https://ollama.com and run: ollama pull qwen2.5vl:7b"
fi

echo "[4/5] Starting backend API on http://127.0.0.1:8000 ..."
uvicorn main:app --reload --host 127.0.0.1 --port 8000 &
UVICORN_PID=$!
cd "$ROOT"

# Give uvicorn a moment to bind
sleep 3

echo "[5/5] Frontend: install and dev server on http://localhost:3998 ..."
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev &
NEXT_PID=$!

cleanup() {
  echo "Shutting down..."
  kill $UVICORN_PID 2>/dev/null || true
  kill $NEXT_PID 2>/dev/null || true
  [ -n "$OLLAMA_PID" ] && kill $OLLAMA_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

echo ""
echo "App is running. Open http://localhost:3998 in your browser."
echo "API docs: http://127.0.0.1:8000/docs"
echo "Log in with: test@example.com / test"
echo "Press Ctrl+C to stop backend and frontend (Docker keeps running)."
echo ""

wait $NEXT_PID
