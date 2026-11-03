# PARCEL-AI Frontend

Responsive React workspace for uploading shipment datasets, inspecting validation results, exploring backend-computed analytics, training delay models, and requesting predictions.

## Stack

- React 19, Vite, and React Router
- Tailwind CSS
- Recharts and Lucide React
- Axios for the FastAPI client
- Vitest, jsdom, and React Testing Library

## Features

- Public landing page and responsive dashboard navigation
- CSV and XLSX upload with extension, empty-file, and backend-configured size checks; server validation remains authoritative
- Dataset listing, search, sorting, paginated results, deletion, and up-to-50-row backend preview
- Suggested and editable shipment-column mapping saved to backend metadata and applied during dataset processing
- Backend validation report and per-column quality details
- Analytics based on actual backend summaries with chart-level date, carrier, and warehouse filters
- Separately labelled Demo Mode with local fictional sample rows and metrics; it does not enter the real dataset/API workflow or show simulated predictions
- Two-uploaded-dataset comparison using backend summaries, shared/missing schema details, comparable delivery metrics, and carrier shipment-volume charts
- Model training and shipment predictions using real backend endpoints
- Model-provided feature importance/explanations only when returned by the API, with a non-causality note
- Filtered prediction and returned preview-row CSV exports; analytics and comparison summary CSV exports with dataset, filter, and generation metadata
- In-app upload-to-export workflow with completed, pending, and unavailable stages
- Loading skeletons, empty, retry, and error states; live `/health` connection indicator
- Search, sortable columns, client-side pagination for returned records, responsive chart layouts, and reduced-motion support
- Locale-aware presentation for dates and numeric preview values without changing exported source data

Real workspace values and predictions come from backend responses only. Fictional data is used exclusively in the explicitly labelled, isolated Dashboard Demo Mode. PDF generation is not offered because the backend does not provide a PDF report endpoint.
API responses omit internal dataset storage and model artifact filesystem paths. The browser does not persist uploaded file contents, credentials, or API secrets.

## Project structure

```text
src/
  components/     Layout, shared cards, badges, and charts
  context/        Dataset, analysis, model, and API connection state
  pages/          Landing page and workspace routes
  services/api.js Centralized FastAPI client
  utils/data.js   Formatting and safe CSV/JSON exports
```

## Requirements and local development

Use Node.js 20.19+ or 22.12+ (required by the installed Vite version).

```powershell
cd parcel-ai-frontend
npm install
Copy-Item .env.example .env
npm run dev
```

During Vite development, a blank API URL falls back to `http://127.0.0.1:8000`. Start the FastAPI backend from `Parcel-ai-backend` in a separate terminal, then open the Vite URL (normally `http://localhost:5173`). In production, a blank API URL uses the same origin; set `VITE_API_BASE_URL` in the build process environment when the API is deployed separately. Production builds intentionally ignore the generic `.env` file and reject loopback API URLs so a developer's local endpoint cannot be embedded accidentally.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Development: `http://127.0.0.1:8000`; production: same origin | FastAPI origin. Configure the deployed HTTPS backend URL if the API is hosted separately. |
| `VITE_API_PREFIX` | `/api` | Prefix for dataset, model, prediction, report, and public configuration routes; keep it aligned with backend `API_PREFIX`. |
| `VITE_MAX_UPLOAD_SIZE_MB` | `20` | Frontend upload guard. The backend remains authoritative and enforces `MAX_UPLOAD_SIZE_MB` from its own configuration. Keep the two values aligned if the backend limit changes. |

Do not put secrets in `VITE_*` variables: Vite embeds them in the browser bundle.

## Backend API integration

The client uses the routes defined in `Parcel-ai-backend/app/main.py` and its routers:

| Method | Route | Frontend use |
| --- | --- | --- |
| `GET` | `/health` | API connection status |
| `GET` | `/api/config` | Public upload-size, supported-format, preview, and API-prefix configuration |
| `POST` | `/api/datasets/upload` | Multipart dataset upload |
| `GET` | `/api/datasets` | Dataset library |
| `GET` | `/api/datasets/{id}` | Dataset metadata |
| `DELETE` | `/api/datasets/{id}` | Delete dataset and stored file |
| `GET` | `/api/datasets/{id}/preview?limit=50` | Sample table and CSV preview export |
| `GET` | `/api/datasets/{id}/columns` | Source columns, standardized field suggestions, and saved mapping |
| `PUT` | `/api/datasets/{id}/mapping` | Save an editable source-column map |
| `POST` | `/api/datasets/{id}/validate` | Run validation |
| `GET` | `/api/datasets/{id}/validation` | Latest validation result |
| `POST` | `/api/datasets/{id}/analyze` | Run analysis |
| `GET` | `/api/datasets/{id}/analysis` | Latest analysis result |
| `POST`, `GET` | `/api/models/train`, `/api/models` | Train a dataset model and list models |
| `POST`, `GET` | `/api/predictions`, `/api/predictions` | Predict on a dataset and list results |
| `GET` | `/api/reports/{id}`, `/api/reports/{id}/download` | Read/download a known report ID |

Dataset comparisons reuse the existing preview, analysis read, and analysis-generation routes for each uploaded dataset; they do not include demo values. Comparison and analytics exports are browser-generated CSV summaries. Filtered shipment CSV exports contain only the rows returned by the preview API (up to 50), not a full dataset download.

The backend does not expose report listing/creation, server-side analytics filters, full dataset pagination, or PDF generation. It returns carrier delay-rate aggregates and model-wide feature importance; those model factors are not causal or per-shipment explanations. Accordingly, local chart filters do not recalculate dataset-wide summary metrics, carrier comparison charts compare shipment volume only, and PDF reports are not offered. Preview and prediction tables paginate only the records already returned by the API; this does not add server-side pagination. See the backend OpenAPI docs at `http://127.0.0.1:8000/docs` in development.

The prediction service needs an existing model and a dataset with a supported delay target. Training failures (for example, missing target columns or insufficient labeled records) are shown from the API. The backend returns held-out evaluation metrics and model-derived global feature importance when training succeeds; no synthetic per-shipment explanation is generated.

## Quality checks

```powershell
npm test
npm run lint
npm run build
```

The production build output is `dist/`.

## Vercel deployment

1. Import the existing Parcel-AI repository and set the project root to `parcel-ai-frontend`.
2. Set the build command to `npm run build` and output directory to `dist`.
3. Configure `VITE_API_BASE_URL` to the publicly reachable HTTPS backend origin. Optionally set `VITE_MAX_UPLOAD_SIZE_MB` to match the backend upload limit.
4. Configure backend CORS to allow the deployed frontend origin.
5. Deploy and verify the site, health indicator, dataset upload, and API requests. `vercel.json` rewrites client-side routes to `index.html`.

Deployment is not performed by this repository setup. For separate production hosting, use HTTPS for the API, configure backend CORS for the deployed frontend origin, and set `VITE_API_BASE_URL` at build time.
