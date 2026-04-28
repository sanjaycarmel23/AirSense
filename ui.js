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
  if(data.co>1400)items.push({t:'High CO concentration detected. Consider ventilation.',c:'danger'});
  else if(data.co>900)items.push({t:'Moderate CO concentration. Monitor for increases.',c:'warning'});
  else items.push({t:'CO levels are within normal range.',c:''});
  if(data.co2>1400)items.push({t:'High CO₂ levels. Improve ventilation immediately.',c:'danger'});
  else if(data.co2>800)items.push({t:'CO₂ levels elevated. Consider opening windows.',c:'warning'});
  else items.push({t:'CO₂ levels are within safe limits.',c:''});
  if(data.no>400)items.push({t:'NO levels are dangerously high! Avoid exposure.',c:'danger'});
  else if(data.no>100)items.push({t:'NO levels above normal. Monitor closely.',c:'warning'});
  if(data.no2>180)items.push({t:'NO₂ levels unhealthy! Limit outdoor activities.',c:'danger'});
  else if(data.no2>80)items.push({t:'NO₂ levels slightly elevated.',c:'warning'});
  if(data.dust>1.5)items.push({t:'High dust concentration detected.',c:'danger'});
  else if(data.dust>0.8)items.push({t:'Moderate dust levels. Air filtration recommended.',c:'warning'});
  if(data.temperature>35)items.push({t:'Temperature above comfortable range.',c:'warning'});
  if(data.humidity>70)items.push({t:'High humidity. Consider dehumidification.',c:'warning'});
  else if(data.humidity<30)items.push({t:'Low humidity. Consider using a humidifier.',c:'warning'});
  const el=$('insights-list');if(el)el.innerHTML=items.map(i=>`<div class="insight-item"><span class="insight-dot ${i.c}"></span><p>${i.t}</p></div>`).join('');
}
function updateSessionStats(){
  const n=state.totalReadings;if(!n)return;
  const aco=$('avg-co'),aco2=$('avg-co2'),ano=$('avg-no'),ano2=$('avg-no2'),adust=$('avg-dust'),at=$('avg-temp'),ah=$('avg-hum'),dp=$('data-points');
  if(aco)aco.innerHTML=(state.totals.co/n).toFixed(1)+' <small>ppm</small>';
  if(aco2)aco2.innerHTML=(state.totals.co2/n).toFixed(1)+' <small>ppm</small>';
  if(ano)ano.innerHTML=(state.totals.no/n).toFixed(1)+' <small>ppb</small>';
  if(ano2)ano2.innerHTML=(state.totals.no2/n).toFixed(1)+' <small>ppb</small>';
  if(adust)adust.innerHTML=(state.totals.dust/n).toFixed(2)+' <small>mg/m³</small>';
  if(at)at.innerHTML=(state.totals.temp/n).toFixed(1)+' <small>°C</small>';
  if(ah)ah.innerHTML=(state.totals.hum/n).toFixed(1)+' <small>%</small>';
  if(dp)dp.textContent=n;
  const ig=$('insight-avg-co'),ig2=$('insight-avg-co2'),ino=$('insight-avg-no'),ino2=$('insight-avg-no2'),idust=$('insight-avg-dust'),it=$('insight-avg-temp'),ih=$('insight-avg-hum');
  if(ig)ig.textContent=(state.totals.co/n).toFixed(1);
  if(ig2)ig2.textContent=(state.totals.co2/n).toFixed(1);
  if(ino)ino.textContent=(state.totals.no/n).toFixed(1);
  if(ino2)ino2.textContent=(state.totals.no2/n).toFixed(1);
  if(idust)idust.textContent=(state.totals.dust/n).toFixed(2);
  if(it)it.textContent=(state.totals.temp/n).toFixed(1)+'°C';
  if(ih)ih.textContent=(state.totals.hum/n).toFixed(1)+'%';
}
function updateAIInsights(){
  const n=state.totalReadings,el=$('ai-insights-list');if(!el||n<3)return;
  const items=[];
  const avgCo=state.totals.co/n,avgCo2=state.totals.co2/n,avgNo=state.totals.no/n,avgHum=state.totals.hum/n;
  const recent=state.allReadings.slice(-5);
  if(recent.length>=3){
    const cos=recent.map(r=>r.co),co2s=recent.map(r=>r.co2);
    const coTrend=cos[cos.length-1]-cos[0],co2Trend=co2s[co2s.length-1]-co2s[0];
    if(coTrend>100)items.push({i:'📈',t:'CO concentration trending upward. Air quality may be degrading.'});
    else if(coTrend<-100)items.push({i:'📉',t:'CO concentration decreasing. Air quality improving.'});
    if(co2Trend>200)items.push({i:'⚠️',t:'CO₂ levels rising. Consider improving ventilation.'});
    else if(co2Trend<-200)items.push({i:'✅',t:'CO₂ levels declining. Ventilation is effective.'});
  }
  if(avgCo>1200)items.push({i:'🔴',t:`Average CO (${avgCo.toFixed(0)} ppm) is critically high.`});
  else if(avgCo<700)items.push({i:'🟢',t:`Average CO (${avgCo.toFixed(0)} ppm) is in safe range.`});
  if(avgCo2>1200)items.push({i:'😷',t:`Average CO₂ (${avgCo2.toFixed(0)} ppm) is elevated.`});
  if(avgNo>300)items.push({i:'🚨',t:`Average NO (${avgNo.toFixed(0)} ppb) is high. Check emission sources.`});
  if(avgHum>65)items.push({i:'💧',t:'Persistent high humidity may promote mold growth.'});
  const pct=state.distribution.Poor/Math.max(n,1)*100;
  if(pct>40)items.push({i:'🚨',t:`${pct.toFixed(0)}% of readings rated "Poor". Immediate action recommended.`});
  else if(pct<10)items.push({i:'🌿',t:`Only ${pct.toFixed(0)}% of readings rated "Poor". Environment is healthy.`});
  if(!items.length)items.push({i:'✨',t:'All parameters within normal ranges. Air quality is good.'});
  el.innerHTML=items.map(i=>`<div class="ai-insight-item"><span class="ai-insight-icon">${i.i}</span><p>${i.t}</p></div>`).join('');
}
