"""
backend/tests/test_api.py
API Integration Tests covering Success, Validation Error (422), and Health Checks (BR-1, BR-2, BR-3, BR-25, BR-37).
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.models import model_manager


VALID_PAYLOAD = {
    "age": 55.0,
    "sex": 1,
    "cp": 1,
    "trestbps": 142.0,
    "chol": 236.0,
    "fbs": 0,
    "thalach": 148.0,
    "exang": 1,
    "oldpeak": 1.6,
}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_health_endpoint_healthy(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["models_loaded"] is True
    assert data["artifact_version"] == "1.0.0"


def test_model_info_endpoint(client):
    res = client.get("/model-info")
    assert res.status_code == 200
    data = res.json()
    assert data["artifact_version"] == "1.0.0"
    assert data["svm_kernel"] == "rbf"
    assert "Laplace" in data["bayesian_inference_method"]
    assert "disclaimer" in data


def test_predict_endpoint_success(client):
    res = client.post("/predict", json=VALID_PAYLOAD)
    assert res.status_code == 200
    data = res.json()

    # Verify IR-2 contract keys expected by frontend
    assert "bayes_posterior_mean" in data
    assert "point_estimate" in data
    assert "svm_estimate" in data
    assert "credible_lower" in data
    assert "credible_upper" in data
    assert "credible_width" in data
    assert "sigma" in data
    assert "feature_contributions" in data
    assert "triage_flag" in data
    assert "triage_reason" in data
    assert data["model_source"] == "trained"

    assert 0.0 <= data["bayes_posterior_mean"] <= 1.0
    assert 0.0 <= data["svm_estimate"] <= 1.0
    assert data["credible_lower"] <= data["bayes_posterior_mean"] <= data["credible_upper"]
    assert len(data["feature_contributions"]) == 9


def test_predict_validation_failure_422(client):
    bad_payload = VALID_PAYLOAD.copy()
    bad_payload["age"] = 10.0  # Invalid age (< 18)
    bad_payload["cp"] = 99     # Invalid chest pain code

    res = client.post("/predict", json=bad_payload)
    assert res.status_code == 422
    data = res.json()

    assert data["error"] == "ValidationError"
    assert data["retryable"] is False
    assert "age" in data["field_errors"]
    assert "cp" in data["field_errors"]


def test_predict_model_not_loaded_503(client, monkeypatch):
    # Temporarily mark model as not loaded to test BR-11, BR-25, BR-37
    monkeypatch.setattr(model_manager, "is_loaded", False)

    res = client.post("/predict", json=VALID_PAYLOAD)
    assert res.status_code == 503

    res_health = client.get("/health")
    assert res_health.status_code == 503
    assert res_health.json()["models_loaded"] is False
