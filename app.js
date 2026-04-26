/* ═══════════════════════════════════════════════════════════
   Air Sense — Dashboard Logic (Light Theme + ML Backend)
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const TICK_MS = 3000, HISTORY_LEN = 15, API_BASE = 'http://localhost:5000/api';
  const COLORS = { gas:'#3b82f6', temp:'#f97316', hum:'#06b6d4', good:'#10b981', moderate:'#eab308', poor:'#ef4444' };

  const state = {
    history: { gas:[], temp:[], hum:[], timestamps:[] },
    distribution: { Good:0, Moderate:0, Poor:0 },
    totals: { gas:0, temp:0, hum:0 },
    totalReadings:0, lastCategory:'Good', backendConnected:false, pending:false, aqiScore:0,
    lastVals: { gas:[], temp:[], hum:[] }
  };

  const $ = id => document.getElementById(id);
  const dom = {
    valGas:$('val-gas'), valTemp:$('val-temp'), valHum:$('val-hum'), valAqi:$('val-aqi'),
    aqiCategory:$('aqi-category'), aqiDesc:$('aqi-desc'), aqiScoreDisplay:$('aqi-score-display'),
    aqiBadgeLabel:$('aqi-badge-label'), aqiBadgeScore:$('aqi-badge-score'),
    aqiBanner:$('aqi-banner'), aqiBannerIcon:$('aqi-banner-icon'), aqiBarIndicator:$('aqi-bar-indicator'),
    timestamp:$('header-timestamp'), connectionBadge:$('connection-badge'),
    canvasHistory:$('canvas-history'), canvasDonut:$('canvas-donut'), canvasAvg:$('canvas-averages'),
    donutLegend:$('donut-legend'),
    avgGas:$('avg-gas'), avgTemp:$('avg-temp'), avgHum:$('avg-hum'), dataPoints:$('data-points'),
    insightsList:$('insights-list'), alertsList:$('alerts-list'),
    refreshBtn:$('refresh-btn'), aqiBadge:$('aqi-badge')
  };

  /* ── API ─────────────────────────────────────────────── */
  async function fetchPrediction(gas, temp, hum) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    try {
      const r = await fetch(`${API_BASE}/predict`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({gas_index:gas, temperature:temp, humidity:hum}), signal:c.signal
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch(e) { clearTimeout(t); throw e; }
  }

  async function checkHealth() {
    try {
      const r = await fetch(`${API_BASE}/health`, {signal:AbortSignal.timeout(3000)});
      if (r.ok) { const d = await r.json(); setConn(d.status==='ok'&&d.model_loaded); return; }
    } catch {}
    setConn(false);
  }

  function setConn(ok) {
    const was = state.backendConnected; state.backendConnected = ok;
    if (dom.connectionBadge) {
      const dot = dom.connectionBadge.querySelector('.pulse-dot');
      const lbl = dom.connectionBadge.querySelector('span:last-child');
      if (ok) { dom.connectionBadge.style.borderColor='var(--green)'; dom.connectionBadge.style.color='var(--green-dark)'; dom.connectionBadge.style.background='var(--green-light)'; if(dot)dot.style.background='var(--green)'; if(lbl)lbl.textContent='Live'; }
      else { dom.connectionBadge.style.borderColor='var(--orange)'; dom.connectionBadge.style.color='var(--orange)'; dom.connectionBadge.style.background='var(--orange-light)'; if(dot)dot.style.background='var(--orange)'; if(lbl)lbl.textContent='Offline'; }
    }
    if (ok && !was) addAlert('ML backend connected — predictions active', 'success');
    else if (!ok && was) addAlert('ML backend disconnected — using fallback', 'warning');
  }

  /* ── Sensors ─────────────────────────────────────────── */
  function rng(a,b){return a+Math.random()*(b-a)}
  function genData() {
    // Model boundaries: Gas <50 → Good, 50-80 → Moderate, >80 → Poor
    const r = Math.random();
    const gas = r < 0.4 ? Math.round(rng(5, 45))      // 40% → Good range
              : r < 0.65 ? Math.round(rng(45, 85))     // 25% → Moderate range
              : Math.round(rng(85, 200));               // 35% → Poor range
    return { gas, temp:Math.round(rng(15,35)*10)/10, hum:Math.round(rng(20,75)*10)/10 };
  }

  function localPredict(g,t,h) {
    let s=0; if(g>400)s+=3;else if(g>250)s+=2;else if(g>150)s+=1;
    if(t>35||t<18)s+=1; if(t>40)s+=1; if(h>70||h<25)s+=1;
    return s>=4?'Poor':s>=2?'Moderate':'Good';
  }

  function calcAqiScore(category, confidence) {
    if (!confidence) return category==='Good'?25:category==='Moderate'?100:200;
    const gConf=confidence.Good||0, mConf=confidence.Moderate||0, pConf=confidence.Poor||0;
    return Math.round(gConf*25 + mConf*100 + pConf*250);
  }

  const META = {
    Good:{ desc:'Air quality is satisfactory and poses little or no health risk.', color:COLORS.good, barPct:8 },
    Moderate:{ desc:'Moderate air quality. Sensitive groups may experience effects.', color:COLORS.moderate, barPct:40 },
    Poor:{ desc:'Air quality is poor. Everyone may experience health effects.', color:COLORS.poor, barPct:80 }
  };

  /* ── Mini trend lines ────────────────────────────────── */
  function updateTrend(id, vals, color) {
    const el = document.querySelector(`#trend-line-${id}`);
    if (!el || vals.length < 2) return;
    const min=Math.min(...vals), max=Math.max(...vals), range=max-min||1;
    const pts = vals.slice(-6).map((v,i,a) => `${(i/(a.length-1))*24},${14-((v-min)/range)*12}`).join(' ');
    el.setAttribute('points', pts);
    el.setAttribute('stroke', color);
  }

  /* ── History Chart ───────────────────────────────────── */
  function drawHistory() {
    const canvas=dom.canvasHistory, dpr=window.devicePixelRatio||1;
    const rect=canvas.parentElement.getBoundingClientRect();
    const w=rect.width-44, h=190;
    canvas.width=w*dpr; canvas.height=h*dpr; canvas.style.width=w+'px'; canvas.style.height=h+'px';
    const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);

    const sets=[{data:state.history.gas,color:COLORS.gas},{data:state.history.temp,color:COLORS.temp},{data:state.history.hum,color:COLORS.hum}];
    const pL=40, pB=30, cW=w-pL-10, cH=h-pB-10;
    let all=[]; sets.forEach(s=>all.push(...s.data));
    if(!all.length) return;
    let gMin=Math.min(...all), gMax=Math.max(...all), range=gMax-gMin||1;
    gMin-=range*0.08; gMax+=range*0.08; const yR=gMax-gMin;

    // Grid
    ctx.font='10px Inter,sans-serif'; ctx.textAlign='right';
    for(let i=0;i<=5;i++){
      const val=gMin+(yR/5)*i, y=10+cH-(cH/5)*i;
      ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=0.5; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(w-10,y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle='#94a3b8'; ctx.fillText(Math.round(val),pL-6,y+3);
    }

    // Time labels
    const ts=state.history.timestamps;
    if(ts.length>1){
      ctx.textAlign='center'; ctx.fillStyle='#94a3b8'; ctx.font='9px Inter,sans-serif';
      const step=cW/(HISTORY_LEN-1);
      ts.forEach((t,i)=>{ if(i%2===0||i===ts.length-1) ctx.fillText(t,pL+i*step,h-6); });
    }

    // Lines
    sets.forEach(ds=>{
      if(ds.data.length<2) return;
      const step=cW/(HISTORY_LEN-1);
      ctx.beginPath();
      ds.data.forEach((v,i)=>{
        const x=pL+i*step, y=10+cH-((v-gMin)/yR)*cH;
        i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      });
      ctx.strokeStyle=ds.color; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
      // End dot
      const li=ds.data.length-1, ly=10+cH-((ds.data[li]-gMin)/yR)*cH;
      ctx.beginPath(); ctx.arc(pL+li*step,ly,3,0,Math.PI*2); ctx.fillStyle=ds.color; ctx.fill();
    });
  }

  /* ── Donut Chart ─────────────────────────────────────── */
  function drawDonut() {
    const canvas=dom.canvasDonut, dpr=window.devicePixelRatio||1;
    canvas.width=160*dpr; canvas.height=160*dpr; canvas.style.width='160px'; canvas.style.height='160px';
    const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,160,160);
    const total=state.totalReadings||1;
    const data=[{l:'Good',v:state.distribution.Good,c:COLORS.good},{l:'Moderate',v:state.distribution.Moderate,c:COLORS.moderate},{l:'Poor',v:state.distribution.Poor,c:COLORS.poor}];
    const cx=80,cy=80,r=65,th=20; let sa=-Math.PI/2;
    data.forEach(seg=>{
      const sw=(seg.v/total)*Math.PI*2; if(!sw) return;
      ctx.beginPath(); ctx.arc(cx,cy,r,sa,sa+sw); ctx.arc(cx,cy,r-th,sa+sw,sa,true);
      ctx.closePath(); ctx.fillStyle=seg.c; ctx.fill(); sa+=sw;
    });
    if(!state.totalReadings){ ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.arc(cx,cy,r-th,Math.PI*2,0,true); ctx.closePath(); ctx.fillStyle='#e2e8f0'; ctx.fill(); }

    dom.donutLegend.innerHTML = data.filter(d=>d.v>0).map(d =>
      `<div class="donut-legend-item"><div class="donut-legend-left"><span class="legend-dot" style="background:${d.c}"></span>${d.l}</div><span class="donut-legend-count">${d.v}</span></div>`
    ).join('');
  }

  /* ── Average Bar Chart ───────────────────────────────── */
  function drawAverages() {
    const canvas=dom.canvasAvg, dpr=window.devicePixelRatio||1;
    const rect=canvas.parentElement.getBoundingClientRect();
    const w=rect.width-44, h=170;
    canvas.width=w*dpr; canvas.height=h*dpr; canvas.style.width=w+'px'; canvas.style.height=h+'px';
    const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
    if(!state.totalReadings) return;

    const n=state.totalReadings;
    const vals=[
      {label:'Gas Index',value:state.totals.gas/n,color:COLORS.gas},
      {label:'Temperature',value:state.totals.temp/n,color:COLORS.temp},
      {label:'Humidity',value:state.totals.hum/n,color:COLORS.hum}
    ];
    const maxVal=Math.max(...vals.map(v=>v.value),1);
    const pL=40, pB=30, cH=h-pB-10, barW=50, gap=(w-pL-10)/(vals.length);

    // Y grid
    ctx.font='10px Inter,sans-serif'; ctx.textAlign='right'; ctx.fillStyle='#94a3b8';
    const gridMax=Math.ceil(maxVal/30)*30;
    for(let i=0;i<=4;i++){
      const val=(gridMax/4)*i, y=10+cH-(cH/4)*i;
      ctx.strokeStyle='#e2e8f0'; ctx.lineWidth=0.5; ctx.setLineDash([3,3]);
      ctx.beginPath(); ctx.moveTo(pL,y); ctx.lineTo(w-10,y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillText(Math.round(val),pL-6,y+3);
    }

    // Bars
    vals.forEach((v,i)=>{
      const x=pL+gap*i+gap/2-barW/2;
      const barH=(v.value/gridMax)*cH;
      const y=10+cH-barH;
      // Bar with rounded top
      ctx.beginPath();
      const r=6;
      ctx.moveTo(x,10+cH); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.lineTo(x+barW-r,y); ctx.quadraticCurveTo(x+barW,y,x+barW,y+r);
      ctx.lineTo(x+barW,10+cH); ctx.closePath();
      ctx.fillStyle=v.color; ctx.fill();
      // Label
      ctx.fillStyle='#64748b'; ctx.font='11px Inter,sans-serif'; ctx.textAlign='center';
      ctx.fillText(v.label, x+barW/2, h-8);
    });
  }

  /* ── Update UI ───────────────────────────────────────── */
  function updateAQI(category, score) {
    const m=META[category];
    dom.aqiCategory.textContent=category;
    dom.aqiScoreDisplay.textContent=score;
    dom.aqiDesc.textContent=m.desc;
    dom.valAqi.textContent=score;
    dom.aqiBadgeLabel.textContent=category;
    dom.aqiBadgeScore.textContent=score;

    // Banner class
    dom.aqiBanner.className='aqi-banner'+(category!=='Good'?' '+category.toLowerCase():'');
    // Badge colors
    const bc=m.color;
    dom.aqiBadge.style.borderColor=bc; dom.aqiBadge.style.color=bc;
    dom.aqiBadge.querySelector('.aqi-badge-dot').style.background=bc;
    // Banner icon color
    dom.aqiBannerIcon.style.color=bc;
    dom.aqiBannerIcon.style.background=category==='Good'?'rgba(16,185,129,0.15)':category==='Moderate'?'rgba(234,179,8,0.15)':'rgba(239,68,68,0.15)';
    // Bar indicator
    dom.aqiBarIndicator.style.left=Math.min(score/300*100,98)+'%';
  }

  function animateVal(el,val) {
    el.style.transition='none'; el.style.opacity='0.3'; el.style.transform='translateY(-3px)';
    requestAnimationFrame(()=>{ el.textContent=val; el.style.transition='opacity 0.3s,transform 0.3s'; el.style.opacity='1'; el.style.transform='translateY(0)'; });
  }

  function updateInsights(data, category) {
    const items = [];
    if (data.gas > 300) items.push({t:'High gas concentration detected. Consider ventilation.', c:'danger'});
    else if (data.gas > 150) items.push({t:'Moderate gas concentration detected. Monitor for further increases.', c:'warning'});
    else items.push({t:'Gas levels are within normal range.', c:''});

    if (data.temp > 35) items.push({t:'Temperature is above comfortable range.', c:'warning'});
    if (data.hum > 70) items.push({t:'High humidity detected. Consider dehumidification.', c:'warning'});
    else if (data.hum < 30) items.push({t:'Low humidity detected. Consider using a humidifier.', c:'warning'});

    dom.insightsList.innerHTML = items.map(i =>
      `<div class="insight-item"><span class="insight-dot ${i.c}"></span><p>${i.t}</p></div>`
    ).join('');
  }

  function addAlert(msg, type = 'info') {
    const li = document.createElement('li');
    li.className = `alert-item ${type}`;
    const time = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    li.textContent = `[${time}] ${msg}`;
    dom.alertsList.prepend(li);
    while (dom.alertsList.children.length > 8) dom.alertsList.removeChild(dom.alertsList.lastChild);
  }

  function updateSessionStats() {
    const n=state.totalReadings; if(!n) return;
    dom.avgGas.innerHTML = (state.totals.gas/n).toFixed(1)+' <small>ppm</small>';
    dom.avgTemp.innerHTML = (state.totals.temp/n).toFixed(1)+' <small>°C</small>';
    dom.avgHum.innerHTML = (state.totals.hum/n).toFixed(1)+' <small>%</small>';
    dom.dataPoints.textContent = n;
  }

  /* ── Tick ─────────────────────────────────────────────── */
  async function tick() {
    const data = genData();
    // History
    ['gas','temp','hum'].forEach(k=>{ state.history[k].push(data[k]); if(state.history[k].length>HISTORY_LEN)state.history[k].shift(); });
    const now=new Date(); const ts=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
    state.history.timestamps.push(ts); if(state.history.timestamps.length>HISTORY_LEN)state.history.timestamps.shift();
    // Trend buffers
    ['gas','temp','hum'].forEach(k=>{ state.lastVals[k].push(data[k]); if(state.lastVals[k].length>6)state.lastVals[k].shift(); });

    // Predict
    let category, confidence;
    if(!state.pending) {
      state.pending=true;
      try {
        const r = await fetchPrediction(data.gas,data.temp,data.hum);
        category=r.prediction; confidence=r.confidence;
        if(!state.backendConnected) setConn(true);
      } catch { category=localPredict(data.gas,data.temp,data.hum); if(state.backendConnected)setConn(false); }
      finally { state.pending=false; }
    } else { category=localPredict(data.gas,data.temp,data.hum); }

    const score = calcAqiScore(category,confidence);
    state.aqiScore=score;
    state.distribution[category]++;
    state.totalReadings++;
    state.totals.gas+=data.gas; state.totals.temp+=data.temp; state.totals.hum+=data.hum;

    // Update UI
    animateVal(dom.valGas,data.gas);
    animateVal(dom.valTemp,data.temp.toFixed(1));
    animateVal(dom.valHum,data.hum.toFixed(1));
    updateAQI(category,score);
    dom.timestamp.textContent='Last updated: '+ts;

    updateTrend('gas',state.lastVals.gas,COLORS.gas);
    updateTrend('temp',state.lastVals.temp,COLORS.temp);
    updateTrend('hum',state.lastVals.hum,COLORS.hum);

    // Alerts on category change
    if (category !== state.lastCategory) {
      const type = category==='Good'?'success':category==='Moderate'?'warning':'danger';
      addAlert(`AQI shifted to ${category} — Gas: ${data.gas} ppm, Temp: ${data.temp}°C, Hum: ${data.hum}%`, type);
      state.lastCategory = category;
    }
    if (data.gas > 450) addAlert(`⚠ High gas reading: ${data.gas} ppm`, 'danger');

    drawHistory(); drawDonut(); drawAverages();
    updateSessionStats(); updateInsights(data,category);
  }

  /* ── Init ─────────────────────────────────────────────── */
  async function init() {
    dom.timestamp.textContent='Last updated: --:--:--';
    await checkHealth();
    tick();
    setInterval(tick, TICK_MS);
    setInterval(checkHealth, 30000);
    dom.refreshBtn?.addEventListener('click', ()=>tick());
    let rt; window.addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{drawHistory();drawAverages();},150); });
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
