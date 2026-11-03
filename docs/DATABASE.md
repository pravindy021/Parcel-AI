# Database and Storage

## Current implementation

SQLAlchemy models persist uploaded dataset metadata, validation reports, analytics reports, trained-model metadata, prediction records, and audit events. The default development database is SQLite (`sqlite:///./parcel_ai.db`). Dataset files and serialized model artifacts use local directories configured by `UPLOAD_DIR` and `MODEL_DIR`.

## Limitations and migration policy

There is no Alembic migration history. Startup `create_all` creates missing tables but does not migrate existing schemas. Do not assume a model change upgrades an existing database. Back up the database and files before any schema change.

PostgreSQL and persistent object storage are not configured or verified. Local disk is not durable on ephemeral hosting. Before multi-tenancy, introduce explicit migrations, user/organization/membership tables, ownership foreign keys and indexes, and tested cross-tenant query scoping. Do not apply a destructive or production migration without a reviewed migration plan.

