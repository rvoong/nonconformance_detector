# Pull Request: Scrum 3 – API Integration, Auth Persistence, Inspection History

## Summary

This PR connects the frontend to the backend API, persists login across reloads, and improves inspection history (placeholders, progress). It adds **synchronous FOD detection** via new `POST /detect` and `GET /detect/prompt` endpoints, **startup seed data** (demo project + MinIO uploads only; no automatic VLM run), and shared UI for design specs and inspection history.

---

## What changed (for reviewers)

### Backend — by API and module

Reviewers can use this section to see exactly which endpoints were added or changed and why.

#### New: Detection API (`/detect`)

| Method + path | Purpose | What it does |
|---------------|--------|---------------|
| **`POST /detect`** | Run FOD detection on an image | Accepts `multipart/form-data`: `file` (image), optional `project_id`. Validates image type, resizes large images (max 1024px) to avoid Ollama limits, loads design-spec text from MinIO when `project_id` is set, calls Ollama VLM (default `qwen2.5vl:7b`). Returns `DetectionResponse` (pass/fail, defects, inference time, prompt_used). When Ollama is unreachable, returns a **mock** result so the UI still shows a result. |
| **`GET /detect/prompt`** | Preview inspection prompt | Query: optional `project_id`. Returns the full prompt (generic instructions + project PDF spec text) that would be sent to the VLM. Used by the frontend for “View prompt” / design-context display. |

- **Created for:** Frontend “Start Analysis” flow: upload image → get immediate result without polling. Optional project context so inspection follows design specs.
- **Files:** `routers/detect.py`, `schemas/detection.py`, `models/ollama_vlm.py` (VLM + mock), `utils/pdf_extract.py` (PDF text for spec).

#### Existing APIs (unchanged contract; frontend now uses them)

- **Auth** — `POST /auth/login`, `POST /auth/logout`: No signature changes; frontend calls them for login/logout and persists user in localStorage.
- **Projects** — `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/archive`: Frontend uses these for project list, create, archive, delete.
- **Storage** — `POST /storage/design`, `POST /storage/image`, `GET /storage/designs`, `GET /storage/design/{object_key}`, `GET /storage/image/{object_key}`: Frontend uses for design PDF upload, image upload (which creates a submission), listing design specs, and presigned URLs for previews.
- **Submissions** — Under ` /projects/{project_id}/submissions`: create, list, get, patch, delete, retry. Frontend lists submission history and fetches single submission for the result page.
- **Anomalies** — `GET /anomalies?submission_id=...`, etc.: Frontend uses to show defect list on the inspect result page.
- **Detection webhook** — `POST /webhooks/detection`: Still present for async detection results; not used by the new sync flow. `detection_service.handle_detection_result` remains a stub.

So: **no breaking changes** to existing routes; this PR adds the **sync** detection API and wires the UI to all of the above.

#### New backend modules (created for what)

| Module | Purpose |
|--------|--------|
| **`routers/detect.py`** | Defines `POST /detect` and `GET /detect/prompt`; image validation/resize, MinIO spec loading, VLM/mock call. |
| **`schemas/detection.py`** | Pydantic models: `DetectionResponse`, `DefectSchema` for the detection API response. |
| **`models/ollama_vlm.py`** | Ollama VLM client: `detect_fod()`, prompt building (generic + spec), pass/fail and defect parsing from VLM text; `get_mock_detection_response()` when Ollama is down. |
| **`utils/pdf_extract.py`** | `extract_text_from_pdf(pdf_bytes)` — used to pull design-spec text from PDFs in MinIO for VLM prompts. |
| **`seed_data.py`** | **Startup seed (MinIO only):** Ensure bucket for demo project, upload design-spec PDF + sample FOD image. No automatic VLM analysis at startup; inspections run only when the user uploads an image and runs analysis from the UI. Idempotent (skips if data already present). |

#### Backend app wiring

- **`main.py`** — Registered `detect_router`; CORS updated to allow localhost/127.0.0.1 (any port) via regex; **lifespan**: calls `run_seed_minio_only()` on startup (no background seed analysis).
- **Dependencies** — `requirements.txt`: added e.g. `pillow`, `pypdf`, `requests` for image handling, PDF text extraction, and Ollama HTTP calls.

---

### Frontend — what changed and why

- **Auth persistence** — User stored in `localStorage`; `hasRestoredFromStorage` ensures protected routes only redirect after restore, so reload no longer sends the user to login.
- **Inspection history** — Placeholder card with “ANALYZING” and progress bar while detection runs; merge on API error; pre-fill from local store. Store helpers: `saveInspectionPlaceholder`, `updateInspectionProgress`, `updateInspectionWithResult`; event-driven sidebar updates.
- **API client** (`lib/api.ts`) — Login, projects, storage (designs/images), submissions, anomalies; **`detectFod(file, projectId?)`** → `POST /detect`; **`getInspectionPrompt(projectId?)`** → `GET /detect/prompt`.
- **Pages** — Login, Projects (list/create/design specs/archive), Inspect (multi-photo upload, run analysis, history), Inspect result (batch view, defects, design preview).
- **New components** — DesignSpecLink, DesignSpecPreview, InspectionHistoryList, alert, loading-spinner. Hook: `useInspectionHistory(projectId)`.

---

### Docs and run locally

- **README** — Rewritten: “Run the app locally (one command)” first (`make run` or `./run.sh`), then step-by-step fallback. Env snippet uses ports 5434, 9002.
- **`run.sh`** — Single script: `docker compose up -d`, create `backend/.env` if missing, start backend (venv + uvicorn) and frontend (npm run dev). Ctrl+C stops backend/frontend; Docker keeps running.
- **Makefile** — `make run` runs `./run.sh`; `dev-reset` simplified to `down -v` then `up -d`.

