# API Guide

Run the backend locally and open `http://127.0.0.1:8000/docs` for the generated OpenAPI schema. The implemented API prefix is configurable (`API_PREFIX`, default `/api`); frontend `VITE_API_PREFIX` must match.

Implemented routes include `/health`, `/api/config`, `/api/datasets`, `/api/models`, `/api/predictions`, and `/api/reports/{id}`. Dataset routes include upload, metadata, deletion, preview, validation, analysis, raw column discovery, and mapping:

- `GET /api/datasets/{id}/columns` returns source columns, exact-name suggestions, and saved mapping.
- `PUT /api/datasets/{id}/mapping` accepts `{"mapping":{"shipment_id":"Tracking Number"}}`; use an empty object to clear the saved map.
- Mapping keys must be supported standardized fields and values must match source columns. A source may be mapped only once. Mapping collisions and unknown source columns return validation errors.
- Mappings are applied to preview, validation, analytics, and model training while the uploaded source file remains unchanged.

The API currently has **no authentication, authorization, tenant scope, or production API version `/api/v1`**. Do not call it with untrusted data or expose it publicly. See the backend README for current route contracts and limitations.

