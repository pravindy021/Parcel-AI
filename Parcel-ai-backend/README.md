# PARCEL-AI Backend

FastAPI service for shipment dataset upload, validation, analytics, model training, predictions, and JSON report retrieval. The service uses SQLite and controlled local directories by default.

## Architecture and stack

- `app/api/routes/`: health, datasets, models, predictions, and reports APIs.
- `app/core/`: environment-based settings.
- `app/db/`: SQLAlchemy engine, sessions, and tables.
- `app/schemas/`: request and response models.
- `app/services/`: upload storage, validation, analytics, and scikit-learn training.
- `tests/`: API and service regression tests.
- Python, FastAPI, Pydantic Settings, SQLAlchemy, pandas, scikit-learn, joblib, and openpyxl.

## Local setup (Windows PowerShell)

Run these commands from `Parcel-ai-backend`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

The API listens on `http://127.0.0.1:8000`. OpenAPI documentation is available at `/docs`; ReDoc is at `/redoc`.

Run backend tests:

```powershell
python -m pytest -q
```

## Environment configuration

`.env.example` lists supported variables:

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | Blocks synthetic training in production. |
| `MAX_UPLOAD_SIZE_MB` | `20` | Maximum uploaded file size. |
| `MAX_DATASET_ROWS` | `250000` | Parsed data-row limit per file. |
| `MAX_DATASET_COLUMNS` | `200` | Parsed column limit per file. |
| `UPLOAD_DIR` | `data/uploads` | Local uploaded-file storage. |
| `DATABASE_URL` | `sqlite:///./parcel_ai.db` | SQLAlchemy database URL. |
| `MODEL_DIR` | `models` | Locally stored model artifacts. |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS origins. |
| `RISK_MEDIUM_THRESHOLD` | `0.5` | Probability at or above which risk is medium. |
| `RISK_HIGH_THRESHOLD` | `0.75` | Probability at or above which risk is high. |

Risk thresholds must be between 0 and 1, and the high threshold must be at least the medium threshold. No API key or production secret is configured or required by this unauthenticated service. Restrict network access appropriately before exposing it publicly.

## API contract

All dataset, model, prediction, and report endpoints use the `/api` prefix. Errors use FastAPI's structured `{"detail": "..."}` response; unhandled errors are logged server-side and returned without stack traces or filesystem paths.

| Method and path | Behavior |
|---|---|
| `GET /` | Service identity and availability. |
| `GET /health` | Checks the database with `SELECT 1`; returns HTTP 503 when unavailable. |
| `GET /api/config` | Returns public upload limits, supported file extensions, preview limit, and API prefix for frontend alignment. |
| `POST /api/datasets/upload` | Multipart fields: `file`, optional `category`, and `description`; returns dataset metadata. |
| `GET /api/datasets` | Lists uploaded datasets. |
| `GET /api/datasets/{dataset_id}` | Returns dataset metadata. |
| `GET /api/datasets/{dataset_id}/preview?limit=50` | Returns up to 50 preview rows, column names, and dataset dimensions. |
| `GET /api/datasets/{dataset_id}/columns` | Returns original source columns, exact-name mapping suggestions, and any saved mapping. |
| `PUT /api/datasets/{dataset_id}/mapping` | Saves a validated standardized-field-to-source-column mapping; an empty map clears it. |
| `DELETE /api/datasets/{dataset_id}` | Deletes the dataset record and its stored file. |
| `POST /api/datasets/{dataset_id}/validate` | Generates a validation report. |
| `GET /api/datasets/{dataset_id}/validation` | Returns the latest validation report. |
| `POST /api/datasets/{dataset_id}/analyze` | Generates analytics and chart-ready aggregates. |
| `GET /api/datasets/{dataset_id}/analysis` | Returns the latest analysis. |
| `POST /api/models/train` | Trains from `dataset_id` or explicit `records`; `synthetic: true` is development-only. |
| `GET /api/models` | Lists trained model metadata and evaluated metrics. |
| `GET /api/models/{model_id}` | Returns one model's metadata. |
| `POST /api/predictions` | Predicts from a `dataset_id` or explicit `records` for a `model_id`. |
| `POST /api/predictions/batch` | Runs up to 100 prediction jobs and 10,000 total records per request. |
| `GET /api/predictions` | Lists saved prediction records. |
| `GET /api/reports/{report_id}` | Retrieves an existing validation or analysis report. |
| `GET /api/reports/{report_id}/download` | Returns the report in JSON; this is not a PDF or file-download implementation. |

