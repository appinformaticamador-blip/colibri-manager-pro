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

function money(v){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v||0))}
function fmtDate(d){return new Date(d+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}
function addDays(dateStr,n){const d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
async function loadSalesForDate(date){
 if(!supabase)return {daily:null,tickets:[],lines:[],sync:null,error:'Supabase no configurado'};
 const start=date+'T00:00:00'; const end=addDays(date,1)+'T00:00:00';
 const [{data:dailyData},{data:ticketsData,error:ticketError},{data:syncData}] = await Promise.all([
  supabase.from('numier_daily_sales').select('*').eq('fecha',date).maybeSingle(),
  supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(5000),
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1)
 ]);
 const tickets=ticketsData||[];
 let daily=dailyData;
 if(!daily){
  const total=tickets.reduce((a,t)=>a+Number(t.total||0),0);
  const efectivo=tickets.reduce((a,t)=>a+Number(t.efectivo||0),0);
  const tarjeta=tickets.reduce((a,t)=>a+Number(t.tarjeta||0),0);
  const cheque=tickets.reduce((a,t)=>a+Number(t.cheque||0),0);
  daily={fecha:date,total,tickets:tickets.length,ticket_medio:tickets.length?total/tickets.length:0,efectivo,tarjeta,cheque};
 }
 return {daily,tickets,lines:[],sync:syncData?.[0]||null,error:ticketError?.message||null};
}

async function loadSyncStatus(){
 if(!supabase)return null;
 const {data}=await supabase.from('numier_sync_status').select('*').eq('status_key','numier').maybeSingle();
 return data||null;
}
function secondsAgo(iso){if(!iso)return '-';const s=Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/1000));if(s<60)return `hace ${s}s`;const m=Math.round(s/60);if(m<60)return `hace ${m}min`;return new Date(iso).toLocaleString('es-ES')}
function SyncStatusCard(){
 const[st,setSt]=useState(null);
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[]);
 async function load(){setSt(await loadSyncStatus())}
 const pct=Math.max(0,Math.min(100,Number(st?.progress_percent||0)));
 const live=pct>=100||String(st?.mode||'').toUpperCase().includes('LIVE');
 return <div className={'card syncStatus '+(live?'live':'syncing')}>
  <div className="row between"><div><h2>{live?'🟢 ACTUALIZADO 100%':'🟡 SINCRONIZANDO'}</h2><p>{st?.message||'Esperando datos de Colibrí Sync'}</p></div><div className="syncPct">{pct.toFixed(1)}%</div></div>
  <div className="progress"><i style={{width:`${pct}%`}}></i></div>
  <div className="syncGrid">
   <span>Procesados <b>{Number(st?.processed_tickets||0).toLocaleString('es-ES')}</b></span>
   <span>Total <b>{Number(st?.total_tickets||0).toLocaleString('es-ES')}</b></span>
   <span>Pendientes <b>{Number(st?.pending_tickets||0).toLocaleString('es-ES')}</b></span>
   <span>Último CAB_ID <b>{Number(st?.last_cab_id||0).toLocaleString('es-ES')}</b></span>
   <span>Última sync <b>{secondsAgo(st?.updated_at)}</b></span>
   <span>Modo <b>{st?.mode||'-'}</b></span>
  </div>
 </div>
}

function SalesCards({daily,sync}){return <div className="grid">
 <div className="card kpi"><span>💶 Ventas</span><b>{money(daily?.total)}</b></div>
 <div className="card kpi"><span>🎫 Tickets</span><b>{daily?.tickets||0}</b></div>
 <div className="card kpi"><span>📊 Ticket medio</span><b>{money(daily?.ticket_medio)}</b></div>
 <div className="card kpi"><span>💵 Efectivo</span><b>{money(daily?.efectivo)}</b></div>
 <div className="card kpi"><span>💳 Tarjeta</span><b>{money(daily?.tarjeta)}</b></div>
 <div className="card kpi"><span>🔄 Última sync</span><b>{sync?.synced_at?new Date(sync.synced_at).toLocaleTimeString('es-ES'):'-'}</b></div>
 </div>}
function SalesByHour({tickets}){const by={};(tickets||[]).forEach(t=>{const d=new Date(t.hora||t.created_at);const h=String(d.getHours()).padStart(2,'0')+':00';by[h]=(by[h]||0)+Number(t.total||0)});const max=Math.max(1,...Object.values(by));return <div>{Object.entries(by).map(([k,v])=><div className="barrow" key={k}><span>{k}</span><div><i style={{width:`${Math.max(4,(v/max)*100)}%`}}></i></div><b>{money(v)}</b></div>)}</div>}

