"""
AQaaS — MongoDB Database Module
Manages connection to MongoDB Atlas and provides CRUD operations
for the 'predictions' collection.
Updated to include PM2.5 field.
"""

import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# MongoDB client (lazy-initialized)
_client = None
_db = None


def get_db():
    """
    Get the MongoDB database instance (lazy singleton).
    Reads MONGO_URI from environment or .env file.
    Returns None if connection fails (app continues without DB).
    """
    global _client, _db

    if _db is not None:
        return _db

    try:
        from pymongo import MongoClient
        from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

        mongo_uri = os.environ.get("MONGO_URI", "")

        # Try loading from .env file if not in environment
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
            serverSelectionTimeoutMS=5000,  # 5s timeout
            connectTimeoutMS=5000,
            maxPoolSize=10,
        )

        # Verify connection
        _client.admin.command("ping")

        _db = _client["airsense"]
        logger.info("✓ Connected to MongoDB Atlas — database: airsense")

        # Ensure index on timestamp for efficient queries
        _db.predictions.create_index("timestamp", unique=False)
        logger.info("  Collection: predictions (indexed on timestamp)")

        return _db

    except Exception as e:
        logger.warning("MongoDB connection failed: %s — running without database", str(e))
        _client = None
        _db = None
        return None


def store_prediction(gas_index, temperature, humidity, pm25, prediction, confidence=None):
    """
    Store a prediction record in the 'predictions' collection.

    Args:
        gas_index: float — sensor gas reading
        temperature: float — sensor temperature
        humidity: float — sensor humidity
        pm25: float — PM2.5 particulate matter reading (µg/m³)
        prediction: str — AQI category (Good/Moderate/Poor)
        confidence: dict — optional confidence scores

    Returns:
        str — inserted document ID, or None on failure
    """
    db = get_db()
    if db is None:
        return None

    try:
        doc = {
            "gas_index": round(float(gas_index), 2),
            "temperature": round(float(temperature), 2),
            "humidity": round(float(humidity), 2),
            "pm25": round(float(pm25), 2),
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
    """
    Fetch recent predictions from MongoDB, newest first.

    Args:
        limit: int — max number of records to return (default 50)

    Returns:
        list[dict] — prediction records, or empty list on failure
    """
    db = get_db()
    if db is None:
        return []

    try:
        cursor = db.predictions.find(
            {},
            {"_id": 0, "gas_index": 1, "temperature": 1, "humidity": 1,
             "pm25": 1, "prediction": 1, "confidence": 1, "timestamp": 1}
        ).sort("timestamp", -1).limit(limit)

        records = []
        for doc in cursor:
            doc["timestamp"] = doc["timestamp"].isoformat() if doc.get("timestamp") else None
            # Ensure pm25 field exists for backward compatibility
            if "pm25" not in doc:
                doc["pm25"] = 0.0
            records.append(doc)

        return records

    except Exception as e:
        logger.error("Failed to fetch predictions: %s", str(e))
        return []


def get_prediction_stats():
    """
    Get aggregate statistics from stored predictions.

    Returns:
        dict with counts, averages, and distribution
    """
    db = get_db()
    if db is None:
        return None

    try:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "avg_gas": {"$avg": "$gas_index"},
                    "avg_temp": {"$avg": "$temperature"},
                    "avg_hum": {"$avg": "$humidity"},
                    "avg_pm25": {"$avg": {"$ifNull": ["$pm25", 0]}},
                }
            }
        ]
        agg_result = list(db.predictions.aggregate(pipeline))

        # Distribution counts
        dist_pipeline = [
            {"$group": {"_id": "$prediction", "count": {"$sum": 1}}}
        ]
        dist_result = list(db.predictions.aggregate(dist_pipeline))
        distribution = {d["_id"]: d["count"] for d in dist_result}

        if agg_result:
            stats = agg_result[0]
            return {
                "total_predictions": stats["total"],
                "avg_gas_index": round(stats["avg_gas"], 2),
                "avg_temperature": round(stats["avg_temp"], 2),
                "avg_humidity": round(stats["avg_hum"], 2),
                "avg_pm25": round(stats.get("avg_pm25", 0) or 0, 2),
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
