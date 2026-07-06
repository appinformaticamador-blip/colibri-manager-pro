import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { CalendarDays, Clock3, Users, Euro, AlertTriangle, BarChart3, Package, ShoppingCart, Sparkles, Settings, LogIn, LogOut, MapPin, ShieldCheck, FileText, Download, RefreshCw } from 'lucide-react';
import './styles.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xccyaoziutlxxklcofrw.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || '131313';
const BAR_LAT = Number(import.meta.env.VITE_BAR_LAT || 37.3891);
const BAR_LNG = Number(import.meta.env.VITE_BAR_LNG || -5.9845);
const BAR_RADIUS = Number(import.meta.env.VITE_BAR_RADIUS_METERS || 80);
const supabase = SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const employees = [
  { name: 'Sonia', pin: '1313', color: '#2166d5' },
  { name: 'Álvaro', pin: '1001', color: '#29a843' },
  { name: 'Jose', pin: '1002', color: '#ff7a00' },
  { name: 'Kathy', pin: '1003', color: '#e91e73' },
  { name: 'Orlando', pin: '1004', color: '#8b35d5' },
  { name: 'Pablo', pin: '1005', color: '#ffc300' },
];
const days = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const slots = ['08:00-10:00','10:00-12:00','12:00-14:00','14:00-16:00','16:00-18:00','18:00-20:00','20:00-22:00','22:00-23:30'];

