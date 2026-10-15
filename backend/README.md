# VitalScore Backend Service

Probabilistic Machine Learning Inference Service for Cardiovascular Risk Classification (SVM with RBF & Platt Scaling vs. Bayesian Logistic Regression via Laplace Approximation).

> **Academic Coursework Demonstration Notice (BR-43)**: This system illustrates uncertainty-aware Bayesian classification compared with standard SVM baselines and is **not a clinically validated diagnostic tool**. Authentication is out of scope for this demo.

---

## 1. Quick Start

### A. Environment & Dependencies (BR-39)
Ensure Python 3.10+ is installed and your virtual environment is activated:

```bash
# Install pinned dependencies
pip install -r requirements.txt
```

### B. Train & Export Model Artifacts (BR-22, BR-23)
Regenerate the model weights, preprocessing scaler, and empirical calibration thresholds from raw data (`data/heart.csv`):

```bash
python -m backend.train
```

Outputs:
- `backend/artifacts/model_artifacts_v1.0.0.joblib`: Serialized `StandardScaler`, RBF `SVC`, and Bayesian MAP weights $\theta_{\text{MAP}}$ + inverse Hessian covariance $\Sigma = H^{-1}$.
- `backend/artifacts/metadata_v1.0.0.json`: Model provenance, hyperparameters, and held-out test split calibration thresholds.

### C. Run the Backend API Server (BR-39)
Start the FastAPI server locally on port 8000:

```bash
python -m backend.main
```
Or via Uvicorn:
```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

- **Interactive Swagger / OpenAPI Docs (BR-4)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc Documentation**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

### D. Run the Pytest Verification Suite (BR-33 to BR-37)
Run the 31-test verification suite covering validation, mathematical invariants, determinism, and train/serve preprocessing parity:

```bash
pytest backend/tests -v
```

---

## 2. API Endpoints

### `POST /predict` (BR-1, BR-5, BR-6, BR-7, BR-8, BR-9)
Accepts 9 clinical parameters and returns Bayesian posterior estimates, SVM Platt probabilities, 95% Credible Intervals (HDI), per-feature log-odds contributions, and calibrated triage flags.

#### Request Schema:
```json
{
  "age": 55.0,
  "sex": 1,
  "cp": 1,
  "trestbps": 142.0,
  "chol": 236.0,
  "fbs": 0,
  "thalach": 148.0,
  "exang": 1,
  "oldpeak": 1.6
}
```

#### Field Ranges & Encodings (BR-6, BR-7):
- `age`: 18.0 to 100.0 (years)
- `sex`: `0` (Female) or `1` (Male)
- `cp`: `0` (Typical Angina), `1` (Atypical Angina), `2` (Non-Anginal), `3` (Asymptomatic)
- `trestbps`: 80.0 to 220.0 (mm Hg)
- `chol`: 100.0 to 600.0 (mg/dl)
- `fbs`: `0` (<= 120 mg/dl) or `1` (> 120 mg/dl)
- `thalach`: 60.0 to 220.0 (bpm)
- `exang`: `0` (Negative/No) or `1` (Positive/Yes)
- `oldpeak`: 0.0 to 6.0 (mm)

#### Response Example (Matching IR-2):
```json
{
  "bayes_posterior_mean": 0.606,
  "point_estimate": 0.606,
  "svm_estimate": 0.6207,
  "credible_lower": 0.4779,
  "credible_upper": 0.7288,
  "credible_width": 0.2509,
  "sigma": 0.0652,
  "feature_contributions": [
    {
      "feature": "ST Depression",
      "feature_key": "oldpeak",
      "formatted_value": "1.6 mm",
      "raw_value": 1.6,
      "standardized_value": 0.6957,
      "coefficient": 0.6835,
      "impact": 0.4755,
      "direction": "Risk Factor"
    }
  ],
  "intercept": 0.4139,
  "log_odds": 0.4428,
  "triage_flag": false,
  "triage_reason": "Calibrated Normal: Posterior risk (60.6%) and credible interval width (25.1 pp) are within standard calibrated boundaries.",
  "model_source": "trained",
  "artifact_version": "1.0.0"
}
```

---

### `GET /health` (BR-2)
Reports whether model artifacts are loaded in memory and system uptime.
Returns `200 OK` when healthy, or `503 Service Unavailable` if artifacts failed to load.

---

### `GET /model-info` (BR-3, BR-13, BR-17, BR-20, BR-22)
Returns verified training hyperparameters, random seed (`42`), stratified split ratio (`0.2`), and calibration alarm threshold derived from the held-out test split.

---

## 3. Architecture & Guarantees

1. **Preprocessing Parity (BR-12, BR-36)**: Both training (`train.py`) and real-time serving (`models.py`) import the identical `StandardScaler` pipeline and feature order from `backend/preprocessing.py`.
2. **Deterministic Sampling (BR-21)**: Posterior Laplace draws are pre-sampled with a fixed seed (`42`), guaranteeing identical output for identical inputs with <15ms latency (BR-31).
3. **Log-Odds Invariant (BR-34)**:
   $$\text{log-odds} = \alpha + \sum_{i=1}^9 \beta_i \cdot x_i^{\text{std}} = \text{intercept} + \sum_{i=1}^9 \text{impact}_i$$
4. **Privacy & Security (BR-24, BR-27, BR-28, BR-30)**:
   - Patient clinical parameters are processed in-memory and **never logged or persisted**.
   - CORS is locked to configured frontend origins (`http://localhost:5173`).
   - Rate limiting (120 req/min) and request body size limits (64 KB) prevent denial-of-service.
