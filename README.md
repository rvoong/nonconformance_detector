# Aperture Labs - FOD Detection

CSCI 577A Spring 2026 Group Project

Foreign Object Debris (FOD) detection using Vision Language Models.

## Getting Started

### Backend Setup

#### 1. Install Ollama

Download from https://ollama.com

#### 2. Pull the model and start server

```bash
ollama pull qwen2.5vl:7b
ollama serve
```

Or directly:

```bash
chmod +x run.sh && ./run.sh
```

**Stop everything:** `make kill` — stops backend, frontend, Ollama, and Docker (keeps DB).
**Stop everything + reset DB:** `make kill-reset` — same as above and removes Docker volumes (fresh DB on next `make run`).

This will:

1. Start Postgres and MinIO with `docker compose up -d`
2. Create `backend/.env` from defaults if missing (ports 5434, 9002)
3. Create a Python venv and install backend deps, then start the API at **http://127.0.0.1:8000**
4. Run `npm install` if needed and start the frontend at **http://localhost:3998**

**Log in:** `test@example.com` / `test`
(Seed users: alice/bob/carol use password `password123`, test@example.com uses `test`. Passwords are stored in plain text; do not commit `backend/.env`—use `.env.example` for documentation.)

Press **Ctrl+C** to stop the backend and frontend; Docker keeps running. To stop Docker: `make dev-down` or `docker compose down`.

**If `make run` or `./run.sh` fails** (e.g. on Windows, or a step errors), use the [step-by-step instructions](#step-by-step-if-one-command-doesnt-work) below.

**Login shows "Cannot reach the backend" or connection timeout?** The frontend calls `http://localhost:8000`. Start the full app with `make run` (starts Docker + backend + frontend), or start the backend first in one terminal (`cd backend && source venv/bin/activate && uvicorn main:app --reload --host 127.0.0.1 --port 8000`) then the frontend in another.

---

## Optional: Ollama (real VLM detection)

For live FOD detection instead of mock results, install Ollama and pull the default VLM.

### Install Ollama

- **macOS:** `brew install ollama` or download from [ollama.com](https://ollama.com)
- **Linux:** `curl -fsSL https://ollama.com/install.sh | sh`
- **Windows:** Download the installer from [ollama.com](https://ollama.com)

### Pull the VLM model

```bash
ollama pull qwen2.5vl:7b
```

This downloads ~5 GB. To use a different model, set `OLLAMA_VLM_MODEL` in your environment (e.g. `export OLLAMA_VLM_MODEL=qwen2.5vl:72b`).

### Usage

`./run.sh` (and `make run`) will automatically start Ollama and pull `qwen2.5vl:7b` if Ollama is installed. If it's not installed, the app falls back to mock detection responses.

To run Ollama manually:

```bash
ollama serve
```

The backend connects to Ollama at `http://localhost:11434` by default (override with `OLLAMA_HOST`).

---

## Step-by-step (if one command doesn't work)

Use these steps if `make run` fails or you're on Windows (where `run.sh` is not supported). Run each step in order; use **two terminals** for backend and frontend.

### 1. Environment

Ensure `backend/.env` exists. If not, copy from example or create with:

```bash
# backend/.env (do not commit; use .env.example for docs)
DATABASE_URL=postgresql://user:pass@127.0.0.1:5434/appdb
MINIO_ENDPOINT=localhost:9002
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_DESIGNS=designs
MINIO_BUCKET_IMAGES=images
MINIO_USE_SSL=false
DETECTION_WEBHOOK_SECRET=dev-webhook-secret
```

(Ports 5434 and 9002 match `docker-compose.yml`.)

### 2. Docker

From the project root, start Postgres and MinIO:

```bash
docker compose up -d
```

Optional: wait a few seconds, then check containers are up: `docker ps`.

### 3. Backend

In a **first terminal**, from the project root:

```bash
cd backend
setup.bat
```

#### 4. Run the server

```bash
cd backend
run.bat
```

### Frontend Setup

#### 1. Install Node.js

Ensure you have Node.js 22.13.0 (LTS). Use nvm to install or switch versions; run `nvm use` from the frontend directory.

#### 2. Install packages

```bash
cd frontend
npm install
```

#### 3. Run the development server
```bash
npm run dev
```

Open [http://localhost:3998](http://localhost:3998) with your browser to see the result.

See [frontend/README.md](frontend/README.md) for more details.

## API

Can use Swagger UI: http://localhost:8000/docs or commands below

### `POST /api/login`

Authenticate a user with username and password.

**Test with curl (Windows):**
```powershell
curl.exe --% -X POST http://localhost:8000/api/login -H "Content-Type: application/json" -d "{\"username\":\"test\",\"password\":\"test\"}"
```

**Response:**
```json
{"success":true,"user":{"username":"test"},"message":"Login successful"}
```

### `POST /api/detect`

Upload an image to detect FOD. Returns location and description of any FOD found.

**Test with curl (Windows):**
```powershell
curl.exe -X POST "http://localhost:8000/api/detect" -F "file=@data/FOD_pictures/bolt_in_front_of_plane.png"
```

**Response:**
`{"response":"In the image, there is a visible Foreign Object Debris (FOD) item in the foreground. Here is the description:\n\n- **Item**: The item appears to be a cylindrical object with markings that read \"48 FW - GOLDEN BOLT.\" It looks like a spent cartridge or a similar type of ammunition casing.\n- **Location**: It is lying on the ground in the foreground, closer to the bottom left corner of the image.\n\nThis item is likely FOD and should be removed to ensure safety and operational readiness."}`

### `POST /api/projects/create`

Create a new project. Required before uploading images.

**Test with curl (Windows):**
```powershell
curl.exe --% -X POST http://localhost:8000/api/projects/create -H "Content-Type: application/json" -d "{\"name\":\"TestProject\"}"
```

**Response:**
```json
{"id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","name":"TestProject","created_at":"2026-02-21T12:00:00","design_specs":[]}
```

### `GET /api/projects/list`

List all projects.

**Test with curl (Windows):**
```powershell
curl.exe -X GET "http://localhost:8000/api/projects/list"
```

### `POST /api/upload/image`

Upload an image to MinIO storage. Requires a valid project ID.

**Step 1: Create a project (see above) and copy the `id` from the response.**

**Step 2: Upload image using the project ID:**
```powershell
curl.exe -X POST "http://localhost:8000/api/upload/image?project_id=YOUR_PROJECT_ID" -F "file=@data/FOD_pictures/bolt_in_front_of_plane.png"
```

**Response:**
```json
{"filename":"bolt_in_front_of_plane.png","project_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","object_key":"a1b2c3d4-e5f6-7890-abcd-ef1234567890/bolt_in_front_of_plane.png"}
```

## Using docker to spin up the database containers

#### 1. Make sure you have docker desktop installed.
#### 2. Install docker cli.
#### 3. Spin up containers

    docker compose up -d

This will create two containers. One contains the postgres database, the other holds the minio storage. In the /backend/db/init.sql, two tables are created in the postgres db. One for `users` and the other for `fod_detection` (subject to change.) Database information will persist unless the volumes are deleted.

#### 4. To stop running containers (not remove volume)
    docker compose stop

#### 5. To remove the containers and remove the volumes:
    docker compose down -v