const SHIFT_DEFS=[
 {id:'desayuno',name:'☕ Desayuno',start:8,end:12},
 {id:'almuerzo',name:'🍽️ Almuerzo',start:12,end:16},
 {id:'tarde',name:'🌇 Tarde',start:16,end:20},
 {id:'cena',name:'🌙 Cena',start:20,end:23.5}
];
const EMPLOYEE_HOUR_COST=7;
function decimalHour(dt){const d=new Date(dt);return d.getHours()+d.getMinutes()/60}
function overlapHours(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1))}
function shiftForTicket(t){const hh=decimalHour(t.hora||t.created_at);return SHIFT_DEFS.find(s=>hh>=s.start&&hh<s.end)?.id||'otros'}
function rangeDates(mode,date){
 if(mode==='hoy') return {from:today(),to:addDays(today(),1),label:'Hoy'};
 if(mode==='ayer') {const d=addDays(today(),-1);return {from:d,to:addDays(d,1),label:'Ayer'}};
 if(mode==='semana') return {from:addDays(today(),-6),to:addDays(today(),1),label:'Últimos 7 días'};
 if(mode==='mes'){const d=new Date();const f=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);return {from:f,to:addDays(today(),1),label:'Mes actual'}};
 return {from:date,to:addDays(date,1),label:fmtDate(date)};
}
async function loadSalesRange(from,to){
 if(!supabase)return {tickets:[],lines:[],sync:null};
 const start=from+'T00:00:00'; const end=to+'T00:00:00';
 const [{data:ticketsData},{data:syncData}]=await Promise.all([
  supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(10000),
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1)
 ]);
 const tickets=ticketsData||[]; const cabIds=tickets.map(t=>t.cab_id).filter(Boolean); let lines=[];
 for(let i=0;i<cabIds.length;i+=200){
  const chunk=cabIds.slice(i,i+200);
  const {data}=await supabase.from('numier_ticket_lines').select('*').in('cab_id',chunk).limit(10000);
  if(data) lines=lines.concat(data);
 }
 return {tickets,lines,sync:syncData?.[0]||null};
}
function summarizeTickets(tickets){
 const total=tickets.reduce((a,t)=>a+Number(t.total||0),0);
 const efectivo=tickets.reduce((a,t)=>a+Number(t.efectivo||0),0);
 const tarjeta=tickets.reduce((a,t)=>a+Number(t.tarjeta||0),0);
 const cheque=tickets.reduce((a,t)=>a+Number(t.cheque||0),0);
 return {total,tickets:tickets.length,ticket_medio:tickets.length?total/tickets.length:0,efectivo,tarjeta,cheque};
}
function productRank(lines,sort='qty'){
 const map=new Map();
 (lines||[]).forEach(l=>{const name=(l.descripcion||l.articulo||'Producto sin nombre').trim(); const r=map.get(name)||{name,qty:0,total:0,tickets:new Set()}; r.qty+=Number(l.cantidad||0); r.total+=Number(l.importe||0); if(l.cab_id)r.tickets.add(l.cab_id); map.set(name,r)});
 return [...map.values()].map(r=>({...r,ticketCount:r.tickets.size,avg:r.qty?r.total/r.qty:0})).sort((a,b)=>sort==='total'?b.total-a.total:b.qty-a.qty);
}
function ProductRanking({lines}){const[sort,setSort]=useState('qty');const top=productRank(lines,sort).slice(0,20);return <div className="card"><div className="row between"><h2>🍽️ Ranking de productos</h2><div><button className={sort==='qty'?'active':''} onClick={()=>setSort('qty')}>Unidades</button><button className={sort==='total'?'active':''} onClick={()=>setSort('total')}>Facturación</button></div></div><table><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Total</th><th>€/ud</th></tr></thead><tbody>{top.map((p,i)=><tr key={p.name}><td>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td><b>{p.name}</b></td><td>{p.qty.toFixed(2)}</td><td>{money(p.total)}</td><td>{money(p.avg)}</td></tr>)}</tbody></table>{top.length===0&&<p>No hay líneas de productos para este periodo.</p>}</div>}
function ShiftProfitability({tickets,clockRows}){
 const shiftStats=SHIFT_DEFS.map(s=>({ ...s, sales:0,tickets:0,staffHours:0,cost:0,profitIndex:0,eurosHour:0 }));
 tickets.forEach(t=>{const id=shiftForTicket(t); const st=shiftStats.find(x=>x.id===id); if(st){st.sales+=Number(t.total||0);st.tickets++}});
 // Pair clock entries/exits by employee for selected day/range loaded in clockRows
 const byEmp={}; (clockRows||[]).slice().reverse().forEach(r=>{const k=r.employee_id||r.employee_name; byEmp[k]=byEmp[k]||[]; byEmp[k].push(r)});
 Object.values(byEmp).forEach(list=>{let open=null; list.forEach(r=>{const typ=String(r.type).toLowerCase(); if(typ==='entrada')open=r; else if(typ==='salida'&&open){const a=decimalHour(open.created_at), b=decimalHour(r.created_at); if(b>a){shiftStats.forEach(s=>s.staffHours+=overlapHours(a,b,s.start,s.end));} open=null;}})});
 shiftStats.forEach(s=>{s.cost=s.staffHours*EMPLOYEE_HOUR_COST; s.profitIndex=s.sales-s.cost; s.eurosHour=s.staffHours?s.sales/s.staffHours:0});
 return <div className="card"><h2>⏰ Rentabilidad por turnos</h2><p className="mutedText">Coste empleado configurado: <b>7 €/h</b></p><table><thead><tr><th>Turno</th><th>Ventas</th><th>Tickets</th><th>Horas personal</th><th>Coste personal</th><th>Índice</th></tr></thead><tbody>{shiftStats.map(s=><tr key={s.id}><td><b>{s.name}</b></td><td>{money(s.sales)}</td><td>{s.tickets}</td><td>{s.staffHours.toFixed(1)} h</td><td>{money(s.cost)}</td><td><b className={s.profitIndex>=0?'ok':'bad'}>{money(s.profitIndex)}</b></td></tr>)}</tbody></table></div>
}
function PredictionBox({mode,date,tickets}){const total=tickets.reduce((a,t)=>a+Number(t.total||0),0);const projected=mode==='hoy'? total/Math.max(0.25,(new Date().getHours()+new Date().getMinutes()/60-8)/15.5) : total;return <div className="card"><h2>🔮 Predicción rápida</h2>{mode==='hoy'?<><p>Ventas actuales: <b>{money(total)}</b></p><p>Si el ritmo se mantiene, cierre estimado: <b>{money(Math.max(total,projected))}</b></p></>:<p>Selecciona <b>Hoy</b> para ver predicción de cierre.</p>}<p className="mutedText">La predicción mejorará cuando acumulemos más histórico por día de semana.</p></div>}
function BusinessIntelligence(){const[mode,setMode]=useState('hoy');const[date,setDate]=useState(today());const[bi,setBi]=useState({tickets:[],lines:[],sync:null});const[clock,setClock]=useState([]);const[loading,setLoading]=useState(false);const r=rangeDates(mode,date);useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[mode,date]);async function load(){if(!supabase)return;setLoading(true);const [{tickets,lines,sync},{data:clockData}]=await Promise.all([loadSalesRange(r.from,r.to),supabase.from('clock_records').select('*').gte('created_at',r.from+'T00:00:00').lt('created_at',r.to+'T00:00:00').order('created_at',{ascending:true}).limit(5000)]);setBi({tickets,lines,sync});setClock(clockData||[]);setLoading(false)}const daily=summarizeTickets(bi.tickets);return <div><div className="card hero"><div><h2>📊 Inteligencia de Negocio v2.4</h2><p>{r.label}</p></div><div className="row controls"><button className={mode==='hoy'?'active':''} onClick={()=>setMode('hoy')}>Hoy</button><button className={mode==='ayer'?'active':''} onClick={()=>setMode('ayer')}>Ayer</button><button className={mode==='semana'?'active':''} onClick={()=>setMode('semana')}>7 días</button><button className={mode==='mes'?'active':''} onClick={()=>setMode('mes')}>Mes</button><input type="date" value={date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/><button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div><SyncStatusCard/><SalesCards daily={daily} sync={bi.sync}/><div className="grid"><PredictionBox mode={mode} date={date} tickets={bi.tickets}/><div className="card"><h2>📈 Ventas por hora</h2><SalesByHour tickets={bi.tickets}/></div></div><ShiftProfitability tickets={bi.tickets} clockRows={clock}/><ProductRanking lines={bi.lines}/><DailyReport summary={daily} lines={bi.lines} tickets={bi.tickets} clockRows={clock} period={r}/></div>}
function DailyReport({summary,lines,tickets,clockRows,period}){const topQty=productRank(lines,'qty')[0];const topMoney=productRank(lines,'total')[0];const totalStaffHours=(clockRows||[]).filter(r=>String(r.type).toLowerCase()==='entrada').length;return <div className="card report"><h2>🧾 Informe diario / periodo</h2><div className="reportGrid"><p><span>Ventas</span><b>{money(summary.total)}</b></p><p><span>Tickets</span><b>{summary.tickets}</b></p><p><span>Ticket medio</span><b>{money(summary.ticket_medio)}</b></p><p><span>Producto más vendido</span><b>{topQty?topQty.name:'-'}</b></p><p><span>Mayor facturación</span><b>{topMoney?topMoney.name:'-'}</b></p><p><span>Coste hora</span><b>7 €/h</b></p></div><button onClick={()=>navigator.clipboard.writeText(`INFORME COLIBRÍ ERP\n${period.label}\nVentas: ${money(summary.total)}\nTickets: ${summary.tickets}\nTicket medio: ${money(summary.ticket_medio)}\nEfectivo: ${money(summary.efectivo)}\nTarjeta: ${money(summary.tarjeta)}\nProducto más vendido: ${topQty?topQty.name:'-'}\nMayor facturación: ${topMoney?topMoney.name:'-'}`)}>Copiar informe</button><p className="mutedText">El informe automático de las 00:00 queda preparado a nivel de datos; de momento también puedes generarlo y copiarlo desde aquí.</p></div>}



