#!/bin/bash
# Backend setup for macOS/Linux (mirrors setup.bat)

set -e
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
    echo "Creating virtual environment"
    python3 -m venv venv
else
    echo "Virtual environment already exists."
fi

echo "Activating virtual environment"
# shellcheck source=/dev/null
source venv/bin/activate

echo "Upgrading pip"
python -m pip install --upgrade pip

echo "Installing dependencies"
pip install -r requirements.txt

echo "Setup complete. To start the server, run: ./run.sh"
