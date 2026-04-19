"""
GLaDOS - Aperture Labs FOD Detection API
"""

import logging
import threading
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from routers.auth import router as auth_router
from routers.projects import router as projects_router
from routers.storage import router as storage_router
from routers.detection import detect_router
from routers.users import router as users_router
from routers.submissions import router as submissions_router
from routers.anomalies import router as anomalies_router
from routers.project_members import router as project_members_router

from core import exceptions
from core.exception_handlers import (
    project_not_found_handler,
    anomaly_not_found_handler,
    user_not_found_handler,
    member_not_found_handler,
    submission_not_found_handler,
    permission_denied_handler,
    conflict_error_handler,
    invalid_state_transition_handler,
)
from models.owlv2 import preload_owlv2
from seed_data import run_seed_minio_only

logging.basicConfig(level=logging.INFO)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security-related headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    run_seed_minio_only()
    threading.Thread(target=preload_owlv2, daemon=True).start()
    yield


app = FastAPI(
    title="GLaDOS - FOD Detection API",
    description="AI Anomaly Detection System for Foreign Object Debris",
    version="1.0.0",
    lifespan=lifespan,
)

# Security headers (before CORS so they apply to all responses)
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS middleware: allow any localhost/127.0.0.1 origin (any port) for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # use regex for flexible dev origins
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(projects_router)
app.include_router(project_members_router)
app.include_router(submissions_router)
app.include_router(anomalies_router)
app.include_router(storage_router)
app.include_router(detect_router)

if settings.STORAGE_BACKEND == "local":
    from routers.local_files import router as local_files_router
    app.include_router(local_files_router)

# Register global exception handlers
app.add_exception_handler(exceptions.ProjectNotFound, project_not_found_handler)
app.add_exception_handler(exceptions.AnomalyNotFound, anomaly_not_found_handler)
app.add_exception_handler(exceptions.UserNotFound, user_not_found_handler)
app.add_exception_handler(exceptions.MemberNotFound, member_not_found_handler)
app.add_exception_handler(exceptions.SubmissionNotFound, submission_not_found_handler)
app.add_exception_handler(exceptions.PermissionDenied, permission_denied_handler)
app.add_exception_handler(exceptions.ConflictError, conflict_error_handler)
app.add_exception_handler(exceptions.InvalidStateTransition, invalid_state_transition_handler)


@app.get("/")
async def root():
    return {
        "message": "Welcome to GLaDOS - FOD Detection API",
        "version": "1.0.0",
        "docs": "/docs",
    }