@echo off
REM Stop everything: backend (8000), frontend (3998), Ollama (11434), Podman (Postgres + MinIO)
REM Usage: kill.bat [-reset]

cd /d "%~dp0"

echo Stopping processes on ports 8000, 3998, 11434...

REM Kill process on port 8000 (backend)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :8000 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM Kill process on port 3998 (frontend)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3998 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM Kill process on port 11434 (Ollama)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :11434 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

REM Check for -reset flag
if "%~1"=="-reset" (
    echo Stopping Docker and removing volumes...
    podman compose -f podman-compose.yml down -v
    echo Stopped everything and removed volumes - DB reset.
) else (
    echo Stopping Docker...
    podman compose -f podman-compose.yml down
    echo Stopped app, Ollama, and Docker.
)
