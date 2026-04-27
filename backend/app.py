"""
AQaaS — Flask Backend Server
Loads the pre-trained Random Forest model and serves AQI predictions via REST API.
Fetches live sensor data from MongoDB for predictions.
"""

import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from model import load_model, predict_aqi, get_model_feature_count
from database import (
    get_db, store_prediction, get_predictions, get_prediction_stats,
    insert_sensor_data, get_latest_sensor_data, get_sensor_history
)

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
CORS(app)

# ── Load Model at Startup ────────────────────────────────────
MODEL_PATH = os.path.join(FRONTEND_DIR, "aqi_model.pkl")
model = load_model(MODEL_PATH)


# ── Routes ───────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
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


@app.route("/api/latest", methods=["GET"])
def latest_reading():
    """
    Fetch the latest sensor data from MongoDB, run ML prediction, return both.
    This is the PRIMARY endpoint for the live dashboard.

    Returns:
    {
        "sensor": { gas, temperature, humidity, pm25, timestamp },
        "prediction": "Good" | "Moderate" | "Poor",
        "confidence": { ... },
        "aqi_score": int,
        "source": "database"
    }
    """
    if model is None:
        return jsonify({"error": "ML model not available"}), 503

    sensor = get_latest_sensor_data()
    if sensor is None:
        return jsonify({"error": "No sensor data available in database", "source": "none"}), 404

    gas = sensor.get("gas", 0)
    temp = sensor.get("temperature", 0)
    hum = sensor.get("humidity", 0)
    pm25 = sensor.get("pm25", 0)

    try:
        result = predict_aqi(model, gas, temp, hum, pm25)
        # Store prediction
        store_prediction(gas, temp, hum, pm25, result["prediction"], result.get("confidence"))

        # Calculate AQI score
        conf = result.get("confidence", {})
        g = conf.get("Good", 0)
        m = conf.get("Moderate", 0)
        p = conf.get("Poor", 0)
        aqi_score = round(g * 25 + m * 100 + p * 250) if conf else (
            25 if result["prediction"] == "Good" else 100 if result["prediction"] == "Moderate" else 200
        )

        logger.info(
            "Latest: Gas=%.1f, Temp=%.1f, Hum=%.1f, PM2.5=%.1f → %s (AQI %d)",
            gas, temp, hum, pm25, result["prediction"], aqi_score
        )

        return jsonify({
            "sensor": sensor,
            "prediction": result["prediction"],
            "confidence": result.get("confidence", {}),
            "aqi_score": aqi_score,
            "source": "database"
        })

    except Exception as e:
        logger.exception("Prediction from latest data failed")
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@app.route("/api/sensor-data", methods=["POST"])
def add_sensor_data():
    """
    Insert sensor data into MongoDB. Used by IoT devices or simulators.

    Expects JSON: { gas, temperature, humidity, pm25 (optional) }
    """
    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    required = ["gas", "temperature", "humidity"]
    missing = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        gas = float(data["gas"])
        temp = float(data["temperature"])
        hum = float(data["humidity"])
        pm25 = float(data.get("pm25", 0))
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid data type: {str(e)}"}), 400

    doc_id = insert_sensor_data(gas, temp, hum, pm25)
    if doc_id:
        return jsonify({"status": "ok", "id": doc_id})
    return jsonify({"error": "Failed to insert — database may not be connected"}), 503


@app.route("/api/sensor-history", methods=["GET"])
def sensor_history():
    """Fetch historical sensor data from MongoDB."""
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (ValueError, TypeError):
        limit = 50
    records = get_sensor_history(limit)
    return jsonify({"count": len(records), "data": records})


@app.route("/api/predict", methods=["POST"])
def predict():
    """Manual prediction endpoint (still works for direct input)."""
    if model is None:
        return jsonify({"error": "ML model not available."}), 503

    data = request.get_json(silent=True)
    if data is None:
        return jsonify({"error": "Request body must be valid JSON."}), 400

    required_fields = ["gas_index", "temperature", "humidity"]
    missing = [f for f in required_fields if f not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    try:
        gas_index = float(data["gas_index"])
        temperature = float(data["temperature"])
        humidity = float(data["humidity"])
        pm25 = float(data.get("pm25", 0))
    except (ValueError, TypeError) as e:
        return jsonify({"error": f"Invalid data type: {str(e)}"}), 400

    validation_errors = []
    if gas_index < 0 or gas_index > 2000:
        validation_errors.append("gas_index should be between 0 and 2000")
    if temperature < -40 or temperature > 80:
        validation_errors.append("temperature should be between -40 and 80")
    if humidity < 0 or humidity > 100:
        validation_errors.append("humidity should be between 0 and 100")
    if pm25 < 0 or pm25 > 1000:
        validation_errors.append("pm25 should be between 0 and 1000")
    if validation_errors:
        return jsonify({"error": "Values out of range", "details": validation_errors}), 422

    try:
        result = predict_aqi(model, gas_index, temperature, humidity, pm25)
        store_prediction(gas_index, temperature, humidity, pm25, result["prediction"], result.get("confidence"))
        return jsonify(result)
    except Exception as e:
        logger.exception("Prediction failed")
        return jsonify({"error": f"Prediction failed: {str(e)}"}), 500


@app.route("/api/model-info", methods=["GET"])
def model_info():
    """Return metadata about the loaded ML model."""
    if model is None:
        return jsonify({"error": "Model not loaded"}), 503
    return jsonify({
        "algorithm": "Random Forest Classifier",
        "n_estimators": len(model.estimators_) if hasattr(model, "estimators_") else "N/A",
        "max_depth": model.max_depth if hasattr(model, "max_depth") else "N/A",
        "features": list(model.feature_names_in_) if hasattr(model, "feature_names_in_") else [],
        "feature_count": get_model_feature_count(model),
        "classes": list(model.classes_) if hasattr(model, "classes_") else [],
        "status": "active",
    })


@app.route("/api/history", methods=["GET"])
def prediction_history():
    """Fetch historical prediction data."""
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (ValueError, TypeError):
        limit = 50
    records = get_predictions(limit)
    return jsonify({"count": len(records), "predictions": records})


@app.route("/api/stats", methods=["GET"])
def prediction_stats():
    """Return aggregate statistics."""
    stats = get_prediction_stats()
    if stats is None:
        return jsonify({"error": "Database not available"}), 503
    return jsonify(stats)


# ── Serve Frontend ───────────────────────────────────────────
@app.route("/")
def serve_dashboard():
    return send_from_directory(FRONTEND_DIR, "index.html")


# ── Entry Point ──────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    logger.info("=" * 50)
    logger.info("AQaaS — ML-Powered Air Quality Dashboard")
    logger.info("=" * 50)
    logger.info("Dashboard:  http://localhost:%d", port)
    logger.info("Latest:     http://localhost:%d/api/latest", port)
    logger.info("Sensor In:  http://localhost:%d/api/sensor-data  [POST]", port)
    logger.info("Predict:    http://localhost:%d/api/predict  [POST]", port)
    logger.info("History:    http://localhost:%d/api/history", port)
    db = get_db()
    logger.info("MongoDB:    %s", "Connected ✓" if db is not None else "Not configured")
    logger.info("Model:      %d features", get_model_feature_count(model))
    logger.info("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=True)
