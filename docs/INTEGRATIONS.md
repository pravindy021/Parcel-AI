# Integrations

No courier, commerce, WMS, TMS, ERP, CRM, database, or scheduled synchronization connector is implemented. No external connection should be presented as live.

Future connectors should implement a shared adapter contract for credential validation, connection testing, retrieval, mapping, idempotent synchronization, retryable failures, and sync history. Store provider secrets outside source control and avoid including shipment contents in logs.

API-key lifecycle, webhook registration/delivery, event retry, and automation are also **NOT IMPLEMENTED**. Required provider credentials must be configured by operators through deployment secret management; never commit them or place them in `VITE_*` variables.

