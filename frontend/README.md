# GLaDOS Frontend

AI-powered anomaly detection and quality inspection UI for the Aperture Labs FOD detection project.

## Prerequisites

- **Node.js** 22.13.0 (LTS)
- **npm** 9.0+

Use [nvm](https://github.com/nvm-sh/nvm) to install or switch Node versions. From the frontend directory, run `nvm use` to pick up the pinned version.

## Quick Start

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Run the development server

```bash
npm run dev
```

The app will be available at **http://localhost:3998**.

### 3. (Optional) Run with Turbopack (faster rebuilds)

```bash
npm run dev:turbopack
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 3998 |
| `npm run dev:turbopack` | Start dev server with Turbopack |
| `npm run build` | Build for production |
| `npm run start` | Run production build |
| `npm run lint` | Run ESLint |
| `npm run lint -- --fix` | Fix lint issues |

## Environment Variables

Create a `.env.local` file in the frontend directory to override defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend FOD detection API base URL |

Example:

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Backend

The frontend calls the FOD detection API for image analysis. Ensure the backend is running before using the Inspect feature:

```bash
# From project root
cd backend
run.bat
```

API docs: http://localhost:8000/docs

## App Flow

1. **Login** → Sign in
2. **Projects** → Select or create a project with design specs
3. **Inspect** → Upload product photos, run analysis, view history
4. **Results** → View inspection reports with defect markers and severity
