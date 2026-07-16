import React,{useEffect,useMemo,useState} from 'react';
import {Bell,CalendarDays,CheckCircle2,ChevronRight,Clock3,Euro,Eye,EyeOff,KeyRound,LayoutDashboard,LogIn,LogOut,MessageCircle,ShieldCheck,TrendingUp,UserRound} from 'lucide-react';
import {HOURLY_RATE,DAYS_ES,RESTAURANT_ID,copyText,dayName,durationText,isoDate,mondayOf,money,pairClockRecords,scheduleForEmployee,scheduledMinutes,slotBounds,weekIdFor} from './peopleUtils';

export default function PeoplePortal({supabase,Brand}){
 const[employee,setEmployee]=useState(null),[employees,setEmployees]=useState([]),[name,setName]=useState(''),[pin,setPin]=useState(''),[msg,setMsg]=useState(''),[showPin,setShowPin]=useState(false);
 useEffect(()=>{loadEmployees()},[]);
 async function loadEmployees(){if(!supabase)return;const{data}=await supabase.from('employees').select('id,name,active,can_clock').eq('active',true).eq('can_clock',true).order('name');setEmployees(data||[])}
 async function login(){if(!name||!pin)return setMsg('Selecciona tu nombre e introduce tu PIN.');setMsg('Comprobando acceso...');const{data,error}=await supabase.from('employees').select('*').eq('name',name).eq('pin',pin).eq('active',true).maybeSingle();if(error||!data)return setMsg('No hemos podido validar el acceso. Revisa el PIN o consulta con tu encargado.');setEmployee(data);setMsg('')}
 if(!employee)return <main className="peopleV2Login">
   <div className="peopleV2LoginWrap">
    <Brand/>
    <section className="peopleV2Intro">
      <span className="peopleV2Eyebrow">COLIBRÍ PEOPLE</span>
      <h2>Tu jornada, tus horas<br/><strong>y tu tranquilidad</strong></h2>
      <p>Entra para fichar y consultar cómo llevas la semana.</p>
    </section>
    <section className="peopleV2LoginCard">
      <label className="peopleV2Field"><span className="peopleV2FieldIcon"><UserRound/></span><span className="peopleV2FieldBody"><small>Empleado</small><select value={name} onChange={e=>setName(e.target.value)}><option value="">Selecciona tu nombre</option>{employees.map(e=><option key={e.id}>{e.name}</option>)}</select></span></label>
      <label className="peopleV2Field"><span className="peopleV2FieldIcon mint"><KeyRound/></span><span className="peopleV2FieldBody"><small>Tu PIN</small><input type={showPin?'text':'password'} inputMode="numeric" placeholder="••••" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()}/></span><button className="peopleV2Eye" onClick={()=>setShowPin(v=>!v)} aria-label="Mostrar u ocultar PIN">{showPin?<EyeOff/>:<Eye/>}</button></label>
      <button className="peopleV2Primary" onClick={login}><LogIn/> Entrar en Mi Jornada</button>
      {msg&&<p className="peopleV2Message">{msg}</p>}
      <div className="peopleV2Trust"><ShieldCheck/><span>Tu PIN es personal. Puedes cambiarlo dentro de tu perfil.</span></div>
    </section>
    <div className="peopleV2Tip"><span>💡</span><div><b>Consejo</b><p>Mantén tu PIN en privado y cámbialo cuando lo necesites.</p></div><ChevronRight/></div>
    <footer>Colibrí People, pensado <b>para ti.</b></footer>
   </div>
  </main>;
 return <EmployeeHome supabase={supabase} employee={employee} onLogout={()=>{setEmployee(null);setPin('')}}/>;
}

