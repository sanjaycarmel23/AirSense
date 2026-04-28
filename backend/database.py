"""
AQaaS — MongoDB Database Module
Manages connection to MongoDB Atlas and provides CRUD operations.
Collections: 'predictions' and 'sensor_data'
Updated for IoT sensor format: dust, co2, no, no2, co, temperature, humidity
"""

import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_client = None
_db = None


def get_db():
    """Get the MongoDB database instance (lazy singleton)."""
    global _client, _db

    if _db is not None:
        return _db

    try:
        from pymongo import MongoClient

        mongo_uri = os.environ.get("MONGO_URI", "")

        if not mongo_uri:
            env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
            if os.path.exists(env_path):
                with open(env_path) as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("MONGO_URI="):
                            mongo_uri = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break

        if not mongo_uri:
            logger.warning("MONGO_URI not set — database features disabled")
            return None

        _client = MongoClient(
            mongo_uri,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            maxPoolSize=10,
        )

        _client.admin.command("ping")

        _db = _client["airsense"]
        logger.info("✓ Connected to MongoDB Atlas — database: airsense")

        # Ensure indexes
        _db.predictions.create_index("timestamp", unique=False)
        _db.sensor_data.create_index("timestamp", unique=False)
        logger.info("  Collections: predictions, sensor_data (indexed on timestamp)")

        return _db

    except Exception as e:
        logger.warning("MongoDB connection failed: %s — running without database", str(e))
        _client = None
        _db = None
        return None


# ── sensor_data Collection ───────────────────────────────────

SENSOR_FIELDS = ["dust", "co2", "no", "no2", "co", "temperature", "humidity"]


def insert_sensor_data(dust=0, co2=0, no=0, no2=0, co=0, temperature=0, humidity=0):
    """
    Insert a sensor reading into the 'sensor_data' collection.
    Called by IoT devices or a simulator.
    """
    db = get_db()
    if db is None:
        return None
    try:
        doc = {
            "dust": round(float(dust), 2),
            "co2": round(float(co2), 2),
            "no": round(float(no), 2),
            "no2": round(float(no2), 2),
            "co": round(float(co), 2),
            "temperature": round(float(temperature), 2),
            "humidity": round(float(humidity), 2),
            "timestamp": datetime.now(timezone.utc),
        }
        result = db.sensor_data.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.error("Failed to insert sensor data: %s", str(e))
        return None


def get_latest_sensor_data():
    """
    Fetch the most recent sensor reading from 'sensor_data'.
    Returns dict with dust, co2, no, no2, co, temperature, humidity, timestamp — or None.
    """
    db = get_db()
    if db is None:
        return None
    try:
        projection = {"_id": 0, "timestamp": 1}
        for f in SENSOR_FIELDS:
            projection[f] = 1
        doc = db.sensor_data.find_one(
            {},
            projection,
            sort=[("timestamp", -1)]
        )
        if doc and doc.get("timestamp"):
            doc["timestamp"] = doc["timestamp"].isoformat()
        # Ensure all fields present with defaults
        if doc:
            for f in SENSOR_FIELDS:
                if f not in doc:
                    doc[f] = 0.0
        return doc
    except Exception as e:
        logger.error("Failed to fetch latest sensor data: %s", str(e))
        return None


def get_sensor_history(limit=50):
    """Fetch recent sensor readings, newest first."""
    db = get_db()
    if db is None:
        return []
    try:
        projection = {"_id": 0, "timestamp": 1}
        for f in SENSOR_FIELDS:
            projection[f] = 1
        cursor = db.sensor_data.find(
            {},
            projection
        ).sort("timestamp", -1).limit(limit)
        records = []
        for doc in cursor:
            doc["timestamp"] = doc["timestamp"].isoformat() if doc.get("timestamp") else None
            for f in SENSOR_FIELDS:
                if f not in doc:
                    doc[f] = 0.0
            records.append(doc)
        return records
    except Exception as e:
        logger.error("Failed to fetch sensor history: %s", str(e))
        return []


