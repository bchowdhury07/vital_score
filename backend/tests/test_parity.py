"""
backend/tests/test_parity.py
Parity Test: Confirm Training and Serving Preprocessing Produce Identical Results (BR-12, BR-36).
"""

import numpy as np
import pandas as pd
from backend.config import DATA_PATH
from backend.models import model_manager
from backend.preprocessing import (
    FEATURE_ORDER,
    load_raw_dataset,
    preprocess_patient_dict,
)


def test_training_and_serving_preprocessing_parity():
    """
    BR-36: Confirm that preprocessing raw rows via training pipeline vs.
    serving preprocess_patient_dict yields 100% identical standardized vectors.
    """
    if not model_manager.is_loaded:
        model_manager.load_artifacts()

    scaler = model_manager.scaler
    X_train_df, _ = load_raw_dataset(DATA_PATH)

    # Sample 20 representative rows across dataset
    sample_indices = [0, 5, 10, 25, 50, 100, 200, 350, 500, 750]

    for idx in sample_indices:
        # 1. Training path
        row_series = X_train_df.iloc[idx]
        train_std = scaler.transform(row_series[FEATURE_ORDER].values.reshape(1, -1))

        # 2. Serving path
        patient_dict = row_series.to_dict()
        _, serve_std = preprocess_patient_dict(patient_dict, scaler)

        assert np.allclose(train_std, serve_std, atol=1e-7), (
            f"Preprocessing parity failure at row {idx}:\n"
            f"Train STD: {train_std}\n"
            f"Serve STD: {serve_std}"
        )
