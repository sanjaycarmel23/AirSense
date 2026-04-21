# 🌬️ AirSense — IoT Air Quality Monitoring Dashboard

> **AQaaS** (Air Quality as a Service) — A real-time IoT-based air quality monitoring and control system with ML-powered AQI prediction.

---

## 📋 Overview

AirSense is a modern, responsive web dashboard designed to visualize real-time environmental data from IoT sensors. It features a **Random Forest machine learning model** that classifies air quality into three categories — **Good**, **Moderate**, or **Poor** — based on live sensor readings.

## 🔧 Sensors Used

| Sensor   | Measurement        | Unit     |
|----------|--------------------|----------|
| **MQ135**   | Gas Index (CO₂, NH₃, Benzene) | ppm      |
| **DSM501A** | Particulate Matter (PM2.5)    | µg/m³    |
| **DHT22**   | Temperature                    | °C       |
| **DHT22**   | Humidity                       | %RH      |

## 🤖 ML Model

- **Algorithm:** Random Forest Classifier  
- **Inputs:** Gas Index, Temperature, Humidity  
- **Output:** AQI Category (`Good` / `Moderate` / `Poor`)  
- **Status:** Active and integrated into the dashboard

## ✨ Features

- 🎯 **Real-time AQI Ring** — Animated ring indicator showing current air quality prediction
- 📊 **Sensor Cards** — Live-updating cards with sparkline mini-charts for each sensor
- 📈 **History Chart** — Line chart showing sensor trends over the last 60 seconds
- 🍩 **Distribution Donut** — Visual breakdown of AQI category frequency
- ⚠️ **Smart Alerts** — Automatic notifications on AQI changes and high-risk readings
- 🧠 **ML Model Panel** — Displays model details and current input feature values
- 🌙 **Dark Mode UI** — Premium glassmorphism design with smooth animations
- 📱 **Fully Responsive** — Works seamlessly on desktop, tablet, and mobile

## 🚀 Getting Started

### Prerequisites

No build tools or dependencies required. This is a **vanilla HTML/CSS/JS** project.

### Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/sanjaycarmel23/AirSense.git
   cd AirSense
   ```

2. Open `index.html` in your browser:
   ```bash
   # On Windows
   start index.html
   
   # On macOS
   open index.html
   
   # On Linux
   xdg-open index.html
   ```

   Or use a local server:
   ```bash
   npx serve .
   ```

## 📁 Project Structure

```
AirSense/
├── index.html      # Main HTML structure
├── index.css       # Design system & styles
├── app.js          # Dashboard logic, charts & ML simulation
├── .gitignore      # Git ignore rules
├── LICENSE         # MIT License
└── README.md       # This file
```

## 🛠️ Tech Stack

- **HTML5** — Semantic markup with accessibility in mind
- **CSS3** — Custom properties, glassmorphism, CSS Grid, Flexbox, animations
- **Vanilla JavaScript** — Zero dependencies, Canvas-based charts, real-time simulation
- **Google Fonts** — Inter typeface for clean typography

## 📸 Screenshots

> The dashboard features a dark-themed UI with real-time sensor cards, AQI prediction ring, history charts, and alert panels.

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

## 👤 Author

**Sanjay Carmel**  
- GitHub: [@sanjaycarmel23](https://github.com/sanjaycarmel23)

---

*Built with ❤️ for cleaner air.*