# ── predictions Collection ───────────────────────────────────

def store_prediction(dust, co2, no, no2, co, temperature, humidity, prediction, confidence=None):
    """Store a prediction record in 'predictions'."""
    db = get_db()
    if db is None:
        return None
    try:
        doc = {
            "dust": round(float(dust), 2),
            "co2": round(float(co2), 2),
            "no": round(float(no), 2),
            "no2": round(float(no2), 2),
            "co": round(float(co), 2),
            "temperature": round(float(temperature), 2),
            "humidity": round(float(humidity), 2),
            "prediction": str(prediction),
            "confidence": confidence or {},
            "timestamp": datetime.now(timezone.utc),
        }
        result = db.predictions.insert_one(doc)
        return str(result.inserted_id)
    except Exception as e:
        logger.error("Failed to store prediction: %s", str(e))
        return None


def get_predictions(limit=50):
    """Fetch recent predictions from MongoDB, newest first."""
    db = get_db()
    if db is None:
        return []
    try:
        projection = {"_id": 0, "prediction": 1, "confidence": 1, "timestamp": 1}
        for f in SENSOR_FIELDS:
            projection[f] = 1
        cursor = db.predictions.find(
            {},
            projection
        ).sort("timestamp", -1).limit(limit)
        records = []
        for doc in cursor:
            doc["timestamp"] = doc["timestamp"].isoformat() if doc.get("timestamp") else None
            for f in SENSOR_FIELDS:
                if f not in doc:
                    doc[f] = 0.0
            records.append(doc)
        return records
    except Exception as e:
        logger.error("Failed to fetch predictions: %s", str(e))
        return []


def get_prediction_stats():
    """Get aggregate statistics from stored predictions."""
    db = get_db()
    if db is None:
        return None
    try:
        pipeline = [
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "avg_dust": {"$avg": {"$ifNull": ["$dust", 0]}},
                "avg_co2": {"$avg": {"$ifNull": ["$co2", 0]}},
                "avg_no": {"$avg": {"$ifNull": ["$no", 0]}},
                "avg_no2": {"$avg": {"$ifNull": ["$no2", 0]}},
                "avg_co": {"$avg": {"$ifNull": ["$co", 0]}},
                "avg_temp": {"$avg": "$temperature"},
                "avg_hum": {"$avg": "$humidity"},
            }}
        ]
        agg_result = list(db.predictions.aggregate(pipeline))
        dist_pipeline = [{"$group": {"_id": "$prediction", "count": {"$sum": 1}}}]
        dist_result = list(db.predictions.aggregate(dist_pipeline))
        distribution = {d["_id"]: d["count"] for d in dist_result}
        if agg_result:
            stats = agg_result[0]
            return {
                "total_predictions": stats["total"],
                "avg_dust": round(stats.get("avg_dust", 0) or 0, 2),
                "avg_co2": round(stats.get("avg_co2", 0) or 0, 2),
                "avg_no": round(stats.get("avg_no", 0) or 0, 2),
                "avg_no2": round(stats.get("avg_no2", 0) or 0, 2),
                "avg_co": round(stats.get("avg_co", 0) or 0, 2),
                "avg_temperature": round(stats["avg_temp"], 2),
                "avg_humidity": round(stats["avg_hum"], 2),
                "distribution": {
                    "Good": distribution.get("Good", 0),
                    "Moderate": distribution.get("Moderate", 0),
                    "Poor": distribution.get("Poor", 0),
                },
            }
        return {"total_predictions": 0, "distribution": {"Good": 0, "Moderate": 0, "Poor": 0}}
    except Exception as e:
        logger.error("Failed to get prediction stats: %s", str(e))
        return None


def close_connection():
    """Close the MongoDB connection gracefully."""
    global _client, _db
    if _client:
        _client.close()
        logger.info("MongoDB connection closed")
    _client = None
    _db = None
