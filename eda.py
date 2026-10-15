import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os

# Create output directory
output_dir = 'eda_output'
os.makedirs(output_dir, exist_ok=True)

# Load dataset
df = pd.read_csv('data/heart.csv')

# 1. Class balance bar chart
plt.figure(figsize=(8, 6))
sns.countplot(data=df, x='HeartDisease')
plt.title('Class Balance of Heart Disease')
plt.xlabel('Heart Disease (0 = No, 1 = Yes)')
plt.ylabel('Count')
plt.savefig(os.path.join(output_dir, 'class_balance.png'))
plt.close()

# 2. Correlation heatmap
plt.figure(figsize=(10, 8))
numeric_df = df.select_dtypes(include=['int64', 'float64'])
sns.heatmap(numeric_df.corr(), annot=True, cmap='coolwarm', fmt='.2f')
plt.title('Correlation Heatmap of Clinical Features')
plt.tight_layout()
plt.savefig(os.path.join(output_dir, 'correlation_heatmap.png'))
plt.close()

# 3. Feature distribution plots (age, cholesterol, resting BP)
fig, axes = plt.subplots(1, 3, figsize=(18, 5))

sns.histplot(data=df, x='Age', kde=True, ax=axes[0], hue='HeartDisease', multiple='stack')
axes[0].set_title('Age Distribution')

sns.histplot(data=df, x='Cholesterol', kde=True, ax=axes[1], hue='HeartDisease', multiple='stack')
axes[1].set_title('Cholesterol Distribution')

sns.histplot(data=df, x='RestingBP', kde=True, ax=axes[2], hue='HeartDisease', multiple='stack')
axes[2].set_title('Resting BP Distribution')

plt.tight_layout()
plt.savefig(os.path.join(output_dir, 'feature_distributions.png'))
plt.close()

# Create Markdown Report
report_content = """# EDA Report: Heart Disease Risk Classification

## Class Balance
![Class Balance](class_balance.png)
**Finding:** The dataset is relatively balanced between patients with and without heart disease, with a slight majority having heart disease (class 1). This is a good baseline for training classification models without severe class imbalance issues.

## Correlation Heatmap
![Correlation Heatmap](correlation_heatmap.png)
**Finding:** Oldpeak and Age show moderate positive correlations with HeartDisease, while MaxHR shows a negative correlation. Cholesterol and RestingBP have weaker correlations with the target variable compared to Oldpeak.

## Feature Distributions
![Feature Distributions](feature_distributions.png)
**Findings:**
- **Age:** Older patients have a visibly higher proportion of heart disease compared to younger patients.
- **Cholesterol:** A significant number of instances have 0 cholesterol, which likely indicates missing values. Excluding those, the distribution for patients with heart disease tends to be slightly higher, but overlaps considerably.
- **Resting BP:** The distribution of resting blood pressure is fairly similar between the two groups, though mostly clustered between 120 and 140.
"""

with open(os.path.join(output_dir, 'eda_report.md'), 'w') as f:
    f.write(report_content)

print("EDA script completed successfully.")
