# Aperture Labs - FOD Detection

CSCI 577A Spring 2026 Group Project

Foreign Object Debris (FOD) detection using Vision Language Models.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Python 3.11-3.13
- Node.js (e.g. 22.x)
- `pip`, `npm`

---

## Quick Start

### [Linux/macOS]

```bash
make run
```

Or directly:
```bash
chmod +x run.sh && ./run.sh
```

**Stop:** Press `Ctrl+C` to stop backend/frontend. Run `make kill` to also stop Docker.

### [Windows]

First, install GNU Make (one-time setup):
```powershell
# Run PowerShell as Administrator
choco install make
```

Then run:
```cmd
make run
```

Or directly (no make required):
```cmd
.\run.bat
```

**Stop:** Close the spawned command windows, or run `make kill` (or `.\kill.bat`).

---

## What `make run` does

1. Starts Docker containers (Postgres + MinIO)
2. Creates `backend/.env` if missing
3. Sets up Python venv and installs dependencies
4. Starts backend API at **http://127.0.0.1:8000**
5. Starts frontend dev server at **http://localhost:3998**

**Log in:** `test@example.com` / `test`
(Other users: alice/bob/carol with password `password123`)

**Stop everything:** `make kill` — stops backend, frontend, Ollama, and Docker (keeps DB).
**Stop + reset DB:** `make kill-reset` — same as above and removes Docker volumes (fresh DB on next run).

---

## Troubleshooting

**"make: command not found" or "make is not recognized"?**

| OS | Solution |
|----|----------|
| **Windows** | Install make via Chocolatey: `choco install make` (run PowerShell as Admin), then restart your terminal. Or skip make and run `.\run.bat` directly. |
| **macOS** | Install Xcode Command Line Tools: `xcode-select --install` |
| **Linux** | Install build-essential: `sudo apt install build-essential` (Debian/Ubuntu) or `sudo dnf install make` (Fedora) |

**[Windows] make is installed but still not found?** Add it to your PATH:

1. Find where make is installed:
   - Chocolatey: `C:\ProgramData\chocolatey\bin` (or `/c/ProgramData/chocolatey/bin` in Git Bash)
   - GnuWin32: `C:\Program Files (x86)\GnuWin32\bin`
   - MinGW: `C:\MinGW\bin` (may be named `mingw32-make.exe`)

2. Add to PATH:
   - Press `Win + R`, type `sysdm.cpl`, press Enter
   - Go to **Advanced** tab → **Environment Variables**
   - Under "User variables", select **Path** → **Edit** → **New**
   - Paste the path (e.g., `C:\ProgramData\chocolatey\bin`)
   - Click **OK** on all dialogs

3. Restart your terminal and try `make run` again

**If `make run` fails**, use the [step-by-step instructions](#step-by-step-if-one-command-doesnt-work) below.

**"Cannot reach the backend"?** The frontend calls `http://localhost:8000`. Ensure backend is running. On Windows, keep the spawned command windows open.

---

## Optional: Ollama (real VLM detection)

For live FOD detection instead of mock results, install [Ollama](https://ollama.com).

`./run.sh` (and `make run`) will automatically start Ollama and pull `qwen2.5vl:7b` if Ollama is installed. If it's not installed, the app falls back to mock detection responses.

---

## Step-by-step (if one command doesn't work)

Use these steps if `make run` or `run.bat` fails. Run each step in order; use **two terminals** for backend and frontend.

### 1. Environment

Ensure `backend/.env` exists. If not, create it with these contents:

```
DATABASE_URL=postgresql://user:pass@127.0.0.1:5434/appdb
MINIO_ENDPOINT=localhost:9002
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_DESIGNS=designs
MINIO_BUCKET_IMAGES=images
MINIO_USE_SSL=false
DETECTION_WEBHOOK_SECRET=dev-webhook-secret
```

### 2. Docker

Start Postgres and MinIO:

```bash
docker compose up -d
```

### 3. Backend (Terminal 1)

#### [Linux/macOS]
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

#### [Windows - Command Prompt]
```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

#### [Windows - PowerShell]
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Leave this terminal running.
- API: http://127.0.0.1:8000
- Swagger: http://127.0.0.1:8000/docs

### 4. Frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev
```

- App: http://localhost:3998
- Log in: `test@example.com` / `test`

---

## Code quality

SonarQube: https://sonarcloud.io/project/overview?id=Aperture-Labs-SP-26_Aperture-Labs-Project

---

## Running tests

From the project root:

```bash
make test        # full suite
make test-unit   # unit tests only
```

Or manually from `backend/` with venv active:

#### [Linux/macOS]
```bash
cd backend
source venv/bin/activate
pytest
```

#### [Windows]
```cmd
cd backend
venv\Scripts\activate
pytest
```

---

## Teardown

| Action | Linux/macOS | Windows |
|--------|-------------|---------|
| Stop backend/frontend | `Ctrl+C` | Close command windows |
| Stop everything | `make kill` | `make kill` or `.\kill.bat` |
| Stop + reset DB | `make kill-reset` | `make kill-reset` or `.\kill.bat -reset` |
| Stop Docker only | `docker compose down` | `docker compose down` |
| Reset DB + storage | `docker compose down -v` | `docker compose down -v` |

---

## Frontend details

See [frontend/README.md](frontend/README.md) for scripts, env (`NEXT_PUBLIC_API_URL`), and port (3998).
