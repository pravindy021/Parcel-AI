from __future__ import annotations

import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Dict, Optional
from zipfile import BadZipFile, is_zipfile

import pandas as pd
from fastapi import UploadFile
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from app.core.config import settings

ALLOWED_EXTENSIONS = {
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class UnsupportedFileTypeError(ValueError):
    pass


class UploadTooLargeError(ValueError):
    pass


class InvalidUploadContentError(ValueError):
    pass


def safe_filename(filename: str) -> str:
    safe_name = Path(filename).name
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", safe_name.strip())
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("Invalid filename")
    return cleaned


def generate_storage_name(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return f"{uuid.uuid4().hex}{ext}"


def stored_upload_path(stored_name: str) -> Path:
    root = Path(settings.upload_dir).resolve()
    path = (root / stored_name).resolve()
    if path.parent != root:
        raise ValueError("Invalid stored dataset reference")
    return path


def validate_upload(file: UploadFile, max_size_bytes: Optional[int] = None) -> Dict[str, object]:
    filename = safe_filename(file.filename or "upload")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFileTypeError(f"Unsupported file type: {ext}")

    content_type = (file.content_type or "").lower()
    expected = ALLOWED_EXTENSIONS[ext]
    allowed_types = {
        ".csv": {"text/csv", "application/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"},
        ".xlsx": {expected, "application/octet-stream"},
    }
    if content_type and content_type not in allowed_types[ext]:
        raise InvalidUploadContentError("File content type does not match the extension")

    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)
    if size <= 0:
        raise InvalidUploadContentError("Uploaded file is empty")
    max_bytes = max_size_bytes if max_size_bytes is not None else settings.max_upload_size_mb * 1024 * 1024
    if size > max_bytes:
        raise UploadTooLargeError(
            f"File is larger than the configured limit of {settings.max_upload_size_mb} MB"
        )

    if ext == ".csv":
        _validate_csv(file)
    else:
        _validate_xlsx(file)
    return {"filename": filename, "extension": ext, "size_bytes": size}


def _validate_csv(file: UploadFile) -> None:
    file.file.seek(0)
    try:
        chunks = pd.read_csv(
            file.file,
            encoding="utf-8-sig",
            on_bad_lines="error",
            chunksize=10_000,
        )
        total_rows = 0
        columns = None
        for chunk in chunks:
            columns = chunk.columns
            if len(columns) > settings.max_dataset_columns:
                raise UploadTooLargeError(
                    f"CSV exceeds the {settings.max_dataset_columns}-column limit"
                )
            total_rows += len(chunk)
            if total_rows > settings.max_dataset_rows:
                raise UploadTooLargeError(
                    f"CSV exceeds the {settings.max_dataset_rows}-row limit"
                )
        if columns is None or total_rows == 0:
            raise InvalidUploadContentError("CSV must contain a header and at least one data row")
    except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError) as exc:
        raise InvalidUploadContentError("CSV content is malformed or unreadable") from exc
    finally:
        file.file.seek(0)


def _validate_xlsx(file: UploadFile) -> None:
    file.file.seek(0)
    if not is_zipfile(file.file):
        raise InvalidUploadContentError("XLSX content is corrupt or invalid")

    file.file.seek(0)
    workbook = None
    try:
        workbook = load_workbook(file.file, read_only=True, data_only=True)
        worksheet = workbook.active
        if worksheet is None:
            raise InvalidUploadContentError("XLSX workbook contains no worksheet")

        row_count = 0
        has_data = False
        for row_count, row in enumerate(worksheet.iter_rows(values_only=True), start=1):
            if row_count == 1 and len(row) > settings.max_dataset_columns:
                raise UploadTooLargeError(
                    f"XLSX exceeds the {settings.max_dataset_columns}-column limit"
                )
            if row_count > settings.max_dataset_rows + 1:
                raise UploadTooLargeError(
                    f"XLSX exceeds the {settings.max_dataset_rows}-row limit"
                )
            if row_count > 1 and any(value is not None for value in row):
                has_data = True
        if row_count < 2 or not has_data:
            raise InvalidUploadContentError("XLSX must contain a header and at least one data row")
    except (BadZipFile, InvalidFileException, OSError, KeyError) as exc:
        raise InvalidUploadContentError("XLSX content is corrupt or invalid") from exc
    finally:
        if workbook is not None:
            workbook.close()
        file.file.seek(0)


def persist_upload(file: UploadFile, category: str, description: str = "") -> tuple[str, Path, dict]:
    metadata = validate_upload(file)
    target_dir = Path(settings.upload_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    stored_name = generate_storage_name(str(metadata["filename"]))
    stored_path = target_dir / stored_name
    file.file.seek(0)
    try:
        with stored_path.open("wb") as out:
            shutil.copyfileobj(file.file, out, length=1024 * 1024)
    except OSError:
        stored_path.unlink(missing_ok=True)
        raise
    return stored_name, stored_path, {
        "filename": metadata["filename"],
        "category": category,
        "description": description,
        "file_type": metadata["extension"],
        "size_bytes": metadata["size_bytes"],
    }