const DAILY_TARGET=4000;
function pct(n,d){return d?((Number(n||0)/Number(d||1))*100):0}
function dayName(dateStr){return new Date(dateStr+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long'})}
function timeOnly(iso){return iso?new Date(iso).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'-'}
function latestByEmployee(rows){
 const latest=new Map();
 (rows||[]).forEach(r=>{const k=r.employee_id||r.employee_name;if(!latest.has(k))latest.set(k,r)});
 return latest;
}
function expectedEndProjection(total,date){
 if(date!==today()) return total;
 const now=new Date();
 const current=now.getHours()+now.getMinutes()/60;
 const open=8, close=23.5;
 const progress=Math.max(.08,Math.min(1,(current-open)/(close-open)));
 return Math.max(total,total/progress);
}
function buildTimeline({tickets=[],clockRows=[],target=DAILY_TARGET}){
 const ev=[];
 const firstTicket=tickets[0];
 const lastTicket=tickets[tickets.length-1];
 const maxTicket=[...tickets].sort((a,b)=>Number(b.total||0)-Number(a.total||0))[0];
 const firstClock=[...clockRows].reverse().find(r=>String(r.type).toLowerCase()==='entrada');
 if(firstClock) ev.push({time:firstClock.created_at,label:`${firstClock.employee_name} ficha entrada`,icon:'👤'});
 if(firstTicket) ev.push({time:firstTicket.hora,label:`Primer ticket · ${money(firstTicket.total)}`,icon:'🧾'});
 let acc=0, milestone25=null, milestone50=null, milestone75=null, milestone100=null;
 tickets.forEach(t=>{
  acc+=Number(t.total||0);
  if(!milestone25&&acc>=target*.25) milestone25={time:t.hora,label:'25% del objetivo alcanzado',icon:'🎯'};
  if(!milestone50&&acc>=target*.50) milestone50={time:t.hora,label:'50% del objetivo alcanzado',icon:'🎯'};
  if(!milestone75&&acc>=target*.75) milestone75={time:t.hora,label:'75% del objetivo alcanzado',icon:'🎯'};
  if(!milestone100&&acc>=target) milestone100={time:t.hora,label:'Objetivo diario alcanzado',icon:'🏆'};
 });
 [milestone25,milestone50,milestone75,milestone100].filter(Boolean).forEach(e=>ev.push(e));
 if(maxTicket) ev.push({time:maxTicket.hora,label:`Ticket más alto · ${money(maxTicket.total)}`,icon:'💎'});
 if(lastTicket) ev.push({time:lastTicket.hora,label:`Último ticket · ${money(lastTicket.total)}`,icon:'🧾'});
 return ev.filter(e=>e.time).sort((a,b)=>new Date(a.time)-new Date(b.time)).slice(0,12);
}
function currentDaySpanish(){
 const ix=(new Date().getDay()+6)%7;
 return DAYS[ix];
}
function scheduledLateAlerts(clockRows){
 const alerts=[];
 let schedule={};
 try{schedule=JSON.parse(localStorage.colibriSchedule||'{}')}catch(e){schedule={}}
 const day=currentDaySpanish();
 const w=week();
 const now=new Date();
 const todayStart=today()+'T00:00:00';
 const entradas=new Set((clockRows||[]).filter(r=>String(r.type).toLowerCase()==='entrada'&&String(r.created_at||'')>=todayStart).map(r=>r.employee_name));
 for(const slot of SLOTS){
  const [from]=slot.split('-');
  const [hh,mm]=from.split(':').map(Number);
  const startDate=new Date(); startDate.setHours(hh,mm+10,0,0);
  if(now<startDate) continue;
  const employees=schedule[`${w}|${day}|${slot}`]||[];
  employees.forEach(e=>{
   const name=e.name||e.employee_name;
   if(name&&!entradas.has(name)) alerts.push({level:'critical',text:`${name} debía entrar a las ${from} y no ha fichado.`});
  });
 }
 return alerts;
}
function buildExecutiveMessage({daily,lastWeek,projected,date}){
 const total=Number(daily?.total||0);
 const lw=Number(lastWeek?.daily?.total||0);
 const diff=lw?((total-lw)/lw)*100:null;
 const objetivo=DAILY_TARGET;
 const p=pct(total,objetivo);
 const projectedDiff=pct(projected,objetivo)-100;
 if(date!==today()){
  return `Resumen de ${fmtDate(date)}: ventas ${money(total)}, ${daily?.tickets||0} tickets y ticket medio ${money(daily?.ticket_medio)}.`;
 }
 if(total===0) return 'Todavía no hay ventas registradas hoy. El sistema está esperando nuevos tickets de NUMIER.';
 let trend='';
 if(diff!==null) trend=` Respecto al mismo día de la semana pasada vas ${Math.abs(diff).toFixed(1)}% ${diff>=0?'por encima':'por debajo'}.`;
 let forecast=` Si el ritmo se mantiene, el cierre estimado es ${money(projected)}, ${projectedDiff>=0?'por encima':'por debajo'} del objetivo diario.`;
 if(p<50) return `Ahora mismo llevas ${money(total)}, un ${p.toFixed(0)}% del objetivo.${trend}${forecast}`;
 if(p>=100) return `Objetivo diario alcanzado. Llevas ${money(total)}, un ${p.toFixed(0)}% del objetivo.${trend}`;
 return `El negocio avanza correctamente: ${money(total)} vendidos, ${daily?.tickets||0} tickets y ${money(daily?.ticket_medio)} de ticket medio.${trend}${forecast}`;
}
function ShiftCards({tickets,clockRows}){
 const shiftStats=SHIFT_DEFS.map(s=>({ ...s, sales:0,tickets:0,staffHours:0,cost:0,score:1 }));
 tickets.forEach(t=>{const id=shiftForTicket(t); const st=shiftStats.find(x=>x.id===id); if(st){st.sales+=Number(t.total||0);st.tickets++}});
 const byEmp={}; (clockRows||[]).slice().reverse().forEach(r=>{const k=r.employee_id||r.employee_name;byEmp[k]=byEmp[k]||[];byEmp[k].push(r)});
 Object.values(byEmp).forEach(list=>{let open=null;list.forEach(r=>{const typ=String(r.type).toLowerCase();if(typ==='entrada')open=r;else if(typ==='salida'&&open){const a=decimalHour(open.created_at),b=decimalHour(r.created_at);if(b>a)shiftStats.forEach(s=>s.staffHours+=overlapHours(a,b,s.start,s.end));open=null;}})});
 const max=Math.max(1,...shiftStats.map(s=>s.sales));
 shiftStats.forEach(s=>{s.cost=s.staffHours*EMPLOYEE_HOUR_COST;s.score=Math.max(1,Math.round((s.sales/max)*5));});
 return <div className="commandShiftGrid">{shiftStats.map(s=><div className="shiftCard" key={s.id}><h3>{s.name}</h3><b>{money(s.sales)}</b><span>{'★'.repeat(s.score)}{'☆'.repeat(5-s.score)}</span><small>{s.tickets} tickets · coste pers. {money(s.cost)}</small></div>)}</div>
}
function TopProductCards({lines}){
 const top=productRank(lines,'qty').slice(0,5);
 return <div className="topProductCards">{top.length?top.map((p,i)=><div className="productCard" key={p.name}><span>{i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)}</span><b>{p.name}</b><small>{p.qty.toFixed(0)} uds · {money(p.total)}</small></div>):<p>No hay productos cargados todavía.</p>}</div>
}
function CommandTimeline({events}){
 return <div className="timeline">{events.length?events.map((e,i)=><div className="timelineItem" key={i}><span>{timeOnly(e.time)}</span><i>{e.icon}</i><b>{e.label}</b></div>):<p>No hay eventos suficientes para construir la línea temporal.</p>}</div>
}
function CommandAlerts({syncStatus,clockRows,daily,projected}){
 const alerts=[];
 const st=syncStatus;
 const lastSync=st?.updated_at?((Date.now()-new Date(st.updated_at).getTime())/60000):null;
 if(lastSync!==null&&lastSync>15) alerts.push({level:'critical',text:`Colibrí Sync lleva ${Math.round(lastSync)} min sin actualizar.`});
 scheduledLateAlerts(clockRows).forEach(a=>alerts.push(a));
 const projectedPct=pct(projected,DAILY_TARGET);
 if(Number(daily?.total||0)>0&&projectedPct<80) alerts.push({level:'warn',text:`La previsión de cierre está por debajo del 80% del objetivo.`});
 if(!alerts.length) alerts.push({level:'ok',text:'Todo correcto. No hay alertas importantes.'});
 return <div className="alertList">{alerts.map((a,i)=><div className={'alert '+a.level} key={i}>{a.level==='critical'?'🔴':a.level==='warn'?'🟡':'🟢'} {a.text}</div>)}</div>
}

function App(){const host=location.hostname;const onlyClock=host.startsWith('fichar.')||location.pathname.includes('fichar');const [authed,setAuthed]=useState(false);return <>{onlyClock?<ClockPage/>:<>{!authed?<Login onOk={()=>setAuthed(true)}/>:<Manager/>}</>}</>}
function Login({onOk}){const[pin,setPin]=useState('');return <main className="login"><Brand/><div className="card narrow"><h2>Acceso Manager</h2><input placeholder="Clave gerente" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={()=>pin===ADMIN_PIN?onOk():alert('Clave incorrecta')}>Entrar</button><a href="/fichar" className="muted">Ir a fichaje empleados</a></div></main>}
function Brand(){return <div className="brand"><img src="/logo_colibri.png" onError={e=>e.currentTarget.style.display='none'}/><div><h1>Colibrí ERP</h1><p>Brasería El Colibrí</p></div></div>}
function Manager(){const[tab,setTab]=useState('dashboard');const tabs=[['dashboard','Centro'],['inteligencia','Inteligencia'],['tpv','TPV'],['empleados','Empleados'],['fichajes','Fichajes'],['cuadrantes','Cuadrantes'],['comparador','Comparador'],['config','Config']];return <div><header><Brand/><nav>{tabs.map(([id,label])=><button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}>{label}</button>)}</nav></header><section className="page">{tab==='dashboard'&&<Dashboard/>}{tab==='inteligencia'&&<BusinessIntelligence/>}{tab==='empleados'&&<Employees/>}{tab==='fichajes'&&<ClockPanel/>}{tab==='cuadrantes'&&<Schedule/>}{tab==='comparador'&&<Compare/>}{tab==='tpv'&&<TPV/>}{tab==='config'&&<Settings/>}</section></div>}


