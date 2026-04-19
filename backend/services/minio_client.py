import io
import shutil
from datetime import timedelta
from pathlib import Path

from core.config import settings


# ─── Local filesystem backend ────────────────────────────────────────────────

def _storage_root() -> Path:
    return Path(settings.LOCAL_STORAGE_PATH).resolve()


def _local_path(bucket: str, object_name: str) -> Path:
    root = _storage_root()
    resolved = (root / bucket / object_name).resolve()
    if not str(resolved).startswith(str(root)):
        raise ValueError("Path traversal rejected")
    return resolved


def _local_ensure_bucket(bucket_name: str) -> None:
    (_storage_root() / bucket_name).mkdir(parents=True, exist_ok=True)


def _local_upload(bucket: str, object_name: str, file_data: bytes) -> str:
    path = _local_path(bucket, object_name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(file_data)
    return object_name


def _local_list(bucket: str, prefix: str) -> list[str]:
    base = _storage_root() / bucket / prefix.rstrip("/")
    if not base.exists():
        return []
    bucket_root = _storage_root() / bucket
    return [
        str(p.relative_to(bucket_root)).replace("\\", "/")
        for p in base.rglob("*")
        if p.is_file()
    ]


def _local_url(bucket: str, object_name: str) -> str:
    return f"{settings.SERVER_BASE_URL}/api/files/{bucket}/{object_name}"


# ─── MinIO backend ────────────────────────────────────────────────────────────

_minio_client = None


def _get_minio():
    global _minio_client
    if _minio_client is None:
        from minio import Minio
        _minio_client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_USE_SSL,
        )
    return _minio_client


# ─── Public API (same signatures as before) ──────────────────────────────────

def _local() -> bool:
    return settings.STORAGE_BACKEND == "local"


def get_client():
    return None if _local() else _get_minio()


def ensure_bucket(bucket_name: str) -> None:
    if _local():
        _local_ensure_bucket(bucket_name)
    else:
        client = _get_minio()
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)


def upload_file(bucket: str, object_name: str, file_data: bytes, content_type: str) -> str:
    if _local():
        return _local_upload(bucket, object_name, file_data)
    client = _get_minio()
    ensure_bucket(bucket)
    client.put_object(bucket, object_name, io.BytesIO(file_data), length=len(file_data), content_type=content_type)
    return object_name


def list_objects(bucket: str, prefix: str) -> list[str]:
    if _local():
        return _local_list(bucket, prefix)
    client = _get_minio()
    return [obj.object_name for obj in client.list_objects(bucket, prefix=prefix, recursive=True)]


def get_presigned_url(bucket: str, object_name: str, expires_seconds: int = 900, download: bool = False) -> str:
    if _local():
        return _local_url(bucket, object_name)
    client = _get_minio()
    extra_params = None
    if download:
        filename = object_name.split("/")[-1]
        extra_params = {"response-content-disposition": f'attachment; filename="{filename}"'}
    return client.presigned_get_object(bucket, object_name, expires=timedelta(seconds=expires_seconds), extra_query_params=extra_params)


def get_file(bucket: str, object_name: str) -> bytes:
    if _local():
        return _local_path(bucket, object_name).read_bytes()
    client = _get_minio()
    response = client.get_object(bucket, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_file(bucket: str, object_name: str) -> None:
    if _local():
        path = _local_path(bucket, object_name)
        if path.exists():
            path.unlink()
    else:
        _get_minio().remove_object(bucket, object_name)


def create_project_bucket(project_id: str) -> None:
    ensure_bucket(project_id)


def delete_project_bucket(project_id: str) -> None:
    if _local():
        path = _storage_root() / project_id
        if path.exists():
            shutil.rmtree(path)
    else:
        client = _get_minio()
        if not client.bucket_exists(project_id):
            return
        for obj in client.list_objects(project_id, recursive=True):
            client.remove_object(project_id, obj.object_name)
        client.remove_bucket(project_id)
