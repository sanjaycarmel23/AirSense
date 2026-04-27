"""
AQaaS — Flask Backend Server
Loads the pre-trained Random Forest model and serves AQI predictions via REST API.
Also serves the frontend dashboard as static files.
Updated to support 4-feature model: Gas Index, Temperature, Humidity, PM2.5
"""

import os
import sys
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from model import load_model, predict_aqi, get_model_feature_count
from database import get_db, store_prediction, get_predictions, get_prediction_stats

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Flask App ────────────────────────────────────────────────
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
CORS(app)  # Allow cross-origin requests from the frontend

# ── Load Model at Startup ────────────────────────────────────
MODEL_PATH = os.path.join(FRONTEND_DIR, "aqi_model.pkl")
model = load_model(MODEL_PATH)


# ── Routes ───────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify the server, model, and database status."""
    db = get_db()
    feature_count = get_model_feature_count(model) if model else 0
    return jsonify({
        "status": "ok",
        "model_loaded": model is not None,
        "model_type": type(model).__name__ if model else None,
        "feature_count": feature_count,
        "features": list(model.feature_names_in_) if model and hasattr(model, "feature_names_in_") else [],
        "classes": list(model.classes_) if model and hasattr(model, "classes_") else [],
        "database_connected": db is not None,
    })


@app.route("/api/predict", methods=["POST"])
def predict():
    """
    Prediction endpoint.
    
    Expects JSON body:
    {
        "gas_index": <float>,
        "temperature": <float>,
        "humidity": <float>,
        "pm25": <float>
    }
    
    Returns:
    {
        "prediction": "Good" | "Moderate" | "Poor",
        "confidence": { "Good": float, "Moderate": float, "Poor": float }
    }
    """
    # ── Validate model is loaded ─────────────────────────────
    if model is None:
        logger.error("Model is not loaded")
        return jsonify({"error": "ML model not available. Server misconfiguration."}), 503

    # ── Parse request body ───────────────────────────────────
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    # ── Validate required fields ─────────────────────────────
    required_fields = ["gas_index", "temperature", "humidity", "pm25"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        # Backward compatibility: pm25 defaults to 0 if not provided
        if missing == ["pm25"]:
            data["pm25"] = 0.0
            missing = []
        else:
            return jsonify({
                "error": f"Missing required fields: {', '.join(missing)}",
                "required": required_fields,
            }), 400

    # ── Validate data types and ranges ───────────────────────
    try:
        gas_index = float(data["gas_index"])
        temperature = float(data["temperature"])
        humidity = float(data["humidity"])
        pm25 = float(data["pm25"])
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid data type. All values must be numeric. Detail: {str(e)}"}), 400

    # Sanity checks for reasonable sensor ranges
    validation_errors = []
    if gas_index < 0 or gas_index > 2000:
        validation_errors.append("gas_index should be between 0 and 2000 ppm")
    if temperature < -40 or temperature > 80:
        validation_errors.append("temperature should be between -40 and 80 °C")
    if humidity < 0 or humidity > 100:
        validation_errors.append("humidity should be between 0 and 100 %RH")
    if pm25 < 0 or pm25 > 1000:
        validation_errors.append("pm25 should be between 0 and 1000 µg/m³")

    if validation_errors:
        return jsonify({
            "error": "Input values out of expected range.",
            "details": validation_errors,
        }), 422

    # ── Run prediction ───────────────────────────────────────
    try:
        result = predict_aqi(model, gas_index, temperature, humidity, pm25)
        logger.info(
            "Prediction: Gas=%.1f, Temp=%.1f, Hum=%.1f, PM2.5=%.1f → %s (conf: %.2f%%)",
            gas_index, temperature, humidity, pm25,
            result["prediction"],
            max(result["confidence"].values()) * 100 if result["confidence"] else 0,
        )

        # ── Store in MongoDB (non-blocking: failure doesn't affect response) ──
        doc_id = store_prediction(
            gas_index, temperature, humidity, pm25,
            result["prediction"], result.get("confidence")
        )
        if doc_id:
            result["stored"] = True

        return jsonify(result)

    except Exception as e:
        logger.exception("Prediction failed")
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@app.route("/api/model-info", methods=["GET"])
def model_info():
    """Return metadata about the loaded ML model."""
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503

    info = {
        "algorithm": "Random Forest Classifier",
        "n_estimators": len(model.estimators_) if hasattr(model, "estimators_") else "N/A",
        "max_depth": model.max_depth if hasattr(model, "max_depth") else "N/A",
        "features": list(model.feature_names_in_) if hasattr(model, "feature_names_in_") else [],
        "feature_count": get_model_feature_count(model),
        "classes": list(model.classes_) if hasattr(model, "classes_") else [],
        "status": "active",
    }
    return jsonify(info)


# ── History & Stats ──────────────────────────────────────────

@app.route("/api/history", methods=["GET"])
def prediction_history():
    """
    Fetch historical prediction data from MongoDB.
    Query params: ?limit=50 (default 50, max 200)
    """
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (ValueError, TypeError):
        limit = 50

    records = get_predictions(limit)
    return jsonify({
        "count": len(records),
        "predictions": records,
    })


@app.route("/api/stats", methods=["GET"])
def prediction_stats():
    """Return aggregate statistics from stored predictions."""
    stats = get_prediction_stats()
    if stats is None:
        return jsonify({"error": "Database not available"}), 503
    return jsonify(stats)


# ── Serve Frontend ───────────────────────────────────────────

@app.route("/")
def serve_dashboard():
    """Serve the frontend dashboard at the root URL."""
    return send_from_directory(FRONTEND_DIR, "index.html")


# ── Entry Point ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info("=" * 50)
    logger.info("AQaaS — ML-Powered Air Quality Dashboard")
    logger.info("=" * 50)
    logger.info("Dashboard:  http://localhost:%d", port)
    logger.info("Health API: http://localhost:%d/api/health", port)
    logger.info("Predict:    http://localhost:%d/api/predict", port)
    logger.info("History:    http://localhost:%d/api/history", port)
    logger.info("Stats:      http://localhost:%d/api/stats", port)
    db = get_db()
    logger.info("MongoDB:    %s", "Connected ✓" if db else "Not configured")
    logger.info("Model features: %d", get_model_feature_count(model))
    logger.info("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=True)

