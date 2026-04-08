"""
FastAPI application and route registration.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import admin, auth, feedback, cycles

_log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Log effective CORS config once at startup (helps debug Railway OPTIONS 400)."""
    _log.info("Surface API CORS allow_origins=%s", settings.CORS_ORIGINS)
    yield


app = FastAPI(
    title="Surface API",
    description="Anonymous feedback and insights API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Health check for load balancers and local dev."""
    return {"status": "ok"}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
app.include_router(cycles.router, prefix="/cycles", tags=["cycles"])
