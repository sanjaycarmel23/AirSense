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
      if(page==='analytics'){setTimeout(()=>{drawHistory();drawDonut();drawAverages();drawPM25();},50);}
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
    return `<tr><td>${start+i+1}</td><td>${r.time}</td><td>${r.gas}</td><td>${r.temp}</td><td>${r.hum}</td><td>${r.pm25}</td><td>${r.score}</td><td><span class="status-badge ${cls}">${r.category}</span></td></tr>`;
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

/* ── Main Tick ─────────────────────────────────────────── */
async function tick(){
  const data=genData();
  ['gas','temp','hum','pm25'].forEach(k=>{state.history[k].push(data[k]);if(state.history[k].length>HISTORY_LEN)state.history[k].shift();});
  const now=new Date(),ts=now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  state.history.timestamps.push(ts);if(state.history.timestamps.length>HISTORY_LEN)state.history.timestamps.shift();
  ['gas','temp','hum','pm25'].forEach(k=>{state.lastVals[k].push(data[k]);if(state.lastVals[k].length>6)state.lastVals[k].shift();});
  let category,confidence;
  if(!state.pending){
    state.pending=true;
    try{const r=await fetchPrediction(data.gas,data.temp,data.hum,data.pm25);category=r.prediction;confidence=r.confidence;if(!state.backendConnected)setConn(true);}
    catch{category=localPredict(data.gas,data.temp,data.hum,data.pm25);if(state.backendConnected)setConn(false);}
    finally{state.pending=false;}
  }else{category=localPredict(data.gas,data.temp,data.hum,data.pm25);}
  const score=calcAqiScore(category,confidence);
  state.aqiScore=score;state.lastCategory=category;state.distribution[category]++;state.totalReadings++;
  state.totals.gas+=data.gas;state.totals.temp+=data.temp;state.totals.hum+=data.hum;state.totals.pm25+=data.pm25;
  state.allReadings.push({gas:data.gas,temp:data.temp,hum:data.hum,pm25:data.pm25,score,category,time:ts});
  if(state.allReadings.length>200)state.allReadings.shift();
  animateVal($('val-gas'),data.gas);
  animateVal($('val-temp'),data.temp.toFixed(1));
  animateVal($('val-hum'),data.hum.toFixed(1));
  animateVal($('val-pm25'),data.pm25.toFixed(1));
  updateAQI(category,score);
  const tsEl=$('header-timestamp');if(tsEl)tsEl.textContent='Last updated: '+ts;
  updateTrend('gas',state.lastVals.gas,COLORS.gas);
  updateTrend('temp',state.lastVals.temp,COLORS.temp);
  updateTrend('hum',state.lastVals.hum,COLORS.hum);
  updateTrend('pm25',state.lastVals.pm25,COLORS.pm25);
  if(category!==state.lastCategory||state.totalReadings===1){
    const type=category==='Good'?'success':category==='Moderate'?'warning':'danger';
    addAlert(`AQI: ${category} — Gas:${data.gas} Temp:${data.temp}°C Hum:${data.hum}% PM2.5:${data.pm25}`,type);
  }
  if(data.pm25>55)addAlert(`⚠ High PM2.5: ${data.pm25} µg/m³`,'danger');
  if(data.gas>450)addAlert(`⚠ High gas: ${data.gas} ppm`,'danger');
  // Only redraw visible charts
  const activePage=document.querySelector('.page.active');
  if(activePage){
    const id=activePage.id;
    if(id==='page-dashboard'){updateSessionStats();updateInsights(data,category);}
    if(id==='page-analytics'){drawHistory();drawDonut();drawAverages();drawPM25();}
    if(id==='page-insights'){updateAIInsights();drawGauge();}
  }
}

/* ── Init ──────────────────────────────────────────────── */
async function init(){
  const tsEl=$('header-timestamp');if(tsEl)tsEl.textContent='Last updated: --:--:--';
  initSidebar();
  initHistoryFilters();
  await checkHealth();
  tick();
  setInterval(tick,TICK_MS);
  setInterval(checkHealth,30000);
  const rb=$('refresh-btn');if(rb)rb.addEventListener('click',()=>tick());
  let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{drawHistory();drawAverages();drawPM25();},150);});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
