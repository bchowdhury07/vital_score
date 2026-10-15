"""
backend/models.py
Model Artifact Loader, Bayesian Laplace Sampler, and Inference Engine (BR-10, BR-11, BR-14, BR-15, BR-16, BR-17, BR-18, BR-19, BR-21, BR-34).
Loads models once at startup, performs deterministic Bayesian posterior sampling, and computes feature log-odds contributions.
"""

import os
import json
import time
from typing import Dict, Any, List, Optional
import numpy as np
import joblib

from backend.config import (
    MODEL_ARTIFACT_PATH,
    METADATA_ARTIFACT_PATH,
    LAPLACE_POSTERIOR_DRAWS,
    RANDOM_SEED,
    DEFAULT_CALIBRATION_CI_WIDTH_THRESHOLD,
    DEFAULT_CALIBRATION_SIGMA_THRESHOLD,
)
from backend.preprocessing import (
    FEATURE_ORDER,
    FEATURE_METADATA,
    preprocess_patient_dict,
    format_feature_value,
)
from backend.schemas import (
    PatientVitalsRequest,
    PredictResponse,
    FeatureContributionItem,
)


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30.0, 30.0)))


class ModelManager:
    """
    Singleton-style manager that loads artifacts once at startup and serves thread-safe predictions.
    """

    def __init__(self):
        self.is_loaded: bool = False
        self.artifact_version: Optional[str] = None
        self.load_time_ms: float = 0.0
        self.scaler = None
        self.svm_model = None
        self.bayesian_map_theta: Optional[np.ndarray] = None
        self.bayesian_cov: Optional[np.ndarray] = None
        self.ci_width_threshold: float = DEFAULT_CALIBRATION_CI_WIDTH_THRESHOLD
        self.sigma_threshold: float = DEFAULT_CALIBRATION_SIGMA_THRESHOLD
        self.metadata: Dict[str, Any] = {}

        # Pre-drawn deterministic posterior parameter samples for ultra-fast (<10ms) latency (BR-21, BR-31)
        self.theta_draws: Optional[np.ndarray] = None

    def load_artifacts(self) -> None:
        """
        Loads artifacts from disk once at startup (BR-10, BR-11).
        Fails fast if files are missing or corrupt.
        """
        t0 = time.perf_counter()

        if not os.path.exists(MODEL_ARTIFACT_PATH):
            raise FileNotFoundError(
                f"Model artifact not found at '{MODEL_ARTIFACT_PATH}'. "
                "Run 'python -m backend.train' to generate artifacts before starting the server."
            )

        if not os.path.exists(METADATA_ARTIFACT_PATH):
            raise FileNotFoundError(
                f"Metadata artifact not found at '{METADATA_ARTIFACT_PATH}'. "
                "Run 'python -m backend.train' to generate artifacts before starting the server."
            )

        try:
            artifacts = joblib.load(MODEL_ARTIFACT_PATH)
            with open(METADATA_ARTIFACT_PATH, "r") as f:
                self.metadata = json.load(f)

            self.artifact_version = artifacts.get("artifact_version", "1.0.0")
            self.scaler = artifacts["scaler"]
            self.svm_model = artifacts["svm_model"]
            self.bayesian_map_theta = artifacts["bayesian_map_theta"]
            self.bayesian_cov = artifacts["bayesian_cov"]

            # Load calibration threshold derived from held-out data (BR-20)
            self.ci_width_threshold = float(
                artifacts.get("calibration_threshold_ci_width", DEFAULT_CALIBRATION_CI_WIDTH_THRESHOLD)
            )
            self.sigma_threshold = float(
                artifacts.get("calibration_threshold_sigma", DEFAULT_CALIBRATION_SIGMA_THRESHOLD)
            )

            # Pre-sample deterministic Laplace posterior draws using fixed seed (BR-15, BR-21, BR-31)
            rng = np.random.RandomState(RANDOM_SEED)
            self.theta_draws = rng.multivariate_normal(
                self.bayesian_map_theta,
                self.bayesian_cov,
                size=LAPLACE_POSTERIOR_DRAWS,
            )  # Shape: (LAPLACE_POSTERIOR_DRAWS, D + 1)

            self.load_time_ms = (time.perf_counter() - t0) * 1000.0
            self.is_loaded = True
            print(
                f"[ModelManager] Loaded artifacts v{self.artifact_version} in {self.load_time_ms:.1f}ms. "
                f"Calibration CI width threshold = {self.ci_width_threshold:.4f}."
            )
        except Exception as e:
            self.is_loaded = False
            raise RuntimeError(f"Failed to load or parse model artifacts: {str(e)}") from e

    def predict(self, vitals: PatientVitalsRequest) -> PredictResponse:
        """
        Executes real-time inference (BR-1, BR-15, BR-16, BR-17, BR-18, BR-19, BR-21, BR-34).
        """
        if not self.is_loaded:
            raise RuntimeError("Models are not loaded. Cannot process prediction request.")

        patient_dict = vitals.model_dump()

        # 1. Shared Preprocessing & Scaling (BR-12)
        raw_vector, std_vector = preprocess_patient_dict(patient_dict, self.scaler)
        raw_flat = raw_vector[0]
        std_flat = std_vector[0]

        # 2. Calibrated SVM Prediction via Platt Scaling (BR-17)
        svm_prob = float(self.svm_model.predict_proba(std_vector)[0, 1])

        # 3. Bayesian Laplace Posterior Probability Distribution (BR-15, BR-16, BR-21)
        # Augment with intercept 1.0: shape (1, D + 1)
        x_aug = np.hstack([[1.0], std_flat])

        # Vectorized probability calculation across all 2000 posterior draws:
        # linear_preds: shape (LAPLACE_POSTERIOR_DRAWS,) = (D + 1,) @ (D + 1, draws)
        linear_preds = self.theta_draws @ x_aug
        prob_draws = sigmoid(linear_preds)

        bayes_mean = float(np.mean(prob_draws))
        credible_lower = float(np.percentile(prob_draws, 2.5))
        credible_upper = float(np.percentile(prob_draws, 97.5))
        credible_width = float(credible_upper - credible_lower)
        sigma = float(np.std(prob_draws))

        # 4. Bayesian Feature Contributions in Log-Odds (BR-18, BR-34)
        intercept = float(self.bayesian_map_theta[0])
        contributions: List[FeatureContributionItem] = []
        running_log_odds = intercept

        for i, feat_key in enumerate(FEATURE_ORDER):
            coef = float(self.bayesian_map_theta[i + 1])
            z_val = float(std_flat[i])
            raw_val = float(raw_flat[i])
            impact = coef * z_val
            running_log_odds += impact

            direction = "Neutral"
            if impact > 0.02:
                direction = "Risk Factor"
            elif impact < -0.02:
                direction = "Protective Factor"

            contributions.append(
                FeatureContributionItem(
                    feature=FEATURE_METADATA[feat_key]["label"],
                    feature_key=feat_key,
                    formatted_value=format_feature_value(feat_key, raw_val),
                    raw_value=round(raw_val, 2),
                    standardized_value=round(z_val, 4),
                    coefficient=round(coef, 4),
                    impact=round(impact, 4),
                    direction=direction,
                )
            )

        # 5. Calibrated Triage Flag & Reason (BR-19, BR-20)
        ci_alarm = credible_width > self.ci_width_threshold
        high_risk = bayes_mean >= 0.70

        if high_risk and ci_alarm:
            triage_flag = True
            triage_reason = (
                f"Dual Escalation: Posterior risk ({bayes_mean * 100:.1f}%) exceeds the 70.0% high-concern threshold "
                f"AND 95% credible interval width ({credible_width * 100:.1f} pp) exceeds the calibrated 85th-percentile "
                f"alarm boundary ({self.ci_width_threshold * 100:.1f} pp). Urgent clinical evaluation warranted."
            )
        elif high_risk:
            triage_flag = True
            triage_reason = (
                f"Elevated Risk: Posterior risk ({bayes_mean * 100:.1f}%) exceeds the 70.0% high-concern threshold "
                f"with narrow credible interval ([{credible_lower * 100:.1f}% – {credible_upper * 100:.1f}%])."
            )
        elif ci_alarm:
            triage_flag = True
            triage_reason = (
                f"Uncertainty Alert: Credible interval width ({credible_width * 100:.1f} pp) exceeds the calibrated "
                f"alarm threshold ({self.ci_width_threshold * 100:.1f} pp, derived from held-out test data). "
                f"High epistemic uncertainty suggests borderline hemodynamics or atypical clinical presentation."
            )
        else:
            triage_flag = False
            triage_reason = (
                f"Calibrated Normal: Posterior risk ({bayes_mean * 100:.1f}%) and credible interval width "
                f"({credible_width * 100:.1f} pp) are within standard calibrated boundaries."
            )

        return PredictResponse(
            bayes_posterior_mean=round(bayes_mean, 4),
            point_estimate=round(bayes_mean, 4),
            svm_estimate=round(svm_prob, 4),
            credible_lower=round(credible_lower, 4),
            credible_upper=round(credible_upper, 4),
            credible_width=round(credible_width, 4),
            sigma=round(sigma, 4),
            feature_contributions=contributions,
            intercept=round(intercept, 4),
            log_odds=round(running_log_odds, 4),
            triage_flag=triage_flag,
            triage_reason=triage_reason,
            model_source="trained",
            artifact_version=self.artifact_version or "1.0.0",
        )


# Global singleton instance loaded at startup
model_manager = ModelManager()
