@echo off
cd /d "%~dp0"

if not exist "venv" (
    echo Creating virtual environment
    python -m venv venv
) else (
    echo Virtual environment already exists.
)

echo Activating virtual environment
call venv\Scripts\activate.bat

echo Upgrading pip
python -m pip install --upgrade pip

echo Installing dependencies
pip install -r requirements.txt

echo Setup Complete. To start the server, run: run.bat