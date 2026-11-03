# SaaS Customer Guide

## Current status

Public product discovery and the local dataset workspace exist. Account registration, login, email verification, password recovery, personal workspaces, workspace ownership, subscriptions, and account deletion are **NOT IMPLEMENTED**. The current backend is unauthenticated and is not safe for public multi-customer use.

The dataset workflow currently supports CSV/XLSX upload, source-column suggestions and mapping, bounded preview, validation, analytics, and model-backed predictions when a model can be trained. Mapping and analytics are not a substitute for authorization.

## Before offering self-service accounts

- Implement verified identity and secure session renewal.
- Add tenant ownership and backend-side authorization to every dataset, model, report, and prediction operation.
- Add migration and recovery plans before deploying schema changes.
- Add abuse protection, email provider configuration, privacy/retention controls, and account deletion tests.
- Gate subscription actions until a real billing provider is configured and payment lifecycle behavior is tested.

No email or payment credentials are currently required by the local development workflow because those integrations do not exist yet.

