"""
FastAPI application and route registration.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routes import admin, app_feedback, auth, contact, cycles, feedback

app = FastAPI(
    title="Surface API",
    description="Anonymous feedback and insights API",
    version="0.1.0",
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
    """Health check for load balancers and local development."""
    return {"status": "ok"}


app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(contact.router, tags=["contact"])
app.include_router(feedback.router, prefix="/feedback", tags=["feedback"])
app.include_router(cycles.router, prefix="/cycles", tags=["cycles"])
app.include_router(app_feedback.router, prefix="/app-feedback", tags=["app-feedback"])
