function updateAQI(cat,score){
  const m=META[cat],d=$('aqi-category'),sd=$('aqi-score-display'),desc=$('aqi-desc'),va=$('val-aqi'),bl=$('aqi-badge-label'),bs=$('aqi-badge-score'),bn=$('aqi-banner'),bi=$('aqi-banner-icon'),bar=$('aqi-bar-indicator'),badge=$('aqi-badge');
  if(d)d.textContent=cat;if(sd)sd.textContent=score;if(desc)desc.textContent=m.desc;if(va)va.textContent=score;
  if(bl)bl.textContent=cat;if(bs)bs.textContent=score;
  if(bn)bn.className='aqi-banner'+(cat!=='Good'?' '+cat.toLowerCase():'');
  if(bi){bi.style.color=m.color;bi.style.background=cat==='Good'?'rgba(16,185,129,0.15)':cat==='Moderate'?'rgba(234,179,8,0.15)':'rgba(239,68,68,0.15)';}
  if(bar)bar.style.left=Math.min(score/300*100,98)+'%';
  if(badge){badge.style.borderColor=m.color;badge.style.color=m.color;const dot=badge.querySelector('.aqi-badge-dot');if(dot)dot.style.background=m.color;}
}
function updateInsights(data,cat){
  const items=[];
  if(data.gas>300)items.push({t:'High gas concentration detected. Consider ventilation.',c:'danger'});
  else if(data.gas>150)items.push({t:'Moderate gas concentration. Monitor for increases.',c:'warning'});
  else items.push({t:'Gas levels are within normal range.',c:''});
  if(data.pm25>55)items.push({t:'PM2.5 is unhealthy! Avoid outdoor activities.',c:'danger'});
  else if(data.pm25>25)items.push({t:'PM2.5 exceeds WHO safe limit (25 µg/m³).',c:'warning'});
  else items.push({t:'PM2.5 levels are within safe limits.',c:''});
  if(data.temp>35)items.push({t:'Temperature above comfortable range.',c:'warning'});
  if(data.hum>70)items.push({t:'High humidity. Consider dehumidification.',c:'warning'});
  else if(data.hum<30)items.push({t:'Low humidity. Consider using a humidifier.',c:'warning'});
  const el=$('insights-list');if(el)el.innerHTML=items.map(i=>`<div class="insight-item"><span class="insight-dot ${i.c}"></span><p>${i.t}</p></div>`).join('');
}
function updateSessionStats(){
  const n=state.totalReadings;if(!n)return;
  const ag=$('avg-gas'),at=$('avg-temp'),ah=$('avg-hum'),ap=$('avg-pm25'),dp=$('data-points');
  if(ag)ag.innerHTML=(state.totals.gas/n).toFixed(1)+' <small>ppm</small>';
  if(at)at.innerHTML=(state.totals.temp/n).toFixed(1)+' <small>°C</small>';
  if(ah)ah.innerHTML=(state.totals.hum/n).toFixed(1)+' <small>%</small>';
  if(ap)ap.innerHTML=(state.totals.pm25/n).toFixed(1)+' <small>µg/m³</small>';
  if(dp)dp.textContent=n;
  const ig=$('insight-avg-gas'),it=$('insight-avg-temp'),ih=$('insight-avg-hum'),ip=$('insight-avg-pm25');
  if(ig)ig.textContent=(state.totals.gas/n).toFixed(1);
  if(it)it.textContent=(state.totals.temp/n).toFixed(1)+'°C';
  if(ih)ih.textContent=(state.totals.hum/n).toFixed(1)+'%';
  if(ip)ip.textContent=(state.totals.pm25/n).toFixed(1);
}
function updateAIInsights(){
  const n=state.totalReadings,el=$('ai-insights-list');if(!el||n<3)return;
  const items=[];const avgGas=state.totals.gas/n,avgPm=state.totals.pm25/n,avgHum=state.totals.hum/n;
  const recent=state.allReadings.slice(-5);
  if(recent.length>=3){
    const gases=recent.map(r=>r.gas),pms=recent.map(r=>r.pm25);
    const gTrend=gases[gases.length-1]-gases[0],pTrend=pms[pms.length-1]-pms[0];
    if(gTrend>20)items.push({i:'📈',t:'Gas concentration trending upward. Air quality may be degrading.'});
    else if(gTrend<-20)items.push({i:'📉',t:'Gas concentration decreasing. Air quality improving.'});
    if(pTrend>10)items.push({i:'⚠️',t:'PM2.5 levels rising. Consider activating air purifier.'});
    else if(pTrend<-10)items.push({i:'✅',t:'PM2.5 levels declining. Particulate pollution reducing.'});
  }
  if(avgGas>200)items.push({i:'🔴',t:`Average gas index (${avgGas.toFixed(0)} ppm) is critically high.`});
  else if(avgGas<50)items.push({i:'🟢',t:`Average gas index (${avgGas.toFixed(0)} ppm) is excellent.`});
  if(avgPm>35)items.push({i:'😷',t:`Average PM2.5 (${avgPm.toFixed(1)} µg/m³) exceeds safe levels.`});
  if(avgHum>65)items.push({i:'💧',t:'Persistent high humidity may promote mold growth.'});
  const pct=state.distribution.Poor/Math.max(n,1)*100;
  if(pct>40)items.push({i:'🚨',t:`${pct.toFixed(0)}% of readings rated "Poor". Immediate action recommended.`});
  else if(pct<10)items.push({i:'🌿',t:`Only ${pct.toFixed(0)}% of readings rated "Poor". Environment is healthy.`});
  if(!items.length)items.push({i:'✨',t:'All parameters within normal ranges. Air quality is good.'});
  el.innerHTML=items.map(i=>`<div class="ai-insight-item"><span class="ai-insight-icon">${i.i}</span><p>${i.t}</p></div>`).join('');
}
