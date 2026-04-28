/* Air Sense — Main App (imports core.js, ui.js, charts.js) */

/* ── Sidebar & Navigation ──────────────────────────────── */
function initSidebar(){
  const toggle=$('sidebar-toggle'),sidebar=$('sidebar');
  if(toggle&&sidebar){
    toggle.addEventListener('click',()=>{
      if(window.innerWidth<=768)sidebar.classList.toggle('mobile-open');
      else sidebar.classList.toggle('collapsed');
    });
  }
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.addEventListener('click',e=>{
      e.preventDefault();
      const page=item.dataset.page;if(!page)return;
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      const target=$('page-'+page);if(target)target.classList.add('active');
      if(window.innerWidth<=768&&sidebar)sidebar.classList.remove('mobile-open');
      if(page==='analytics'){setTimeout(()=>{drawHistory();drawDonut();drawAverages();drawCO();},50);}
      if(page==='history')renderHistory();
      if(page==='insights'){updateAIInsights();setTimeout(drawGauge,50);}
    });
  });
}

/* ── History Page ──────────────────────────────────────── */
function renderHistory(){
  const tbody=$('history-tbody'),countEl=$('history-count'),pagEl=$('pagination');
  if(!tbody)return;
  let data=state.allReadings.slice().reverse();
  if(state.activeFilter!=='all')data=data.filter(r=>r.category===state.activeFilter);
  const total=data.length,pages=Math.ceil(total/state.perPage)||1;
  if(state.currentPage>pages)state.currentPage=pages;
  const start=(state.currentPage-1)*state.perPage,pageData=data.slice(start,start+state.perPage);
  if(countEl)countEl.textContent=`Showing ${pageData.length} of ${total} records`;
  tbody.innerHTML=pageData.map((r,i)=>{
    const cls=r.category.toLowerCase();
    return `<tr><td>${start+i+1}</td><td>${r.time}</td><td>${r.co}</td><td>${r.co2}</td><td>${r.no}</td><td>${r.no2}</td><td>${r.dust}</td><td>${r.temperature}</td><td>${r.humidity}</td><td>${r.score}</td><td><span class="status-badge ${cls}">${r.category}</span></td></tr>`;
  }).join('');
  if(pagEl){
    let btns='';for(let i=1;i<=pages;i++)btns+=`<button class="page-btn${i===state.currentPage?' active':''}" data-p="${i}">${i}</button>`;
    pagEl.innerHTML=btns;
    pagEl.querySelectorAll('.page-btn').forEach(b=>b.addEventListener('click',()=>{state.currentPage=parseInt(b.dataset.p);renderHistory();}));
  }
}
function initHistoryFilters(){
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter=btn.dataset.filter;state.currentPage=1;renderHistory();
    });
  });
}

/* ── Main Tick — tries MongoDB first, falls back to simulated ── */
let lastDbTimestamp = null;

