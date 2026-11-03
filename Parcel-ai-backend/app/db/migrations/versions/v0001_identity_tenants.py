from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


TENANT_COLUMNS = {
    "uploaded_datasets": {"organization_id": "VARCHAR NULL REFERENCES organizations(id)", "owner_user_id": "VARCHAR NULL REFERENCES users(id)"},
    "dataset_validation_reports": {"organization_id": "VARCHAR NULL REFERENCES organizations(id)"},
    "analysis_reports": {"organization_id": "VARCHAR NULL REFERENCES organizations(id)"},
    "model_versions": {"organization_id": "VARCHAR NULL REFERENCES organizations(id)"},
    "prediction_records": {"organization_id": "VARCHAR NULL REFERENCES organizations(id)"},
}


def upgrade(engine: Engine) -> None:
    """Add nullable tenant ownership columns without modifying legacy records."""
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table_name, columns in TENANT_COLUMNS.items():
            if not inspector.has_table(table_name):
                continue
            existing_columns = {column["name"] for column in inspect(connection).get_columns(table_name)}
            for column_name, definition in columns.items():
                if column_name not in existing_columns:
                    connection.execute(
                        text(f'ALTER TABLE "{table_name}" ADD COLUMN "{column_name}" {definition}')
                    )

    indexes = (
        ("uploaded_datasets", "organization_id"),
        ("uploaded_datasets", "owner_user_id"),
        ("dataset_validation_reports", "organization_id"),
        ("analysis_reports", "organization_id"),
        ("model_versions", "organization_id"),
        ("prediction_records", "organization_id"),
    )
    with engine.begin() as connection:
        metadata = inspect(connection)
        for table_name, column_name in indexes:
            if metadata.has_table(table_name):
                index_name = f"ix_{table_name}_{column_name}"
                connection.execute(
                    text(
                        f'CREATE INDEX IF NOT EXISTS "{index_name}" '
                        f'ON "{table_name}" ("{column_name}")'
                    )
                )
