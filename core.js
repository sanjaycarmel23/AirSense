const TICK_MS=3000,HISTORY_LEN=15,API_BASE='http://localhost:5000/api';
const COLORS={dust:'#8b5cf6',co2:'#3b82f6',no:'#f97316',no2:'#ef4444',co:'#64748b',temp:'#f59e0b',hum:'#06b6d4',good:'#10b981',moderate:'#eab308',poor:'#ef4444'};
const state={
  history:{dust:[],co2:[],no:[],no2:[],co:[],temp:[],hum:[],timestamps:[]},
  distribution:{Good:0,Moderate:0,Poor:0},
  totals:{dust:0,co2:0,no:0,no2:0,co:0,temp:0,hum:0},
  totalReadings:0,lastCategory:'Good',backendConnected:false,pending:false,aqiScore:0,
  lastVals:{dust:[],co2:[],no:[],no2:[],co:[],temp:[],hum:[]},
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
async function fetchPrediction(d){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),5000);
  try{const r=await fetch(`${API_BASE}/predict`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d),signal:c.signal});clearTimeout(t);if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}catch(e){clearTimeout(t);throw e;}
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
  const co=r<0.4?Math.round(rng(600,900)):r<0.65?Math.round(rng(900,1400)):Math.round(rng(1400,2000));
  const co2=r<0.4?Math.round(rng(400,800)):r<0.65?Math.round(rng(800,1400)):Math.round(rng(1400,2200));
  const no_val=r<0.4?Math.round(rng(10,100)):r<0.65?Math.round(rng(100,400)):Math.round(rng(400,1000));
  const no2_val=r<0.4?Math.round(rng(20,80)):r<0.65?Math.round(rng(80,180)):Math.round(rng(180,340));
  const dust=Math.round(rng(0.1,2.2)*100)/100;
  return{
    dust,co2,no:no_val,no2:no2_val,co,
    temperature:Math.round(rng(15,40)*10)/10,
    humidity:Math.round(rng(20,80)*10)/10
  };
}
function localPredict(d){
  let s=0;
  if(d.co>1400)s+=3;else if(d.co>900)s+=2;else if(d.co>600)s+=1;
  if(d.co2>1400)s+=2;else if(d.co2>800)s+=1;
  if(d.no>400)s+=2;else if(d.no>100)s+=1;
  if(d.no2>180)s+=2;else if(d.no2>80)s+=1;
  if(d.temperature>35||d.temperature<18)s+=1;
  if(d.humidity>70||d.humidity<25)s+=1;
  return s>=6?'Poor':s>=3?'Moderate':'Good';
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
