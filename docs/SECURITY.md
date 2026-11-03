# Security and Privacy Status

## Current controls

Uploads are restricted to CSV/XLSX, checked for size and content, stored under generated names, and API responses avoid exposing local file paths. Errors are sanitized and uploads are not executed. The frontend does not persist uploaded file contents or API secrets.

## Critical limitation

The backend has no authentication or authorization. Dataset, model, and prediction APIs are globally accessible to any caller who can reach the service. There is no tenant isolation, account protection, CSRF/session design, API-key authentication, or audit viewer. **Do not expose the current service to untrusted networks or process confidential multi-customer data.**

Local SQLite/files are development storage only. Configure TLS, private durable storage, managed secrets, backups, retention/deletion policies, rate limits, and monitoring before production. No GDPR, ISO 27001, SOC 2, or other compliance certification is claimed.

