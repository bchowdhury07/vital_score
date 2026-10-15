import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, roc_curve, confusion_matrix
from sklearn.preprocessing import StandardScaler, LabelEncoder

# Output directory
output_dir = 'models_output'
os.makedirs(output_dir, exist_ok=True)

# Load data
df = pd.read_csv('data/heart.csv')

# Preprocessing
X = df.drop('HeartDisease', axis=1)
y = df['HeartDisease']

# Encode categorical variables
categorical_cols = X.select_dtypes(include=['object']).columns
for col in categorical_cols:
    le = LabelEncoder()
    X[col] = le.fit_transform(X[col])

# Fixed-seed stratified split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# Scale features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# 1. Baseline Logistic Regression
lr = LogisticRegression(random_state=42)
lr.fit(X_train_scaled, y_train)
lr_preds = lr.predict(X_test_scaled)
lr_probs = lr.predict_proba(X_test_scaled)[:, 1]

# 2. SVM with RBF kernel and grid search
svm = SVC(kernel='rbf', probability=True, random_state=42)
param_grid = {'C': [0.1, 1, 10], 'gamma': ['scale', 'auto', 0.1, 1]}
grid_search = GridSearchCV(svm, param_grid, cv=5, scoring='accuracy')
grid_search.fit(X_train_scaled, y_train)
best_svm = grid_search.best_estimator_
svm_preds = best_svm.predict(X_test_scaled)
svm_probs = best_svm.predict_proba(X_test_scaled)[:, 1]

# Results computation
def get_metrics(y_true, y_pred, y_prob):
    return {
        'Accuracy': accuracy_score(y_true, y_pred),
        'Precision': precision_score(y_true, y_pred),
        'Recall': recall_score(y_true, y_pred),
        'F1 Score': f1_score(y_true, y_pred),
        'ROC-AUC': roc_auc_score(y_true, y_prob)
    }

lr_metrics = get_metrics(y_test, lr_preds, lr_probs)
svm_metrics = get_metrics(y_test, svm_preds, svm_probs)

results_df = pd.DataFrame([lr_metrics, svm_metrics], index=['Logistic Regression', 'SVM (RBF)'])

# Overlaid ROC Curve
fpr_lr, tpr_lr, _ = roc_curve(y_test, lr_probs)
fpr_svm, tpr_svm, _ = roc_curve(y_test, svm_probs)

plt.figure(figsize=(8, 6))
plt.plot(fpr_lr, tpr_lr, label=f'Logistic Regression (AUC = {lr_metrics["ROC-AUC"]:.3f})')
plt.plot(fpr_svm, tpr_svm, label=f'SVM RBF (AUC = {svm_metrics["ROC-AUC"]:.3f})')
plt.plot([0, 1], [0, 1], 'k--')
plt.xlabel('False Positive Rate')
plt.ylabel('True Positive Rate')
plt.title('ROC Curve Comparison')
plt.legend()
plt.savefig(os.path.join(output_dir, 'roc_curve.png'))
plt.close()

# Confusion Matrices
fig, axes = plt.subplots(1, 2, figsize=(12, 5))

cm_lr = confusion_matrix(y_test, lr_preds)
sns.heatmap(cm_lr, annot=True, fmt='d', cmap='Blues', ax=axes[0])
axes[0].set_title('Logistic Regression Confusion Matrix')
axes[0].set_xlabel('Predicted')
axes[0].set_ylabel('Actual')

cm_svm = confusion_matrix(y_test, svm_preds)
sns.heatmap(cm_svm, annot=True, fmt='d', cmap='Oranges', ax=axes[1])
axes[1].set_title('SVM (RBF) Confusion Matrix')
axes[1].set_xlabel('Predicted')
axes[1].set_ylabel('Actual')

plt.tight_layout()
plt.savefig(os.path.join(output_dir, 'confusion_matrices.png'))
plt.close()

# Create Markdown Report
report_content = f"""# Baseline Models Results

## Performance Metrics Table
{results_df.to_markdown()}

## Overlaid ROC Curve
![ROC Curve](roc_curve.png)

## Confusion Matrices
![Confusion Matrices](confusion_matrices.png)

*Note: Used a single fixed-seed stratified train/val/test split (80/20 train/test, random_state=42).*
"""

with open(os.path.join(output_dir, 'baseline_results.md'), 'w') as f:
    f.write(report_content)

print("Baseline models script completed successfully.")
