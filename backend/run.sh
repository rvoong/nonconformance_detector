#!/bin/bash

# Change to the directory where the script is located
cd "$(dirname "$0")" || exit 1

# Activate virtual environment if it exists
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo "No virtual environment found. Run setup.sh"
    exit 1
fi

# Check if virtual environment is active
if [ -n "$VIRTUAL_ENV" ]; then
    echo "venv is running correctly: $VIRTUAL_ENV"
else
    echo "ERROR: venv activation failed"
    exit 1
fi

echo "Starting Aperture Labs API"
echo "Server: http://localhost:8000"
echo "Docs: http://localhost:8000/docs"

uvicorn main:app --reload --host 127.0.0.1 --port 8000