function Dashboard(){
 const [date,setDate]=useState(today());
 const [state,setState]=useState({tickets:[],lines:[],clockRows:[],sync:null,syncStatus:null,lastWeek:null,loading:true});
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[date]);
 async function load(){
  if(!supabase)return;
  const from=date,to=addDays(date,1);
  const weekAgo=addDays(date,-7);
  const [{tickets,lines,sync},{data:clockData},syncStatus,lastWeek]=await Promise.all([
   loadSalesRange(from,to),
   supabase.from('clock_records').select('*').gte('created_at',from+'T00:00:00').lt('created_at',to+'T00:00:00').order('created_at',{ascending:false}).limit(5000),
   loadSyncStatus(),
   loadSalesForDate(weekAgo)
  ]);
  setState({tickets,lines,clockRows:clockData||[],sync,syncStatus,lastWeek,loading:false});
 }
 const daily=summarizeTickets(state.tickets);
 const projected=expectedEndProjection(daily.total,date);
 const objectivePct=Math.min(100,pct(daily.total,DAILY_TARGET));
 const latest=latestByEmployee(state.clockRows);
 const working=[...latest.values()].filter(r=>String(r.type).toLowerCase()==='entrada');
 const executive=buildExecutiveMessage({daily,lastWeek:state.lastWeek,projected,date});
 const events=buildTimeline({tickets:state.tickets,clockRows:state.clockRows,target:DAILY_TARGET});
 const weekTotal=Number(state.lastWeek?.daily?.total||0);
 const weekDiff=weekTotal?((Number(daily.total)-weekTotal)/weekTotal)*100:null;
 return <div className="commandCenter">
  <div className="commandHero">
   <div>
    <span className="eyebrow">Colibrí ERP PRO 3.0 · Centro de Mando</span>
    <h2>{date===today()?'Buenos días, Alfonso':'Análisis del día'}</h2>
    <p>{fmtDate(date)}</p>
   </div>
   <div className="row controls">
    <button onClick={()=>setDate(today())}>Hoy</button>
    <button onClick={()=>setDate(addDays(today(),-1))}>Ayer</button>
    <input type="date" value={date} onChange={e=>setDate(e.target.value)}/>
    <button onClick={load}>{state.loading?'Cargando...':'Actualizar'}</button>
   </div>
  </div>

  <SyncStatusCard/>

  <div className="execGrid">
   <div className="execCard primary"><span>💶 Ventas</span><b>{money(daily.total)}</b><small>{objectivePct.toFixed(0)}% del objetivo de {money(DAILY_TARGET)}</small><div className="miniProgress"><i style={{width:`${objectivePct}%`}}/></div></div>
   <div className="execCard"><span>🎫 Tickets</span><b>{daily.tickets}</b><small>Ticket medio {money(daily.ticket_medio)}</small></div>
   <div className="execCard"><span>🔮 Previsión cierre</span><b>{money(projected)}</b><small>{pct(projected,DAILY_TARGET).toFixed(0)}% del objetivo</small></div>
   <div className="execCard"><span>📈 Semana anterior</span><b>{weekDiff===null?'-':`${weekDiff>=0?'+':''}${weekDiff.toFixed(1)}%`}</b><small>{weekTotal?`vs ${money(weekTotal)}`:'Sin histórico suficiente'}</small></div>
   <div className="execCard"><span>👥 Trabajando ahora</span><b>{date===today()?working.length:'-'}</b><small>{date===today()?working.map(w=>w.employee_name).join(', ')||'Nadie fichado':'Solo disponible hoy'}</small></div>
   <div className="execCard"><span>🟢 Estado</span><b>{Number(state.syncStatus?.progress_percent||0)>=100?'LIVE':'SYNC'}</b><small>Última sync {secondsAgo(state.syncStatus?.updated_at||state.sync?.synced_at)}</small></div>
  </div>

  <div className="card commandAdvice">
   <h2>🎯 Qué deberías saber ahora</h2>
   <p>{executive}</p>
  </div>

  <div className="grid">
   <div className="card"><h2>📈 Ventas por hora</h2><SalesByHour tickets={state.tickets}/></div>
   <div className="card"><h2>🚨 Alertas inteligentes</h2><CommandAlerts syncStatus={state.syncStatus} clockRows={state.clockRows} daily={daily} projected={projected}/></div>
  </div>

  <div className="card"><h2>⏰ Rentabilidad por turnos</h2><ShiftCards tickets={state.tickets} clockRows={state.clockRows}/></div>

  <div className="grid">
   <div className="card"><h2>🍽️ Productos TOP</h2><TopProductCards lines={state.lines}/></div>
   <div className="card"><h2>📓 Timeline del día</h2><CommandTimeline events={events}/></div>
  </div>

  <div className="card">
   <h2>🎫 Últimos tickets</h2>
   <table><thead><tr><th>Hora</th><th>Ticket</th><th>Pago</th><th>Total</th></tr></thead><tbody>{state.tickets.slice(-12).reverse().map(t=><tr key={t.id||t.cab_id}><td>{timeOnly(t.hora)}</td><td>{t.numdoc||t.cab_id}</td><td>{t.forma_pago||''}</td><td>{money(t.total)}</td></tr>)}</tbody></table>
  </div>
 </div>
}

