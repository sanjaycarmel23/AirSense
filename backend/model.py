"""
AQaaS — ML Model Module
Handles loading the pre-trained Random Forest model and running inference.
Updated to support 7-feature IoT input: dust, co2, no, no2, co, temperature, humidity
"""

import os
import logging
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


def load_model(model_path: str):
    """
    Load the pre-trained model from the specified .pkl file.
    Uses joblib for deserialization (scikit-learn standard).
    
    Args:
        model_path: Absolute or relative path to the .pkl model file.
    
    Returns:
        Loaded model object, or None if loading fails.
    """
    abs_path = os.path.abspath(model_path)
    logger.info("Loading model from: %s", abs_path)

    if not os.path.exists(abs_path):
        logger.error("Model file not found: %s", abs_path)
        return None

    try:
        import joblib
        model = joblib.load(abs_path)
        logger.info("Model loaded successfully: %s", type(model).__name__)

        # Log model metadata
        if hasattr(model, "feature_names_in_"):
            logger.info("  Features: %s", list(model.feature_names_in_))
        if hasattr(model, "classes_"):
            logger.info("  Classes: %s", list(model.classes_))
        if hasattr(model, "estimators_"):
            logger.info("  Estimators: %d", len(model.estimators_))

        return model

    except Exception as e:
        logger.exception("Failed to load model: %s", e)
        return None


def get_model_feature_count(model) -> int:
    """
    Determine the number of features the model expects.
    Returns 7 for the IoT model (dust, co2, no, no2, co, temperature, humidity).
    """
    if model is None:
        return 7  # default to IoT model
    if hasattr(model, "n_features_in_"):
        return model.n_features_in_
    if hasattr(model, "feature_names_in_"):
        return len(model.feature_names_in_)
    return 7  # default to IoT model


def predict_aqi(
    model,
    dust: float = 0.0,
    co2: float = 0.0,
    no: float = 0.0,
    no2: float = 0.0,
    co: float = 0.0,
    temperature: float = 0.0,
    humidity: float = 0.0,
) -> dict:
    """
    Run AQI prediction using the loaded model.
    Dynamically adapts to the model's expected features using feature_names_in_.
    
    Args:
        model: Trained scikit-learn model.
        dust: Dust / PM2.5 sensor reading.
        co2: CO2 sensor reading (ppm).
        no: NO sensor reading (ppb).
        no2: NO2 sensor reading (ppb).
        co: CO sensor reading (ppm).
        temperature: Temperature reading (°C).
        humidity: Relative humidity reading (%RH).
    
    Returns:
        Dictionary with:
        - prediction: "Good", "Moderate", or "Poor"
        - confidence: Dict of class probabilities
    """
    # All available sensor values mapped to feature names
    all_features = {
        "dust": dust,
        "co2": co2,
        "no": no,
        "no2": no2,
        "co": co,
        "temperature": temperature,
        "humidity": humidity,
    }

    # Build DataFrame using exactly the features the model expects
    if hasattr(model, "feature_names_in_"):
        model_features = list(model.feature_names_in_)
    else:
        # Fallback for models without feature_names_in_
        model_features = list(all_features.keys())

    row = [all_features.get(f, 0.0) for f in model_features]
    features = pd.DataFrame([row], columns=model_features)

    # Get prediction
    prediction = model.predict(features)[0]

    # Get prediction probabilities
    confidence = {}
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(features)[0]
        classes = model.classes_
        confidence = {cls: round(float(prob), 4) for cls, prob in zip(classes, probabilities)}

    return {
        "prediction": str(prediction),
        "confidence": confidence,
    }
