/* ═══════════════════════════════════════════════════════════
   AQaaS — Dashboard Application Logic
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /* ── Constants ───────────────────────────────────────────── */
  const TICK_MS          = 2000;   // data refresh interval
  const HISTORY_LENGTH   = 30;     // data points on line chart
  const SPARKLINE_LENGTH = 12;     // data points per sparkline

  const COLORS = {
    gas:  '#f87171',
    pm:   '#fbbf24',
    temp: '#60a5fa',
    hum:  '#22d3ee',
    good:     '#34d399',
    moderate: '#fbbf24',
    poor:     '#f87171',
  };

  /* ── State ──────────────────────────────────────────────── */
  const state = {
    gas:  [], pm: [], temp: [], hum: [],
    history: { gas: [], temp: [], hum: [] },
    distribution: { Good: 0, Moderate: 0, Poor: 0 },
    totalReadings: 0,
    lastCategory: 'Good',
  };

  /* ── DOM refs ───────────────────────────────────────────── */
  const $ = (id) => document.getElementById(id);

  const dom = {
    valGas:      $('val-gas'),
    valPm:       $('val-pm'),
    valTemp:     $('val-temp'),
    valHum:      $('val-hum'),
    sparkGas:    $('spark-gas'),
    sparkPm:     $('spark-pm'),
    sparkTemp:   $('spark-temp'),
    sparkHum:    $('spark-hum'),
    aqiCategory: $('aqi-category'),
    aqiDesc:     $('aqi-desc'),
    aqiRingFill: $('aqi-ring-fill'),
    aqiIndicator:$('aqi-bar-indicator'),
    miGas:       $('mi-gas'),
    miTemp:      $('mi-temp'),
    miHum:       $('mi-hum'),
    timestamp:   $('header-timestamp'),
    alertsList:  $('alerts-list'),
    donutCenter: $('donut-center'),
    donutLegend: $('donut-legend'),
    canvasHistory: $('canvas-history'),
    canvasDonut:   $('canvas-donut'),
  };

  /* ── Sensor Simulation ──────────────────────────────────── */
  function randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function generateSensorData() {
    // Simulate realistic-ish values with occasional spikes
    const spike = Math.random() < 0.08;
    return {
      gas:  Math.round(randomInRange(spike ? 350 : 80, spike ? 600 : 280)),
      pm:   Math.round(randomInRange(spike ? 80 : 10, spike ? 180 : 70) * 10) / 10,
      temp: Math.round(randomInRange(22, 38) * 10) / 10,
      hum:  Math.round(randomInRange(30, 75) * 10) / 10,
    };
  }

  /* ── ML Prediction (simplified Random Forest heuristic) ── */
  function predictAQI(gas, temp, hum) {
    // Simulates a Random Forest prediction based on sensor thresholds
    let score = 0;

    // Gas contribution (heaviest weight)
    if (gas > 400) score += 3;
    else if (gas > 250) score += 2;
    else if (gas > 150) score += 1;

    // Temperature contribution
    if (temp > 35 || temp < 18) score += 1;
    if (temp > 40) score += 1;

    // Humidity contribution
    if (hum > 70 || hum < 25) score += 1;

    if (score >= 4) return 'Poor';
    if (score >= 2) return 'Moderate';
    return 'Good';
  }

  const AQI_META = {
    Good: {
      desc: 'Air quality is satisfactory and poses little or no risk.',
      gradient: 'var(--grad-good)',
      color: COLORS.good,
      ringPct: 0.33,
      barPos: '16.6%',
    },
    Moderate: {
      desc: 'Air quality is acceptable; some pollutants may pose a moderate concern for sensitive groups.',
      gradient: 'var(--grad-moderate)',
      color: COLORS.moderate,
      ringPct: 0.66,
      barPos: '50%',
    },
    Poor: {
      desc: 'Air quality is poor. Everyone may begin to experience health effects.',
      gradient: 'var(--grad-poor)',
      color: COLORS.poor,
      ringPct: 1.0,
      barPos: '83.3%',
    },
  };

  /* ── Sparkline Renderer (Canvas-based) ──────────────────── */
  function renderSparkline(container, data, color) {
    // Create or reuse canvas
    let canvas = container.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width  = container.clientWidth || 200;
      canvas.height = 32;
      canvas.style.width = '100%';
      canvas.style.height = '32px';
      container.appendChild(canvas);
    }

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) return;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = w / (data.length - 1);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, 'transparent');

    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Fill area under line
    ctx.lineTo((data.length - 1) * step, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Dot on last point
    const lastX = (data.length - 1) * step;
    const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /* ── History Line Chart ─────────────────────────────────── */
  function drawHistoryChart() {
    const canvas = dom.canvasHistory;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width - 48;  // padding
    const h = 200;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const datasets = [
      { data: state.history.gas,  color: COLORS.gas,  label: 'Gas' },
      { data: state.history.temp, color: COLORS.temp, label: 'Temp' },
      { data: state.history.hum,  color: COLORS.hum,  label: 'Hum' },
    ];

    // Y-axis grid
    const padLeft = 36;
    const padBottom = 24;
    const chartW = w - padLeft - 10;
    const chartH = h - padBottom - 10;

    // Find global min/max across all datasets
    let allVals = [];
    datasets.forEach(ds => allVals.push(...ds.data));
    if (allVals.length === 0) return;
    let gMin = Math.min(...allVals);
    let gMax = Math.max(...allVals);
    const range = gMax - gMin || 1;
    gMin -= range * 0.05;
    gMax += range * 0.05;
    const yRange = gMax - gMin;

    // Grid lines
    const gridLines = 5;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridLines; i++) {
      const val = gMin + (yRange / gridLines) * i;
      const y = 10 + chartH - (chartH / gridLines) * i;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillText(Math.round(val), padLeft - 6, y + 3);
    }

    // Draw datasets
    datasets.forEach(ds => {
      if (ds.data.length < 2) return;
      const step = chartW / (HISTORY_LENGTH - 1);

      // Gradient fill under line
      const grad = ctx.createLinearGradient(0, 10, 0, 10 + chartH);
      grad.addColorStop(0, ds.color + '18');
      grad.addColorStop(1, 'transparent');

      ctx.beginPath();
      ds.data.forEach((v, i) => {
        const x = padLeft + i * step;
        const y = 10 + chartH - ((v - gMin) / yRange) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const lastIdx = ds.data.length - 1;
      ctx.lineTo(padLeft + lastIdx * step, 10 + chartH);
      ctx.lineTo(padLeft, 10 + chartH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ds.data.forEach((v, i) => {
        const x = padLeft + i * step;
        const y = 10 + chartH - ((v - gMin) / yRange) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = ds.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // End dot
      const ly = 10 + chartH - ((ds.data[lastIdx] - gMin) / yRange) * chartH;
      ctx.beginPath();
      ctx.arc(padLeft + lastIdx * step, ly, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = ds.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(padLeft + lastIdx * step, ly, 6, 0, Math.PI * 2);
      ctx.fillStyle = ds.color + '25';
      ctx.fill();
    });
  }

  /* ── Donut Chart ────────────────────────────────────────── */
  function drawDonutChart() {
    const canvas = dom.canvasDonut;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 180 * dpr;
    canvas.height = 180 * dpr;
    canvas.style.width = '180px';
    canvas.style.height = '180px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 180, 180);

    const total = state.totalReadings || 1;
    const data = [
      { label: 'Good',     value: state.distribution.Good,     color: COLORS.good },
      { label: 'Moderate', value: state.distribution.Moderate, color: COLORS.moderate },
      { label: 'Poor',     value: state.distribution.Poor,     color: COLORS.poor },
    ];

    const cx = 90, cy = 90, r = 70, thickness = 18;
    let startAngle = -Math.PI / 2;

    data.forEach(seg => {
      const sweep = (seg.value / total) * Math.PI * 2;
      if (sweep === 0) return;

      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
      ctx.arc(cx, cy, r - thickness, startAngle + sweep, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      startAngle += sweep;
    });

    // Empty state ring
    if (state.totalReadings === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.arc(cx, cy, r - thickness, Math.PI * 2, 0, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fill();
    }

    // Update center text
    dom.donutCenter.innerHTML = `${state.totalReadings}<br><small>readings</small>`;

    // Update legend
    dom.donutLegend.innerHTML = data.map(d =>
      `<span><span class="legend-dot" style="background:${d.color}"></span>${d.label}: ${d.value}</span>`
    ).join('');
  }

  /* ── Value Animator ─────────────────────────────────────── */
  function animateValue(el, newVal) {
    el.style.transition = 'none';
    el.style.opacity = '0.4';
    el.style.transform = 'translateY(-4px)';
    requestAnimationFrame(() => {
      el.textContent = newVal;
      el.style.transition = 'opacity 0.35s, transform 0.35s';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }

  /* ── Alerts ─────────────────────────────────────────────── */
  function addAlert(msg, type = 'info') {
    const li = document.createElement('li');
    li.className = `alert-item ${type}`;
    li.textContent = msg;
    dom.alertsList.prepend(li);
    // Keep max 5 alerts
    while (dom.alertsList.children.length > 5) {
      dom.alertsList.removeChild(dom.alertsList.lastChild);
    }
  }

  /* ── AQI Ring Update ────────────────────────────────────── */
  function updateAQIRing(category) {
    const meta = AQI_META[category];
    const circumference = 2 * Math.PI * 70; // 439.82
    const offset = circumference * (1 - meta.ringPct);

    dom.aqiRingFill.style.strokeDashoffset = offset;
    dom.aqiRingFill.style.stroke = meta.color;

    dom.aqiCategory.textContent = category;
    dom.aqiCategory.style.background = meta.gradient;
    dom.aqiCategory.style.webkitBackgroundClip = 'text';
    dom.aqiCategory.style.webkitTextFillColor = 'transparent';
    dom.aqiCategory.style.backgroundClip = 'text';

    dom.aqiDesc.textContent = meta.desc;
    dom.aqiIndicator.style.left = meta.barPos;
  }

  /* ── Tick ────────────────────────────────────────────────── */
  function tick() {
    const data = generateSensorData();

    // Push to sparkline buffers
    ['gas', 'pm', 'temp', 'hum'].forEach(key => {
      state[key].push(data[key]);
      if (state[key].length > SPARKLINE_LENGTH) state[key].shift();
    });

    // Push to history
    ['gas', 'temp', 'hum'].forEach(key => {
      state.history[key].push(data[key]);
      if (state.history[key].length > HISTORY_LENGTH) state.history[key].shift();
    });

    // Predict
    const category = predictAQI(data.gas, data.temp, data.hum);
    state.distribution[category]++;
    state.totalReadings++;

    // Alerts on category change
    if (category !== state.lastCategory) {
      const type = category === 'Good' ? 'success' : category === 'Moderate' ? 'warning' : 'danger';
      addAlert(`AQI shifted to ${category} — Gas: ${data.gas} ppm, Temp: ${data.temp}°C, Hum: ${data.hum}%`, type);
      state.lastCategory = category;
    }

    // High gas alert
    if (data.gas > 450) {
      addAlert(`⚠ High gas reading detected: ${data.gas} ppm`, 'danger');
    }

    // Update values
    animateValue(dom.valGas, data.gas);
    animateValue(dom.valPm, data.pm.toFixed(1));
    animateValue(dom.valTemp, data.temp.toFixed(1));
    animateValue(dom.valHum, data.hum.toFixed(1));

    // Model inputs
    dom.miGas.textContent  = data.gas;
    dom.miTemp.textContent = data.temp.toFixed(1) + ' °C';
    dom.miHum.textContent  = data.hum.toFixed(1) + ' %';

    // Timestamp
    dom.timestamp.textContent = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });

    // AQI
    updateAQIRing(category);

    // Sparklines
    renderSparkline(dom.sparkGas,  state.gas,  COLORS.gas);
    renderSparkline(dom.sparkPm,   state.pm,   COLORS.pm);
    renderSparkline(dom.sparkTemp, state.temp,  COLORS.temp);
    renderSparkline(dom.sparkHum,  state.hum,   COLORS.hum);

    // Charts
    drawHistoryChart();
    drawDonutChart();
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    // Set initial timestamp
    dom.timestamp.textContent = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });

    // First tick immediately, then repeat
    tick();
    setInterval(tick, TICK_MS);

    // Handle resize for history chart
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(drawHistoryChart, 150);
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
