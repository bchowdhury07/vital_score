"""
backend/tests/test_validation.py
Unit Tests for Input Validation and Medical Range Enforcement (BR-6, BR-7, BR-8, BR-9).
"""

import pytest
from pydantic import ValidationError
from backend.schemas import PatientVitalsRequest


VALID_PATIENT = {
    "age": 54.0,
    "sex": 1,
    "cp": 2,
    "trestbps": 138.0,
    "chol": 224.0,
    "fbs": 0,
    "thalach": 162.0,
    "exang": 0,
    "oldpeak": 1.8,
}


def test_valid_patient_intake():
    req = PatientVitalsRequest(**VALID_PATIENT)
    assert req.age == 54.0
    assert req.sex == 1
    assert req.cp == 2
    assert req.trestbps == 138.0
    assert req.chol == 224.0
    assert req.fbs == 0
    assert req.thalach == 162.0
    assert req.exang == 0
    assert req.oldpeak == 1.8


@pytest.mark.parametrize(
    "field,invalid_val",
    [
        ("age", 17.0),    # Under min 18
        ("age", 101.0),   # Over max 100
        ("trestbps", 79.0),  # Under min 80
        ("trestbps", 221.0), # Over max 220
        ("chol", 99.0),   # Under min 100
        ("chol", 601.0),  # Over max 600
        ("thalach", 59.0),   # Under min 60
        ("thalach", 221.0),  # Over max 220
        ("oldpeak", -0.1),   # Under min 0
        ("oldpeak", 6.1),    # Over max 6
    ],
)
def test_numeric_range_rejection(field, invalid_val):
    bad_data = VALID_PATIENT.copy()
    bad_data[field] = invalid_val
    with pytest.raises(ValidationError) as exc_info:
        PatientVitalsRequest(**bad_data)
    errors = exc_info.value.errors()
    assert any(e["loc"][-1] == field for e in errors), f"Expected validation error on {field}"


@pytest.mark.parametrize(
    "field,invalid_val",
    [
        ("sex", 2),
        ("sex", -1),
        ("cp", 4),
        ("cp", -1),
        ("fbs", 2),
        ("fbs", -1),
        ("exang", 2),
        ("exang", -1),
    ],
)
def test_categorical_code_rejection(field, invalid_val):
    bad_data = VALID_PATIENT.copy()
    bad_data[field] = invalid_val
    with pytest.raises(ValidationError) as exc_info:
        PatientVitalsRequest(**bad_data)
    errors = exc_info.value.errors()
    assert any(e["loc"][-1] == field for e in errors)


def test_missing_field_rejection():
    # BR-9: Missing fields must be rejected without silent imputation
    for field in VALID_PATIENT.keys():
        bad_data = VALID_PATIENT.copy()
        del bad_data[field]
        with pytest.raises(ValidationError):
            PatientVitalsRequest(**bad_data)


def test_extra_field_forbidden():
    bad_data = VALID_PATIENT.copy()
    bad_data["unknown_unsupported_field"] = 123
    with pytest.raises(ValidationError):
        PatientVitalsRequest(**bad_data)
