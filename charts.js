function drawHistory(){
  const canvas=$('canvas-history');if(!canvas)return;
  const dpr=window.devicePixelRatio||1,rect=canvas.parentElement.getBoundingClientRect();
  const w=rect.width-44,h=240;
  canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const sets=[{data:state.history.gas,color:COLORS.gas},{data:state.history.temp,color:COLORS.temp},{data:state.history.hum,color:COLORS.hum},{data:state.history.pm25,color:COLORS.pm25}];
  const pL=40,pB=30,cW=w-pL-10,cH=h-pB-10;
  let all=[];sets.forEach(s=>all.push(...s.data));if(!all.length)return;
  let gMin=Math.min(...all),gMax=Math.max(...all),range=gMax-gMin||1;
  gMin-=range*0.08;gMax+=range*0.08;const yR=gMax-gMin;
  ctx.font='10px Inter,sans-serif';ctx.textAlign='right';
  for(let i=0;i<=5;i++){const val=gMin+(yR/5)*i,y=10+cH-(cH/5)*i;ctx.strokeStyle='#e2e8f0';ctx.lineWidth=0.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(w-10,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#94a3b8';ctx.fillText(Math.round(val),pL-6,y+3);}
  const ts=state.history.timestamps;
  if(ts.length>1){ctx.textAlign='center';ctx.fillStyle='#94a3b8';ctx.font='9px Inter,sans-serif';const step=cW/(HISTORY_LEN-1);ts.forEach((t,i)=>{if(i%3===0||i===ts.length-1)ctx.fillText(t,pL+i*step,h-6);});}
  sets.forEach(ds=>{if(ds.data.length<2)return;const step=cW/(HISTORY_LEN-1);ctx.beginPath();ds.data.forEach((v,i)=>{const x=pL+i*step,y=10+cH-((v-gMin)/yR)*cH;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.strokeStyle=ds.color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();const li=ds.data.length-1,ly=10+cH-((ds.data[li]-gMin)/yR)*cH;ctx.beginPath();ctx.arc(pL+li*step,ly,3,0,Math.PI*2);ctx.fillStyle=ds.color;ctx.fill();});
}
function drawDonut(){
  const canvas=$('canvas-donut');if(!canvas)return;
  const dpr=window.devicePixelRatio||1;canvas.width=160*dpr;canvas.height=160*dpr;canvas.style.width='160px';canvas.style.height='160px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,160,160);
  const total=state.totalReadings||1;
  const data=[{l:'Good',v:state.distribution.Good,c:COLORS.good},{l:'Moderate',v:state.distribution.Moderate,c:COLORS.moderate},{l:'Poor',v:state.distribution.Poor,c:COLORS.poor}];
  const cx=80,cy=80,r=65,th=20;let sa=-Math.PI/2;
  data.forEach(seg=>{const sw=(seg.v/total)*Math.PI*2;if(!sw)return;ctx.beginPath();ctx.arc(cx,cy,r,sa,sa+sw);ctx.arc(cx,cy,r-th,sa+sw,sa,true);ctx.closePath();ctx.fillStyle=seg.c;ctx.fill();sa+=sw;});
  if(!state.totalReadings){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.arc(cx,cy,r-th,Math.PI*2,0,true);ctx.closePath();ctx.fillStyle='#e2e8f0';ctx.fill();}
  const dl=$('donut-legend');if(dl)dl.innerHTML=data.filter(d=>d.v>0).map(d=>`<div class="donut-legend-item"><div class="donut-legend-left"><span class="legend-dot" style="background:${d.c}"></span>${d.l}</div><span class="donut-legend-count">${d.v}</span></div>`).join('');
}
function drawAverages(){
  const canvas=$('canvas-averages');if(!canvas)return;
  const dpr=window.devicePixelRatio||1,rect=canvas.parentElement.getBoundingClientRect();
  const w=rect.width-44,h=170;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  if(!state.totalReadings)return;const n=state.totalReadings;
  const vals=[{label:'Gas Index',value:state.totals.gas/n,color:COLORS.gas},{label:'Temperature',value:state.totals.temp/n,color:COLORS.temp},{label:'Humidity',value:state.totals.hum/n,color:COLORS.hum},{label:'PM2.5',value:state.totals.pm25/n,color:COLORS.pm25}];
  const maxVal=Math.max(...vals.map(v=>v.value),1);const pL=40,pB=30,cH=h-pB-10,barW=40,gap=(w-pL-10)/vals.length;
  ctx.font='10px Inter,sans-serif';ctx.textAlign='right';ctx.fillStyle='#94a3b8';const gridMax=Math.ceil(maxVal/30)*30||30;
  for(let i=0;i<=4;i++){const val=(gridMax/4)*i,y=10+cH-(cH/4)*i;ctx.strokeStyle='#e2e8f0';ctx.lineWidth=0.5;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(pL,y);ctx.lineTo(w-10,y);ctx.stroke();ctx.setLineDash([]);ctx.fillText(Math.round(val),pL-6,y+3);}
  vals.forEach((v,i)=>{const x=pL+gap*i+gap/2-barW/2,barH=(v.value/gridMax)*cH,y=10+cH-barH,r=6;ctx.beginPath();ctx.moveTo(x,10+cH);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.lineTo(x+barW-r,y);ctx.quadraticCurveTo(x+barW,y,x+barW,y+r);ctx.lineTo(x+barW,10+cH);ctx.closePath();ctx.fillStyle=v.color;ctx.fill();ctx.fillStyle='#64748b';ctx.font='10px Inter,sans-serif';ctx.textAlign='center';ctx.fillText(v.label,x+barW/2,h-8);});
}
function drawPM25(){
  const canvas=$('canvas-pm25');if(!canvas)return;
  const dpr=window.devicePixelRatio||1,rect=canvas.parentElement.getBoundingClientRect();
  const w=rect.width-44,h=180;canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const data=state.history.pm25;if(data.length<2)return;
  const pL=40,pB=30,cW=w-pL-10,cH=h-pB-10;
  let gMin=Math.min(...data,0),gMax=Math.max(...data,50);const yR=gMax-gMin||1;
  // WHO limit line at 25
  const whoY=10+cH-((25-gMin)/yR)*cH;
  ctx.fillStyle='rgba(239,68,68,0.08)';ctx.fillRect(pL,10,cW,whoY-10);
  ctx.strokeStyle='rgba(239,68,68,0.4)';ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(pL,whoY);ctx.lineTo(w-10,whoY);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#ef4444';ctx.font='9px Inter,sans-serif';ctx.textAlign='left';ctx.fillText('WHO Limit (25)',pL+4,whoY-4);
  const step=cW/(HISTORY_LEN-1);ctx.beginPath();data.forEach((v,i)=>{const x=pL+i*step,y=10+cH-((v-gMin)/yR)*cH;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.strokeStyle=COLORS.pm25;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
  // Fill area
  const last=data.length-1;ctx.lineTo(pL+last*step,10+cH);ctx.lineTo(pL,10+cH);ctx.closePath();ctx.fillStyle='rgba(139,92,246,0.1)';ctx.fill();
}
function drawGauge(){
  const canvas=$('canvas-gauge');if(!canvas)return;
  const dpr=window.devicePixelRatio||1;canvas.width=280*dpr;canvas.height=160*dpr;canvas.style.width='280px';canvas.style.height='160px';
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,280,160);
  const cx=140,cy=140,r=110,th=18,startA=Math.PI,endA=2*Math.PI;
  const segments=[{end:0.33,color:COLORS.good},{end:0.66,color:COLORS.moderate},{end:1,color:COLORS.poor}];
  segments.forEach((seg,i)=>{const sa=startA+(i>0?segments[i-1].end:0)*Math.PI,ea=startA+seg.end*Math.PI;ctx.beginPath();ctx.arc(cx,cy,r,sa,ea);ctx.arc(cx,cy,r-th,ea,sa,true);ctx.closePath();ctx.fillStyle=seg.color;ctx.globalAlpha=0.25;ctx.fill();ctx.globalAlpha=1;});
  const score=Math.min(state.aqiScore,300);const pct=score/300;const needleA=startA+pct*Math.PI;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(needleA)*(r-5),cy+Math.sin(needleA)*(r-5));ctx.strokeStyle=pct<0.33?COLORS.good:pct<0.66?COLORS.moderate:COLORS.poor;ctx.lineWidth=3;ctx.lineCap='round';ctx.stroke();
  ctx.beginPath();ctx.arc(cx,cy,6,0,Math.PI*2);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
  const gv=$('gauge-value'),gt=$('gauge-text');if(gv)gv.textContent=state.aqiScore;if(gt)gt.textContent=state.lastCategory;
}