function EmployeeHome({supabase,employee,onLogout}){
 const[tab,setTab]=useState('jornada'),[rows,setRows]=useState([]),[scheduleRow,setScheduleRow]=useState(null),[requests,setRequests]=useState([]),[loading,setLoading]=useState(true),[msg,setMsg]=useState(''),[now,setNow]=useState(new Date());
 const monday=mondayOf(),from=isoDate(monday),to=isoDate(new Date(monday.getTime()+7*86400000)),weekId=weekIdFor();
 useEffect(()=>{load();const t=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(t)},[]);
 async function load(){setLoading(true);const[{data:r},{data:s},{data:q}]=await Promise.all([
  supabase.from('clock_records').select('*').or(`employee_id.eq.${employee.id},employee_name.eq.${employee.name}`).gte('created_at',from+'T00:00:00').lt('created_at',to+'T00:00:00').order('created_at'),
  supabase.from('work_schedule_weeks').select('*').eq('restaurant_id',RESTAURANT_ID).eq('week_id',weekId).maybeSingle(),
  supabase.from('employee_time_requests').select('*').eq('employee_id',employee.id).order('created_at',{ascending:false}).limit(20)
 ]);setRows(r||[]);setScheduleRow(s||null);setRequests(q||[]);setLoading(false)}
 const pairs=useMemo(()=>pairClockRecords(rows),[rows,now]);const schedule=useMemo(()=>scheduleForEmployee(scheduleRow,employee),[scheduleRow,employee]);
 const latest=rows[rows.length-1],working=String(latest?.type||'').toLowerCase()==='entrada';
 const totalMinutes=Object.values(pairs).flat().reduce((a,x)=>a+x.minutes,0);const planned=scheduledMinutes(schedule);const pending=requests.filter(x=>x.status==='pending');
 const validatedMinutes=Object.entries(pairs).reduce((sum,[date,ps])=>{const actual=ps.reduce((a,x)=>a+x.minutes,0);const day=dayName(date+'T12:00:00');const dailyPlanned=scheduledMinutes({[day]:schedule[day]||[]});const approved=requests.some(r=>r.status==='approved'&&isoDate(r.proposed_at)===date);return sum+(approved?actual:dailyPlanned?Math.min(actual,dailyPlanned):0)},0);
 const todayName=dayName(new Date()),todayBounds=slotBounds(schedule[todayName]||[]);
 async function clock(type,method='gps'){
  setMsg('Comprobando ubicación...');let coords=null;if(method==='gps'){try{coords=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000}));}catch{return setMsg('No se pudo obtener el GPS. Usa el QR del local.')}}
  const note=type==='salida'&&todayBounds&&new Date().toTimeString().slice(0,5)>todayBounds.end?prompt('Has superado el horario previsto. Escribe el motivo para que el gerente pueda revisarlo:','')||'': '';
  const{data,error}=await supabase.rpc('registrar_fichaje_v2',{p_employee_name:employee.name,p_pin:employee.pin,p_type:type,p_note:note,p_gps_lat:coords?.coords?.latitude||null,p_gps_lng:coords?.coords?.longitude||null,p_accuracy:coords?.coords?.accuracy||null,p_method:method});
  if(error||!data?.ok){setMsg('No se pudo fichar: '+(error?.message||data?.message||'revisa el GPS o usa QR'));return}
  if(type==='salida'&&note){await supabase.from('employee_time_requests').insert({employee_id:employee.id,employee_name:employee.name,request_type:'overtime',proposed_at:new Date().toISOString(),reason:note,status:'pending'});setMsg('Salida registrada. El tiempo fuera del cuadrante queda pendiente de validación.')}else setMsg(type==='entrada'?'Entrada registrada correctamente. ¡Buen turno!':'Salida registrada. Tu resumen ya está actualizado.');await load();
 }
 async function requestForgottenExit(){const open=[...rows].reverse().find(r=>String(r.type).toLowerCase()==='entrada');if(!open)return setMsg('No encontramos una entrada abierta esta semana.');const proposed=prompt('Indica la fecha y hora real de salida (AAAA-MM-DD HH:MM)',`${isoDate(new Date())} ${new Date().toTimeString().slice(0,5)}`);if(!proposed)return;const reason=prompt('Cuéntanos brevemente qué ocurrió.','Se me olvidó fichar al salir.');if(!reason)return;const{error}=await supabase.from('employee_time_requests').insert({employee_id:employee.id,employee_name:employee.name,request_type:'forgotten_exit',related_clock_id:open.id,proposed_at:new Date(proposed.replace(' ','T')).toISOString(),reason,status:'pending'});if(error)return setMsg(error.message);setMsg('Solicitud enviada. Tu encargado la revisará.');load()}
 async function shareWeek(){let text=`*Mi resumen semanal · ${employee.name}*\n`;for(let i=0;i<7;i++){const d=new Date(monday);d.setDate(d.getDate()+i);const key=isoDate(d),mins=(pairs[key]||[]).reduce((a,x)=>a+x.minutes,0);text+=`${DAYS_ES[i]}: ${durationText(mins)}${(pairs[key]||[]).some(x=>!x.exit)?' (jornada abierta)':''}\n`}text+=`\nTotal fichado: *${durationText(totalMinutes)}*\nHoras previstas: ${durationText(planned)}\nEstimación validada: ${money(validatedMinutes/60*HOURLY_RATE)}`;await copyText(text);setMsg('Resumen copiado. Ya puedes pegarlo en WhatsApp.')}
 async function changePin(){const current=prompt('Introduce tu PIN actual');if(current!==String(employee.pin))return setMsg('El PIN actual no coincide.');const next=prompt('Nuevo PIN (4 a 8 números)');if(!/^\d{4,8}$/.test(next||''))return setMsg('El PIN debe tener entre 4 y 8 números.');const{error}=await supabase.rpc('employee_change_own_pin',{p_employee_id:employee.id,p_current_pin:current,p_new_pin:next});if(error)return setMsg(error.message);employee.pin=next;setMsg('PIN cambiado correctamente.')}
 async function enableReminders(){if(!('Notification'in window))return setMsg('Este móvil no admite notificaciones web.');const p=await Notification.requestPermission();if(p==='granted'){localStorage.setItem('colibriPeopleNotifications','1');new Notification('Colibrí People',{body:'Recordatorios activados. Te ayudaremos a no olvidar tus fichajes.'});setMsg('Recordatorios activados. Añade esta web a la pantalla de inicio para mayor fiabilidad.')}else setMsg('No se han autorizado las notificaciones.')}
 const difference=totalMinutes-planned;const punctual=rows.filter(r=>r.type==='entrada').length?Math.max(0,100-Math.min(40,rows.filter(r=>r.type==='entrada'&&r.note).length*5)):100;
 const currentMinutes=working&&latest?Math.max(0,Math.round((now-new Date(latest.created_at))/60000)):0;
 const completeDays=Object.values(pairs).filter(x=>x.some(p=>p.exit)).length;
 const pct=planned?Math.round(totalMinutes/planned*100):0;
 const tabs=[['jornada','Mi jornada',Clock3],['semana','Mi semana',CalendarDays],['evolucion','Mi evolución',TrendingUp],['perfil','Mi perfil',UserRound]];
 return <main className="peopleV2App">
  <header className="peopleV2Header">
   <div className="peopleV2HeaderBrand"><img src="/colibri-brand.png" alt="Colibrí"/><div><b>Colibrí <span>People</span></b><small>Brasería El Colibrí</small></div></div>
   <div className="peopleV2Welcome"><div><h1>Hola, {employee.name} 👋</h1><p>{working?'Tu jornada está en marcha.':'Todo listo para tu próxima jornada.'}</p><span className={working?'peopleV2Status on':'peopleV2Status'}>{working?'● En turno':'○ Fuera de turno'}</span></div><button onClick={onLogout}><LogOut/> Salir</button></div>
  </header>
  <nav className="peopleV2Tabs">{tabs.map(([id,label,Icon])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}><Icon/><span>{label}</span></button>)}</nav>
  <div className="peopleV2Content">
   {msg&&<div className="peopleV2Notice">{msg}</div>}
   {loading?<section className="peopleV2Card">Cargando tus datos...</section>:<>
   {tab==='jornada'&&<>
    <section className="peopleV2Card peopleV2Today">
      <div className="peopleV2SectionTitle"><span className="purple"><Clock3/></span><h2>Mi jornada</h2></div>
      <div className="peopleV2TodayGrid">
       <div><small>Hoy</small><b>{new Date().toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}</b><span>{todayBounds?`${todayBounds.start} – ${todayBounds.end}`:'Sin turno asignado'}</span></div>
       <div><small>{working?'Tiempo en turno':'Horas hoy'}</small><b>{durationText(working?currentMinutes:(pairs[isoDate(new Date())]||[]).reduce((a,x)=>a+x.minutes,0))}</b><span>{working?'contador activo':'jornada registrada'}</span></div>
       <div><small>Sueldo estimado</small><b className="green">{money(validatedMinutes/60*HOURLY_RATE)}</b><span>esta semana</span></div>
      </div>
      <div className="peopleV2ClockButtons"><button onClick={()=>clock('entrada')} disabled={working}><LogIn/> Fichar entrada</button><button className="danger" onClick={()=>clock('salida')} disabled={!working}><LogOut/> Fichar salida</button></div>
      <div className="peopleV2Secondary"><button onClick={()=>clock('entrada','qr')}>Entrada QR</button><button onClick={()=>clock('salida','qr')}>Salida QR</button><button onClick={requestForgottenExit}>Olvidé fichar la salida</button></div>
    </section>
    <section className="peopleV2Card">
      <div className="peopleV2SectionTitle"><span className="mint"><CalendarDays/></span><h2>Mi semana</h2></div>
      <div className="peopleV2WeekMetrics"><div><small>Horas fichadas</small><b>{durationText(totalMinutes)}</b></div><div><small>Horas previstas</small><b>{durationText(planned)}</b></div><div><small>Diferencia</small><b className={difference>=0?'green':'orange'}>{difference>=0?'+':''}{durationText(difference)}</b></div></div>
      <div className="peopleV2Progress"><i style={{width:`${Math.min(100,Math.max(0,pct))}%`}}/></div><p className="peopleV2ProgressCopy">{pct}% de las horas previstas</p>
    </section>
    <section className="peopleV2Card">
      <div className="peopleV2SectionTitle"><span className="purple"><TrendingUp/></span><h2>Mi evolución</h2></div>
      <div className="peopleV2Stats"><div><TrendingUp/><small>Puntualidad</small><b>{punctual}%</b><span>Excelente</span></div><div><CheckCircle2/><small>Jornadas completas</small><b>{completeDays}</b><span>esta semana</span></div><div><MessageCircle/><small>Solicitudes</small><b>{pending.length}</b><span>pendientes</span></div><div><LayoutDashboard/><small>Cuadrante</small><b>{pct}%</b><span>horas previstas</span></div></div>
      <p className="peopleV2Positive">🌿 Tus datos te ayudan a tener siempre claro tu trabajo y tus horas.</p>
    </section>
    <section className="peopleV2Card"><div className="peopleV2SectionTitle"><span className="purple">💡</span><h2>Mis solicitudes</h2></div>{requests.length?requests.slice(0,4).map(r=><div className="peopleV2Request" key={r.id}><div><b>{r.request_type==='forgotten_exit'?'Salida olvidada':'Regularización'}</b><span>{new Date(r.proposed_at).toLocaleString('es-ES')}</span></div><em className={r.status}>{r.status==='pending'?'En revisión':r.status==='approved'?'Aprobada':'Rechazada'}</em></div>):<p className="peopleV2Empty"><CheckCircle2/> No tienes solicitudes. Todo está en orden.</p>}</section>
   </>}
   {tab==='semana'&&<section className="peopleV2Card"><div className="peopleV2TitleRow"><div><h2>Mi semana</h2><p>Tu resumen claro, día a día.</p></div><button onClick={shareWeek}><MessageCircle/> WhatsApp</button></div><div className="peopleV2Days">{DAYS_ES.map((day,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);const p=pairs[isoDate(d)]||[],mins=p.reduce((a,x)=>a+x.minutes,0),bounds=slotBounds(schedule[day]||[]);return <article key={day}><div><b>{day}</b><small>{bounds?`${bounds.start}–${bounds.end}`:'Libre'}</small></div><strong>{durationText(mins)}</strong><span>{p.some(x=>!x.exit)?'🟡':mins?'✅':'—'}</span></article>})}</div><div className="peopleV2Totals"><span>Total <b>{durationText(totalMinutes)}</b></span><span>Previstas <b>{durationText(planned)}</b></span><span>Pendientes <b>{pending.length}</b></span></div></section>}
   {tab==='evolucion'&&<><section className="peopleV2Card"><div className="peopleV2SectionTitle"><span className="purple"><TrendingUp/></span><h2>Mi evolución</h2></div><div className="peopleV2Stats"><div><TrendingUp/><small>Puntualidad</small><b>{punctual}%</b><span>Excelente</span></div><div><CheckCircle2/><small>Jornadas completas</small><b>{completeDays}</b><span>esta semana</span></div><div><MessageCircle/><small>Solicitudes</small><b>{requests.length}</b><span>totales</span></div><div><LayoutDashboard/><small>Cuadrante</small><b>{pct}%</b><span>completado</span></div></div></section><section className="peopleV2Card"><h2>Mis solicitudes</h2>{requests.length?requests.map(r=><div className="peopleV2Request" key={r.id}><div><b>{r.request_type==='forgotten_exit'?'Salida olvidada':'Regularización'}</b><span>{new Date(r.proposed_at).toLocaleString('es-ES')}</span></div><em className={r.status}>{r.status==='pending'?'En revisión':r.status==='approved'?'Aprobada':'Rechazada'}</em></div>):<p className="peopleV2Empty"><CheckCircle2/> No tienes solicitudes. Todo está en orden.</p>}</section></>}
   {tab==='perfil'&&<div className="peopleV2ProfileGrid"><section className="peopleV2Card peopleV2Profile"><div className="peopleV2Avatar">{employee.name.slice(0,1).toUpperCase()}</div><h2>{employee.name}</h2><p>Tu perfil personal de Colibrí People</p><button onClick={changePin}><KeyRound/> Cambiar mi PIN</button><small>Tu gerente puede restablecerlo si lo olvidas.</small></section><section className="peopleV2Card"><div className="peopleV2SectionTitle"><span className="mint"><Bell/></span><h2>Recordatorios</h2></div><p>Activa avisos para recordar la entrada y la salida.</p><button className="peopleV2Primary inline" onClick={enableReminders}><Bell/> Activar notificaciones</button><small>En iPhone, añade la web a la pantalla de inicio.</small></section></div>}
   </>}
  </div>
 </main>;
}
