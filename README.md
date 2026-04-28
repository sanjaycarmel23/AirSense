# 🌬️ AirSense — IoT Air Quality Monitoring Dashboard

> **AQaaS** (Air Quality as a Service) — A real-time IoT-based air quality monitoring and control system with ML-powered AQI prediction.

---

## 📋 Overview

AirSense is a full-stack IoT air quality monitoring dashboard that visualizes real-time environmental data from IoT sensors. It features a **Random Forest ML model** that classifies air quality into three categories — **Good**, **Moderate**, or **Poor** — based on live sensor readings from 7 parameters.

The system consists of:
- A **Flask backend** serving ML predictions via REST API
- A **vanilla JS frontend** with real-time charts, alerts, and analytics
- **MongoDB Atlas** integration for persistent sensor data storage
- An **IoT sensor interface** that accepts data from hardware devices

## 🔧 IoT Sensor Data Format

The system accepts sensor data in the following JSON format:

```json
{
  "dust": 0.62,
  "co2": 1289.25,
  "no": 343.80,
  "no2": 229.20,
  "co": 716.25,
  "temperature": 30,
  "humidity": 60
}
```

| Parameter       | Description                | Unit     |
|-----------------|----------------------------|----------|
| `dust`          | Dust / Particulate Matter  | mg/m³    |
| `co2`           | Carbon Dioxide             | ppm      |
| `no`            | Nitric Oxide               | ppb      |
| `no2`           | Nitrogen Dioxide           | ppb      |
| `co`            | Carbon Monoxide            | ppm      |
| `temperature`   | Ambient Temperature        | °C       |
| `humidity`      | Relative Humidity          | %RH      |

## 🤖 ML Model

- **Algorithm:** Random Forest Classifier (200 estimators, max_depth=10)
- **Features:** `dust`, `co2`, `no`, `no2`, `co`, `temperature`, `humidity` (7 inputs)
- **Output:** AQI Category — `Good` / `Moderate` / `Poor`
- **Class Balancing:** `class_weight='balanced'` to handle imbalanced data
- **Cross-Validation Accuracy:** ~84%
- **Model File:** `aqi_model.pkl` (pre-trained, included in repo)

## ✨ Features

- 📊 **7 Live Sensor Cards** — Real-time display of CO, CO₂, NO, NO₂, Dust, Temperature, Humidity with sparkline trends
- 🎯 **AQI Score Banner** — Color-coded air quality status with gradient bar indicator
- 📈 **Sensor Trend Charts** — Line charts showing sensor history over last 15 readings
- 🍩 **AQI Distribution** — Donut chart showing Good/Moderate/Poor breakdown
- 📊 **Average Bar Charts** — Session average values for all 7 parameters
- 📉 **CO Concentration Trend** — Dedicated CO trend chart with warning threshold
- ⚠️ **Smart Alerts** — Automatic notifications for AQI changes and high-risk readings
- 🧠 **AI Insights** — Trend analysis and environmental recommendations
- 🏥 **System Insights** — Stat cards, gauge, and detailed analytics
- 📜 **Prediction History** — Filterable, paginated table of all readings
- 🔄 **Auto-refresh** — Data updates every 3 seconds
- 📱 **Fully Responsive** — Works on desktop, tablet, and mobile
- 🌐 **MongoDB Integration** — Persistent storage of sensor data and predictions
- 🎨 **Light Theme UI** — Clean, modern design with smooth animations

## 🚀 Getting Started

### Prerequisites

- **Python 3.10+** installed
- **Git** installed
- **MongoDB Atlas** account (optional — works without it using simulated data)

### Step 1: Clone the Repository

```bash
git clone https://github.com/sanjaycarmel23/AirSense.git
cd AirSense
```

### Step 2: Create a Python Virtual Environment

```bash
# Create virtual environment
python -m venv .venv

# Activate it
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

### Step 4: Configure MongoDB (Optional)

If you want persistent data storage, create a `.env` file in the project root:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
```

> Skip this step if you just want to run with simulated data.

