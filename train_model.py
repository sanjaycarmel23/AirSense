"""
AQaaS - Model Training with New IoT Sensor Format
Features match the IoT device JSON: dust, co2, no, no2, co, temperature, humidity
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import joblib
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.metrics import classification_report, accuracy_score
import warnings
warnings.filterwarnings("ignore")


def prepare_data(csv_path="data.csv"):
    """Load and prepare data with IoT sensor feature names."""
    df = pd.read_csv(csv_path)

    # Replace -200 sentinel with NaN
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].replace(-200, np.nan)

    # Map CO_level to 3-class AQI labels
    label_map = {
        "Very low": "Good",
        "Low": "Good",
        "Moderate": "Moderate",
        "High": "Poor",
        "Very High": "Poor",
    }
    df["AQI_Label"] = df["CO_level"].map(label_map)

    # Map CSV columns to IoT sensor names
    # Based on value range matching with the actual IoT JSON format:
    # { dust, co2, no, no2, co, temperature, humidity }
    feature_mapping = {
        "AH": "dust",                # Absolute Humidity -> dust proxy (range 0-2.2)
        "PT08_S2_NMHC": "co2",      # NMHC sensor -> CO2 proxy (range 400-2200)
        "Nox_GT": "no",             # NOx ground truth -> NO (range 0-1479)
        "NO2_GT": "no2",            # NO2 ground truth -> NO2 (range 0-340)
        "PT08_S1_CO": "co",         # CO sensor -> CO (range 600-2040)
        "T": "temperature",          # Temperature (range -1 to 44)
        "RH": "humidity",            # Relative Humidity (range 9-89)
    }

    for old_name, new_name in feature_mapping.items():
        df[new_name] = df[old_name]

    feature_names = list(feature_mapping.values())

    # Drop NaN rows
    mask = df[feature_names].notna().all(axis=1) & df["AQI_Label"].notna()
    df_clean = df[mask].copy()

    return df_clean[feature_names], df_clean["AQI_Label"], feature_names


# -- Prepare data --
X, y, feature_names = prepare_data()
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

print("=" * 60)
print("  MODEL TRAINING — IoT Sensor Format")
print("=" * 60)
print(f"Dataset: {len(X)} clean samples | Train: {len(X_train)} | Test: {len(X_test)}")
print(f"Features: {feature_names}")
print(f"Classes: {sorted(y.unique())}")
print(f"\nClass distribution:")
for cls, count in y.value_counts().items():
    pct = count / len(y) * 100
    print(f"  {cls:10s}: {count:5d}  ({pct:.1f}%)")

# -- Train --
model = RandomForestClassifier(
    n_estimators=200,
    max_depth=10,
    min_samples_split=12,
    min_samples_leaf=5,
    max_features="sqrt",
    class_weight="balanced",
    bootstrap=True,
    random_state=42,
    n_jobs=-1,
)
model.fit(X_train, y_train)

train_acc = accuracy_score(y_train, model.predict(X_train))
test_acc = accuracy_score(y_test, model.predict(X_test))
cv = cross_val_score(model, X, y, cv=StratifiedKFold(5, shuffle=True, random_state=42), scoring="accuracy")

print(f"\nTrain accuracy: {train_acc:.4f} ({train_acc*100:.1f}%)")
print(f"Test accuracy:  {test_acc:.4f} ({test_acc*100:.1f}%)")
print(f"CV accuracy:    {cv.mean():.4f} +/- {cv.std():.4f} ({cv.mean()*100:.1f}%)")
print(f"Overfit gap:    {(train_acc - test_acc):.4f}")

print(f"\nTest Classification Report:")
print(classification_report(y_test, model.predict(X_test), zero_division=0))

print("Feature Importances:")
for name, imp in sorted(zip(feature_names, model.feature_importances_), key=lambda x: -x[1]):
    bar = "#" * int(imp * 40)
    print(f"  {name:15s}: {imp:.4f}  {bar}")

# -- Save production model (trained on full data) --
print(f"\n{'=' * 60}")
print("  SAVING PRODUCTION MODEL")
print("=" * 60)

final_model = RandomForestClassifier(
    n_estimators=200,
    max_depth=10,
    min_samples_split=12,
    min_samples_leaf=5,
    max_features="sqrt",
    class_weight="balanced",
    bootstrap=True,
    random_state=42,
    n_jobs=-1,
)
final_model.fit(X, y)
joblib.dump(final_model, "aqi_model.pkl")

print(f"Saved: aqi_model.pkl")
print(f"Features: {list(final_model.feature_names_in_)}")
print(f"Classes:  {list(final_model.classes_)}")

# Verify with sample IoT data
sample = pd.DataFrame([{
    "dust": 0.62,
    "co2": 1289.25,
    "no": 343.80,
    "no2": 229.20,
    "co": 716.25,
    "temperature": 30,
    "humidity": 60,
}])
pred = final_model.predict(sample[feature_names])
proba = final_model.predict_proba(sample[feature_names])
conf = {c: round(p, 3) for c, p in zip(final_model.classes_, proba[0])}
print(f"\nVerification with sample IoT data:")
print(f"  Input: dust=0.62, co2=1289.25, no=343.80, no2=229.20, co=716.25, temp=30, hum=60")
print(f"  Prediction: {pred[0]}")
print(f"  Confidence: {conf}")
print("\nDone!")
