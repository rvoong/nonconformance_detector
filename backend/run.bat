@echo off
cd /d "%~dp0"

if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo No virtual environment found. Run setup.bat
    exit /b 1
)

if defined VIRTUAL_ENV (
    echo venv is running correctly: %VIRTUAL_ENV%
) else (
    echo ERROR: venv activation failed
    exit /b 1
)

echo Starting Aperture Labs API
echo Server: http://localhost:8000
echo Docs: http://localhost:8000/docs

uvicorn main:app --reload --host 127.0.0.1 --port 8000
