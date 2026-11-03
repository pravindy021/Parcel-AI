# Deployment

## Local Windows PowerShell

From the repository root:

```powershell
Set-Location .\Parcel-ai-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

In another terminal:

```powershell
Set-Location .\parcel-ai-frontend
npm install
npm run dev
```

Use backend `/docs` for OpenAPI. Frontend production builds require the correct `VITE_API_BASE_URL` at build time when the API is hosted separately. Never put secrets in frontend environment variables.

## Production status

Deployment is not verified. The included local SQLite and filesystem storage are not durable on ephemeral hosts. There are no database migrations, object storage adapter, identity controls, CI deployment workflow, or configured production secrets. Do not treat the current service as production-ready. Configure TLS, PostgreSQL, private persistent storage, origins, backups, monitoring, and authorization before public use.

