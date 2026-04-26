"""
AQaaS — ML Model Module
Handles loading the pre-trained Random Forest model and running inference.
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


def predict_aqi(model, gas_index: float, temperature: float, humidity: float) -> dict:
    """
    Run AQI prediction using the loaded model.
    
    Args:
        model: Trained scikit-learn model.
        gas_index: Gas sensor reading (ppm).
        temperature: Temperature reading (°C).
        humidity: Relative humidity reading (%RH).
    
    Returns:
        Dictionary with:
        - prediction: "Good", "Moderate", or "Poor"
        - confidence: Dict of class probabilities
    """
    # Prepare feature DataFrame matching training feature order and names.
    # Using DataFrame avoids sklearn's "X does not have valid feature names" warning.
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