async function tick(){
  let data, category, confidence, score, source='simulated';

  // PRIMARY: Try fetching latest from MongoDB via /api/latest
  if(!state.pending){
    state.pending=true;
    try{
      const resp = await fetchLatest();
      if(resp && resp.sensor){
        const s = resp.sensor;
        data = {
          dust: s.dust || 0,
          co2: s.co2 || 0,
          no: s.no || 0,
          no2: s.no2 || 0,
          co: s.co || 0,
          temperature: s.temperature || 0,
          humidity: s.humidity || 0
        };
        category = resp.prediction;
        confidence = resp.confidence;
        score = resp.aqi_score;
        source = 'database';
        if(!state.backendConnected) setConn(true);

        // Skip if same timestamp (no new data in DB)
        if(s.timestamp && s.timestamp === lastDbTimestamp){
          state.pending=false;
          return; // no new data, skip update
        }
        lastDbTimestamp = s.timestamp;
      }
    }catch(e){
      // /api/latest failed — will fall back below
    }
    state.pending=false;
  }

  // FALLBACK: Generate simulated data + predict via POST or local
  if(!data){
    data = genData();
    try{
      const r = await fetchPrediction(data);
      category = r.prediction; confidence = r.confidence;
      if(!state.backendConnected) setConn(true);
    }catch{
      category = localPredict(data);
      if(state.backendConnected) setConn(false);
    }
    score = calcAqiScore(category, confidence);
    source = 'simulated';
  }

  // ── Update state ──
  const keys=['dust','co2','no','no2','co'];
  const envKeys=['temp','hum'];
  keys.forEach(k=>{state.history[k].push(data[k]);if(state.history[k].length>HISTORY_LEN)state.history[k].shift();});
  state.history.temp.push(data.temperature);if(state.history.temp.length>HISTORY_LEN)state.history.temp.shift();
  state.history.hum.push(data.humidity);if(state.history.hum.length>HISTORY_LEN)state.history.hum.shift();

  const now=new Date(),ts=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  state.history.timestamps.push(ts);if(state.history.timestamps.length>HISTORY_LEN)state.history.timestamps.shift();

  keys.forEach(k=>{state.lastVals[k].push(data[k]);if(state.lastVals[k].length>6)state.lastVals[k].shift();});
  state.lastVals.temp.push(data.temperature);if(state.lastVals.temp.length>6)state.lastVals.temp.shift();
  state.lastVals.hum.push(data.humidity);if(state.lastVals.hum.length>6)state.lastVals.hum.shift();

  state.aqiScore=score;state.distribution[category]++;state.totalReadings++;
  state.totals.dust+=data.dust;state.totals.co2+=data.co2;state.totals.no+=data.no;state.totals.no2+=data.no2;state.totals.co+=data.co;state.totals.temp+=data.temperature;state.totals.hum+=data.humidity;
  state.allReadings.push({dust:data.dust,co2:data.co2,no:data.no,no2:data.no2,co:data.co,temperature:data.temperature,humidity:data.humidity,score,category,time:ts,source});
  if(state.allReadings.length>200)state.allReadings.shift();

  // ── Update UI ──
  animateVal($('val-co'),data.co);
  animateVal($('val-co2'),data.co2);
  animateVal($('val-no'),typeof data.no==='number'?data.no.toFixed(1):data.no);
  animateVal($('val-no2'),typeof data.no2==='number'?data.no2.toFixed(1):data.no2);
  animateVal($('val-dust'),typeof data.dust==='number'?data.dust.toFixed(2):data.dust);
  animateVal($('val-temp'),typeof data.temperature==='number'?data.temperature.toFixed(1):data.temperature);
  animateVal($('val-hum'),typeof data.humidity==='number'?data.humidity.toFixed(1):data.humidity);
  updateAQI(category,score);
  const tsEl=$('header-timestamp');
  if(tsEl) tsEl.textContent=`Last updated: ${ts}` + (source==='database'?' · from DB':'');

  updateTrend('co',state.lastVals.co,COLORS.co);
  updateTrend('co2',state.lastVals.co2,COLORS.co2);
  updateTrend('no',state.lastVals.no,COLORS.no);
  updateTrend('no2',state.lastVals.no2,COLORS.no2);
  updateTrend('dust',state.lastVals.dust,COLORS.dust);
  updateTrend('temp',state.lastVals.temp,COLORS.temp);
  updateTrend('hum',state.lastVals.hum,COLORS.hum);

  if(category!==state.lastCategory){
    const type=category==='Good'?'success':category==='Moderate'?'warning':'danger';
    addAlert(`AQI: ${category} — CO:${data.co} CO₂:${data.co2} NO:${data.no} NO₂:${data.no2}`,type);
  }
  state.lastCategory=category;
  if(data.co>1400)addAlert(`⚠ High CO: ${data.co} ppm`,'danger');
  if(data.co2>1400)addAlert(`⚠ High CO₂: ${data.co2} ppm`,'danger');
  if(data.no>400)addAlert(`⚠ High NO: ${data.no} ppb`,'danger');

  const activePage=document.querySelector('.page.active');
  if(activePage){
    const id=activePage.id;
    if(id==='page-dashboard'){updateSessionStats();updateInsights(data,category);}
    if(id==='page-analytics'){drawHistory();drawDonut();drawAverages();drawCO();}
    if(id==='page-insights'){updateAIInsights();drawGauge();}
  }
}

/* ── Init ──────────────────────────────────────────────── */
async function init(){
  const tsEl=$('header-timestamp');if(tsEl)tsEl.textContent='Last updated: --:--:--';
  initSidebar();
  initHistoryFilters();
  await checkHealth();

  if(state.dbConnected) addAlert('MongoDB connected — fetching live sensor data','success');
  else addAlert('MongoDB not connected — using simulated data','warning');

  tick();
  setInterval(tick,TICK_MS);
  setInterval(checkHealth,30000);
  const rb=$('refresh-btn');if(rb)rb.addEventListener('click',()=>tick());
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{drawHistory();drawAverages();drawCO();},150);});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
