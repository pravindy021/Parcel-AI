# PARCEL-AI

PARCEL-AI is a logistics analytics monorepo with a React/Vite frontend and a FastAPI backend for shipment dataset processing, analytics, and trained-model predictions.

The current workspace supports CSV/XLSX ingestion, suggested and editable source-column mapping, validation, analytics, and predictions from trained backend models. It is an evolving development project, **not a production multi-tenant SaaS**: authentication, tenant isolation, enterprise integrations, billing, database migrations, and durable production storage are not implemented.

## Project layout

- `parcel-ai-frontend/` — React frontend.
- `Parcel-ai-backend/` — FastAPI API, SQLite persistence, dataset processing, analytics, and model services.

## Run locally

### Backend (Windows PowerShell)

```powershell
Set-Location .\Parcel-ai-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

The backend API runs at `http://127.0.0.1:8000`; OpenAPI docs are at `http://127.0.0.1:8000/docs`.

### Frontend

```powershell
Set-Location .\parcel-ai-frontend
npm install
npm run dev
```

For local development, the frontend uses `http://127.0.0.1:8000` as its default API origin and reads upload limits from the backend's public configuration endpoint. Configure `VITE_API_BASE_URL` in the build process environment when deploying the API on a separate origin; keep `VITE_API_PREFIX` and backend `API_PREFIX` aligned.

## Current status and product roadmap

The source-column mapping flow detects common shipment field names, lets the user override mappings from the dataset preview, saves mappings in dataset metadata, and applies them to processing without changing the uploaded source file. See [API guide](./docs/API_GUIDE.md) for the mapping contract.

Review the [architecture audit](./docs/ARCHITECTURE.md), [security status](./docs/SECURITY.md), and [roadmap](./docs/ROADMAP.md) before deploying or handling customer data. The backend currently has no authentication or authorization; do not expose it to untrusted users or use it for confidential multi-tenant data.

## Verification

Run backend tests from `Parcel-ai-backend`:

```powershell
python -m pytest -q
```

Run frontend checks from `parcel-ai-frontend`:

```powershell
npm test -- --run
npm run lint
npm run build
```

The backend currently uses local SQLite, uploaded files, and model artifacts by default. Local storage on ephemeral hosting is not durable; see [backend documentation](./Parcel-ai-backend/README.md) for API behavior, environment settings, and limitations. Deployment has not been performed or verified.
