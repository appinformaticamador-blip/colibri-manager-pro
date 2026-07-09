import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './styles.css';

const supabaseUrl=import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=supabaseUrl&&supabaseAnon?createClient(supabaseUrl,supabaseAnon):null;
const ADMIN_PIN='131313';
const EMP_COLORS=['#29b6f6','#66bb6a','#ffa726','#ec407a','#ab47bc','#ffee58','#26c6da','#ef5350','#bdbdbd'];
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const SLOTS=['08:00-10:00','10:00-12:00','12:00-14:00','14:00-16:00','16:00-18:00','18:00-20:00','20:00-22:00','22:00-23:30'];
function h(slot){const [a,b]=slot.split('-');const [ah,am]=a.split(':').map(Number);const [bh,bm]=b.split(':').map(Number);return ((bh*60+bm)-(ah*60+am))/60}
function dist(lat1,lon1,lat2,lon2){const R=6371000,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
function today(){return new Date().toISOString().slice(0,10)}
function week(){const d=new Date();const y=d.getFullYear();const onejan=new Date(y,0,1);return `${y}-W${String(Math.ceil((((d-onejan)/86400000)+onejan.getDay()+1)/7)).padStart(2,'0')}`}
function App(){const host=location.hostname;const onlyClock=host.startsWith('fichar.')||location.pathname.includes('fichar');const [authed,setAuthed]=useState(false);return <>{onlyClock?<ClockPage/>:<>{!authed?<Login onOk={()=>setAuthed(true)}/>:<Manager/>}</>}</>}
function Login({onOk}){const[pin,setPin]=useState('');return <main className="login"><Brand/><div className="card narrow"><h2>Acceso Manager</h2><input placeholder="Clave gerente" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={()=>pin===ADMIN_PIN?onOk():alert('Clave incorrecta')}>Entrar</button><a href="/fichar" className="muted">Ir a fichaje empleados</a></div></main>}
function Brand(){return <div className="brand"><img src="/logo_colibri.png" onError={e=>e.currentTarget.style.display='none'}/><div><h1>Colibrí ERP</h1><p>Brasería El Colibrí</p></div></div>}
function Manager(){const[tab,setTab]=useState('dashboard');const tabs=['dashboard','empleados','fichajes','cuadrantes','comparador','tpv','config'];return <div><header><Brand/><nav>{tabs.map(t=><button className={tab===t?'active':''} onClick={()=>setTab(t)} key={t}>{t}</button>)}</nav></header><section className="page">{tab==='dashboard'&&<Dashboard/>}{tab==='empleados'&&<Employees/>}{tab==='fichajes'&&<ClockPanel/>}{tab==='cuadrantes'&&<Schedule/>}{tab==='comparador'&&<Compare/>}{tab==='tpv'&&<TPV/>}{tab==='config'&&<Settings/>}</section></div>}
function Dashboard(){
  const[rows,setRows]=useState([]);
  const[selectedDate,setSelectedDate]=useState(today());
  const[sales,setSales]=useState(null);
  const[sync,setSync]=useState(null);
  useEffect(()=>{load()},[selectedDate]);
  function shiftDate(days){const d=new Date(selectedDate);d.setDate(d.getDate()+days);setSelectedDate(d.toISOString().slice(0,10))}
  async function load(){
    if(!supabase)return;
    const {data:clockData}=await supabase.from('clock_records').select('*').order('created_at',{ascending:false}).limit(50);
    setRows(clockData||[]);
    const {data:salesData}=await supabase.from('numier_daily_sales').select('*').eq('business_date',selectedDate).maybeSingle();
    setSales(salesData||null);
    const {data:syncData}=await supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1).maybeSingle();
    setSync(syncData||null);
  }
  const working=[...new Map(rows.map(r=>[r.employee_name,r])).values()].filter(r=>r.type==='entrada');
  const isToday=selectedDate===today();
  return <div>
    <div className="card toolbar">
      <h2>Dashboard</h2>
      <div className="row wrap">
        <button onClick={()=>setSelectedDate(today())}>Hoy</button>
        <button onClick={()=>shiftDate(-1)}>Día anterior</button>
        <button onClick={()=>shiftDate(1)}>Día siguiente</button>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/>
        <button onClick={load}>Actualizar</button>
      </div>
      <p className="muted">Viendo: <b>{new Date(selectedDate+'T12:00:00').toLocaleDateString()}</b>{isToday?' · Hoy':''}</p>
    </div>
    <div className="grid">
      <div className="card"><h2>Ventas del día</h2><div className="big">{sales?Number(sales.total_sales||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'}):'—'}</div><p>{sales?`${sales.ticket_count||0} tickets · Ticket medio ${Number(sales.average_ticket||0).toFixed(2)} €`:'Sin datos importados para este día'}</p></div>
      <div className="card"><h2>Formas de pago</h2><p>💵 Efectivo: <b>{sales?Number(sales.total_cash||0).toFixed(2)+' €':'—'}</b></p><p>💳 Tarjeta: <b>{sales?Number(sales.total_card||0).toFixed(2)+' €':'—'}</b></p></div>
      <div className="card"><h2>Trabajando ahora</h2><div className="big">{working.length}</div>{working.map(w=><p key={w.id}>🟢 {w.employee_name}</p>)}</div>
      <div className="card"><h2>Última sincronización NUMIER</h2>{sync?<><p>🟢 {sync.file_name}</p><p>{new Date(sync.synced_at).toLocaleString()}</p><p className="muted">{Number(sync.file_size||0).toLocaleString('es-ES')} bytes</p></>:<p>Sin sincronizaciones registradas</p>}</div>
      <div className="card"><h2>Últimos fichajes</h2>{rows.slice(0,6).map(r=><p key={r.id}>{r.type==='entrada'?'🟢':'🔴'} {r.employee_name} · {new Date(r.created_at).toLocaleString()}</p>)}</div>
      <div className="card"><h2>Estado</h2><p>✅ Supabase conectado</p><p>📍 GPS bar configurado</p><p>🧾 NUMIER preparado para días anteriores</p></div>
    </div>
  </div>
}
function Employees(){const[employees,setEmployees]=useState([]);const[name,setName]=useState('');const[pin,setPin]=useState('');useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data}=await supabase.from('employees').select('*').order('name');setEmployees(data||[])}async function add(){if(!name||!pin)return alert('Nombre y PIN');const color=EMP_COLORS[employees.length%EMP_COLORS.length];const{error}=await supabase.from('employees').insert({name,pin,role:'empleado',color,can_clock:true,active:true});if(error)alert(error.message);setName('');setPin('');load()}async function update(e,patch){const{error}=await supabase.from('employees').update(patch).eq('id',e.id);if(error)alert(error.message);load()}return <div className="card"><h2>Empleados</h2><div className="row"><input placeholder="Nuevo empleado" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={add}>Añadir</button></div>{employees.map(e=><div className="employee" key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><span>{e.active?'Activo':'Inactivo'}</span><input placeholder="Nuevo PIN" onBlur={ev=>ev.target.value&&update(e,{pin:ev.target.value})}/><button onClick={()=>update(e,{active:!e.active})}>{e.active?'Desactivar':'Activar'}</button></div>)}</div>}
function ClockPage(){const[employees,setEmployees]=useState([]);const[emp,setEmp]=useState('');const[pin,setPin]=useState('');const[note,setNote]=useState('');const[msg,setMsg]=useState('');const[qr,setQr]=useState(false);useEffect(()=>{load()},[]);async function load(){if(!supabase){setMsg('Supabase no configurado');return}const{data}=await supabase.from('employees').select('name').eq('active',true).eq('can_clock',true).order('name');setEmployees(data||[])}async function clock(type,method='gps'){if(!supabase)return setMsg('Supabase no configurado');setMsg('Comprobando...');let coords=null;if(method==='gps'){try{coords=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));}catch(e){setQr(true);return setMsg('GPS no disponible. Usa el QR del bar.')}}const payload={p_employee_name:emp,p_pin:pin,p_type:type,p_note:note,p_gps_lat:coords?.coords?.latitude||null,p_gps_lng:coords?.coords?.longitude||null,p_accuracy:coords?.coords?.accuracy||null,p_method:method};const{data,error}=await supabase.rpc('registrar_fichaje_v2',payload);if(error)return setMsg('❌ '+error.message);setMsg((data?.ok?'✅ ':'❌ ')+(data?.message||'Respuesta recibida')+(data?.distance_m?` · Distancia ${Math.round(data.distance_m)} m`:''));if(!data?.ok&&data?.outside_radius)setQr(true)}return <main className="login"><Brand/><div className="card narrow"><h2>Fichaje empleados</h2><select value={emp} onChange={e=>setEmp(e.target.value)}><option value="">Empleado</option>{employees.map(e=><option key={e.name}>{e.name}</option>)}</select><input placeholder="PIN" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><textarea placeholder="Observaciones" value={note} onChange={e=>setNote(e.target.value)}/><div className="row"><button onClick={()=>clock('entrada')}>Entrada GPS</button><button className="red" onClick={()=>clock('salida')}>Salida GPS</button></div>{qr&&<div className="qrbox"><p>Escanea/usa QR físico del bar como respaldo.</p><button onClick={()=>clock('entrada','qr')}>Entrada QR</button><button className="red" onClick={()=>clock('salida','qr')}>Salida QR</button></div>}<p className="msg">{msg}</p></div></main>}
function ClockPanel(){const[rows,setRows]=useState([]);useEffect(()=>{load()},[]);async function load(){const{data}=await supabase.from('clock_records').select('*').order('created_at',{ascending:false}).limit(100);setRows(data||[])}return <div className="card"><h2>Panel fichajes</h2><button onClick={load}>Actualizar</button><table><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.employee_name}</td><td>{r.type}</td><td>{r.method}</td><td>{r.distance_m?Math.round(r.distance_m)+' m':''}</td></tr>)}</tbody></table></div>}
function Schedule(){
 const baseEmployees=[
  {id:'sonia',name:'Sonia',category:'Sala',color:'#29b6f6'},
  {id:'alvaro',name:'Álvaro',category:'Sala',color:'#66bb6a'},
  {id:'jose',name:'Jose',category:'Barra',color:'#ffa726'},
  {id:'kathy',name:'Kathy',category:'Sala',color:'#ec407a'},
  {id:'orlando',name:'Orlando',category:'Cocina',color:'#ab47bc'},
  {id:'pablo',name:'Pablo',category:'Barra',color:'#26c6da'},
  {id:'santi',name:'Santi',category:'Sala',color:'#ef5350'},
  {id:'alfonso',name:'Alfonso',category:'Gerencia',color:'#0b7f6d'}
 ];
 const STORAGE='colibriCuadrantesPro327';
 const EMP_STORAGE='colibriCuadrantesEmpleados327';
 const [weekId,setWeekId]=useState(()=>week());
 const [book,setBook]=useState(()=>loadBook());
 const [employees,setEmployees]=useState(()=>loadEmployees());
 const [selected,setSelected]=useState(null);
 const [dragItem,setDragItem]=useState(null);
 const [newName,setNewName]=useState('');
 const [newCat,setNewCat]=useState('Sala');
 const [sourceDay,setSourceDay]=useState('Lunes');
 const [targetDay,setTargetDay]=useState('Martes');
 function parseJSON(key,fallback){try{const raw=localStorage.getItem(key);if(!raw)return fallback;const val=JSON.parse(raw);return val&&typeof val==='object'?val:fallback}catch{return fallback}}
 function cleanId(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||('emp_'+Date.now())}
 function loadBook(){const raw=parseJSON(STORAGE,{weeks:{}});return raw&&raw.weeks&&typeof raw.weeks==='object'?raw:{weeks:{}}}
 function loadEmployees(){const raw=parseJSON(EMP_STORAGE,null);return Array.isArray(raw)&&raw.length?raw.filter(Boolean).map((e,i)=>({id:String(e.id||cleanId(e.name)||('emp_'+i)),name:String(e.name||'Empleado'),category:String(e.category||'Equipo'),color:String(e.color||EMP_COLORS[i%EMP_COLORS.length])})):baseEmployees}
 function persistBook(next){const safe=next&&next.weeks&&typeof next.weeks==='object'?next:{weeks:{}};setBook(safe);localStorage.setItem(STORAGE,JSON.stringify(safe))}
 function persistEmployees(next){const safe=Array.isArray(next)?next:[];setEmployees(safe);localStorage.setItem(EMP_STORAGE,JSON.stringify(safe))}
 function emptyWeek(){const w={};DAYS.forEach(d=>{w[d]={};SLOTS.forEach(s=>w[d][s]=[])});return w}
 function getWeek(wid=weekId){const raw=book.weeks?.[wid];const w=emptyWeek();if(raw&&typeof raw==='object'){DAYS.forEach(d=>{if(raw[d]&&typeof raw[d]==='object'){SLOTS.forEach(s=>{w[d][s]=Array.isArray(raw[d][s])?raw[d][s].map(String).slice(0,3):[]})}})}return w}
 function saveWeek(wid,w){const clean=emptyWeek();DAYS.forEach(d=>SLOTS.forEach(s=>{const arr=w?.[d]?.[s];clean[d][s]=Array.isArray(arr)?arr.map(String).slice(0,3):[]}));persistBook({weeks:{...(book.weeks||{}),[wid]:clean}})}
 function getCell(day,slot){return getWeek()[day][slot]||[]}
 function setCell(day,slot,ids){const w=getWeek();w[day][slot]=Array.isArray(ids)?ids.slice(0,3):[];saveWeek(weekId,w)}
 function empById(id){return employees.find(e=>e.id===id)||{id,name:id,category:'Equipo',color:'#0b7f6d'}}
 function duration(slot){const [a,b]=slot.split('-');const [ah,am]=a.split(':').map(Number);const [bh,bm]=b.split(':').map(Number);return ((bh*60+bm)-(ah*60+am))/60}
 function shiftWeek(wid,delta){const m=String(wid).match(/(\d{4})-W(\d{1,2})/);if(!m)return week();let y=Number(m[1]),w=Number(m[2])+delta;while(w<1){y--;w=52}while(w>52){y++;w=1}return `${y}-W${String(w).padStart(2,'0')}`}
 function hasWeek(wid){const w=getWeek(wid);return DAYS.some(d=>SLOTS.some(s=>(w[d][s]||[]).length>0))}
 function copyWeek(from,to){const src=getWeek(from);const next={weeks:{...(book.weeks||{}),[to]:src}};persistBook(next)}
 function copyPreviousWeek(){const prev=shiftWeek(weekId,-1);if(!hasWeek(prev)){alert(`No hay cuadrante guardado en ${prev}`);return}if(hasWeek(weekId)&&!confirm(`La semana ${weekId} ya tiene datos. ¿Sustituir por ${prev}?`))return;copyWeek(prev,weekId);alert(`Semana copiada desde ${prev}`)}
 function duplicateNextWeek(){const next=shiftWeek(weekId,1);if(!hasWeek(weekId)){alert('La semana actual está vacía');return}if(hasWeek(next)&&!confirm(`La semana ${next} ya tiene datos. ¿Sustituirlos?`))return;copyWeek(weekId,next);setWeekId(next);alert(`Duplicado a ${next}`)}
 function clearWeek(){if(!confirm(`¿Vaciar la semana ${weekId}?`))return;saveWeek(weekId,emptyWeek())}
 function copyDay(){if(sourceDay===targetDay){alert('Elige dos días diferentes');return}const w=getWeek();SLOTS.forEach(s=>w[targetDay][s]=[...(w[sourceDay][s]||[])]);saveWeek(weekId,w);alert(`${sourceDay} copiado a ${targetDay}`)}
 function toggleEmployee(id){if(!selected)return;const arr=getCell(selected.day,selected.slot);const exists=arr.includes(id);if(exists){setCell(selected.day,selected.slot,arr.filter(x=>x!==id));return}if(arr.length>=3){alert('Máximo 3 empleados por franja');return}setCell(selected.day,selected.slot,[...arr,id])}
 function addEmployee(){const name=newName.trim();if(!name)return;const emp={id:cleanId(name),name,category:newCat,color:EMP_COLORS[employees.length%EMP_COLORS.length]};if(!employees.some(e=>e.id===emp.id))persistEmployees([...employees,emp]);setNewName('')}
 function removeEmployee(id){if(!confirm('¿Quitar este empleado de la lista y de todos los cuadrantes?'))return;persistEmployees(employees.filter(e=>e.id!==id));const all={...(book.weeks||{})};Object.keys(all).forEach(wid=>{const w=getWeek(wid);DAYS.forEach(d=>SLOTS.forEach(s=>w[d][s]=(w[d][s]||[]).filter(x=>x!==id)));all[wid]=w});persistBook({weeks:all})}
 function moveDrag(toDay,toSlot){if(!dragItem)return;const from=getCell(dragItem.day,dragItem.slot).filter(x=>x!==dragItem.id);const to=getCell(toDay,toSlot).filter(x=>x!==dragItem.id);if(to.length>=3){alert('Máximo 3 empleados por franja');setDragItem(null);return}setCell(dragItem.day,dragItem.slot,from);setCell(toDay,toSlot,[...to,dragItem.id]);setDragItem(null)}
 const totals=useMemo(()=>{const result={};DAYS.forEach(d=>SLOTS.forEach(s=>getCell(d,s).forEach(id=>{result[id]=(result[id]||0)+duration(s)})));return result},[book,weekId]);
 const totalHours=Object.values(totals).reduce((a,b)=>a+b,0);
 const warnings=employees.filter(e=>(totals[e.id]||0)>40).map(e=>`${e.name}: ${(totals[e.id]||0).toFixed(1)} h`);
 function buildWhatsApp(){const lines=[`📅 CUADRANTE SEMANA ${weekId}`,'Brasería El Colibrí',''];DAYS.forEach(day=>{let added=false;SLOTS.forEach(slot=>{const names=getCell(day,slot).map(id=>empById(id).name);if(names.length){if(!added){lines.push(`🟢 ${day.toUpperCase()}`);added=true}lines.push(`${slot}: ${names.join(', ')}`)}});if(added)lines.push('')});lines.push('📊 HORAS SEMANALES');employees.filter(e=>totals[e.id]).forEach(e=>lines.push(`${e.name}: ${totals[e.id].toFixed(1)} h`));if(warnings.length)lines.push('', '⚠️ Revisar más de 40h:', ...warnings);lines.push('', 'Revisad vuestro horario de entrada y salida.');return lines.join('\n')}
 function copyWhatsApp(){copyText(buildWhatsApp())}
 function downloadWhatsApp(){downloadFile(`cuadrante_${weekId}.txt`,buildWhatsApp())}
 async function exportImage(){const cw=1500,ch=980;const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cw,ch);ctx.fillStyle='#073b35';ctx.font='bold 42px Arial';ctx.fillText(`Cuadrante semanal ${weekId}`,40,55);ctx.font='24px Arial';ctx.fillText('Brasería El Colibrí',40,90);const colW=(cw-80)/8;const rowH=86;const y0=120;ctx.font='bold 18px Arial';['Hora',...DAYS].forEach((t,i)=>{ctx.fillStyle='#0b4d43';ctx.fillRect(40+i*colW,y0,colW-6,36);ctx.fillStyle='white';ctx.fillText(t,52+i*colW,y0+25)});SLOTS.forEach((slot,r)=>{const y=y0+44+r*rowH;ctx.fillStyle='#eaf8f4';ctx.fillRect(40,y,colW-6,rowH-8);ctx.fillStyle='#073b35';ctx.font='bold 17px Arial';ctx.fillText(slot,52,y+34);DAYS.forEach((day,i)=>{const x=40+(i+1)*colW;ctx.fillStyle='#f7fbfa';ctx.fillRect(x,y,colW-6,rowH-8);getCell(day,slot).forEach((id,j)=>{const e=empById(id);ctx.fillStyle=e.color;ctx.fillRect(x+8,y+8+j*22,colW-24,19);ctx.fillStyle='white';ctx.font='bold 14px Arial';ctx.fillText(e.name.slice(0,22),x+13,y+23+j*22)})})});ctx.fillStyle='#073b35';ctx.font='bold 26px Arial';ctx.fillText(`Total semanal: ${totalHours.toFixed(1)} h`,40,ch-40);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));try{if(window.ClipboardItem&&navigator.clipboard?.write){await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);alert('Imagen copiada. Pégala en WhatsApp Web.');return}}catch{}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cuadrante_${weekId}.png`;a.click();URL.revokeObjectURL(a.href)}
 function resetModule(){if(!confirm('¿Reiniciar solo los datos locales del módulo cuadrantes?'))return;localStorage.removeItem(STORAGE);localStorage.removeItem(EMP_STORAGE);setBook({weeks:{}});setEmployees(baseEmployees)}
 return <div className="schedulePage scheduleFresh">
  <div className="card scheduleCard mainScheduleCard">
   <div className="scheduleTopButtons">
    <div><h2>Acciones de cuadrante</h2><p>Botones visibles y operativos para trabajar semana a semana.</p></div>
    <div className="scheduleActionGrid">
     <button onClick={()=>setWeekId(shiftWeek(weekId,-1))}>← Semana anterior</button>
     <button onClick={()=>setWeekId(week())}>Semana actual</button>
     <button onClick={()=>setWeekId(shiftWeek(weekId,1))}>Semana siguiente →</button>
     <button onClick={copyPreviousWeek}>Copiar semana anterior</button>
     <button onClick={duplicateNextWeek}>Duplicar a siguiente</button>
     <button onClick={copyWhatsApp}>Copiar WhatsApp</button>
     <button onClick={downloadWhatsApp}>Descargar texto</button>
     <button onClick={exportImage}>Copiar/descargar imagen</button>
     <button className="red" onClick={clearWeek}>Vaciar semana</button>
    </div>
    <div className="copyDayBox"><select value={sourceDay} onChange={e=>setSourceDay(e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><span>→</span><select value={targetDay} onChange={e=>setTargetDay(e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><button onClick={copyDay}>Copiar día</button><button className="red" onClick={resetModule}>Reiniciar módulo</button></div>
   </div>
   <div className="scheduleTitleBar row between"><div><h2>Cuadrante semanal {weekId}</h2><p className="mutedText">Pulsa una celda para seleccionar hasta 3 empleados. En PC puedes arrastrar nombres entre franjas.</p></div><b className="scheduleVersion">{totalHours.toFixed(1)} h</b></div>
   {warnings.length>0&&<div className="warnBox">⚠️ Revisar: {warnings.join(' · ')}</div>}
   <div className="scheduleWrap"><table className="schedulePro"><thead><tr><th>Hora</th>{DAYS.map(day=><th key={day}>{day}</th>)}</tr></thead><tbody>{SLOTS.map(slot=><tr key={slot}><td className="slotHour">{slot}</td>{DAYS.map(day=>{const ids=getCell(day,slot);return <td key={day} className="shiftCell" onClick={()=>setSelected({day,slot})} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();moveDrag(day,slot)}}>{ids.length?ids.map(id=>{const e=empById(id);return <span key={id} className="badge" draggable onDragStart={ev=>{ev.stopPropagation();setDragItem({id,day,slot})}} onClick={ev=>{ev.stopPropagation();setSelected({day,slot})}} style={{background:e.color}}>{e.name}</span>}):<span className="emptyShift">+ añadir</span>}</td>})}</tr>)}</tbody></table></div>
   <div className="scheduleFooter"><h3>Horas semanales</h3><b>{totalHours.toFixed(1)} h</b></div>
   <div className="employeeSummary">{employees.filter(e=>totals[e.id]).map(e=><div key={e.id}><span className="sq" style={{background:e.color}}/> <b>{e.name}</b><em>{totals[e.id].toFixed(1)} h</em></div>)}</div>
   <h3>Texto listo para WhatsApp</h3><textarea readOnly rows="12" value={buildWhatsApp()} onFocus={e=>e.target.select()} />
  </div>
  <div className="card employeeManager"><h3>Empleados del cuadrante</h3><div className="row"><input placeholder="Nombre empleado" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addEmployee()}}/><select value={newCat} onChange={e=>setNewCat(e.target.value)}><option>Sala</option><option>Barra</option><option>Cocina</option><option>Terraza</option><option>Extra</option><option>Gerencia</option></select><button onClick={addEmployee}>Añadir</button></div><div className="employeeChips">{employees.map(e=><span key={e.id} className="employeeChip"><span className="sq" style={{background:e.color}}/> <b>{e.name}</b><small>{e.category}</small><button className="miniRed" onClick={()=>removeEmployee(e.id)}>×</button></span>)}</div></div>
  {selected&&<div className="modal" onClick={()=>setSelected(null)}><div className="card scheduleModal" onClick={e=>e.stopPropagation()}><div className="row between"><h3>{selected.day} · {selected.slot}</h3><button className="red" onClick={()=>setSelected(null)}>Cerrar</button></div><p>Selecciona máximo 3 empleados.</p><div className="empGrid">{employees.map(e=>{const active=getCell(selected.day,selected.slot).includes(e.id);return <button key={e.id} className={active?'empbtn selected':'empbtn'} onClick={()=>toggleEmployee(e.id)}><span className="sq" style={{background:e.color}}/> {e.name} <small>{e.category}</small> {active?'✓':''}</button>})}</div><button className="red" onClick={()=>setCell(selected.day,selected.slot,[])}>Vaciar esta franja</button></div></div>}
 </div>
}
function Compare(){const[text,setText]=useState('');const[name,setName]=useState('');function calc(){const clean=text.replace(/_/g,'');let total=0;for(const line of clean.split('\n')){const times=[...line.matchAll(/entrada\s*(\d{1,2}):(\d{2})\s*salida\s*(\d{1,2}):(\d{2})/gi)];const seen=new Set();times.forEach(m=>{const k=m[0];if(seen.has(k))return;seen.add(k);const a=+m[1]*60+ +m[2],b=+m[3]*60+ +m[4];if(b>a)total+=(b-a)/60})}return total}return <div className="card"><h2>Comparador WhatsApp vs cuadrante</h2><input placeholder="Empleado" value={name} onChange={e=>setName(e.target.value)}/><textarea rows="12" placeholder="Pega plantilla WhatsApp" value={text} onChange={e=>setText(e.target.value)}/><h3>Horas declaradas detectadas: {calc()} h</h3><p>Compara este total con el resumen de cuadrante semanal.</p></div>}
function TPV(){return <div className="card"><h2>NUMIER / TPV Cloud</h2><p>Colibrí Sync enviará los datos desde <b>C:\\NUMIER\\DATOS</b> a Supabase.</p><p>Desde el Dashboard puedes elegir <b>Hoy</b>, <b>Día anterior</b> o cualquier fecha para consultar las ventas cuando estés fuera.</p><p className="muted">Tablas usadas: numier_sync_files y numier_daily_sales.</p></div>}
function Settings(){const[settings,setSettings]=useState(null);useEffect(()=>{supabase?.from('settings').select('*').single().then(({data})=>setSettings(data))},[]);async function save(){const{error}=await supabase.from('settings').upsert(settings);if(error)alert(error.message);else alert('Guardado')}if(!settings)return <div className="card">Cargando...</div>;return <div className="card"><h2>Configuración</h2><label>Latitud<input value={settings.bar_lat} onChange={e=>setSettings({...settings,bar_lat:e.target.value})}/></label><label>Longitud<input value={settings.bar_lng} onChange={e=>setSettings({...settings,bar_lng:e.target.value})}/></label><label>Radio metros<input value={settings.gps_radius_m} onChange={e=>setSettings({...settings,gps_radius_m:e.target.value})}/></label><button onClick={save}>Guardar</button><div className="qrprint"><h3>QR físico del bar</h3><p>Imprime este código y colócalo en zona de personal.</p><img src="/qr_bar_colibri.png"/></div></div>}
createRoot(document.getElementById('root')).render(<App/>);
