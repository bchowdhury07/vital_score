"""
backend/main.py
FastAPI Web Service for VitalScore Risk Inference (BR-1 to BR-5, BR-8, BR-10, BR-11, BR-24 to BR-30).
"""

import time
import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, List
from collections import defaultdict

from fastapi import FastAPI, Request, status, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from backend.config import (
    SERVICE_NAME,
    SERVICE_DISCLAIMER,
    ARTIFACT_VERSION,
    ALLOWED_ORIGINS,
    MAX_REQUEST_SIZE_BYTES,
    RATE_LIMIT_PER_MINUTE,
)
from backend.models import model_manager
from backend.schemas import (
    PatientVitalsRequest,
    PredictResponse,
    HealthResponse,
    ModelInfoResponse,
)

# Configure Privacy-Preserving Logger (BR-24, BR-28)
# Patient health inputs are NEVER logged.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [VitalScore API] %(message)s",
)
logger = logging.getLogger("vitalscore_backend")

STARTUP_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan context manager: Loads models once at startup (BR-10, BR-11, BR-32).
    """
    logger.info("Initializing VitalScore backend service...")
    try:
        model_manager.load_artifacts()
        logger.info(
            f"Model artifacts v{model_manager.artifact_version} loaded successfully in "
            f"{model_manager.load_time_ms:.2f} ms."
        )
    except Exception as exc:
        logger.critical(f"FATAL: Model loading failed during startup: {str(exc)}")
        # Service starts in degraded unhealthy state for observability (BR-11, BR-25)

    yield

    logger.info("VitalScore backend shutting down.")


app = FastAPI(
    title="VitalScore Clinical Risk Inference API",
    description=(
        "Probabilistic Machine Learning backend for Cardiovascular Risk Assessment (SVM vs. Bayesian Logistic Regression). "
        f"{SERVICE_DISCLAIMER}"
    ),
    version=ARTIFACT_VERSION,
    docs_url="/docs",  # OpenAPI Docs exposed (BR-4)
    redoc_url="/redoc",
    lifespan=lifespan,
)

# 1. Configured CORS Origins (BR-27)
# Strict origin list, no wildcard allowed in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# In-Memory Rate Limiting Tracker (BR-30)
rate_limit_records = defaultdict(list)


# 2. Privacy, Rate Limiting & Performance Middleware (BR-24, BR-28, BR-30, BR-31)
@app.middleware("http")
async def security_and_privacy_middleware(request: Request, call_next):
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()

    # Rate Limiting: max requests per minute window
    req_history = rate_limit_records[client_ip]
    rate_limit_records[client_ip] = [t for t in req_history if now - t < 60.0]
    if len(rate_limit_records[client_ip]) >= RATE_LIMIT_PER_MINUTE:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "RateLimitExceeded",
                "message": f"Rate limit of {RATE_LIMIT_PER_MINUTE} requests/minute exceeded. Please slow down.",
                "retryable": True,
            },
        )
    rate_limit_records[client_ip].append(now)

    # Request Body Size Limit (BR-30)
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_SIZE_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={
                "error": "PayloadTooLarge",
                "message": f"Request body exceeds maximum size of {MAX_REQUEST_SIZE_BYTES} bytes.",
                "retryable": False,
            },
        )

    # Track Latency (BR-31)
    t_start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - t_start) * 1000.0

    # Privacy Audit Log: Logs endpoint, response status, duration, artifact version.
    # NEVER logs patient features or request payload (BR-24, BR-28).
    logger.info(
        f"{request.method} {request.url.path} -> status={response.status_code} "
        f"latency={duration_ms:.2f}ms artifact_v={model_manager.artifact_version or 'N/A'}"
    )

    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
    response.headers["X-Artifact-Version"] = model_manager.artifact_version or "unloaded"
    return response


# 3. Custom Error Handlers for Consistent Error Contract (BR-25, BR-26)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Standardized 422 Validation Error with field-level messages and retryable=false flag (BR-8, BR-25, BR-26).
    """
    field_errors: Dict[str, str] = {}
    for err in exc.errors():
        loc = err.get("loc", [])
        field_name = str(loc[-1]) if loc else "general"
        msg = err.get("msg", "Invalid value.")
        field_errors[field_name] = msg

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "ValidationError",
            "message": "Clinical input validation failed. Please correct the highlighted parameters.",
            "field_errors": field_errors,
            "retryable": False,
        },
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all 500 error handler that suppresses internal stack traces (BR-25, BR-26).
    """
    logger.error(f"Internal server error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred during prediction. Please try again.",
            "retryable": True,
        },
    )


# 4. API Endpoints
@app.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check (BR-2)",
    tags=["Diagnostics"],
)
async def health_check():
    """
    Reports whether model artifacts are loaded and ready to serve (BR-2, BR-11).
    Returns 503 if models are not loaded.
    """
    is_ready = model_manager.is_loaded
    uptime = time.time() - STARTUP_TIME

    if not is_ready:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "models_loaded": False,
                "artifact_version": None,
                "uptime_seconds": round(uptime, 2),
                "model_source": "trained",
                "error": "Model artifacts not loaded. Service unavailable.",
                "retryable": True,
            },
        )

    return HealthResponse(
        status="healthy",
        models_loaded=True,
        artifact_version=model_manager.artifact_version,
        uptime_seconds=round(uptime, 2),
        model_source="trained",
    )


@app.get(
    "/model-info",
    response_model=ModelInfoResponse,
    summary="Model Provenance & Configuration (BR-3)",
    tags=["Diagnostics"],
)
async def get_model_info():
    """
    Returns verified training configuration, dataset split, hyperparameters,
    and calibration alarm provenance (BR-3, BR-13, BR-17, BR-20, BR-22, BR-43).
    """
    if not model_manager.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model artifacts are not loaded.",
        )

    meta = model_manager.metadata
    return ModelInfoResponse(
        model_source="trained",
        artifact_version=meta.get("artifact_version", "1.0.0"),
        training_date=meta.get("training_date", "Unknown"),
        dataset=meta.get("dataset", "heart.csv"),
        num_samples=meta.get("num_samples", 918),
        num_features=meta.get("num_features", 9),
        features=meta.get("features", []),
        random_seed=meta.get("random_seed", 42),
        stratified_test_split=meta.get("stratified_test_split", 0.2),
        svm_kernel=meta.get("svm_kernel", "rbf"),
        svm_c=meta.get("svm_c", 1.0),
        svm_gamma=meta.get("svm_gamma", "scale"),
        svm_calibration_method=meta.get("svm_calibration_method", "Platt scaling"),
        bayesian_inference_method=meta.get("bayesian_inference_method", "Laplace Approximation"),
        bayesian_draws=meta.get("bayesian_draws", 2000),
        bayesian_priors=meta.get("bayesian_priors", "Normal(0, 100)"),
        calibration_threshold_ci_width=model_manager.ci_width_threshold,
        calibration_threshold_sigma=model_manager.sigma_threshold,
        calibration_provenance_run=meta.get("calibration_provenance_run", "Held-out test split"),
        test_metrics=meta.get("test_metrics", {}),
        disclaimer=SERVICE_DISCLAIMER,
        auth_policy="Authentication is out of scope for the academic coursework demo.",
    )


@app.post(
    "/predict",
    response_model=PredictResponse,
    summary="Assess Cardiovascular Risk (BR-1)",
    tags=["Inference"],
)
async def predict_risk(vitals: PatientVitalsRequest):
    """
    Accepts 9 clinical parameters, performs real-time Bayesian Laplace posterior sampling,
    and returns probabilistic risk assessment, 95% credible intervals, feature contributions,
    and calibrated triage escalation (BR-1, BR-5, BR-15, BR-16, BR-17, BR-18, BR-19, IR-2).
    """
    if not model_manager.is_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Prediction engine unavailable: models not loaded.",
        )

    try:
        response = model_manager.predict(vitals)
        return response
    except Exception as exc:
        logger.error(f"Prediction computation failed: {str(exc)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Inference computation failed.",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
