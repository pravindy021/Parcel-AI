# Enterprise Guide

## Current status

The current backend supports local dataset operations and prediction endpoints, but has no organization model, member management, role-based permissions, API keys, webhooks, sync scheduler, or audit administration. Organization boundaries and customer isolation are **NOT IMPLEMENTED**. Do not submit confidential enterprise data to this service.

## Required enterprise release gates

1. Implement organization membership and server-side authorization for every resource.
2. Add API credentials with one-time secret display, secure storage, rotation, revocation, and scoped permissions.
3. Version API contracts and add pagination, rate limits, idempotency, and audit events.
4. Implement connectors as tested adapters; report unavailable credentials as disconnected rather than successful.
5. Add signed webhook delivery, retry logs, and non-sensitive event payloads.
6. Deploy with PostgreSQL migrations and durable private object storage.

No third-party connector is currently live or configured.