---

## How to test

**Run the app:** From repo root, `make run` (or see README step-by-step). Log in with **test@example.com** / **test**.

**Quick checks**

1. **Login** → lands on Projects; **reload** → stay on same page (no redirect to login).
2. **Projects** → create project, upload design spec (PDF), open/preview.
3. **New Inspection** → upload photos, **Start Analysis** → History shows new card with “ANALYZING” and progress bar; when done, PASS/FAIL and Report.
4. **Inspect result** → click item in History → batch result and defect list.
5. **Logout** → redirect to login; reload stays on login.
6. **API:** Swagger at http://127.0.0.1:8000/docs — try `POST /auth/login`, `GET /projects`, `POST /detect` (image file).
7. **Tests:** `make test` from root.

---

## Files

### New files

| File | Purpose |
|------|---------|
| `frontend/src/components/ui/toast.tsx` | `ToastItem` and `ToastContainer` UI components; slide-in/slide-out animation classes; variant icons (success/error/warning/info) |
| `frontend/src/context/ToastContext.tsx` | `ToastProvider` context and `useToast()` hook; 5s auto-dismiss; 220ms exit-animation delay before DOM removal |
| `frontend/src/app/globals.css` *(keyframes)* | `@keyframes toast-in` / `toast-out` and `.toast-enter` / `.toast-exit` CSS classes for slide animations |
| `frontend/src/__tests__/toast.test.tsx` | Unit tests for `ToastItem` and `ToastContainer` (render, dismiss, variants) |
| `frontend/src/__tests__/ToastContext.test.tsx` | Unit tests for `ToastProvider` / `useToast` (add, stack, auto-dismiss, manual dismiss, outside-provider error) |
| `frontend/src/__tests__/useInspectionHistory.test.ts` | Unit tests for status transition detection in `useInspectionHistory` (Req 8–10: notify on complete/failed/error/timeout; `__new__` sentinel; polling stop/resume) |
| `frontend/src/__tests__/login.test.tsx` | Unit tests for login page (Req 1, 11) |
| `frontend/src/__tests__/inspect-upload.test.tsx` | Unit tests for upload page (Req 2, 4) |
| `frontend/src/__tests__/projects.test.tsx` | Unit tests for projects page (Req 3, 12, 13) |
| `frontend/src/__tests__/result.test.tsx` | Unit tests for inspect result page (Req 5, 6, 7) |
| `frontend/vitest.config.ts` | Vitest configuration (jsdom environment, `@` path alias, setup file) |
| `frontend/vitest.setup.ts` | Global test setup: imports `@testing-library/jest-dom` matchers |

### Modified files

| File | Change |
|------|--------|
| `frontend/src/hooks/useInspectionHistory.ts` | Added `StatusChangeEvent` type and optional `onStatusChange` callback; `prevStatuses` ref tracks last-seen status per submission; `isInitialized` ref suppresses callbacks on first load |
| `frontend/src/components/InspectHistorySidebar.tsx` | Wired `useToast` + `handleStatusChange` callback into `useInspectionHistory`; fires info/success/warning/error toasts on job status transitions |
| `frontend/src/app/ClientRoot.tsx` | Wrapped app with `<ToastProvider>` so toasts are available globally |
| `frontend/package.json` | Added `test` / `test:watch` scripts; added dev deps: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` |
| `frontend/package-lock.json` | Lockfile updated for new test dependencies |
| `README.md` | Resolved merge conflict (kept comprehensive `run.sh` / `make run` docs) |

---

## Notes

- Demo user: **test@example.com** / **test** (from `seed.sql`).
- Ollama optional; without it `POST /detect` returns a mock result.
- Ports: backend 8000, frontend 3998, Postgres 5434, MinIO 9002/9001.

### Command sent to the VLM (Ollama)

We call Ollama’s generate API with the following. Default model: `qwen2.5vl:7b` (override with `OLLAMA_VLM_MODEL`).

**Request:** `POST {OLLAMA_HOST}/api/generate` (default host `http://localhost:11434`)

```json
{
  "model": "qwen2.5vl:7b",
  "prompt": "<see below>",
  "images": ["<base64-encoded PNG>"],
  "stream": false
}
```

**Default prompt (when no custom prompt is passed):**

Defined in `backend/models/ollama_vlm.py` (`OllamaVLM._default_generic_prompt` and `_build_spec_prompt`). When `project_id` is provided, design PDFs from MinIO are read and their text is injected into the prompt. Use `GET /detect/prompt?project_id=...` to retrieve the exact prompt.

Generic prompt used by the model (no spec):

```
You are a quality inspector. Analyze this image and determine whether it passes or fails inspection.

1) Describe what you see and whether it matches a typical inspection context (e.g. product, surface, or scene to be checked). If the image clearly does NOT show something that can be inspected (e.g. irrelevant artwork or out-of-scope content), briefly explain and end with: RESULT: FAIL.

2) If the image is suitable for inspection, check for defects, anomalies, or issues:
   - If you find NO issues: explain why it passes. End with: RESULT: PASS
   - If you find issues: list each defect with severity (CRITICAL FAILURES, MAJOR ISSUES, or MINOR ISSUES) and approximate position (X%, Y%). End with: RESULT: FAIL
3) You must end your response with exactly one line: RESULT: PASS or RESULT: FAIL.

Do not respond with only 'RESULT: PASS' or 'RESULT: FAIL'. Always include a short description and reason.
```

With a project spec, the same structure is used but the specification text is inserted under "--- Specification ---".
