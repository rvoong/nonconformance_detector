@echo off
REM Run the full app locally: Podman (Postgres + MinIO), backend API, frontend.
REM Usage: run.bat (from repo root)
REM Prerequisites: Podman (with podman compose), Python 3.12+, Node.js, pip, npm

cd /d "%~dp0"

echo [1/5] Starting Podman (Postgres + MinIO)...
podman compose -f podman-compose.yml up -d

echo [2/5] Waiting for Postgres to be ready...
timeout /t 5 /nobreak > nul

REM Ensure backend .env exists (use defaults matching podman-compose.yml)
if not exist "backend\.env" (
    echo [2b] Creating backend\.env from defaults...
    (
        echo DATABASE_URL=postgresql://user:pass@127.0.0.1:5434/appdb
        echo MINIO_ENDPOINT=localhost:9002
        echo MINIO_ACCESS_KEY=minioadmin
        echo MINIO_SECRET_KEY=minioadmin
        echo MINIO_BUCKET_DESIGNS=designs
        echo MINIO_BUCKET_IMAGES=images
        echo MINIO_USE_SSL=false
        echo DETECTION_WEBHOOK_SECRET=dev-webhook-secret
    ) > backend\.env
)

echo [3/5] Backend: venv and dependencies...
cd backend
if not exist "venv" (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -q -r requirements.txt

echo [4/5] Starting backend API on http://127.0.0.1:8000 ...
start "Backend API" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn main:app --reload --host 127.0.0.1 --port 8000"
cd /d "%~dp0"
timeout /t 3 /nobreak > nul

echo [5/5] Frontend: install and dev server on http://localhost:3998 ...
cd frontend
if not exist "node_modules" (
    call npm install
)
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
cd /d "%~dp0"

echo.
echo App is running!
echo   Frontend: http://localhost:3998
echo   Backend API docs: http://127.0.0.1:8000/docs
echo   Login: test@example.com / test
echo.
echo Close the spawned command windows or run 'make kill' to stop.