### Step 5: Start the Server

```bash
python backend/app.py
```

You should see output like:
```
AQaaS — ML-Powered Air Quality Dashboard
==================================================
Dashboard:  http://localhost:5000
Latest:     http://localhost:5000/api/latest
Sensor In:  http://localhost:5000/api/sensor-data  [POST]
Predict:    http://localhost:5000/api/predict  [POST]
Model:      7 features
==================================================
```

### Step 6: Open the Dashboard

Open your browser and navigate to:

```
http://localhost:5000
```

The dashboard will start showing simulated data automatically. If MongoDB is connected, it will fetch real sensor data from the database.

## 📡 API Endpoints

| Method | Endpoint              | Description                          |
|--------|-----------------------|--------------------------------------|
| GET    | `/`                   | Serve the dashboard                  |
| GET    | `/api/health`         | Health check + model info            |
| GET    | `/api/latest`         | Latest sensor reading + ML prediction|
| POST   | `/api/sensor-data`    | Insert sensor data from IoT device   |
| POST   | `/api/predict`        | Manual prediction with custom values |
| GET    | `/api/sensor-history` | Recent sensor readings               |
| GET    | `/api/history`        | Prediction history                   |
| GET    | `/api/stats`          | Aggregate statistics                 |
| GET    | `/api/model-info`     | ML model metadata                    |

### Sending Sensor Data from IoT Device

```bash
curl -X POST http://localhost:5000/api/sensor-data \
  -H "Content-Type: application/json" \
  -d '{"dust":0.62,"co2":1289.25,"no":343.80,"no2":229.20,"co":716.25,"temperature":30,"humidity":60}'
```

### Manual Prediction

```bash
curl -X POST http://localhost:5000/api/predict \
  -H "Content-Type: application/json" \
  -d '{"dust":0.62,"co2":1289.25,"no":343.80,"no2":229.20,"co":716.25,"temperature":30,"humidity":60}'
```

## 📁 Project Structure

```
AirSense/
├── backend/
│   ├── __init__.py          # Package init
│   ├── app.py               # Flask server & API routes
│   ├── model.py             # ML model loading & prediction
│   └── database.py          # MongoDB CRUD operations
├── index.html               # Dashboard HTML (multi-page SPA)
├── index.css                # Design system & styles
├── core.js                  # Core state, API calls, utilities
├── app.js                   # Main app loop, navigation, tick
├── ui.js                    # UI updates, insights, stats
├── charts.js                # Canvas-based charts & graphs
├── aqi_model.pkl            # Pre-trained Random Forest model
├── data.csv                 # Training dataset
├── train_model.py           # Model training script
├── requirements.txt         # Python dependencies
├── .env                     # MongoDB connection (not in repo)
├── .gitignore               # Git ignore rules
├── LICENSE                  # MIT License
└── README.md                # This file
```

## 🛠️ Tech Stack

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JavaScript, Canvas API   |
| Backend    | Python, Flask, Flask-CORS                     |
| ML Model   | scikit-learn (Random Forest), joblib, pandas   |
| Database   | MongoDB Atlas (via pymongo)                   |
| Typography | Google Fonts (Inter)                          |

## 🔄 How It Works

1. **IoT sensors** send JSON data to `/api/sensor-data` (or simulated data is generated)
2. **Flask backend** stores the data in MongoDB and runs the ML model
3. **Random Forest model** predicts air quality as Good, Moderate, or Poor
4. **Frontend dashboard** polls `/api/latest` every 3 seconds for new readings
5. **Charts and UI** update in real-time with animations and trend analysis

## 🏋️ Retraining the Model

To retrain the model with updated data:

```bash
python train_model.py
```

This will:
- Load `data.csv` and preprocess features
- Train a balanced Random Forest classifier
- Evaluate with train/test split and 5-fold cross-validation
- Save the production model to `aqi_model.pkl`

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Sanjay Carmel**  
- GitHub: [@sanjaycarmel23](https://github.com/sanjaycarmel23)

---

*Built with ❤️ for cleaner air.*