function Employees(){const[employees,setEmployees]=useState([]);const[name,setName]=useState('');const[pin,setPin]=useState('');useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data}=await supabase.from('employees').select('*').order('name');setEmployees(data||[])}async function add(){if(!name||!pin)return alert('Nombre y PIN');const color=EMP_COLORS[employees.length%EMP_COLORS.length];const{error}=await supabase.from('employees').insert({name,pin,role:'empleado',color,can_clock:true,active:true});if(error)alert(error.message);setName('');setPin('');load()}async function update(e,patch){const{error}=await supabase.from('employees').update(patch).eq('id',e.id);if(error)alert(error.message);load()}return <div className="card"><h2>Empleados</h2><div className="row"><input placeholder="Nuevo empleado" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={add}>Añadir</button></div>{employees.map(e=><div className="employee" key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><span>{e.active?'Activo':'Inactivo'}</span><input placeholder="Nuevo PIN" onBlur={ev=>ev.target.value&&update(e,{pin:ev.target.value})}/><button onClick={()=>update(e,{active:!e.active})}>{e.active?'Desactivar':'Activar'}</button></div>)}</div>}
function ClockPage(){const[employees,setEmployees]=useState([]);const[emp,setEmp]=useState('');const[pin,setPin]=useState('');const[note,setNote]=useState('');const[msg,setMsg]=useState('');const[qr,setQr]=useState(false);useEffect(()=>{load()},[]);async function load(){if(!supabase){setMsg('Supabase no configurado');return}const{data}=await supabase.from('employees').select('name').eq('active',true).eq('can_clock',true).order('name');setEmployees(data||[])}async function clock(type,method='gps'){if(!supabase)return setMsg('Supabase no configurado');setMsg('Comprobando...');let coords=null;if(method==='gps'){try{coords=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));}catch(e){setQr(true);return setMsg('GPS no disponible. Usa el QR del bar.')}}const payload={p_employee_name:emp,p_pin:pin,p_type:type,p_note:note,p_gps_lat:coords?.coords?.latitude||null,p_gps_lng:coords?.coords?.longitude||null,p_accuracy:coords?.coords?.accuracy||null,p_method:method};const{data,error}=await supabase.rpc('registrar_fichaje_v2',payload);if(error)return setMsg('❌ '+error.message);setMsg((data?.ok?'✅ ':'❌ ')+(data?.message||'Respuesta recibida')+(data?.distance_m?` · Distancia ${Math.round(data.distance_m)} m`:''));if(!data?.ok&&data?.outside_radius)setQr(true)}return <main className="login"><Brand/><div className="card narrow"><h2>Fichaje empleados</h2><select value={emp} onChange={e=>setEmp(e.target.value)}><option value="">Empleado</option>{employees.map(e=><option key={e.name}>{e.name}</option>)}</select><input placeholder="PIN" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><textarea placeholder="Observaciones" value={note} onChange={e=>setNote(e.target.value)}/><div className="row"><button onClick={()=>clock('entrada')}>Entrada GPS</button><button className="red" onClick={()=>clock('salida')}>Salida GPS</button></div>{qr&&<div className="qrbox"><p>Escanea/usa QR físico del bar como respaldo.</p><button onClick={()=>clock('entrada','qr')}>Entrada QR</button><button className="red" onClick={()=>clock('salida','qr')}>Salida QR</button></div>}<p className="msg">{msg}</p></div></main>}
function ClockPanel(){const[rows,setRows]=useState([]);const[open,setOpen]=useState([]);useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data,error}=await supabase.from('clock_records').select('*').order('created_at',{ascending:false}).limit(500);if(error){alert(error.message);return}const list=data||[];setRows(list);const latest=new Map();list.forEach(r=>{if(!latest.has(r.employee_id||r.employee_name))latest.set(r.employee_id||r.employee_name,r)});setOpen([...latest.values()].filter(r=>r.type==='entrada'))}async function closeManual(r){const now=new Date();const suggested=now.toISOString().slice(0,16);const value=prompt(`Hora de salida real para ${r.employee_name} (formato YYYY-MM-DDTHH:mm)`,suggested);if(!value)return;const reason=prompt('Motivo del cierre manual','Olvido de fichaje')||'Cierre manual por manager';const exitIso=new Date(value).toISOString();const {error}=await supabase.from('clock_records').insert({employee_id:r.employee_id,employee_name:r.employee_name,type:'salida',method:'manual',inside_radius:true,note:`SALIDA MANUAL POR MANAGER · ${reason}`,created_at:exitIso});if(error){alert(error.message);return}alert('Turno cerrado manualmente');load()}return <div className="grid"><div className="card"><h2>Fichajes abiertos</h2><button onClick={load}>Actualizar</button>{open.length===0&&<p>✅ No hay turnos abiertos.</p>}{open.map(r=><div className="employee" key={r.id}><b>{r.employee_name}</b><span>Entrada: {new Date(r.created_at).toLocaleString()}</span><span>{Math.max(0,((Date.now()-new Date(r.created_at))/3600000)).toFixed(1)} h abierto</span><button className="red" onClick={()=>closeManual(r)}>Cerrar turno</button></div>)}</div><div className="card"><h2>Historial de fichajes</h2><table><tbody>{rows.slice(0,120).map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.employee_name}</td><td>{r.type}</td><td>{r.method}</td><td>{r.note||''}</td><td>{r.distance_m?Math.round(r.distance_m)+' m':''}</td></tr>)}</tbody></table></div></div>}
function Schedule(){const [data,setData]=useState(()=>JSON.parse(localStorage.colibriSchedule||'{}'));const [selected,setSelected]=useState(null);const [employees,setEmployees]=useState([]);useEffect(()=>{supabase?.from('employees').select('*').eq('active',true).then(({data})=>setEmployees(data||[]))},[]);function key(d,s){return `${week()}|${d}|${s}`}function toggle(emp){const k=key(selected.d,selected.s);let arr=data[k]||[];arr=arr.find(x=>x.id===emp.id)?arr.filter(x=>x.id!==emp.id):(arr.length<3?[...arr,emp]:arr);const nd={...data,[k]:arr};setData(nd);localStorage.colibriSchedule=JSON.stringify(nd)}function hours(){const m={};Object.entries(data).forEach(([k,arr])=>{const slot=k.split('|')[2];arr.forEach(e=>m[e.name]=(m[e.name]||0)+h(slot))});return m}return <div className="card"><h2>Cuadrante semanal {week()}</h2><table className="schedule"><thead><tr><th>Hora</th>{DAYS.map(d=><th>{d}</th>)}</tr></thead><tbody>{SLOTS.map(s=><tr><td>{s}</td>{DAYS.map(d=><td onClick={()=>setSelected({d,s})}>{(data[key(d,s)]||[]).map(e=><span className="badge" style={{background:e.color}}>{e.name}</span>)}</td>)}</tr>)}</tbody></table><h3>Horas</h3>{Object.entries(hours()).map(([n,v])=><p>{n}: {v} h</p>)}{selected&&<div className="modal"><div className="card narrow"><h3>{selected.d} {selected.s}</h3>{employees.map(e=><button className="empbtn" onClick={()=>toggle(e)}><span className="sq" style={{background:e.color}}/> {e.name}</button>)}<button onClick={()=>setSelected(null)}>Guardar y cerrar</button></div></div>}</div>}
function Compare(){const[text,setText]=useState('');const[name,setName]=useState('');function calc(){const clean=text.replace(/_/g,'');let total=0;for(const line of clean.split('\n')){const times=[...line.matchAll(/entrada\s*(\d{1,2}):(\d{2})\s*salida\s*(\d{1,2}):(\d{2})/gi)];const seen=new Set();times.forEach(m=>{const k=m[0];if(seen.has(k))return;seen.add(k);const a=+m[1]*60+ +m[2],b=+m[3]*60+ +m[4];if(b>a)total+=(b-a)/60})}return total}return <div className="card"><h2>Comparador WhatsApp vs cuadrante</h2><input placeholder="Empleado" value={name} onChange={e=>setName(e.target.value)}/><textarea rows="12" placeholder="Pega plantilla WhatsApp" value={text} onChange={e=>setText(e.target.value)}/><h3>Horas declaradas detectadas: {calc()} h</h3><p>Compara este total con el resumen de cuadrante semanal.</p></div>}

