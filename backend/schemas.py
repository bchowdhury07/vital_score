"""
backend/schemas.py
Pydantic Request & Response Schemas for Input Validation & API Contract (BR-1, BR-6, BR-7, BR-8, BR-9).
"""

from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict


class PatientVitalsRequest(BaseModel):
    """
    Input validation enforcing exact medical plausibility ranges and categorical codes (BR-6, BR-7, BR-8, BR-9).
    Strict validation prevents silent coercion or clipping.
    """
    model_config = ConfigDict(extra="forbid", strict=False)

    age: float = Field(
        ...,
        description="Patient's chronological age in years",
        ge=18.0,
        le=100.0,
        examples=[54.0],
    )
    sex: int = Field(
        ...,
        description="Biological sex (1 = Male, 0 = Female)",
        examples=[1],
    )
    cp: int = Field(
        ...,
        description="Chest pain type (0 = Typical Angina, 1 = Atypical Angina, 2 = Non-Anginal, 3 = Asymptomatic)",
        examples=[2],
    )
    trestbps: float = Field(
        ...,
        description="Resting systolic blood pressure (mm Hg)",
        ge=80.0,
        le=220.0,
        examples=[138.0],
    )
    chol: float = Field(
        ...,
        description="Serum cholesterol (mg/dl)",
        ge=100.0,
        le=600.0,
        examples=[224.0],
    )
    fbs: int = Field(
        ...,
        description="Fasting blood sugar > 120 mg/dl (1 = Elevated/True, 0 = Normal/False)",
        examples=[0],
    )
    thalach: float = Field(
        ...,
        description="Maximum heart rate achieved during exercise (bpm)",
        ge=60.0,
        le=220.0,
        examples=[162.0],
    )
    exang: int = Field(
        ...,
        description="Exercise-induced angina (1 = Positive/Yes, 0 = Negative/No)",
        examples=[0],
    )
    oldpeak: float = Field(
        ...,
        description="ST depression induced by exercise relative to rest (mm)",
        ge=0.0,
        le=6.0,
        examples=[1.8],
    )

    @field_validator("sex")
    @classmethod
    def validate_sex_code(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("Biological sex must be 0 (Female) or 1 (Male).")
        return v

    @field_validator("cp")
    @classmethod
    def validate_cp_code(cls, v: int) -> int:
        if v not in (0, 1, 2, 3):
            raise ValueError(
                "Chest pain type must be one of: 0 (Typical Angina), 1 (Atypical Angina), 2 (Non-Anginal), 3 (Asymptomatic)."
            )
        return v

    @field_validator("fbs")
    @classmethod
    def validate_fbs_code(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("Fasting blood sugar must be 0 (<= 120 mg/dl) or 1 (> 120 mg/dl).")
        return v

    @field_validator("exang")
    @classmethod
    def validate_exang_code(cls, v: int) -> int:
        if v not in (0, 1):
            raise ValueError("Exercise-induced angina must be 0 (No) or 1 (Yes).")
        return v


class FeatureContributionItem(BaseModel):
    """
    Per-feature log-odds contribution from the Bayesian model (BR-18, BR-34).
    """
    feature: str = Field(..., description="Feature display name")
    feature_key: str = Field(..., description="Canonical feature key")
    formatted_value: str = Field(..., description="Human-readable patient feature value")
    raw_value: float = Field(..., description="Raw clinical input value")
    standardized_value: float = Field(..., description="Standardized feature value z")
    coefficient: float = Field(..., description="Bayesian MAP feature coefficient beta_i")
    impact: float = Field(..., description="Log-odds contribution (beta_i * z)")
    direction: Literal["Risk Factor", "Protective Factor", "Neutral"] = Field(
        ..., description="Clinical risk direction"
    )


class PredictResponse(BaseModel):
    """
    Cardiovascular Risk Assessment Response (BR-1, BR-5, IR-2).
    """
    bayes_posterior_mean: float = Field(
        ...,
        description="Mean predicted probability of CAD from Bayesian posterior distribution",
        ge=0.0,
        le=1.0,
    )
    point_estimate: float = Field(
        ...,
        description="Alias for bayes_posterior_mean for legacy frontend compatibility",
        ge=0.0,
        le=1.0,
    )
    svm_estimate: float = Field(
        ...,
        description="Platt-scaled predicted probability from RBF SVM baseline",
        ge=0.0,
        le=1.0,
    )
    credible_lower: float = Field(
        ...,
        description="2.5th percentile lower bound of 95% Bayesian Credible Interval",
        ge=0.0,
        le=1.0,
    )
    credible_upper: float = Field(
        ...,
        description="97.5th percentile upper bound of 95% Bayesian Credible Interval",
        ge=0.0,
        le=1.0,
    )
    credible_width: float = Field(
        ...,
        description="Width of 95% Credible Interval (upper - lower)",
        ge=0.0,
        le=1.0,
    )
    sigma: float = Field(
        ...,
        description="Standard deviation of posterior probability draws (epistemic uncertainty)",
        ge=0.0,
    )
    feature_contributions: List[FeatureContributionItem] = Field(
        ...,
        description="Bayesian feature contributions in log-odds (BR-18)",
    )
    intercept: float = Field(
        ...,
        description="Bayesian MAP intercept alpha (BR-34)",
    )
    log_odds: float = Field(
        ...,
        description="Total log-odds = intercept + sum(feature_contributions) (BR-34)",
    )
    triage_flag: bool = Field(
        ...,
        description="Whether uncertainty or high risk warrants dual clinician escalation (BR-19)",
    )
    triage_reason: str = Field(
        ...,
        description="Clinical rationale for the triage flag (BR-19)",
    )
    model_source: Literal["trained", "placeholder"] = Field(
        default="trained",
        description="Origin of the inference model (BR-5)",
    )
    artifact_version: str = Field(
        ...,
        description="Version of trained model artifacts used for prediction (BR-13)",
    )


class HealthResponse(BaseModel):
    """
    System Health Status (BR-2).
    """
    status: Literal["healthy", "unhealthy"]
    models_loaded: bool
    artifact_version: Optional[str] = None
    uptime_seconds: float
    model_source: str = "trained"


class ModelInfoResponse(BaseModel):
    """
    Provenanced Model Metadata and Provenance (BR-3, BR-13, BR-17, BR-20, BR-22, BR-43).
    """
    model_source: str = "trained"
    artifact_version: str
    training_date: str
    dataset: str
    num_samples: int
    num_features: int
    features: List[str]
    random_seed: int
    stratified_test_split: float

    # SVM details
    svm_kernel: str
    svm_c: float
    svm_gamma: str
    svm_calibration_method: str

    # Bayesian details
    bayesian_inference_method: str
    bayesian_draws: int
    bayesian_priors: str

    # Calibration threshold & run (BR-20)
    calibration_threshold_ci_width: float
    calibration_threshold_sigma: float
    calibration_provenance_run: str

    # Performance on held-out test split (BR-38)
    test_metrics: Dict[str, Any]

    # Academic Notice (BR-43)
    disclaimer: str
    auth_policy: str = "Authentication is out of scope for the academic coursework demo."
