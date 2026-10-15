"""
backend/tests/test_inference.py
Unit Tests for Bayesian Uncertainty, Credible Intervals, Mathematical Invariants, and Regression (BR-21, BR-33, BR-34, BR-35).
"""

import pytest
import numpy as np
from backend.models import model_manager
from backend.schemas import PatientVitalsRequest


@pytest.fixture(scope="module", autouse=True)
def setup_model():
    if not model_manager.is_loaded:
        model_manager.load_artifacts()


TEST_PATIENT_1 = {
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

TEST_PATIENT_LOW_RISK = {
    "age": 35.0,
    "sex": 0,
    "cp": 0,
    "trestbps": 110.0,
    "chol": 180.0,
    "fbs": 0,
    "thalach": 180.0,
    "exang": 0,
    "oldpeak": 0.0,
}


def test_credible_interval_invariants():
    """
    BR-33: Verify that 0 <= lower <= bayes_mean <= upper <= 1
    and credible_width == upper - lower.
    """
    for patient in [TEST_PATIENT_1, TEST_PATIENT_LOW_RISK]:
        req = PatientVitalsRequest(**patient)
        resp = model_manager.predict(req)

        assert 0.0 <= resp.credible_lower <= 1.0
        assert 0.0 <= resp.bayes_posterior_mean <= 1.0
        assert 0.0 <= resp.credible_upper <= 1.0
        assert resp.credible_lower <= resp.bayes_posterior_mean <= resp.credible_upper
        assert np.isclose(resp.credible_width, resp.credible_upper - resp.credible_lower, atol=1e-3)
        assert resp.sigma >= 0.0


def test_contributions_plus_intercept_equals_log_odds():
    """
    BR-34: Contributions plus intercept must exactly equal the model's log-odds.
    """
    req = PatientVitalsRequest(**TEST_PATIENT_1)
    resp = model_manager.predict(req)

    contrib_sum = sum(c.impact for c in resp.feature_contributions)
    reconstructed_log_odds = resp.intercept + contrib_sum

    assert np.isclose(reconstructed_log_odds, resp.log_odds, atol=1e-3), (
        f"Contributions sum ({contrib_sum}) + intercept ({resp.intercept}) "
        f"!= log_odds ({resp.log_odds})"
    )


def test_deterministic_output():
    """
    BR-21: The same input returns the exact same prediction results.
    """
    req = PatientVitalsRequest(**TEST_PATIENT_1)
    resp1 = model_manager.predict(req)
    resp2 = model_manager.predict(req)

    assert resp1.bayes_posterior_mean == resp2.bayes_posterior_mean
    assert resp1.svm_estimate == resp2.svm_estimate
    assert resp1.credible_lower == resp2.credible_lower
    assert resp1.credible_upper == resp2.credible_upper
    assert resp1.log_odds == resp2.log_odds
    assert [c.impact for c in resp1.feature_contributions] == [c.impact for c in resp2.feature_contributions]


def test_regression_pinned_output():
    """
    BR-35: Regression test pinning known inputs to known outputs for artifact version 1.0.0.
    """
    req = PatientVitalsRequest(**TEST_PATIENT_1)
    resp = model_manager.predict(req)

    # Validate output stays pinned to exact trained v1.0.0 parameters
    assert resp.artifact_version == "1.0.0"
    assert resp.model_source == "trained"
    assert np.isclose(resp.bayes_posterior_mean, 0.6060, atol=1e-3)
    assert np.isclose(resp.svm_estimate, 0.6207, atol=1e-3)
    assert np.isclose(resp.credible_lower, 0.4779, atol=1e-3)
    assert np.isclose(resp.credible_upper, 0.7288, atol=1e-3)
    assert np.isclose(resp.credible_width, 0.2509, atol=1e-3)
    assert np.isclose(resp.sigma, 0.0652, atol=1e-3)
    assert len(resp.feature_contributions) == 9