function TPV(){const[date,setDate]=useState(today());const[data,setData]=useState({daily:null,tickets:[],sync:null,error:null});const[loading,setLoading]=useState(false);useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[date]);async function load(){setLoading(true);const d=await loadSalesForDate(date);setData(d);setLoading(false)}const tickets=data.tickets||[];return <div><div className="card hero"><div><h2>NUMIER LIVE</h2><p>Ventas, tickets y formas de pago desde Colibrí Sync.</p></div><div className="row controls"><button onClick={()=>setDate(today())}>Hoy</button><button onClick={()=>setDate(addDays(today(),-1))}>Ayer</button><button onClick={()=>setDate(addDays(date,-1))}>◀ Día</button><button onClick={()=>setDate(addDays(date,1))}>Día ▶</button><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div><SyncStatusCard/><SalesCards daily={data.daily} sync={data.sync}/><div className="grid"><div className="card"><h2>Ventas por hora</h2><SalesByHour tickets={tickets}/></div><div className="card"><h2>Últimos tickets</h2><table><thead><tr><th>Hora</th><th>Ticket</th><th>Pago</th><th>Total</th></tr></thead><tbody>{tickets.slice(-30).reverse().map(t=><tr key={t.id||t.cab_id}><td>{t.hora?new Date(t.hora).toLocaleTimeString('es-ES'):''}</td><td>{t.numdoc||t.cab_id}</td><td>{t.forma_pago||''}</td><td>{money(t.total)}</td></tr>)}</tbody></table></div><div className="card"><h2>Resumen</h2><p>Fecha: <b>{fmtDate(date)}</b></p><p>Tickets cargados: <b>{tickets.length}</b></p><p>Última sincronización: <b>{data.sync?.synced_at?new Date(data.sync.synced_at).toLocaleString('es-ES'):'-'}</b></p>{data.error&&<p className="error">{data.error}</p>}</div></div></div>}
function Settings(){const[settings,setSettings]=useState(null);useEffect(()=>{supabase?.from('settings').select('*').single().then(({data})=>setSettings(data))},[]);async function save(){const{error}=await supabase.from('settings').upsert(settings);if(error)alert(error.message);else alert('Guardado')}if(!settings)return <div className="card">Cargando...</div>;return <div className="card"><h2>Configuración</h2><label>Latitud<input value={settings.bar_lat} onChange={e=>setSettings({...settings,bar_lat:e.target.value})}/></label><label>Longitud<input value={settings.bar_lng} onChange={e=>setSettings({...settings,bar_lng:e.target.value})}/></label><label>Radio metros<input value={settings.gps_radius_m} onChange={e=>setSettings({...settings,gps_radius_m:e.target.value})}/></label><button onClick={save}>Guardar</button><div className="qrprint"><h3>QR físico del bar</h3><p>Imprime este código y colócalo en zona de personal.</p><img src="/qr_bar_colibri.png"/></div></div>}
createRoot(document.getElementById('root')).render(<App/>);