function distanceMeters(lat1, lon1, lat2, lon2){
  const R=6371000; const toRad=x=>x*Math.PI/180;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
function getWeekId(d=new Date()){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}
function hoursForSlot(slot){ const [a,b]=slot.split('-'); const to=(t)=>{const [h,m]=t.split(':').map(Number); return h+m/60}; return +(to(b)-to(a)).toFixed(2); }
const initialSchedule = Object.fromEntries(slots.map(s=>[s,Object.fromEntries(days.map(d=>[d,[]]))]));

function App(){
  const host = window.location.hostname;
  const isClockDomain = host.startsWith('fichar.') || window.location.pathname.startsWith('/fichar');
  const [admin, setAdmin] = useState(localStorage.getItem('colibri-admin')==='ok');
  if(isClockDomain) return <ClockPortal />;
  if(!admin) return <AdminLogin onLogin={()=>{localStorage.setItem('colibri-admin','ok'); setAdmin(true)}} />;
  return <Manager onLogout={()=>{localStorage.removeItem('colibri-admin'); setAdmin(false)}} />;
}
function AdminLogin({onLogin}){
  const [pin,setPin]=useState(''); const [err,setErr]=useState('');
  return <main className="loginPage"><section className="loginCard"><img src="/logo_colibri.png"/><h1>Colibrí ERP</h1><p>Acceso privado de gestión</p><input type="password" placeholder="Clave de gerente" value={pin} onChange={e=>setPin(e.target.value)} /><button onClick={()=> pin===ADMIN_PIN?onLogin():setErr('Clave incorrecta')}>Entrar</button>{err&&<b className="err">{err}</b>}<small>Portal empleados: fichar.braseria-elcolibri.es</small></section></main>
}
function Manager({onLogout}){
  const [tab,setTab]=useState('dashboard'); const [clockRows,setClockRows]=useState([]);
  const [week,setWeek]=useState(getWeekId());
  const [schedule,setSchedule]=useState(()=>JSON.parse(localStorage.getItem('colibri-schedule-'+getWeekId())||'null')||initialSchedule);
  useEffect(()=>{ localStorage.setItem('colibri-schedule-'+week, JSON.stringify(schedule)); },[schedule,week]);
  const refresh=async()=>{ if(!supabase) return; const {data}=await supabase.from('time_clock').select('*').order('created_at',{ascending:false}).limit(80); setClockRows(data||[]); };
  useEffect(()=>{ refresh(); const t=setInterval(refresh,20000); return()=>clearInterval(t); },[]);
  const workingNow = useMemo(()=>{ const map={}; [...clockRows].reverse().forEach(r=>map[r.employee_name]=r.type); return Object.entries(map).filter(([,v])=>v==='entrada').map(([k])=>k); },[clockRows]);
  return <div className="shell"><aside><img src="/logo_colibri.png"/><nav>{[
    ['dashboard','Dashboard',BarChart3],['schedule','Cuadrantes',CalendarDays],['clock','Fichajes',Clock3],['employees','Empleados',Users],['hours','Horas y nóminas',Euro],['inventory','Inventario',Package],['purchases','Compras',ShoppingCart],['ai','IA Colibrí',Sparkles],['settings','Configuración',Settings]
  ].map(([id,label,Icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><Icon size={18}/>{label}</button>)}</nav><button className="logout" onClick={onLogout}><LogOut size={18}/>Salir</button></aside><main><header><div><h1>Colibrí ERP Cloud</h1><p>Gestión integral · Brasería El Colibrí</p></div><button onClick={refresh}><RefreshCw size={18}/>Actualizar</button></header>{tab==='dashboard'&&<Dashboard rows={clockRows} workingNow={workingNow} />}{tab==='schedule'&&<Schedule week={week} setWeek={setWeek} schedule={schedule} setSchedule={setSchedule}/>} {tab==='clock'&&<ClockPanel rows={clockRows} refresh={refresh}/>} {tab==='employees'&&<Employees/>}{tab==='hours'&&<Hours schedule={schedule} rows={clockRows}/>} {tab==='inventory'&&<Placeholder title="Inventario" text="Base preparada para stock, alertas y costes de producto."/>}{tab==='purchases'&&<Placeholder title="Compras" text="Base preparada para facturas, proveedores y comparativas."/>}{tab==='ai'&&<Placeholder title="IA Colibrí" text="Próximo módulo: generar cuadrantes y consultar datos del negocio."/>}{tab==='settings'&&<SettingsPanel/>}</main></div>
}
function Dashboard({rows,workingNow}){return <section><div className="cards"><Card icon={Users} title="Trabajando ahora" value={workingNow.length} sub="empleados"/><Card icon={Clock3} title="Fichajes hoy" value={rows.filter(r=>new Date(r.created_at).toDateString()===new Date().toDateString()).length} sub="registros"/><Card icon={AlertTriangle} title="Incidencias" value="0" sub="hoy"/><Card icon={Euro} title="Ventas TPV" value="—" sub="pendiente importar"/></div><div className="grid2"><section className="panel"><h2>Personal en tiempo real</h2>{employees.map(e=><div className="person" key={e.name}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><em>{workingNow.includes(e.name)?'Dentro / trabajando':'Sin entrada activa'}</em></div>)}</section><section className="panel gradient"><h2>Próximos pasos</h2><p>1. Fichajes con GPS operativo.</p><p>2. Cuadrantes y control de horas.</p><p>3. Importación TPV, inventario, compras e IA.</p></section></div></section>}
function Card({icon:Icon,title,value,sub}){return <div className="card"><Icon/><span>{title}</span><strong>{value}</strong><small>{sub}</small></div>}
function Schedule({week,setWeek,schedule,setSchedule}){ const [cell,setCell]=useState(null); const totals=useMemo(()=>{const t={}; employees.forEach(e=>t[e.name]=0); slots.forEach(s=>days.forEach(d=>(schedule[s]?.[d]||[]).forEach(n=>t[n]=(t[n]||0)+hoursForSlot(s)))); return t;},[schedule]);
  const toggle=(name)=>{ const {slot,day}=cell; const arr=schedule[slot][day]||[]; let next=arr.includes(name)?arr.filter(x=>x!==name):(arr.length>=3?arr:[...arr,name]); setSchedule({...schedule,[slot]:{...schedule[slot],[day]:next}}); };
  return <section className="panel"><div className="row"><h2>Cuadrante · {week}</h2><input value={week} onChange={e=>setWeek(e.target.value)}/><button onClick={()=>window.print()}><FileText size={18}/>PDF</button><button onClick={()=>navigator.clipboard.writeText(buildWhatsApp(schedule,week))}>Copiar WhatsApp</button></div><div className="tableWrap"><table className="schedule"><thead><tr><th>Horario</th>{days.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{slots.map(s=><tr key={s}><th>{s}</th>{days.map(d=><td key={d} onClick={()=>setCell({slot:s,day:d})}>{(schedule[s]?.[d]||[]).map(n=>{const e=employees.find(x=>x.name===n);return <span className="badge" key={n}><i style={{background:e?.color}}></i>{n}</span>})}<small>+</small></td>)}</tr>)}</tbody></table></div><h3>Resumen horas</h3><div className="chips">{Object.entries(totals).filter(([,h])=>h>0).map(([n,h])=><span key={n}>{n}: {h} h</span>)}</div>{cell&&<div className="modal"><div><header><h2>{cell.day} · {cell.slot}</h2><button onClick={()=>setCell(null)}>Cerrar</button></header><p>Selecciona hasta 3 empleados.</p>{employees.map(e=><button className="empBtn" key={e.name} onClick={()=>toggle(e.name)}><span className="sq" style={{background:e.color}}></span>{e.name}<b>{(schedule[cell.slot][cell.day]||[]).includes(e.name)?'✓':'+'}</b></button>)}</div></div>}</section>}
function buildWhatsApp(s,w){let txt=`*CUADRANTE BRASERÍA EL COLIBRÍ*\nSemana ${w}\n\n`; days.forEach(d=>{txt+=`*${d}*\n`; slots.forEach(sl=>{const a=s[sl]?.[d]||[]; if(a.length) txt+=`${sl}: ${a.join(' + ')}\n`;}); txt+='\n';}); return txt;}
function ClockPanel({rows,refresh}){return <section className="panel"><div className="row"><h2>Panel de fichajes</h2><button onClick={refresh}>Actualizar</button><button onClick={()=>downloadCSV(rows)}><Download size={18}/>CSV</button></div>{rows.map(r=><div className="log" key={r.id}><b>{r.employee_name}</b><span className={r.type==='entrada'?'in':'out'}>{r.type}</span><em>{new Date(r.created_at).toLocaleString()}</em>{r.note&&<small>{r.note}</small>}</div>)}</section>}
function downloadCSV(rows){const csv='empleado,tipo,fecha,nota\n'+rows.map(r=>`"${r.employee_name}","${r.type}","${r.created_at}","${r.note||''}"`).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='fichajes_colibri.csv'; a.click();}
function Employees(){return <section className="panel"><h2>Empleados activos</h2>{employees.map(e=><div className="person" key={e.name}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><em>PIN configurado</em></div>)}</section>}
function Hours(){return <section className="panel"><h2>Horas y nóminas</h2><p>Módulo preparado para calcular horas normales, extra, nocturnidad y exportación de nóminas.</p></section>}
function SettingsPanel(){return <section className="panel"><h2>Configuración</h2><p>Radio GPS autorizado: {BAR_RADIUS} m</p><p>PIN gerente: configurado por variable de entorno.</p></section>}
function Placeholder({title,text}){return <section className="panel"><h2>{title}</h2><p>{text}</p></section>}
function ClockPortal(){ const [name,setName]=useState('Sonia'), [pin,setPin]=useState(''), [note,setNote]=useState(''), [msg,setMsg]=useState(''), [busy,setBusy]=useState(false), [geo,setGeo]=useState(null);
  const getGeo=()=>new Promise((res,rej)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:10000}):rej(new Error('GPS no disponible')));
  const punch=async(type)=>{setBusy(true);setMsg('Comprobando GPS...'); try{const pos=await getGeo(); const lat=pos.coords.latitude,lng=pos.coords.longitude,dist=distanceMeters(lat,lng,BAR_LAT,BAR_LNG); setGeo({lat,lng,dist}); if(dist>BAR_RADIUS){setMsg(`❌ Fuera del radio autorizado (${dist} m).`); setBusy(false); return;} if(!supabase) throw new Error('Supabase no configurado'); const {data,error}=await supabase.rpc('registrar_fichaje',{p_employee_name:name,p_pin:pin,p_type:type,p_note:`GPS ${dist}m · ${note||''}`}); if(error) throw error; setMsg(data?.ok?`✅ Fichaje registrado: ${name} · ${type.toUpperCase()} · ${dist} m`:`❌ ${data?.message||'No registrado'}`);}catch(e){setMsg('❌ '+(e.message||'Error al fichar'));} setBusy(false); };
  return <main className="clockPage"><section className="clockCard"><img src="/logo_colibri.png"/><h1>Fichaje empleados</h1><p>Brasería El Colibrí</p><label>Empleado</label><select value={name} onChange={e=>setName(e.target.value)}>{employees.map(e=><option key={e.name}>{e.name}</option>)}</select><label>PIN</label><input type="password" value={pin} onChange={e=>setPin(e.target.value)} placeholder="Introduce tu PIN"/><label>Observación</label><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Opcional"/><div className="gps"><MapPin/> GPS obligatorio · radio {BAR_RADIUS} m {geo&&`· última distancia ${geo.dist} m`}</div><button className="entry" disabled={busy} onClick={()=>punch('entrada')}><LogIn/> Entrada</button><button className="exit" disabled={busy} onClick={()=>punch('salida')}><LogOut/> Salida</button>{msg&&<div className="message">{msg}</div>}</section></main>}

createRoot(document.getElementById('root')).render(<App/>);
