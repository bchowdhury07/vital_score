"""
backend/train.py
Single Reproducible Training & Artifact Export Script (BR-12, BR-13, BR-17, BR-20, BR-22, BR-23, BR-38).
Trains SVM (RBF + Platt scaling) and Bayesian Logistic Regression (Laplace MAP + Hessian),
conducts held-out calibration analysis, and exports versioned artifacts.
"""

import os
import json
import datetime
from typing import Tuple, Dict, Any, List
import numpy as np
import pandas as pd
import joblib
from scipy.optimize import minimize
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.svm import SVC
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    brier_score_loss,
)

from backend.config import (
    DATA_PATH,
    ARTIFACTS_DIR,
    ARTIFACT_VERSION,
    MODEL_ARTIFACT_PATH,
    METADATA_ARTIFACT_PATH,
    RANDOM_SEED,
    TEST_SPLIT_SIZE,
    LAPLACE_POSTERIOR_DRAWS,
)
from backend.preprocessing import (
    FEATURE_ORDER,
    load_raw_dataset,
    fit_scaler,
)


def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30.0, 30.0)))


def fit_bayesian_laplace(
    X_train_scaled: np.ndarray,
    y_train: np.ndarray,
    prior_sigma: float = 10.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Fits Bayesian Logistic Regression via Laplace Approximation (MAP + inverse Hessian).
    Priors: alpha ~ Normal(0, prior_sigma^2), beta_i ~ Normal(0, prior_sigma^2)
    """
    N, D = X_train_scaled.shape
    # Add intercept column (first column)
    X_aug = np.hstack([np.ones((N, 1)), X_train_scaled])  # Shape: (N, D + 1)
    prior_var = prior_sigma ** 2

    # Negative Log-Posterior Loss
    def neg_log_posterior(theta: np.ndarray) -> float:
        mu = X_aug @ theta
        p = sigmoid(mu)
        # Log-likelihood with numerical guard
        eps = 1e-12
        ll = np.sum(y_train * np.log(p + eps) + (1.0 - y_train) * np.log(1.0 - p + eps))
        prior_pen = 0.5 * np.sum(theta ** 2) / prior_var
        return -(ll - prior_pen)

    # Gradient of Negative Log-Posterior
    def grad_neg_log_posterior(theta: np.ndarray) -> np.ndarray:
        mu = X_aug @ theta
        p = sigmoid(mu)
        grad = X_aug.T @ (p - y_train) + (theta / prior_var)
        return grad

    # Hessian of Negative Log-Posterior at theta
    def hessian_neg_log_posterior(theta: np.ndarray) -> np.ndarray:
        mu = X_aug @ theta
        p = sigmoid(mu)
        w = p * (1.0 - p)
        W_X = X_aug * w[:, np.newaxis]
        H = (X_aug.T @ W_X) + (np.eye(D + 1) / prior_var)
        return H

    # Optimize to find MAP
    init_theta = np.zeros(D + 1)
    res = minimize(
        fun=neg_log_posterior,
        x0=init_theta,
        jac=grad_neg_log_posterior,
        method="L-BFGS-B",
        options={"maxiter": 1000, "ftol": 1e-9},
    )

    if not res.success:
        raise RuntimeError(f"Bayesian MAP optimization failed: {res.message}")

    map_theta = res.x
    H = hessian_neg_log_posterior(map_theta)

    # Invert Hessian for posterior covariance matrix (Laplace approximation)
    cov_matrix = np.linalg.inv(H)

    return map_theta, cov_matrix


def sample_laplace_predictions(
    X_scaled: np.ndarray,
    map_theta: np.ndarray,
    cov_matrix: np.ndarray,
    n_draws: int = 2000,
    seed: int = 42,
) -> np.ndarray:
    """
    Draws posterior parameter samples and evaluates predictive probabilities for each row.
    Returns: array of shape (N, n_draws)
    """
    rng = np.random.RandomState(seed)
    # Theta draws: shape (n_draws, D + 1)
    theta_draws = rng.multivariate_normal(map_theta, cov_matrix, size=n_draws)

    N = X_scaled.shape[0]
    X_aug = np.hstack([np.ones((N, 1)), X_scaled])  # (N, D + 1)

    # Linear predictors: (N, n_draws) = (N, D + 1) @ (D + 1, n_draws)
    linear_preds = X_aug @ theta_draws.T
    prob_draws = sigmoid(linear_preds)
    return prob_draws


def run_training() -> Dict[str, Any]:
    print(f"=== Starting VitalScore Model Training (Artifact v{ARTIFACT_VERSION}) ===")
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    # 1. Load & Preprocess Raw Dataset (BR-12)
    print(f"Loading raw dataset from: {DATA_PATH}")
    X, y = load_raw_dataset(DATA_PATH)
    print(f"Dataset successfully loaded: {X.shape[0]} patients, {X.shape[1]} clinical features.")

    # 2. Fixed-Seed Stratified Split (BR-22)
    print(f"Performing stratified split (test_size={TEST_SPLIT_SIZE}, seed={RANDOM_SEED})...")
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=TEST_SPLIT_SIZE,
        random_state=RANDOM_SEED,
        stratify=y,
    )

    # 3. Fit Shared Scaler on Training Set (BR-12)
    scaler = fit_scaler(X_train)
    X_train_scaled = scaler.transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # 4. Train Baseline SVM with RBF Kernel & Platt Scaling (BR-17)
    print("Training SVM with RBF kernel and Platt scaling (GridSearchCV)...")
    param_grid = {"C": [0.1, 1.0, 10.0], "gamma": ["scale", "auto", 0.1, 1.0]}
    base_svm = SVC(kernel="rbf", probability=True, random_state=RANDOM_SEED)
    grid_search = GridSearchCV(base_svm, param_grid, cv=5, scoring="roc_auc", n_jobs=-1)
    grid_search.fit(X_train_scaled, y_train)
    best_svm = grid_search.best_estimator_
    print(f"Best SVM parameters: C={best_svm.C}, gamma={best_svm.gamma}")

    # SVM Test Evaluation
    svm_test_probs = best_svm.predict_proba(X_test_scaled)[:, 1]
    svm_test_preds = (svm_test_probs >= 0.5).astype(int)

    # 5. Train Bayesian Logistic Regression with Laplace Approximation (BR-15)
    print("Fitting Bayesian Logistic Regression via Laplace Approximation (MAP + Hessian)...")
    map_theta, cov_matrix = fit_bayesian_laplace(X_train_scaled, y_train.values, prior_sigma=10.0)
    print(f"Bayesian MAP intercept (alpha): {map_theta[0]:.4f}")
    for idx, f_name in enumerate(FEATURE_ORDER):
        print(f"  - {f_name:10s}: beta = {map_theta[idx + 1]:+.4f} (std err = {np.sqrt(cov_matrix[idx + 1, idx + 1]):.4f})")

    # 6. Held-Out Calibration Analysis & Threshold Derivation (BR-20, BR-38)
    print("Conducting calibration analysis on held-out test split...")
    test_prob_draws = sample_laplace_predictions(
        X_test_scaled,
        map_theta,
        cov_matrix,
        n_draws=LAPLACE_POSTERIOR_DRAWS,
        seed=RANDOM_SEED,
    )  # Shape: (N_test, draws)

    test_bayes_means = np.mean(test_prob_draws, axis=1)
    test_bayes_lowers = np.percentile(test_prob_draws, 2.5, axis=1)
    test_bayes_uppers = np.percentile(test_prob_draws, 97.5, axis=1)
    test_ci_widths = test_bayes_uppers - test_bayes_lowers
    test_sigmas = np.std(test_prob_draws, axis=1)

    # Derive Calibration Thresholds from 85th percentile of held-out test uncertainty (BR-20)
    ci_width_threshold = float(np.percentile(test_ci_widths, 85))
    sigma_threshold = float(np.percentile(test_sigmas, 85))
    print(f"Empirical 85th-percentile calibration CI width threshold: {ci_width_threshold:.4f} (width)")
    print(f"Empirical 85th-percentile calibration sigma threshold:   {sigma_threshold:.4f} (sigma)")

    # Metrics on Held-out Test Set
    test_bayes_preds = (test_bayes_means >= 0.5).astype(int)
    metrics = {
        "svm": {
            "accuracy": float(accuracy_score(y_test, svm_test_preds)),
            "precision": float(precision_score(y_test, svm_test_preds)),
            "recall": float(recall_score(y_test, svm_test_preds)),
            "f1": float(f1_score(y_test, svm_test_preds)),
            "roc_auc": float(roc_auc_score(y_test, svm_test_probs)),
            "brier_score": float(brier_score_loss(y_test, svm_test_probs)),
        },
        "bayesian_laplace": {
            "accuracy": float(accuracy_score(y_test, test_bayes_preds)),
            "precision": float(precision_score(y_test, test_bayes_preds)),
            "recall": float(recall_score(y_test, test_bayes_preds)),
            "f1": float(f1_score(y_test, test_bayes_preds)),
            "roc_auc": float(roc_auc_score(y_test, test_bayes_means)),
            "brier_score": float(brier_score_loss(y_test, test_bayes_means)),
            "mean_ci_width": float(np.mean(test_ci_widths)),
            "mean_sigma": float(np.mean(test_sigmas)),
        },
    }

    print("\n--- Test Set Evaluation ---")
    print(f"SVM Test Accuracy:      {metrics['svm']['accuracy']:.4f} | ROC-AUC: {metrics['svm']['roc_auc']:.4f}")
    print(f"Bayes Test Accuracy:    {metrics['bayesian_laplace']['accuracy']:.4f} | ROC-AUC: {metrics['bayesian_laplace']['roc_auc']:.4f}")

    # 7. Package and Serialize Artifacts (BR-10, BR-13)
    artifacts = {
        "artifact_version": ARTIFACT_VERSION,
        "feature_order": FEATURE_ORDER,
        "scaler": scaler,
        "svm_model": best_svm,
        "bayesian_map_theta": map_theta,
        "bayesian_cov": cov_matrix,
        "calibration_threshold_ci_width": ci_width_threshold,
        "calibration_threshold_sigma": sigma_threshold,
        "trained_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "random_seed": RANDOM_SEED,
    }

    joblib.dump(artifacts, MODEL_ARTIFACT_PATH)
    print(f"Model artifacts successfully serialized to: {MODEL_ARTIFACT_PATH}")

    # 8. Create Provenance Metadata (BR-3, BR-20, BR-22, BR-43)
    metadata = {
        "artifact_version": ARTIFACT_VERSION,
        "training_date": artifacts["trained_timestamp"],
        "dataset": "heart.csv (UCI / Kaggle Heart Failure dataset)",
        "num_samples": int(X.shape[0]),
        "num_features": int(X.shape[1]),
        "features": FEATURE_ORDER,
        "random_seed": RANDOM_SEED,
        "stratified_test_split": TEST_SPLIT_SIZE,
        "svm_kernel": "rbf",
        "svm_c": float(best_svm.C),
        "svm_gamma": str(best_svm.gamma),
        "svm_calibration_method": "Platt scaling (probability=True)",
        "bayesian_inference_method": "Laplace Approximation (Multivariate Normal MAP with inverse Hessian)",
        "bayesian_draws": LAPLACE_POSTERIOR_DRAWS,
        "bayesian_priors": "alpha ~ Normal(0, 100), beta_i ~ Normal(0, 100)",
        "calibration_threshold_ci_width": ci_width_threshold,
        "calibration_threshold_sigma": sigma_threshold,
        "calibration_provenance_run": f"Held-out test split (N={len(y_test)}, seed={RANDOM_SEED}) 85th percentile",
        "test_metrics": metrics,
        "disclaimer": (
            "Academic coursework demonstration only. This system illustrates uncertainty-aware "
            "Bayesian classification vs. standard SVM baselines and is not a clinically validated tool."
        ),
    }

    with open(METADATA_ARTIFACT_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"Metadata provenance successfully serialized to: {METADATA_ARTIFACT_PATH}")

    print("=== Training & Calibration Completed Successfully ===")
    return metadata


if __name__ == "__main__":
    run_training()
