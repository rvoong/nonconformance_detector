from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./app.db"
    MINIO_ENDPOINT: str = "localhost:9002"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET_DESIGNS: str = "designs"
    MINIO_BUCKET_IMAGES: str = "images"
    MINIO_USE_SSL: bool = False
    DETECTION_WEBHOOK_SECRET: str = "dev-webhook-secret"
    OLLAMA_VLM_MODEL: str = "gemma4:e4b"

    # "local" = filesystem (no Docker); "minio" = MinIO container
    STORAGE_BACKEND: str = "local"
    LOCAL_STORAGE_PATH: str = "./storage"
    SERVER_BASE_URL: str = "http://localhost:8000"


settings = Settings()  # ← this line must be here