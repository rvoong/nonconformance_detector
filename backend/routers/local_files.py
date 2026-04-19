from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from core.config import settings

router = APIRouter(tags=["Files"])


@router.get("/api/files/{bucket}/{path:path}")
def serve_local_file(bucket: str, path: str):
    root = Path(settings.LOCAL_STORAGE_PATH).resolve()
    file_path = (root / bucket / path).resolve()
    if not str(file_path).startswith(str(root)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)
