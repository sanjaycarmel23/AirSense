"""
AQaaS — ML Model Module
Handles loading the pre-trained Random Forest model and running inference.
Updated to support 4-feature input: Gas Index, Temperature, Humidity, PM2.5
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
    Returns 4 for the new model, 3 for the legacy model.
    """
    if model is None:
        return 4  # default to new model
    if hasattr(model, "n_features_in_"):
        return model.n_features_in_
    if hasattr(model, "feature_names_in_"):
        return len(model.feature_names_in_)
    return 4  # default to 4-feature model


def predict_aqi(model, gas_index: float, temperature: float, humidity: float, pm25: float = 0.0) -> dict:
    """
    Run AQI prediction using the loaded model.
    Supports both 3-feature (legacy) and 4-feature (updated) models.
    
    Args:
        model: Trained scikit-learn model.
        gas_index: Gas sensor reading (ppm).
        temperature: Temperature reading (°C).
        humidity: Relative humidity reading (%RH).
        pm25: PM2.5 particulate matter reading (µg/m³).
    
    Returns:
        Dictionary with:
        - prediction: "Good", "Moderate", or "Poor"
        - confidence: Dict of class probabilities
    """
    feature_count = get_model_feature_count(model)

    if feature_count >= 4:
        # New 4-feature model: Gas_Index, Temperature, Humidity, PM25
        features = pd.DataFrame(
            [[gas_index, temperature, humidity, pm25]],
            columns=['Gas_Index', 'Temperature', 'Humidity', 'PM25']
        )
    else:
        # Legacy 3-feature model: Gas_Index, Temperature, Humidity
        features = pd.DataFrame(
            [[gas_index, temperature, humidity]],
            columns=['Gas_Index', 'Temperature', 'Humidity']
        )

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
