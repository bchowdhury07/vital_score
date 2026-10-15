"""
backend/preprocessing.py
Shared Preprocessing Pipeline for Training and Serving (BR-12, BR-36).
Ensures 100% parity between training and real-time inference.
"""

from typing import Dict, List, Tuple, Any
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

# Exact feature order used across all models, training, and inference (BR-12)
FEATURE_ORDER: List[str] = [
    "age",
    "sex",
    "cp",
    "trestbps",
    "chol",
    "fbs",
    "thalach",
    "exang",
    "oldpeak",
]

# Clinical Metadata and Display Labels
FEATURE_METADATA: Dict[str, Dict[str, Any]] = {
    "age": {"label": "Age", "unit": "yrs", "type": "numeric"},
    "sex": {
        "label": "Biological Sex",
        "unit": "",
        "type": "categorical",
        "labels": {1: "Male", 0: "Female"},
    },
    "cp": {
        "label": "Chest Pain Type",
        "unit": "",
        "type": "categorical",
        "labels": {
            0: "Typical Angina",
            1: "Atypical Angina",
            2: "Non-Anginal",
            3: "Asymptomatic",
        },
    },
    "trestbps": {"label": "Resting Blood Pressure", "unit": "mm Hg", "type": "numeric"},
    "chol": {"label": "Serum Cholesterol", "unit": "mg/dl", "type": "numeric"},
    "fbs": {
        "label": "Fasting Blood Sugar",
        "unit": "",
        "type": "binary",
        "labels": {1: "> 120 mg/dl", 0: "Normal (<= 120)"},
    },
    "thalach": {"label": "Maximum Heart Rate", "unit": "bpm", "type": "numeric"},
    "exang": {
        "label": "Exercise-Induced Angina",
        "unit": "",
        "type": "binary",
        "labels": {1: "Positive", 0: "Negative"},
    },
    "oldpeak": {"label": "ST Depression", "unit": "mm", "type": "numeric"},
}

# Raw Kaggle/UCI Heart CSV Column Mapping
RAW_COLUMN_MAP: Dict[str, str] = {
    "Age": "age",
    "Sex": "sex",
    "ChestPainType": "cp",
    "RestingBP": "trestbps",
    "Cholesterol": "chol",
    "FastingBS": "fbs",
    "MaxHR": "thalach",
    "ExerciseAngina": "exang",
    "Oldpeak": "oldpeak",
}

# Explicit Categorical Value Mapping (BR-7)
SEX_MAP: Dict[str, int] = {"M": 1, "F": 0}
CP_MAP: Dict[str, int] = {"TA": 0, "ATA": 1, "NAP": 2, "ASY": 3}
EXANG_MAP: Dict[str, int] = {"Y": 1, "N": 0}


def load_raw_dataset(csv_path: str) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Loads raw heart.csv and applies deterministic preprocessing to extract
    the 9 canonical clinical features and binary target 'HeartDisease'.
    """
    df = pd.read_csv(csv_path)

    # Validate target presence
    if "HeartDisease" not in df.columns:
        raise ValueError("Missing 'HeartDisease' target column in dataset.")

    y = df["HeartDisease"].astype(int)

    # Map raw columns to canonical feature names
    missing_cols = [c for c in RAW_COLUMN_MAP if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing required raw columns in dataset: {missing_cols}")

    processed_df = pd.DataFrame(index=df.index)

    # 1. Age
    processed_df["age"] = df["Age"].astype(float)

    # 2. Sex: M=1, F=0
    processed_df["sex"] = df["Sex"].map(lambda v: SEX_MAP[v] if isinstance(v, str) and v in SEX_MAP else int(v))

    # 3. Chest Pain: TA=0, ATA=1, NAP=2, ASY=3
    processed_df["cp"] = df["ChestPainType"].map(lambda v: CP_MAP[v] if isinstance(v, str) and v in CP_MAP else int(v))

    # 4. Resting Blood Pressure
    processed_df["trestbps"] = df["RestingBP"].astype(float)

    # 5. Cholesterol
    processed_df["chol"] = df["Cholesterol"].astype(float)

    # 6. Fasting Blood Sugar
    processed_df["fbs"] = df["FastingBS"].astype(int)

    # 7. Max Heart Rate
    processed_df["thalach"] = df["MaxHR"].astype(float)

    # 8. Exercise Angina: Y=1, N=0
    processed_df["exang"] = df["ExerciseAngina"].map(lambda v: EXANG_MAP[v] if isinstance(v, str) and v in EXANG_MAP else int(v))

    # 9. ST Depression
    processed_df["oldpeak"] = df["Oldpeak"].astype(float)

    # Ensure exact feature order
    X = processed_df[FEATURE_ORDER]

    return X, y


def fit_scaler(X_train: pd.DataFrame) -> StandardScaler:
    """
    Fits and returns a StandardScaler on the exact FEATURE_ORDER columns.
    """
    scaler = StandardScaler()
    scaler.fit(X_train[FEATURE_ORDER])
    return scaler


def preprocess_patient_dict(patient_vitals: Dict[str, Any], scaler: StandardScaler) -> Tuple[np.ndarray, np.ndarray]:
    """
    Converts a validated patient dictionary into:
      1. raw feature vector in FEATURE_ORDER
      2. standardized feature vector using the fitted scaler.

    Ensures zero drift between train and serve.
    """
    raw_vector = np.array(
        [[float(patient_vitals[col]) for col in FEATURE_ORDER]],
        dtype=np.float64,
    )
    raw_df = pd.DataFrame(raw_vector, columns=FEATURE_ORDER)
    std_vector = scaler.transform(raw_df)
    return raw_vector, std_vector


def format_feature_value(feature_key: str, raw_val: float) -> str:
    """
    Returns a human-readable clinical label for a feature value.
    """
    meta = FEATURE_METADATA.get(feature_key, {})
    f_type = meta.get("type", "numeric")
    unit = meta.get("unit", "")

    if f_type in ("categorical", "binary"):
        labels = meta.get("labels", {})
        int_val = int(round(raw_val))
        return labels.get(int_val, str(int_val))
    elif feature_key == "oldpeak":
        return f"{raw_val:.1f} {unit}".strip()
    else:
        return f"{int(round(raw_val))} {unit}".strip()
