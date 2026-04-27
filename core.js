const TICK_MS=3000,HISTORY_LEN=15,API_BASE='http://localhost:5000/api';
const COLORS={gas:'#3b82f6',temp:'#f97316',hum:'#06b6d4',pm25:'#8b5cf6',good:'#10b981',moderate:'#eab308',poor:'#ef4444'};
const state={
  history:{gas:[],temp:[],hum:[],pm25:[],timestamps:[]},
  distribution:{Good:0,Moderate:0,Poor:0},
  totals:{gas:0,temp:0,hum:0,pm25:0},
  totalReadings:0,lastCategory:'Good',backendConnected:false,pending:false,aqiScore:0,
  lastVals:{gas:[],temp:[],hum:[],pm25:[]},
  allReadings:[],currentPage:1,perPage:12,activeFilter:'all',
  dbConnected:false
};
const $=id=>document.getElementById(id);
const META={
  Good:{desc:'Air quality is satisfactory and poses little or no health risk.',color:COLORS.good,barPct:8},
  Moderate:{desc:'Moderate air quality. Sensitive groups may experience effects.',color:COLORS.moderate,barPct:40},
  Poor:{desc:'Air quality is poor. Everyone may experience health effects.',color:COLORS.poor,barPct:80}
};

/* ── Fetch latest reading from MongoDB via backend ─────── */
async function fetchLatest(){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),5000);
  try{
    const r=await fetch(`${API_BASE}/latest`,{signal:c.signal});
    clearTimeout(t);
    if(!r.ok){
      if(r.status===404) return null; // no data in DB yet
      throw new Error(`HTTP ${r.status}`);
    }
    return await r.json();
  }catch(e){clearTimeout(t);throw e;}
}

/* ── Fallback: POST manual prediction ──────────────────── */
async function fetchPrediction(gas,temp,hum,pm25){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),5000);
  try{const r=await fetch(`${API_BASE}/predict`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gas_index:gas,temperature:temp,humidity:hum,pm25:pm25}),signal:c.signal});clearTimeout(t);if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}catch(e){clearTimeout(t);throw e;}
}

async function checkHealth(){
  try{const r=await fetch(`${API_BASE}/health`,{signal:AbortSignal.timeout(3000)});if(r.ok){const d=await r.json();setConn(d.status==='ok'&&d.model_loaded);state.dbConnected=d.database_connected||false;return;}}catch{}setConn(false);
}
function setConn(ok){
  const was=state.backendConnected;state.backendConnected=ok;
  const b=$('connection-badge');if(b){const dot=b.querySelector('.pulse-dot'),lbl=b.querySelector('span:last-child');
  if(ok){b.style.borderColor='var(--green)';b.style.color='var(--green-dark)';b.style.background='var(--green-light)';if(dot)dot.style.background='var(--green)';if(lbl)lbl.textContent=state.dbConnected?'Live · DB':'Live';}
  else{b.style.borderColor='var(--orange)';b.style.color='var(--orange)';b.style.background='var(--orange-light)';if(dot)dot.style.background='var(--orange)';if(lbl)lbl.textContent='Offline';}}
  if(ok&&!was)addAlert('ML backend connected — predictions active','success');
  else if(!ok&&was)addAlert('ML backend disconnected — using fallback','warning');
}

/* ── Simulated data (fallback when DB has no data) ─────── */
function rng(a,b){return a+Math.random()*(b-a)}
function genData(){
  const r=Math.random();
  const gas=r<0.4?Math.round(rng(5,45)):r<0.65?Math.round(rng(45,85)):Math.round(rng(85,200));
  const pm25=r<0.4?Math.round(rng(5,25)*10)/10:r<0.65?Math.round(rng(25,55)*10)/10:Math.round(rng(55,150)*10)/10;
  return{gas,temp:Math.round(rng(15,35)*10)/10,hum:Math.round(rng(20,75)*10)/10,pm25};
}
function localPredict(g,t,h,p){
  let s=0;if(g>400)s+=3;else if(g>250)s+=2;else if(g>150)s+=1;
  if(t>35||t<18)s+=1;if(t>40)s+=1;if(h>70||h<25)s+=1;
  if(p>55)s+=2;else if(p>25)s+=1;
  return s>=4?'Poor':s>=2?'Moderate':'Good';
}
function calcAqiScore(cat,conf){
  if(!conf)return cat==='Good'?25:cat==='Moderate'?100:200;
  const g=conf.Good||0,m=conf.Moderate||0,p=conf.Poor||0;
  return Math.round(g*25+m*100+p*250);
}
function animateVal(el,val){if(!el)return;el.style.transition='none';el.style.opacity='0.3';el.style.transform='translateY(-3px)';requestAnimationFrame(()=>{el.textContent=val;el.style.transition='opacity 0.3s,transform 0.3s';el.style.opacity='1';el.style.transform='translateY(0)';});}
function addAlert(msg,type='info'){
  const ul=$('alerts-list');if(!ul)return;const li=document.createElement('li');li.className=`alert-item ${type}`;
  const time=new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
  li.textContent=`[${time}] ${msg}`;ul.prepend(li);while(ul.children.length>8)ul.removeChild(ul.lastChild);
  const ul2=$('insight-alerts-list');if(ul2){const li2=li.cloneNode(true);ul2.prepend(li2);while(ul2.children.length>8)ul2.removeChild(ul2.lastChild);}
}
function updateTrend(id,vals,color){
  const el=document.querySelector(`#trend-line-${id}`);if(!el||vals.length<2)return;
  const min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
  const pts=vals.slice(-6).map((v,i,a)=>`${(i/(a.length-1))*24},${14-((v-min)/range)*12}`).join(' ');
  el.setAttribute('points',pts);el.setAttribute('stroke',color);
}
