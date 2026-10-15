import os
from typing import List

# Versioning (BR-13)
ARTIFACT_VERSION = os.getenv("ARTIFACT_VERSION", "1.0.0")

# Paths (BR-40)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS_DIR = os.getenv("ARTIFACTS_DIR", os.path.join(BASE_DIR, "artifacts"))
MODEL_ARTIFACT_PATH = os.path.join(ARTIFACTS_DIR, f"model_artifacts_v{ARTIFACT_VERSION}.joblib")
METADATA_ARTIFACT_PATH = os.path.join(ARTIFACTS_DIR, f"metadata_v{ARTIFACT_VERSION}.json")
DATA_PATH = os.getenv("DATA_PATH", os.path.join(os.path.dirname(BASE_DIR), "data", "heart.csv"))

# CORS Allowed Origins (BR-27, BR-40)
ALLOWED_ORIGINS: List[str] = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

# Random Seeds & Training Config (BR-21, BR-22)
RANDOM_SEED = int(os.getenv("RANDOM_SEED", "42"))
TEST_SPLIT_SIZE = float(os.getenv("TEST_SPLIT_SIZE", "0.2"))

# Inference Configuration (BR-15, BR-20, BR-40)
LAPLACE_POSTERIOR_DRAWS = int(os.getenv("LAPLACE_POSTERIOR_DRAWS", "2000"))

# Calibration Threshold: default fallback if metadata artifact is not yet present (BR-20)
# (Will be populated and updated from calibration analysis on held-out test split)
DEFAULT_CALIBRATION_CI_WIDTH_THRESHOLD = float(os.getenv("DEFAULT_CALIBRATION_CI_WIDTH_THRESHOLD", "0.314"))
DEFAULT_CALIBRATION_SIGMA_THRESHOLD = float(os.getenv("DEFAULT_CALIBRATION_SIGMA_THRESHOLD", "0.08"))

# Rate Limiting & Security (BR-30)
MAX_REQUEST_SIZE_BYTES = int(os.getenv("MAX_REQUEST_SIZE_BYTES", "65536"))  # 64 KB
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "120"))

# Service Metadata (BR-3, BR-42, BR-43)
SERVICE_NAME = "VitalScore Clinical Risk Inference Service"
SERVICE_DISCLAIMER = (
    "Academic demonstration only. This system illustrates uncertainty-aware Bayesian "
    "classification and is not a clinically validated diagnostic tool."
)
