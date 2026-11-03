# Architecture and Current Audit

## Current system

PARCEL-AI is a monorepo with a React 19/Vite browser client and a FastAPI service. The browser uses a centralized Axios client. The API stores dataset and analysis metadata with SQLAlchemy, files under a local upload directory, and trained scikit-learn artifacts under a local model directory.

The current data path is: upload CSV/XLSX -> store file and metadata -> optionally map source columns -> preview/validate -> analyze -> train a model -> request predictions. The model pipeline labels delay using available delivery timestamps or explicit status values, excludes post-delivery leakage fields, uses a chronological holdout when shipment dates are available, and exposes evaluated metrics and model-level feature importance.

## Repository findings

- Implemented: dataset upload and deletion, bounded preview, validation, analytics, model training and prediction APIs, API-config discovery, and the React workspace.
- Implemented in this increment: persisted column mapping with name-based suggestions, API-side mapping validation, and mapping application before preview/validation/analytics/training.
- Not implemented: user authentication, organizations, workspaces, roles, tenant isolation, migrations, API keys, integrations, webhooks, billing, and platform administration.
- The API currently has no authentication or authorization. Do not expose it to untrusted users or use it for multi-customer production data.
- SQLite and local file/model storage are development defaults; ephemeral deployment storage is not durable.
- No migration tool is configured. `create_all` does not upgrade existing tables.

## Architectural constraints

Keep the current routes and service boundaries while adding migrations before introducing tenant foreign keys. Tenant identity must be derived from an authenticated principal, not from request-supplied organization IDs. Apply ownership filters to each resource query and verify them in cross-tenant tests. Use an object-store adapter before treating uploaded files as durable production data.