This contract matches the React client paths and methods. Dataset uploads use the `file` multipart field; dataset/model listings return `items` and `count`; prediction responses return `items` and `count`. Set frontend `VITE_API_PREFIX` to the same value as backend `API_PREFIX` when changing the default `/api`. Report listing/creation endpoints and PDF generation are not implemented.

## Upload and validation

Only UTF-8 CSV and XLSX are accepted; legacy XLS is unsupported. Uploads are given generated storage names and checked for type, content, non-empty rows, size, row count, and column count. CSV parsing rejects malformed rows; XLSX content is opened in read-only mode for structural and size checks. Uploaded files are never executed. API responses do not include filesystem paths.

Validation reports required shipment fields (`shipment_id`, `carrier`, `origin_warehouse`, `destination`, and `created_at`), missing values, duplicate rows, invalid shipment IDs, invalid dates, negative weight/distance/cost/amount values, and impossible delivery date orderings. Optional fields are not required for analytics. Validation reports errors and warnings without rewriting the uploaded source.

Column mapping accepts canonical fields defined in `app/services/column_mapping.py`. Suggestions are based on normalized field names and are advisory; users can change them. A saved mapping is applied consistently to preview, validation, analytics, and model training. The uploaded file is not rewritten. Unsupported field names, missing source columns, duplicate sources, and rename collisions are rejected.

## Analytics and ML behavior

Analytics always reports total rows and data-quality counts. Delivery counts/rates are returned only when delivery timestamps or classifiable delivery status is present. When timestamp columns exist, a shipment is late only when `actual_delivery_time > promised_delivery_time`; rows missing either timestamp are excluded from delivery-rate denominators and are not marked on-time. Segment summaries include sample counts and leave unsupported rates unavailable.

Model training requires at least 20 usable labeled examples and both target classes. With promised and actual timestamps, the target is exactly `actual > promised`; rows missing either are excluded. Otherwise, only explicit late/delayed and on-time status values are used. Target, status, actual-delivery, and known delay-derived columns are excluded from model features. Data with a valid shipment creation timestamp uses a chronological 75/25 holdout; otherwise training uses a stratified random holdout. Logistic regression and random forest candidates are compared by F1. Metrics identify the validation strategy and target definition. Feature importance is computed from the selected fitted estimator; it describes model contributions, not causality.

Prediction requests require the trained model's prediction-time features. Missing features return HTTP 422 instead of being silently invented. Predictions are only produced from a saved model artifact, and response probabilities and risk levels are derived from that model. Risk cutoffs are configurable. Explicit synthetic training is available only outside production and is marked `training_data_source: synthetic_demo`.

## Database, storage, and deployment

The default database is local SQLite. Uploaded files and trained joblib artifacts are stored under `UPLOAD_DIR` and `MODEL_DIR`; `.gitignore` excludes those artifacts and local database files. These local directories are not durable on ephemeral hosting. Only the SQLite driver is included and tested; a non-SQLite database needs its compatible driver and separate verification. No schema migration or persistent volume is configured here.

The included `render.yaml` installs requirements and starts Uvicorn on the platform-provided port. Set `ALLOWED_ORIGINS`, `DATABASE_URL`, `UPLOAD_DIR`, and `MODEL_DIR` for the deployment environment. Deployment itself has not been performed or verified.

## Known limitations

- The API has no authentication or authorization.
- The API has no organization ownership or tenant isolation; never use it for private multi-customer workloads.
- Database schema changes have no migration framework; `create_all` does not upgrade existing tables.
- Validation uses the documented canonical required field names; automatic column mapping is not implemented.
- Delivery metrics require the columns described above; unavailable metrics are omitted or `null`, not fabricated.
- Model training without a creation timestamp uses a stratified random holdout, not temporal validation.
- Explanation data is global model feature importance, not per-shipment causal attribution.
- Reports are retrieved as JSON; PDF generation and a reports list endpoint are not implemented.
- Database and file storage are local by default and require deployment-specific persistence for durable hosting.
