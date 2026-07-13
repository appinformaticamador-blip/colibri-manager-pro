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
const CLOSED_ID='__cerrado__';
const MAX_PER_SLOT=4;
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
async function loadServiceState(){
 if(!supabase)return {open:[],status:null,audit:[],error:'Supabase no configurado'};
 const cutoff=new Date(Date.now()-5*60*1000).toISOString();
 const dayStart=today()+'T00:00:00';
 const dayEnd=addDays(today(),1)+'T00:00:00';
 const [{data:openData,error:openError},{data:statusData},{data:auditData}]=await Promise.all([
  supabase.from('numier_open_accounts').select('*').gte('last_seen_at',cutoff).order('mesa_numero',{ascending:true}),
  supabase.from('numier_service_status').select('*').eq('status_key','service').maybeSingle(),
  supabase.from('numier_audit_events').select('*').gte('hora',dayStart).lt('hora',dayEnd).order('hora',{ascending:false}).limit(100)
 ]);
 return {open:openData||[],status:statusData||null,audit:auditData||[],error:openError?.message||null};
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
const SMART_GROWTH_TARGET=0.10; // Objetivo inteligente: +10% sobre histórico comparable
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
async function loadArticlesMap(){
 if(!supabase)return new Map();
 const {data}=await supabase.from('numier_articles').select('article_code,article_name,family,category_name').limit(20000);
 const map=new Map();
 (data||[]).forEach(a=>{const code=String(a.article_code||'').trim();if(code)map.set(code,{name:a.article_name||code,family:a.family||a.category_name||''});});
 return map;
}
async function loadSmartGoal(date,currentTotal=0){
 if(!supabase)return {goal:750,base:0,projected:currentTotal,source:'objetivo base',message:'Objetivo base configurado'};
 const target=new Date(date+'T12:00:00');
 const from=new Date(target); from.setDate(from.getDate()-420);
 const {data}=await supabase.from('numier_daily_sales').select('fecha,total,tickets,ticket_medio').gte('fecha',from.toISOString().slice(0,10)).lt('fecha',date).order('fecha',{ascending:false}).limit(500);
 const rows=(data||[]).filter(r=>Number(r.total||0)>0);
 const sameWeekday=rows.filter(r=>new Date(r.fecha+'T12:00:00').getDay()===target.getDay()).slice(0,12);
 const avgSame=sameWeekday.length?sameWeekday.reduce((a,r)=>a+Number(r.total||0),0)/sameWeekday.length:0;
 const ly=new Date(target); ly.setFullYear(ly.getFullYear()-1); const lyStart=new Date(ly); lyStart.setDate(lyStart.getDate()-14); const lyEnd=new Date(ly); lyEnd.setDate(lyEnd.getDate()+14);
 const sameLastYear=rows.filter(r=>{const d=new Date(r.fecha+'T12:00:00');return d>=lyStart&&d<=lyEnd&&d.getDay()===target.getDay();});
 const avgYear=sameLastYear.length?sameLastYear.reduce((a,r)=>a+Number(r.total||0),0)/sameLastYear.length:0;
 let base=0,source='';
 if(avgYear>0&&avgSame>0){base=(avgYear*0.6)+(avgSame*0.4);source='año anterior + últimos mismos días';}
 else if(avgSame>0){base=avgSame;source='últimos mismos días de la semana';}
 else {base=750/1.10;source='objetivo base';}
 const goal=Math.round(base*(1+SMART_GROWTH_TARGET));
 let elapsed=1;if(date===today()){const now=new Date();const hour=now.getHours()+now.getMinutes()/60;elapsed=Math.max(0.08,Math.min(1,(hour-8)/(23.5-8)));}
 const projected=date===today()?Math.max(currentTotal,currentTotal/elapsed):currentTotal;
 const diff=currentTotal-goal;
 const message=currentTotal>=goal?`Objetivo IA superado en ${money(diff)}.`:`Faltan ${money(Math.abs(diff))} para alcanzar el objetivo IA de hoy.`;
 return {goal,base,projected,source,message,avgSame,avgYear,growth:SMART_GROWTH_TARGET};
}
async function loadSalesRange(from,to){
 if(!supabase)return {tickets:[],lines:[],sync:null,articles:new Map()};
 const start=from+'T00:00:00'; const end=to+'T00:00:00';
 const [{data:ticketsData},{data:syncData},articles]=await Promise.all([
  supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(10000),
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1),
  loadArticlesMap()
 ]);
 const tickets=ticketsData||[]; const cabIds=tickets.map(t=>t.cab_id).filter(Boolean); let lines=[];
 for(let i=0;i<cabIds.length;i+=200){const chunk=cabIds.slice(i,i+200);const {data}=await supabase.from('numier_ticket_lines').select('*').in('cab_id',chunk).limit(10000);if(data)lines=lines.concat(data);}
 return {tickets,lines,sync:syncData?.[0]||null,articles};
}

// Gestoría PRO: lectura sin límite de 1000 registros. Supabase devuelve por páginas.
async function fetchAllPages(buildQuery,pageSize=1000,onProgress=null,label='registros'){
 let all=[];
 for(let from=0;;from+=pageSize){
  const to=from+pageSize-1;
  const {data,error}=await buildQuery().range(from,to);
  if(error)throw error;
  const batch=data||[];
  all=all.concat(batch);
  if(onProgress)onProgress(`Cargando ${label}: ${all.length.toLocaleString('es-ES')}...`);
  if(batch.length<pageSize)break;
 }
 return all;
}
async function loadSalesRangeGestoria(from,to,onProgress=null){
 if(!supabase)return {tickets:[],lines:[],sync:null,articles:new Map()};
 const start=from+'T00:00:00'; const end=to+'T00:00:00';
 onProgress&&onProgress('Cargando tickets del periodo completo...');
 const tickets=await fetchAllPages(()=>supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('numdoc',{ascending:true}),1000,onProgress,'tickets');
 const cabIds=tickets.map(t=>t.cab_id).filter(Boolean);
 let lines=[];
 onProgress&&onProgress(`Cargando líneas de ${cabIds.length.toLocaleString('es-ES')} tickets...`);
 for(let i=0;i<cabIds.length;i+=80){
  const chunk=cabIds.slice(i,i+80);
  const part=await fetchAllPages(()=>supabase.from('numier_ticket_lines').select('*').in('cab_id',chunk).order('cab_id',{ascending:true}),1000,null,'líneas');
  lines=lines.concat(part);
  onProgress&&onProgress(`Cargando líneas: ${Math.min(i+80,cabIds.length).toLocaleString('es-ES')} / ${cabIds.length.toLocaleString('es-ES')} tickets`);
 }
 const [{data:syncData},articles]=await Promise.all([
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1),
  loadArticlesMap()
 ]);
 onProgress&&onProgress(`Completado: ${tickets.length.toLocaleString('es-ES')} tickets y ${lines.length.toLocaleString('es-ES')} líneas.`);
 return {tickets,lines,sync:syncData?.[0]||null,articles};
}
function ticketOrderKey(t){
 const raw=String(t.numdoc||t.numero||t.cab_id||'');
 const nums=raw.match(/\d+/g);
 return nums?Number(nums[nums.length-1]):Number(t.cab_id||0);
}
function formaPagoText(t){
 const fp=String(t.forma_pago||'').trim().toUpperCase();
 const e=Number(t.efectivo||0),ta=Number(t.tarjeta||0),ch=Number(t.cheque||0);
 if(e>0&&ta>0)return 'Mixto efectivo/tarjeta';
 if(ta>0||fp==='T')return 'Tarjeta';
 if(e>0||fp==='E')return 'Efectivo';
 if(ch>0||fp==='C')return 'Cheque/Otros';
 if(fp==='A')return 'Mixto';
 return fp||'-';
}
function ticketFiscalRows(tickets,lines){
 const byCab=new Map();
 (lines||[]).forEach(l=>{const k=String(l.cab_id);if(!byCab.has(k))byCab.set(k,[]);byCab.get(k).push(l)});
 return (tickets||[]).slice().sort((a,b)=>ticketOrderKey(a)-ticketOrderKey(b)).map(t=>{
  const ls=byCab.get(String(t.cab_id))||[];
  const groups={0:{base:0,cuota:0,total:0},10:{base:0,cuota:0,total:0},21:{base:0,cuota:0,total:0},otros:{base:0,cuota:0,total:0}};
  ls.forEach(l=>{const iva=Number(l.iva??l.tipo_iva??0);const total=Number(l.importe||0);const base=iva>0?total/(1+iva/100):total;const cuota=total-base;const key=iva===0?0:iva===10?10:iva===21?21:'otros';groups[key].base+=base;groups[key].cuota+=cuota;groups[key].total+=total;});
  let baseTotal=Object.values(groups).reduce((a,g)=>a+g.base,0), ivaTotal=Object.values(groups).reduce((a,g)=>a+g.cuota,0), totalLines=Object.values(groups).reduce((a,g)=>a+g.total,0);
  const totalTicket=Number(t.total||0);
  if(!ls.length&&totalTicket){groups[10].total=totalTicket;groups[10].base=totalTicket/1.10;groups[10].cuota=totalTicket-groups[10].base;baseTotal=groups[10].base;ivaTotal=groups[10].cuota;totalLines=totalTicket;}
  const fecha=t.hora?new Date(t.hora):null;
  return {numdoc:t.numdoc||'',cab_id:t.cab_id||'',fecha:fecha?fecha.toLocaleDateString('es-ES'):'',hora:fecha?fecha.toLocaleTimeString('es-ES'):'',forma:formaPagoText(t),mesa:t.mesa||t.cab_mesa||'',estado:t.estado||'C',base0:groups[0].base,iva0:groups[0].cuota,total0:groups[0].total,base10:groups[10].base,iva10:groups[10].cuota,total10:groups[10].total,base21:groups[21].base,iva21:groups[21].cuota,total21:groups[21].total,baseOtros:groups.otros.base,ivaOtros:groups.otros.cuota,totalOtros:groups.otros.total,baseTotal,ivaTotal,total:Number(totalTicket||totalLines),efectivo:Number(t.efectivo||0),tarjeta:Number(t.tarjeta||0),otros:Number(t.cheque||0)};
 });
}

async function loadTicketFull(cabId){
 if(!supabase||!cabId)return {ticket:null,lines:[],articles:new Map()};
 const [ticketRes,lineRes,articles]=await Promise.all([
  supabase.from('numier_tickets').select('*').eq('cab_id',cabId).maybeSingle(),
  supabase.from('numier_ticket_lines').select('*').eq('cab_id',cabId).order('line_key',{ascending:true}).limit(500),
  loadArticlesMap()
 ]);
 return {ticket:ticketRes.data||null,lines:lineRes.data||[],articles,error:ticketRes.error?.message||lineRes.error?.message||null};
}
function ticketText({ticket,lines,articles,account}){
 const title=account?(account.zona==='barra'?`CUENTA RÁPIDA ${account.mesa}`:`MESA ${account.mesa_numero}`):`TICKET ${ticket?.numdoc||ticket?.cab_id||''}`;
 const hora=account?.opened_at||ticket?.hora;
 const rows=(lines||[]).map(l=>`${(productNameFromLine(l,articles)||'').padEnd(28).slice(0,28)} ${String(Number(l.cantidad||0)).padStart(4)} ${money(l.importe).padStart(10)}`);
 const total=(lines||[]).reduce((a,l)=>a+Number(l.importe||0),0)||Number(ticket?.total||account?.total||0);
 return `*${title}*\n${hora?new Date(hora).toLocaleString('es-ES'):''}\n\nProducto                     Ud      Total\n--------------------------------------------\n${rows.join('\n')}\n--------------------------------------------\n*TOTAL: ${money(total)}*`;
}
function downloadFile(name,content,type='text/plain;charset=utf-8'){
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;document.body.appendChild(a);a.click();URL.revokeObjectURL(a.href);a.remove();
}
function asCSV(rows){return rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n')}
function quarterRange(year,q){const startMonth=(q-1)*3;const f=new Date(year,startMonth,1);const t=new Date(year,startMonth+3,1);return {from:f.toISOString().slice(0,10),to:t.toISOString().slice(0,10),label:`${q}T ${year}`}}
function monthRange(year,m){const f=new Date(year,m-1,1);const t=new Date(year,m,1);return {from:f.toISOString().slice(0,10),to:t.toISOString().slice(0,10),label:`${String(m).padStart(2,'0')}/${year}`}}
function ivaSummary(lines){
 const m={};(lines||[]).forEach(l=>{const iva=Number(l.iva||0);const total=Number(l.importe||0);const base=iva>0?total/(1+iva/100):total;const cuota=total-base;const k=String(iva);m[k]=m[k]||{iva,base:0,cuota:0,total:0};m[k].base+=base;m[k].cuota+=cuota;m[k].total+=total;});
 return Object.values(m).sort((a,b)=>a.iva-b.iva);
}
function expectedStartMapToday(){
 try{const data=JSON.parse(localStorage.colibriSchedule||'{}');const day=DAYS[(new Date().getDay()+6)%7];const res={};Object.entries(data).forEach(([k,arr])=>{const parts=k.split('|');if(parts[1]!==day)return;const start=parts[2]?.split('-')[0];(arr||[]).forEach(e=>{if(!res[e.name]||start<res[e.name])res[e.name]=start;});});return res;}catch{return {}}
}
function punctualityFor(row,expected){
 if(String(row.type).toLowerCase()==='salida')return {label:'Salida',cls:'exit',icon:'🔴'};
 const st=expected?.[row.employee_name];if(!st)return {label:'Sin turno',cls:'neutral',icon:'⚪'};
 const d=new Date(row.created_at);const [h,m]=st.split(':').map(Number);const exp=new Date(d);exp.setHours(h,m,0,0);const diff=Math.round((d-exp)/60000);
 if(diff>10)return {label:`+${diff} min`,cls:'late10',icon:'⚠️'};
 if(diff>5)return {label:`+${diff} min`,cls:'late5',icon:'🟡'};
 return {label:diff>0?`+${diff} min`:'Puntual',cls:'ok',icon:'🟢'};
}

function summarizeTickets(tickets){
 const total=tickets.reduce((a,t)=>a+Number(t.total||0),0);
 const efectivo=tickets.reduce((a,t)=>a+Number(t.efectivo||0),0);
 const tarjeta=tickets.reduce((a,t)=>a+Number(t.tarjeta||0),0);
 const cheque=tickets.reduce((a,t)=>a+Number(t.cheque||0),0);
 return {total,tickets:tickets.length,ticket_medio:tickets.length?total/tickets.length:0,efectivo,tarjeta,cheque};
}
function productNameFromLine(l,articles){
 const code=String(l.articulo||'').trim(); const fallback=(l.descripcion||l.articulo||'Producto sin nombre').trim();
 if(code&&articles?.get?.(code)?.name)return articles.get(code).name;
 return fallback;
}
function productRank(lines,sort='qty',articles=new Map()){
 const map=new Map();
 (lines||[]).forEach(l=>{const code=String(l.articulo||'').trim();const name=productNameFromLine(l,articles);const art=code?articles.get(code):null;const key=name||code||'Producto sin nombre';const r=map.get(key)||{name:key,code,family:art?.family||'',qty:0,total:0,tickets:new Set()};r.qty+=Number(l.cantidad||0);r.total+=Number(l.importe||0);if(l.cab_id)r.tickets.add(l.cab_id);map.set(key,r)});
 return [...map.values()].map(r=>({...r,ticketCount:r.tickets.size,avg:r.qty?r.total/r.qty:0})).sort((a,b)=>sort==='total'?b.total-a.total:b.qty-a.qty);
}
function ProductRanking({lines,articles}){const[sort,setSort]=useState('qty');const top=productRank(lines,sort,articles).slice(0,20);return <div className="card"><div className="row between"><h2>🍽️ Ranking de productos</h2><div><button className={sort==='qty'?'active':''} onClick={()=>setSort('qty')}>Unidades</button><button className={sort==='total'?'active':''} onClick={()=>setSort('total')}>Facturación</button></div></div><table><thead><tr><th>#</th><th>Producto</th><th>Familia</th><th>Unidades</th><th>Total</th><th>€/ud</th></tr></thead><tbody>{top.map((p,i)=><tr key={p.name}><td>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td><b>{p.name}</b>{p.code&&<small className="mutedCode"> {p.code}</small>}</td><td>{p.family||'-'}</td><td>{p.qty.toFixed(2)}</td><td>{money(p.total)}</td><td>{money(p.avg)}</td></tr>)}</tbody></table>{top.length===0&&<p>No hay líneas de productos para este periodo.</p>}</div>}
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
function BusinessIntelligence(){const[mode,setMode]=useState('hoy');const[date,setDate]=useState(today());const[bi,setBi]=useState({tickets:[],lines:[],sync:null,articles:new Map()});const[clock,setClock]=useState([]);const[loading,setLoading]=useState(false);const r=rangeDates(mode,date);useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[mode,date]);async function load(){if(!supabase)return;setLoading(true);const [{tickets,lines,sync,articles},{data:clockData}]=await Promise.all([loadSalesRange(r.from,r.to),supabase.from('clock_records').select('*').gte('created_at',r.from+'T00:00:00').lt('created_at',r.to+'T00:00:00').order('created_at',{ascending:true}).limit(5000)]);setBi({tickets,lines,sync,articles});setClock(clockData||[]);setLoading(false)}const daily=summarizeTickets(bi.tickets);return <div><div className="card hero"><div><h2>📊 Inteligencia de Negocio v2.4</h2><p>{r.label}</p></div><div className="row controls"><button className={mode==='hoy'?'active':''} onClick={()=>setMode('hoy')}>Hoy</button><button className={mode==='ayer'?'active':''} onClick={()=>setMode('ayer')}>Ayer</button><button className={mode==='semana'?'active':''} onClick={()=>setMode('semana')}>7 días</button><button className={mode==='mes'?'active':''} onClick={()=>setMode('mes')}>Mes</button><input type="date" value={date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/><button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div><SyncStatusCard/><SalesCards daily={daily} sync={bi.sync}/><div className="grid"><PredictionBox mode={mode} date={date} tickets={bi.tickets}/><div className="card"><h2>📈 Ventas por hora</h2><SalesByHour tickets={bi.tickets}/></div></div><ShiftProfitability tickets={bi.tickets} clockRows={clock}/><ProductRanking lines={bi.lines} articles={bi.articles}/><DailyReport summary={daily} lines={bi.lines} tickets={bi.tickets} clockRows={clock} period={r}/></div>}

const TERRACE_TABLES=[
 {n:1,x:6,y:7},{n:2,x:20,y:7},{n:3,x:34,y:7},{n:4,x:48,y:7},{n:5,x:62,y:7},
 {n:11,x:82,y:7},{n:6,x:6,y:29},{n:7,x:20,y:29},{n:8,x:34,y:29},{n:9,x:48,y:29},{n:10,x:62,y:29},{n:12,x:88,y:24},
 {n:14,x:14,y:53},{n:15,x:14,y:76},{n:13,x:82,y:36}
];
const SALON_TABLES=[
 {n:21,x:16,y:23},{n:22,x:16,y:55},{n:23,x:56,y:20},{n:24,x:56,y:42},{n:25,x:56,y:64},{n:26,x:78,y:20},{n:27,x:78,y:42},{n:28,x:78,y:64}
];
function zoneLabel(z){return z==='terraza'?'Terraza':z==='salon'?'Salón':'Barra'}
function minutesOpen(openedAt){if(!openedAt)return 0;return Math.max(0,Math.round((Date.now()-new Date(openedAt).getTime())/60000))}
function durationShort(min){if(min<60)return `${min} min`;const h=Math.floor(min/60),m=min%60;return `${h}h ${String(m).padStart(2,'0')}`}
function tableTimeClass(min){if(min>=90)return 'danger';if(min>=60)return 'warn';if(min>=30)return 'notice';return 'fresh'}
function openValueClass(total){const v=Number(total||0);if(v>=80)return 'highValue';if(v>=35)return 'midValue';return ''}
function OccupancyBar({value}){const pct=Math.max(0,Math.min(100,Number(value||0)));return <div className="occBar"><i style={{width:`${pct}%`}}></i></div>}
function serviceForecast({closedToday,totalPending,openCount,avgMin}){
 const current=Number(closedToday||0), pending=Number(totalPending||0);
 const uplift=pending>0?pending*0.18:0;
 const potential=current+pending+uplift;
 let tone='🟢 Servicio tranquilo';
 if(openCount>=12)tone='🟡 Servicio con mucha actividad';
 if(openCount>=18)tone='🔴 Servicio muy cargado';
 return {potential,uplift,tone,text: pending>0?`Hay ${openCount} cuentas abiertas con ${money(pending)} pendientes. Aplicando una estimación prudente de consumo adicional del 18%, el potencial inmediato del servicio es ${money(potential)}.`:`No hay pendiente de cobro ahora mismo. El servicio está limpio y la previsión depende del ritmo de nuevas mesas.`};
}
function ServiceTable({def,account,onOpen}){
 const open=!!account;const mins=minutesOpen(account?.opened_at);const cls=open?`open ${tableTimeClass(mins)} ${openValueClass(account.total)}`:'free';
 return <button type="button" className={'serviceTable '+cls} style={{left:def.x+'%',top:def.y+'%'}} title={open?`Mesa ${def.n} · ${money(account.total)} · ${durationShort(mins)}`:`Mesa ${def.n} libre`} onClick={()=>open&&onOpen(account)}>
  <div className="tableCircle"><span>{def.n}</span>{open&&<small>{money(account.total).replace(',00','')}</small>}</div>
  <div className="tableLabel">{open?<><b>{durationShort(mins)}</b><em>Abierta</em></>:<b>Libre</b>}</div>
 </button>
}
function ServiceZoneMap({title,tables,openByMesa,onOpen}){return <div className="serviceZone"><h3>{title}</h3><div className="floorGrid">{tables.map(t=><ServiceTable key={t.n} def={t} account={openByMesa.get(t.n)} onOpen={onOpen}/>)}</div></div>}
function TicketModal({cabId,account,onClose}){
 const[detail,setDetail]=useState({loading:true,ticket:null,lines:[],articles:new Map(),error:null});
 useEffect(()=>{let alive=true;loadTicketFull(cabId).then(d=>alive&&setDetail({...d,loading:false}));return()=>{alive=false}},[cabId]);
 if(!cabId)return null;
 const mins=account?minutesOpen(account.opened_at):0;
 const total=detail.lines.reduce((a,l)=>a+Number(l.importe||0),0)||Number(detail.ticket?.total||account?.total||0);
 const copy=()=>navigator.clipboard.writeText(ticketText({...detail,account}));
 return <div className="modal" onClick={onClose}><div className="card ticketModal" onClick={e=>e.stopPropagation()}><div className="row between"><h2>{account?(account.zona==='barra'?`Cuenta rápida ${account.mesa||account.mesa_numero}`:`Mesa ${account.mesa_numero}`):`Ticket ${detail.ticket?.numdoc||cabId}`}</h2><button className="red" onClick={onClose}>Cerrar</button></div>
  {detail.loading?<p>Cargando ticket...</p>:detail.error?<p className="error">{detail.error}</p>:<>
   <div className="ticketMeta"><p><span>CAB_ID</span><b>{cabId}</b></p><p><span>Hora</span><b>{new Date(account?.opened_at||detail.ticket?.hora||Date.now()).toLocaleString('es-ES')}</b></p><p><span>Estado</span><b>{account?'Cuenta abierta':(detail.ticket?.estado||'Cerrado')}</b></p>{account&&<p><span>Tiempo</span><b>{durationShort(mins)}</b></p>}<p><span>Total</span><b>{money(total)}</b></p></div>
   <div className="ticketBox"><h3>BRASERÍA EL COLIBRÍ</h3><p>{account?(account.zona==='barra'?'Cuenta rápida':`Mesa ${account.mesa_numero}`):`Ticket ${detail.ticket?.numdoc||cabId}`}</p><table><thead><tr><th>Producto</th><th>Ud</th><th>Total</th></tr></thead><tbody>{detail.lines.map(l=><tr key={l.line_key||l.id}><td>{productNameFromLine(l,detail.articles)}</td><td>{Number(l.cantidad||0)}</td><td>{money(l.importe)}</td></tr>)}</tbody><tfoot><tr><td colSpan="2">TOTAL</td><td>{money(total)}</td></tr></tfoot></table>{detail.lines.length===0&&<p>No hay líneas cargadas para este ticket.</p>}</div>
   <div className="row"><button onClick={copy}>Copiar WhatsApp</button><button onClick={()=>window.print()}>Imprimir</button></div>
  </>}
 </div></div>
}
function serviceAccountName(account,index=0){
 const candidates=[account?.cliente,account?.cliente_nombre,account?.nombre_cliente,account?.customer_name,account?.postit,account?.descripcion,account?.observaciones,account?.mesa_nombre,account?.nombre];
 const real=candidates.find(v=>String(v||'').trim());
 if(real)return String(real).trim();
 if(account?.zona==='barra')return `Barra ${index+1}`;
 return `Mesa ${account?.mesa_numero||account?.mesa||'-'}`;
}
function accountLabel(account,index=0){return account?.zona==='barra'?serviceAccountName(account,index):`Mesa ${account?.mesa_numero||account?.mesa||'-'}`}
function accountArticleCount(detail){return (detail?.lines||[]).reduce((a,l)=>a+Number(l.cantidad||0),0)}
function ServiceAccountList({accounts,onOpen,barDetails=new Map(),title='Cuentas abiertas'}){
 const sorted=[...(accounts||[])].sort((a,b)=>minutesOpen(b.opened_at)-minutesOpen(a.opened_at));
 return <section className="serviceListCard"><div className="serviceSectionTitle"><div><h2>{title}</h2><p>{sorted.length} cuentas · {money(sorted.reduce((a,o)=>a+Number(o.total||0),0))} pendientes</p></div></div>
  <div className="serviceAccountList">{sorted.map((o,i)=>{const mins=minutesOpen(o.opened_at);const detail=barDetails.get(String(o.cab_id));const preview=(detail?.lines||[]).slice(0,3);return <button type="button" className={'serviceAccountRow '+tableTimeClass(mins)} key={o.cab_id||`${o.zona}-${i}`} onClick={()=>onOpen(o)}>
   <div className="accountMain"><b>{accountLabel(o,i)}</b><span>{zoneLabel(o.zona)} · abierta hace {durationShort(mins)}</span>{preview.length>0&&<small>{preview.map(l=>`${Number(l.cantidad||0)}× ${productNameFromLine(l,detail.articles)}`).join(' · ')}</small>}</div>
   <div className="accountNumbers"><b>{money(o.total)}</b><span>{detail?`${accountArticleCount(detail)} artículos`:'Ver contenido'}</span></div>
  </button>})}{sorted.length===0&&<div className="serviceEmpty"><b>Sin cuentas abiertas</b><span>No hay actividad en esta zona ahora mismo.</span></div>}</div>
 </section>
}
function ServiceBarPanel({accounts,onOpen,details}){
 const sorted=[...(accounts||[])].sort((a,b)=>new Date(a.opened_at)-new Date(b.opened_at));
 const total=sorted.reduce((a,o)=>a+Number(o.total||0),0);const oldest=sorted[0];
 return <section className="barLivePanel"><div className="serviceSectionTitle"><div><span className="sectionEyebrow">BARRA LIVE</span><h2>Cuentas abiertas de barra</h2><p>Post-it y cuentas rápidas de NUMIER, tratadas como tickets activos.</p></div><div className="barSummary"><b>{sorted.length}</b><span>cuentas</span><strong>{money(total)}</strong></div></div>
  {oldest&&<div className={'serviceAlert '+(minutesOpen(oldest.opened_at)>=60?'critical':minutesOpen(oldest.opened_at)>=30?'warning':'info')}><b>Cuenta más antigua:</b> {accountLabel(oldest,0)} · {durationShort(minutesOpen(oldest.opened_at))} · {money(oldest.total)}</div>}
  <div className="barCards">{sorted.map((o,i)=>{const detail=details.get(String(o.cab_id));const lines=(detail?.lines||[]).slice(0,5);const mins=minutesOpen(o.opened_at);return <button type="button" className={'barAccountCard '+tableTimeClass(mins)} key={o.cab_id||i} onClick={()=>onOpen(o)}>
   <div className="barCardTop"><div><span>CUENTA DE BARRA</span><h3>{accountLabel(o,i)}</h3></div><b>{money(o.total)}</b></div>
   <div className="barCardMeta"><span>⏱ {durationShort(mins)}</span><span>🧾 {detail?`${accountArticleCount(detail)} uds.`:'Cargando...'}</span></div>
   <div className="barPreview">{lines.map(l=><p key={l.line_key||l.id}><span>{Number(l.cantidad||0)}× {productNameFromLine(l,detail.articles)}</span><b>{money(l.importe)}</b></p>)}{detail&&!lines.length&&<p><span>Sin líneas sincronizadas</span></p>}{!detail&&<p><span>Cargando contenido...</span></p>}</div>
   <div className="barCardAction">Abrir ticket completo →</div>
  </button>})}{!sorted.length&&<div className="serviceEmpty wide"><b>Barra sin cuentas abiertas</b><span>Cuando NUMIER abra un post-it o cuenta rápida aparecerá aquí automáticamente.</span></div>}</div>
 </section>
}
function ServiceAlerts({open,barra,occTerrace,occSalon}){
 const alerts=[];const old=[...open].sort((a,b)=>minutesOpen(b.opened_at)-minutesOpen(a.opened_at))[0];
 if(old&&minutesOpen(old.opened_at)>=90)alerts.push({type:'critical',text:`${accountLabel(old,0)} lleva ${durationShort(minutesOpen(old.opened_at))} abierta.`});
 else if(old&&minutesOpen(old.opened_at)>=60)alerts.push({type:'warning',text:`Revisar ${accountLabel(old,0)}: lleva ${durationShort(minutesOpen(old.opened_at))} abierta.`});
 if(occTerrace>=80)alerts.push({type:'info',text:`Terraza al ${occTerrace}% de ocupación.`});
 if(occSalon>=80)alerts.push({type:'info',text:`Salón al ${occSalon}% de ocupación.`});
 if(barra.length>=4)alerts.push({type:'warning',text:`Barra acumula ${barra.length} cuentas abiertas.`});
 if(!alerts.length)alerts.push({type:'positive',text:'Servicio estable. No hay alertas operativas relevantes.'});
 return <div className="serviceAlerts">{alerts.map((a,i)=><div className={'serviceAlert '+a.type} key={i}>{a.text}</div>)}</div>
}
function EstadoServicio({initialView='plano',focusAccount=null}){
 const[state,setState]=useState({open:[],status:null,error:null});
 const[daily,setDaily]=useState(null);
 const[selected,setSelected]=useState(null);
 const[loading,setLoading]=useState(false);
 const[view,setView]=useState(initialView||'plano');
 const[barDetails,setBarDetails]=useState(new Map());
 useEffect(()=>{setView(initialView||'plano')},[initialView]);
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[]);
 useEffect(()=>{if(!focusAccount)return;const match=(state.open||[]).find(o=>String(o.cab_id)===String(focusAccount.cab_id)||String(o.mesa_numero)===String(focusAccount.mesa_numero));if(match)setSelected(match)},[focusAccount,state.open]);
 async function load(){setLoading(true);const [service,sales]=await Promise.all([loadServiceState(),loadSalesForDate(today())]);setState(service);setDaily(sales.daily);const bar=(service.open||[]).filter(o=>o.zona==='barra');const detailPairs=await Promise.all(bar.slice(0,30).map(async o=>[String(o.cab_id),await loadTicketFull(o.cab_id)]));setBarDetails(new Map(detailPairs));setLoading(false)}
 const open=state.open||[];
 const openByMesa=new Map(open.filter(o=>Number(o.mesa_numero)>=1&&Number(o.mesa_numero)<=30&&o.zona!=='barra').map(o=>[Number(o.mesa_numero),o]));
 const terrace=open.filter(o=>o.zona==='terraza');const salon=open.filter(o=>o.zona==='salon');const barra=open.filter(o=>o.zona==='barra');
 const totalPending=open.reduce((a,o)=>a+Number(o.total||0),0);
 const closedToday=Number(daily?.total||0);const potential=closedToday+totalPending;
 const avgMin=open.length?Math.round(open.reduce((a,o)=>a+minutesOpen(o.opened_at),0)/open.length):0;
 const oldest=open.length?Math.max(...open.map(o=>minutesOpen(o.opened_at))):0;
 const largest=open.length?Math.max(...open.map(o=>Number(o.total||0))):0;
 const occTerrace=Math.round((terrace.length/15)*100);const occSalon=Math.round((salon.length/8)*100);const occTotal=Math.round((open.filter(o=>o.zona!=='barra').length/23)*100);
 const last=state.status?.updated_at||open[0]?.last_seen_at;const forecast=serviceForecast({closedToday,totalPending,openCount:open.length,avgMin});
 return <div className="servicePage"><div className="serviceHeader"><div><span className="pill">Colibrí ERP PRO · Servicio LIVE</span><h1>Estado del Servicio</h1><p>Centro operativo en tiempo real: mesas, barra, tickets activos y alertas.</p></div><div className="serviceLive"><b>● EN DIRECTO</b><span>{last?secondsAgo(last):'sin datos'}</span><button onClick={load}>{loading?'Actualizando...':'Actualizar ahora'}</button></div></div>{state.error&&<div className="alertBad">Error: {state.error}</div>}
 <div className="serviceViewTabs"><button className={view==='plano'?'active':''} onClick={()=>setView('plano')}>▦ Plano</button><button className={view==='lista'?'active':''} onClick={()=>setView('lista')}>☷ Listado</button><button className={view==='barra'?'active':''} onClick={()=>setView('barra')}>▰ Barra <span>{barra.length}</span></button></div>
 <div className="serviceKpis livePro"><div><span>Cuentas abiertas</span><b>{open.length}</b><em>{money(totalPending)} pendientes</em></div><div><span>Ocupación</span><b>{occTotal}%</b><em>{open.filter(o=>o.zona!=='barra').length} de 23 mesas</em><OccupancyBar value={occTotal}/></div><div><span>Vendido hoy</span><b>{money(closedToday)}</b><em>facturación cerrada</em></div><div><span>Potencial inmediato</span><b>{money(potential)}</b><em>vendido + pendiente</em></div><div><span>Tiempo medio</span><b>{durationShort(avgMin)}</b><em>más antigua: {durationShort(oldest)}</em></div><div><span>Cuenta mayor</span><b>{money(largest)}</b><em>{barra.length} en barra</em></div></div>
 <ServiceAlerts open={open} barra={barra} occTerrace={occTerrace} occSalon={occSalon}/>
 <div className="card serviceAi"><h2>🤖 Lectura IA del servicio</h2><p><b>{forecast.tone}</b>. {forecast.text}</p><div className="serviceFormula"><span>Vendido: <b>{money(closedToday)}</b></span><span>+</span><span>Pendiente: <b>{money(totalPending)}</b></span><span>=</span><span>Potencial: <b>{money(potential)}</b></span></div></div>
 {view==='barra'&&<ServiceBarPanel accounts={barra} onOpen={setSelected} details={barDetails}/>} 
 {view==='lista'&&<div className="serviceLists"><ServiceAccountList accounts={barra} onOpen={setSelected} barDetails={barDetails} title="Barra"/><ServiceAccountList accounts={[...terrace,...salon]} onOpen={setSelected} title="Mesas abiertas"/></div>}
 {view==='plano'&&<><ServiceBarPanel accounts={barra} onOpen={setSelected} details={barDetails}/><div className="serviceLayout"><main><ServiceZoneMap title="TERRAZA (01-19)" tables={TERRACE_TABLES} openByMesa={openByMesa} onOpen={setSelected}/><ServiceZoneMap title="SALÓN (20-30)" tables={SALON_TABLES} openByMesa={openByMesa} onOpen={setSelected}/></main><aside className="servicePanel"><div className="sideCard"><h3>Ocupación por zona</h3><p><span>Terraza</span><b>{terrace.length}/15</b><em>{occTerrace}%</em></p><OccupancyBar value={occTerrace}/><p><span>Salón</span><b>{salon.length}/8</b><em>{occSalon}%</em></p><OccupancyBar value={occSalon}/><p><span>Barra</span><b>{barra.length}</b><em>{money(barra.reduce((a,o)=>a+Number(o.total||0),0))}</em></p></div><div className="sideCard"><h3>Actividad actual</h3>{open.slice().sort((a,b)=>new Date(b.opened_at)-new Date(a.opened_at)).slice(0,10).map((o,i)=><button className="activityRow" key={o.cab_id||i} onClick={()=>setSelected(o)}><span>{accountLabel(o,i)}</span><b>{money(o.total)}</b><em>{durationShort(minutesOpen(o.opened_at))}</em></button>)}{!open.length&&<p><span>No hay cuentas abiertas</span></p>}</div><div className="sideCard"><h3>Auditoría hoy</h3>{['N','X','G'].map(st=>{const rows=(state.audit||[]).filter(a=>a.estado===st);const sum=rows.reduce((a,r)=>a+Number(r.total||0),0);return <p key={st}><span>{st==='N'?'Borradas manualmente':st==='X'?'Anuladas':'Gastos'}</span><b>{rows.length}</b><em>{money(sum)}</em></p>})}</div><div className="sideCard legend"><h3>Leyenda</h3><p><i className="dot free"></i> Libre</p><p><i className="dot open"></i> Abierta &lt;30 min</p><p><i className="dot notice"></i> 30-60 min</p><p><i className="dot warn"></i> 60-90 min</p><p><i className="dot danger"></i> +90 min</p></div></aside></div></>}
 <TicketModal cabId={selected?.cab_id} account={selected} onClose={()=>setSelected(null)}/></div>
}

function DailyReport({summary,lines,tickets,clockRows,period}){const topQty=productRank(lines,'qty')[0];const topMoney=productRank(lines,'total')[0];const totalStaffHours=(clockRows||[]).filter(r=>String(r.type).toLowerCase()==='entrada').length;return <div className="card report"><h2>🧾 Informe diario / periodo</h2><div className="reportGrid"><p><span>Ventas</span><b>{money(summary.total)}</b></p><p><span>Tickets</span><b>{summary.tickets}</b></p><p><span>Ticket medio</span><b>{money(summary.ticket_medio)}</b></p><p><span>Producto más vendido</span><b>{topQty?topQty.name:'-'}</b></p><p><span>Mayor facturación</span><b>{topMoney?topMoney.name:'-'}</b></p><p><span>Coste hora</span><b>7 €/h</b></p></div><button onClick={()=>navigator.clipboard.writeText(`INFORME COLIBRÍ ERP\n${period.label}\nVentas: ${money(summary.total)}\nTickets: ${summary.tickets}\nTicket medio: ${money(summary.ticket_medio)}\nEfectivo: ${money(summary.efectivo)}\nTarjeta: ${money(summary.tarjeta)}\nProducto más vendido: ${topQty?topQty.name:'-'}\nMayor facturación: ${topMoney?topMoney.name:'-'}`)}>Copiar informe</button><p className="mutedText">El informe automático de las 00:00 queda preparado a nivel de datos; de momento también puedes generarlo y copiarlo desde aquí.</p></div>}


/* COLIBRI_HOTFIX_3_1_X_01
   Sprint: Hotfix 3.1.x-01
   Motivo: Los tabs Cuadrantes, Comparador y Configuración llamaban a componentes no definidos
   y React dejaba la pantalla en blanco. Este bloque restaura carga segura sin tocar Supabase.
*/
function SafeHotfixCard({icon,title,subtitle,children}){
 return <div className="card">
  <div className="hero"><div><h2>{icon} {title}</h2><p>{subtitle}</p></div></div>
  {children}
 </div>
}

function scheduleKey(weekId,day,slot){return `${weekId}|${day}|${slot}`}
function safeJSON(value,fallback){try{return JSON.parse(value)||fallback}catch{return fallback}}
function asArray(value){return Array.isArray(value)?value:[]}
function asObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}
function parseWeekId(weekId){
 const m=String(weekId||'').match(/^(\d{4})-W(\d{1,2})$/);
 if(!m)return {year:new Date().getFullYear(),week:Number(String(week()).split('-W')[1]||1)};
 return {year:Number(m[1]),week:Number(m[2])};
}
function formatWeekId(year,weekNo){return `${year}-W${String(weekNo).padStart(2,'0')}`}
function weeksInYear(year){
 const d=new Date(year,11,31);
 const day=d.getDay()||7;
 if(day===4)return 53;
 const jan1=new Date(year,0,1);
 const janDay=jan1.getDay()||7;
 return janDay===4?53:52;
}
function shiftWeekId(weekId,delta){
 let {year,week}=parseWeekId(weekId);
 week+=delta;
 while(week<1){year-=1;week+=weeksInYear(year)}
 while(week>weeksInYear(year)){week-=weeksInYear(year);year+=1}
 return formatWeekId(year,week);
}
function copyScheduleWeek(data,fromWeek,toWeek){
 const nd={...data};
 DAYS.forEach(day=>SLOTS.forEach(slot=>{
  const fromKey=scheduleKey(fromWeek,day,slot);
  const toKey=scheduleKey(toWeek,day,slot);
  if(asArray(data[fromKey]).length)nd[toKey]=asArray(data[fromKey]).map(e=>({...e}));
  else delete nd[toKey];
 }));
 return nd;
}
function hasScheduleWeek(data,weekId){
 return DAYS.some(day=>SLOTS.some(slot=>asArray(asObject(data)[scheduleKey(weekId,day,slot)]).length));
}

function employeeLabel(e){return e?.name||e?.employee_name||e?.nombre||`Empleado ${e?.id||''}`.trim()}
function employeeColor(e,i=0){return e?.color||['#0b7f6d','#0b5c9a','#8b5cf6','#d97706','#dc2626','#0891b2','#be185d'][i%7]}
function slotStart(slot){return slot.split('-')[0]}
function slotEnd(slot){return slot.split('-')[1]}
function mergeRanges(slots){
 const ordered=(slots||[]).slice().sort((a,b)=>slotStart(a).localeCompare(slotStart(b)));
 const ranges=[];
 ordered.forEach(slot=>{const a=slotStart(slot),b=slotEnd(slot);const last=ranges[ranges.length-1];if(last&&last.end===a)last.end=b;else ranges.push({start:a,end:b});});
 return ranges;
}
function buildScheduleSummary(data,weekId){
 const byEmp={};
 DAYS.forEach(day=>SLOTS.forEach(slot=>{asArray(asObject(data)[scheduleKey(weekId,day,slot)]).forEach(e=>{const name=employeeLabel(e);byEmp[name]=byEmp[name]||{name,color:e.color||'#0b7f6d',days:{},hours:0};byEmp[name].days[day]=byEmp[name].days[day]||[];byEmp[name].days[day].push(slot);byEmp[name].hours+=h(slot);})}));
 return Object.values(byEmp).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
function scheduleWhatsAppText(data,weekId){
 const summary=buildScheduleSummary(data,weekId);
 const lines=[`📅 CUADRANTE SEMANAL · ${weekId}`,`Brasería El Colibrí`,``];
 if(!summary.length)lines.push('Sin turnos asignados todavía.');
 summary.forEach(emp=>{lines.push(`👤 ${emp.name} · ${emp.hours.toFixed(1)} h`);DAYS.forEach(day=>{const ranges=mergeRanges(emp.days[day]||[]);if(ranges.length)lines.push(`  ${day}: ${ranges.map(r=>`${r.start}-${r.end}`).join(' / ')}`)});lines.push('');});
 lines.push('Por favor, revisad vuestro horario de entrada y salida.');
 return lines.join('\n');
}
function copyText(text){navigator.clipboard?.writeText(text).then(()=>alert('Texto copiado para WhatsApp')).catch(()=>{const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();alert('Texto copiado para WhatsApp')})}
function Schedule(){
 const RESTAURANT_ID='colibri';
 const STORAGE='colibriCuadrantesRC332_CACHE';
 const baseEmployees=[
  {id:'alfonso',name:'ALFONSO',category:'Gerencia',color:'#5f8791'},
  {id:'sonia',name:'SONIA',category:'Sala',color:'#29b6f6'},
  {id:'alvaro',name:'ALVARO',category:'Sala',color:'#66bb6a'},
  {id:'jose',name:'JOSE',category:'Barra',color:'#ffa726'},
  {id:'kathy',name:'KATHY',category:'Sala',color:'#ec407a'},
  {id:'orlando',name:'ORLANDO',category:'Sala',color:'#ab47bc'},
  {id:'pablo',name:'PABLO',category:'Sala',color:'#ffee58'},
  {id:'prueba',name:'PRUEBA',category:'Refuerzo',color:'#26c6da'}
 ];
 function emptyWeek(){const w={};DAYS.forEach(d=>{w[d]={};SLOTS.forEach(s=>w[d][s]=[])});return w}
 function slugName(name){return String(name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}
 function normalizeEmployeeId(id){return id==='ivan'?'kathy':id}
 function normalizeEmployees(list){
  const source=Array.isArray(list)?list:[];
  const byKey=new Map();
  const blocked=new Set(['ivan','javi']);
  const put=(raw,i)=>{
   if(!raw)return;
   const rawName=String(raw.name||raw.employee_name||raw.nombre||raw.id||'').trim();
   const nameKey=slugName(rawName);
   let id=normalizeEmployeeId(String(raw.id||nameKey||'').trim());
   const idKey=slugName(id);
   if(blocked.has(nameKey)||blocked.has(idKey))return;
   let name=rawName||id;
   let category=raw.category||raw.role||raw.position||'Sala';
   let color=raw.color||EMP_COLORS[i%EMP_COLORS.length];
   if(!id)return;
   id=slugName(id)||slugName(name);
   name=String(name).trim().toUpperCase();
   const key=slugName(name)||id;
   const fixed={id,name,category,color,active:raw.active!==false,can_clock:raw.can_clock!==false};
   byKey.set(key,{...(byKey.get(key)||{}),...fixed});
  };
  baseEmployees.forEach(put);
  source.forEach(put);
  return [...byKey.values()].filter(e=>e.active!==false).sort((a,b)=>{
   const order=baseEmployees.map(x=>x.id);
   const ia=order.indexOf(a.id),ib=order.indexOf(b.id);
   if(ia!==-1||ib!==-1)return (ia===-1?999:ia)-(ib===-1?999:ib);
   return a.name.localeCompare(b.name,'es');
  });
 }
 async function loadEmployeesFromSupabase(existing=[]){
  const fallback=normalizeEmployees([...baseEmployees,...existing]);
  if(!supabase)return fallback;
  try{
   const {data,error}=await supabase.from('employees').select('*').eq('active',true).order('name');
   if(error)throw error;
   const remote=(data||[]).filter(e=>(e?.name||e?.employee_name||e?.nombre)).map((e,i)=>{
    const label=String(e.name||e.employee_name||e.nombre||'').trim();
    const id=slugName(label)||String(e.id);
    return {
     id,
     name:label.toUpperCase(),
     category:e.category||e.position||(e.role==='empleado'?'Sala':e.role)||'Sala',
     color:e.color||EMP_COLORS[i%EMP_COLORS.length],
     active:true,
     can_clock:e.can_clock!==false
    };
   });
   // Regla ERP: si existen empleados en el módulo Empleados, Cuadrantes usa ESA lista como fuente única.
   // Si todavía no hay empleados dados de alta, usa la plantilla base para no dejar el módulo vacío.
   return remote.length?normalizeEmployees(remote):fallback;
  }catch(e){
   console.warn('No se pudo cargar empleados desde Supabase',e);
   return fallback;
  }
 }
 function cleanWeek(src){const w=emptyWeek();DAYS.forEach(d=>SLOTS.forEach(s=>{const arr=src?.[d]?.[s];if(Array.isArray(arr)&&arr.includes(CLOSED_ID)){w[d][s]=[CLOSED_ID];return;}w[d][s]=Array.isArray(arr)?[...new Set(arr.filter(Boolean).map(normalizeEmployeeId).filter(id=>id!==CLOSED_ID))].slice(0,MAX_PER_SLOT):[]}));return w}
 function parseJSON(key,fallback){try{const raw=localStorage.getItem(key);if(!raw)return fallback;const val=JSON.parse(raw);return val||fallback}catch{return fallback}}
 function shiftWeek(id,delta){const m=String(id||week()).match(/(\d{4})-W(\d{2})/);let y=m?+m[1]:new Date().getFullYear();let w=m?+m[2]:1;w+=delta;while(w<1){y--;w+=53}while(w>53){y++;w-=53}return `${y}-W${String(w).padStart(2,'0')}`}
 const [weekId,setWeekId]=useState(week());
 const [weekData,setWeekData]=useState(emptyWeek());
 const [employees,setEmployees]=useState(baseEmployees);
 const [selected,setSelected]=useState(null);
 const [newName,setNewName]=useState('');
 const [newCat,setNewCat]=useState('Sala');
 const [sourceDay,setSourceDay]=useState('Lunes');
 const [targetDay,setTargetDay]=useState('Martes');
 const [dragItem,setDragItem]=useState(null);
 const [copyItem,setCopyItem]=useState(null);
 const [touchHint,setTouchHint]=useState('');
 const [syncState,setSyncState]=useState(supabase?'cargando':'sin_supabase');
 const [saving,setSaving]=useState(false);
 const [loadError,setLoadError]=useState('');
 const [lastSaved,setLastSaved]=useState('');
 const [revision,setRevision]=useState(0);
 const [loaded,setLoaded]=useState(false);
 const weekRef=React.useRef(weekData);
 const pointerDragRef=React.useRef(null);
 useEffect(()=>{weekRef.current=weekData},[weekData]);
 useEffect(()=>{loadWeek(weekId,true)},[weekId]);
 useEffect(()=>{const t=setInterval(()=>{if(supabase&&!saving)loadWeek(weekId,false)},8000);return()=>clearInterval(t)},[weekId,saving]);
 function cacheKey(id){return `${STORAGE}_${id}`}
 async function loadWeek(id,showLoading){
  if(showLoading){setLoaded(false);setSyncState(supabase?'cargando':'sin_supabase')}
  setLoadError('');
  if(!supabase){
   const cached=parseJSON(cacheKey(id),{data:emptyWeek(),employees:baseEmployees});
   setWeekData(cleanWeek(cached.data||cached));
   setEmployees(normalizeEmployees(cached.employees));
   setSyncState('local');setLoaded(true);return;
  }
  try{
   const {data,error}=await supabase.from('work_schedule_weeks').select('*').eq('restaurant_id',RESTAURANT_ID).eq('week_id',id).maybeSingle();
   if(error)throw error;
   if(data){
    const next=cleanWeek(data.data||{});
    const emps=await loadEmployeesFromSupabase([]);
    setWeekData(next);setEmployees(emps);setRevision(Number(data.revision||0));
    localStorage.setItem(cacheKey(id),JSON.stringify({data:next,employees:emps,revision:Number(data.revision||0)}));
   }else{
    const cached=parseJSON(cacheKey(id),null);
    if(cached?.data){setWeekData(cleanWeek(cached.data));setEmployees(await loadEmployeesFromSupabase([]))}
    else {setWeekData(emptyWeek());setEmployees(await loadEmployeesFromSupabase([]))}
    setRevision(0);
   }
   setSyncState('supabase');setLastSaved(new Date().toLocaleTimeString('es-ES'));
  }catch(e){
   setSyncState('error_supabase');setLoadError(e?.message||String(e));
   const cached=parseJSON(cacheKey(id),{data:emptyWeek(),employees:baseEmployees});
   setWeekData(cleanWeek(cached.data||cached));setEmployees(await loadEmployeesFromSupabase([]));
  }finally{setLoaded(true)}
 }
 async function saveWeek(id,nextWeek,nextEmployees=employees){
  const clean=cleanWeek(nextWeek);const safeEmployees=normalizeEmployees(nextEmployees).map((e,i)=>({id:e.id,name:e.name,category:e.category||'Sala',color:e.color||EMP_COLORS[i%EMP_COLORS.length]}));
  setWeekData(clean);setEmployees(safeEmployees);localStorage.setItem(cacheKey(id),JSON.stringify({data:clean,employees:safeEmployees,revision:revision+1}));
  if(!supabase){setSyncState('local');return}
  setSaving(true);setLoadError('');
  try{
   const payload={restaurant_id:RESTAURANT_ID,week_id:id,data:clean,employees:safeEmployees,revision:revision+1,updated_at:new Date().toISOString()};
   const {data,error}=await supabase.from('work_schedule_weeks').upsert(payload,{onConflict:'restaurant_id,week_id'}).select('revision,updated_at').single();
   if(error)throw error;
   setRevision(Number(data?.revision||revision+1));setSyncState('supabase');setLastSaved(new Date().toLocaleTimeString('es-ES'));
  }catch(e){setSyncState('error_supabase');setLoadError(e?.message||String(e))}
  finally{setSaving(false)}
 }
 function getCell(day,slot){const arr=weekData?.[day]?.[slot];return Array.isArray(arr)?arr:[]}
 function empById(id){return employees.find(e=>e.id===normalizeEmployeeId(id))||{id,name:id,category:'',color:'#607d8b'}}
 function setCell(day,slot,ids){const w=cleanWeek(weekData);w[day][slot]=Array.isArray(ids)?ids.slice(0,MAX_PER_SLOT):[];saveWeek(weekId,w)}
 function toggleEmployee(id){if(!selected)return;const arr=getCell(selected.day,selected.slot).filter(x=>x!==CLOSED_ID);const next=arr.includes(id)?arr.filter(x=>x!==id):arr.length>=MAX_PER_SLOT?arr:[...arr,id];setCell(selected.day,selected.slot,next)}
 function markClosed(day,slot){setCell(day,slot,[CLOSED_ID]);setSelected(null)}
 function isClosed(day,slot){return getCell(day,slot).includes(CLOSED_ID)}
 function addEmployee(){const name=newName.trim();if(!name)return;const id=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_')+'_'+Date.now().toString(36);const list=[...employees,{id,name,category:newCat,color:EMP_COLORS[employees.length%EMP_COLORS.length]}];setNewName('');saveWeek(weekId,weekData,list)}
 function removeEmployee(id){if(!confirm('¿Quitar empleado y sus turnos de esta semana?'))return;const list=employees.filter(e=>e.id!==id);const w=cleanWeek(weekData);DAYS.forEach(d=>SLOTS.forEach(s=>w[d][s]=w[d][s].filter(x=>x!==id&&x!==normalizeEmployeeId(id))));saveWeek(weekId,w,list)}
 function clearWeek(){if(!confirm('¿Vaciar la semana actual?'))return;saveWeek(weekId,emptyWeek())}
 async function fetchRemoteWeek(id){if(!supabase)return cleanWeek(parseJSON(cacheKey(id),{data:emptyWeek()}).data||{});const {data,error}=await supabase.from('work_schedule_weeks').select('data').eq('restaurant_id',RESTAURANT_ID).eq('week_id',id).maybeSingle();if(error)throw error;return cleanWeek(data?.data||{})}
 async function copyPreviousWeek(){try{const prev=shiftWeek(weekId,-1);const src=await fetchRemoteWeek(prev);await saveWeek(weekId,src);alert(`Semana ${prev} copiada`)}catch(e){alert('No se pudo copiar: '+(e?.message||e))}}
 async function duplicateNextWeek(){const nextId=shiftWeek(weekId,1);await saveWeek(nextId,weekData);setWeekId(nextId);alert('Duplicada a la semana siguiente')}
 function copyDay(){if(sourceDay===targetDay)return;const w=cleanWeek(weekData);SLOTS.forEach(s=>w[targetDay][s]=[...(w[sourceDay][s]||[])]);saveWeek(weekId,w);alert(`${sourceDay} copiado a ${targetDay}`)}
 function quickCopy(a,b){const w=cleanWeek(weekData);SLOTS.forEach(s=>w[b][s]=[...(w[a][s]||[])]);saveWeek(weekId,w)}
 function addEmployeeToCell(employeeId,day,slot){
  if(!employeeId)return false;
  const w=cleanWeek(weekData);
  const dest=(Array.isArray(w[day][slot])?w[day][slot]:[]).filter(x=>x!==CLOSED_ID);
  if(dest.includes(employeeId)){setTouchHint('Ese empleado ya está en esa franja');return true}
  if(dest.length>=MAX_PER_SLOT){setTouchHint(`Máximo ${MAX_PER_SLOT} empleados por franja`);return true}
  dest.push(employeeId);
  w[day][slot]=dest.slice(0,MAX_PER_SLOT);
  saveWeek(weekId,w);
  setTouchHint(`${empById(employeeId).name} copiado a ${day} ${slot}`);
  return true;
 }
 function startCopyEmployee(id,day,slot){
  setCopyItem({id,day,slot});
  setTouchHint(`Copiando ${empById(id).name}. Toca otra celda para duplicarlo.`);
 }
 function copyDrag(day,slot,event){
  event?.preventDefault?.();
  let item=dragItem;
  try{const raw=event?.dataTransfer?.getData('application/json')||event?.dataTransfer?.getData('text/plain');if(raw)item=JSON.parse(raw)}catch{}
  if(!item?.id)return;
  addEmployeeToCell(item.id,day,slot);
  setDragItem(null);
 }
 function copyEmployeeToCell(day,slot){
  if(!copyItem)return false;
  addEmployeeToCell(copyItem.id,day,slot);
  setCopyItem(null);
  return true;
 }
 function pointerStart(e,id,day,slot){
  if(e.pointerType==='mouse')return;
  pointerDragRef.current={id,day,slot,x:e.clientX,y:e.clientY,moved:false};
  setTouchHint(`Arrastra ${empById(id).name} a otra celda o toca para copiar.`);
  try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}
 }
 function pointerMove(e){
  const p=pointerDragRef.current;if(!p)return;
  if(Math.abs(e.clientX-p.x)>8||Math.abs(e.clientY-p.y)>8)p.moved=true;
 }
 function pointerEnd(e){
  const p=pointerDragRef.current;if(!p)return;
  pointerDragRef.current=null;
  if(!p.moved)return;
  const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-day][data-slot]');
  if(!el)return;
  const day=el.getAttribute('data-day'),slot=el.getAttribute('data-slot');
  if(day&&slot){e.preventDefault?.();addEmployeeToCell(p.id,day,slot);}
 }
 const totals=useMemo(()=>{const t={};DAYS.forEach(d=>SLOTS.forEach(s=>getCell(d,s).filter(id=>id!==CLOSED_ID).forEach(id=>t[id]=(t[id]||0)+h(s))));return t},[weekData,employees]);
 const totalHours=Object.values(totals).reduce((a,b)=>a+b,0);
 const warnings=employees.filter(e=>totals[e.id]>40).map(e=>`${e.name} supera 40 h`);
 function buildWhatsApp(){let out=`📅 BRASERÍA EL COLIBRÍ\nCUADRANTE SEMANA ${weekId}\n\n`;DAYS.forEach(day=>{out+=`━━━━━━━━━━━━━━\n🟢 ${day.toUpperCase()}\n`;let any=false;SLOTS.forEach(slot=>{const cell=getCell(day,slot);if(cell.includes(CLOSED_ID)){any=true;out+=`\n${slot}\nCERRADO\n`;return;}const names=cell.filter(id=>id!==CLOSED_ID).map(id=>`• ${empById(id).name}`);if(names.length){any=true;out+=`\n${slot}\n${names.join('\n')}\n`}});if(!any)out+='Sin turnos asignados\n';out+='\n'});out+='━━━━━━━━━━━━━━\nHORAS SEMANALES\n';employees.filter(e=>totals[e.id]).forEach(e=>out+=`${e.name}: ${totals[e.id].toFixed(1)} h\n`);return out}
 async function copyWhatsApp(){try{await navigator.clipboard.writeText(buildWhatsApp());alert('Texto copiado para WhatsApp')}catch{prompt('Copia el texto:',buildWhatsApp())}}
 function downloadText(){const blob=new Blob([buildWhatsApp()],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cuadrante_${weekId}.txt`;a.click();URL.revokeObjectURL(a.href)}
 async function exportImage(){const cw=1500,ch=980;const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.fillStyle='#073b35';ctx.font='bold 42px Arial';ctx.fillText(`Cuadrante semanal ${weekId}`,40,55);ctx.font='24px Arial';ctx.fillText('Brasería El Colibrí',40,90);const colW=(cw-80)/8,rowH=86,y0=120;ctx.font='bold 18px Arial';['Hora',...DAYS].forEach((t,i)=>{ctx.fillStyle='#0b4d43';ctx.fillRect(40+i*colW,y0,colW-6,36);ctx.fillStyle='white';ctx.fillText(t,52+i*colW,y0+25)});SLOTS.forEach((slot,r)=>{const y=y0+44+r*rowH;ctx.fillStyle='#eef9f6';ctx.fillRect(40,y,colW-6,rowH-8);ctx.fillStyle='#073b35';ctx.font='bold 20px Arial';ctx.fillText(slot,52,y+42);DAYS.forEach((d,di)=>{const x=40+(di+1)*colW;const cell=getCell(d,slot);const closed=cell.includes(CLOSED_ID);ctx.fillStyle=closed?'#000000':'#103f38';ctx.fillRect(x,y,colW-6,rowH-8);if(closed){ctx.fillStyle='white';ctx.font='bold 18px Arial';ctx.fillText('CERRADO',x+16,y+42);return;}cell.filter(id=>id!==CLOSED_ID).forEach((id,idx)=>{const emp=empById(id);ctx.fillStyle=emp.color;ctx.fillRect(x+10,y+10+idx*22,colW-26,18);ctx.fillStyle='white';ctx.font='bold 14px Arial';ctx.fillText(emp.name,x+16,y+24+idx*22)})})});canvas.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=`cuadrante_${weekId}.png`;a.click();URL.revokeObjectURL(a.href)})}
 function exportPDF(){window.print()}
 if(!loaded)return <div className="card"><h2>Cargando cuadrante...</h2></div>;
 return <div className="schedulePage scheduleFresh">
  <div className="scheduleTopButtons">
   <h2>Control semanal</h2><p>{syncState==='supabase'?'🟢 Guardado compartido activo':syncState==='local'?'🟡 Modo local: falta configurar Supabase':'🔴 Error Supabase'} {saving?' · guardando...':''} {lastSaved?` · ${lastSaved}`:''}</p>
   {loadError&&<div className="warnBox">Error Supabase: {loadError}. Ejecuta el SQL RC 3.3.2 y revisa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.</div>}
   {!supabase&&<div className="warnBox">Supabase no está configurado. Así PC y móvil nunca podrán compartir cuadrantes.</div>}
   <div className="scheduleActionGrid">
    <button onClick={()=>setWeekId(shiftWeek(weekId,-1))}>← Semana anterior</button><button onClick={()=>setWeekId(week())}>Semana actual</button><button onClick={()=>setWeekId(shiftWeek(weekId,1))}>Semana siguiente →</button><button onClick={copyPreviousWeek}>Copiar semana anterior</button><button onClick={duplicateNextWeek}>Duplicar a siguiente</button><button onClick={copyWhatsApp}>Copiar WhatsApp</button><button onClick={downloadText}>Descargar texto</button><button onClick={exportImage}>Copiar/descargar imagen</button><button onClick={exportPDF}>Exportar PDF</button><button onClick={()=>loadWeek(weekId,true)}>Recargar de Supabase</button><button className="red" onClick={clearWeek}>Vaciar semana</button>
   </div>
   <div className="copyDayBox"><select value={sourceDay} onChange={e=>setSourceDay(e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><span>→</span><select value={targetDay} onChange={e=>setTargetDay(e.target.value)}>{DAYS.map(d=><option key={d}>{d}</option>)}</select><button onClick={copyDay}>Copiar día</button></div>
   <div className="quickCopyDays"><b>Copias rápidas:</b>{DAYS.slice(0,-1).map((d,i)=><button key={d} onClick={()=>quickCopy(d,DAYS[i+1])}>{d} → {DAYS[i+1]}</button>)}</div>
  </div>
  <div className="card mainScheduleCard scheduleCard" id="printSchedule">
   <div className="row between scheduleTitleBar"><div><h2>Cuadrante semanal {weekId}</h2><p className="mutedText">Fuente única: Supabase. En PC arrastra una etiqueta para DUPLICARLA en otra franja. En móvil toca un empleado y luego toca la celda destino.</p></div><b className="scheduleVersion">{totalHours.toFixed(1)} h</b></div>
   {warnings.length>0&&<div className="warnBox">{warnings.join(' · ')}</div>}
   {copyItem&&<div className="copyModeBox">📋 Copiando <b>{empById(copyItem.id).name}</b>. Toca una celda destino para duplicarlo. <button onClick={()=>{setCopyItem(null);setTouchHint('')}}>Cancelar</button></div>}
   {touchHint&&<div className="copyModeBox soft">{touchHint}</div>}
   <div className="scheduleWrap"><table className="schedulePro"><thead><tr><th>Hora</th>{DAYS.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{SLOTS.map(slot=><tr key={slot}><td className="slotHour">{slot}</td>{DAYS.map(day=>{const closed=isClosed(day,slot);const cell=getCell(day,slot).filter(id=>id!==CLOSED_ID);return <td key={day+slot} data-day={day} data-slot={slot} className={(copyItem?'shiftCell copyReady':'shiftCell')+(closed?' closedCell':'')} onClick={()=>{if(!copyEmployeeToCell(day,slot))setSelected({day,slot})}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={e=>copyDrag(day,slot,e)}>{closed?<span className="closedLabel">CERRADO</span>:<>{cell.length===0&&<span className="emptyShift">+ añadir</span>}{cell.map(id=>{const emp=empById(id);return <span key={id} draggable className="badge" style={{background:emp.color,color:emp.color==='#ffee58'?'#073b35':'white'}} title="Arrastra para duplicar. En móvil toca y luego toca destino." onClick={e=>{e.stopPropagation();startCopyEmployee(id,day,slot);}} onPointerDown={e=>{e.stopPropagation();pointerStart(e,id,day,slot)}} onPointerMove={pointerMove} onPointerUp={pointerEnd} onDoubleClick={e=>{e.stopPropagation();setSelected({day,slot})}} onDragStart={e=>{e.stopPropagation();const item={id,day,slot};setDragItem(item);e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/json',JSON.stringify(item));e.dataTransfer.setData('text/plain',JSON.stringify(item));}} onDragEnd={()=>setDragItem(null)}>{emp.name}</span>})}</>}</td>})}</tr>)}</tbody></table></div>
   <div className="employeeSummary">{employees.map(e=><div key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><em>{(totals[e.id]||0).toFixed(1)} h</em></div>)}</div>
   <textarea value={buildWhatsApp()} readOnly rows={10}/>
  </div>
  <div className="card employeeManager"><h2>Empleados del cuadrante</h2><div className="row"><input placeholder="Nombre" value={newName} onChange={e=>setNewName(e.target.value)}/><select value={newCat} onChange={e=>setNewCat(e.target.value)}><option>Sala</option><option>Barra</option><option>Cocina</option><option>Gerencia</option></select><button onClick={addEmployee}>Añadir empleado</button></div><div className="employeeChips">{employees.map(e=><span className="employeeChip" key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><small>{e.category}</small><button className="miniRed" onClick={()=>removeEmployee(e.id)}>x</button></span>)}</div></div>
  {selected&&<div className="modal" onClick={()=>setSelected(null)}><div className="card scheduleModal" onClick={e=>e.stopPropagation()}><h2>{selected.day} · {selected.slot}</h2><p>Selecciona hasta 4 empleados o marca la franja como cerrada.</p><div className="empGrid"><button className={'empbtn closedOption '+(isClosed(selected.day,selected.slot)?'selected':'')} onClick={()=>markClosed(selected.day,selected.slot)}><span className="sq black"></span><b>CERRADO</b><small>Sin servicio</small></button>{employees.map(emp=>{const active=getCell(selected.day,selected.slot).includes(emp.id);return <button key={emp.id} className={'empbtn '+(active?'selected':'')} onClick={()=>toggleEmployee(emp.id)}><span className="sq" style={{background:emp.color}}></span><b>{emp.name}</b><small>{emp.category}</small></button>})}</div><button className="red" onClick={()=>setSelected(null)}>Cerrar</button></div></div>}
 </div>
}
function Compare(){const[text,setText]=useState('');const[name,setName]=useState('');function calc(){const clean=text.replace(/_/g,'');let total=0;for(const line of clean.split('\n')){const times=[...line.matchAll(/entrada\s*(\d{1,2}):(\d{2})\s*salida\s*(\d{1,2}):(\d{2})/gi)];const seen=new Set();times.forEach(m=>{const k=m[0];if(seen.has(k))return;seen.add(k);const a=+m[1]*60+ +m[2],b=+m[3]*60+ +m[4];if(b>a)total+=(b-a)/60})}return total}return <div className="card"><h2>Comparador WhatsApp vs cuadrante</h2><input placeholder="Empleado" value={name} onChange={e=>setName(e.target.value)}/><textarea rows="12" placeholder="Pega plantilla WhatsApp" value={text} onChange={e=>setText(e.target.value)}/><h3>Horas declaradas detectadas: {calc()} h</h3><p>Compara este total con el resumen de cuadrante semanal.</p></div>}

function normalizeProductName(v){return String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}
function calcUnitCost(line){const packs=Math.max(0,Number(line?.quantity||0));const units=Math.max(1,Number(line?.pack_units||1));const net=Math.max(0,Number(line?.net_total||0));return packs>0?net/(packs*units):0}
function marginPct(sale,cost){sale=Number(sale||0);cost=Number(cost||0);return sale>0?((sale-cost)/sale)*100:0}
const PURCHASE_CATEGORIES=['Materia prima','Bebidas','Consumibles de servicio','Limpieza e higiene','Menaje','Utensilios y pequeño equipamiento','Energía y suministros','Mantenimiento y reparación','Otros gastos'];
const INVOICE_STATUS={queued:['En cola','statusPending'],processing:['Procesando IA','statusProcessing'],awaiting_review:['Revisar','statusWarning'],reviewed:['Completada','statusOk'],failed:['Error','statusError'],rejected:['Rechazada','statusError'],pending_review:['Pendiente','statusPending']};
function addMonthsISO(months){const d=new Date();d.setMonth(d.getMonth()+months);return d.toISOString()}
function Profitability(){
 const[t,setT]=useState('resumen');
 const[suppliers,setSuppliers]=useState([]);const[invoices,setInvoices]=useState([]);const[items,setItems]=useState([]);
 const[selectedId,setSelectedId]=useState(null);const[loading,setLoading]=useState(true);const[error,setError]=useState('');
 const[newSupplier,setNewSupplier]=useState('');const[file,setFile]=useState(null);const[busy,setBusy]=useState(false);
 const[invForm,setInvForm]=useState({supplier_id:'',invoice_number:'',invoice_date:today(),subtotal:'',tax_total:'',total:''});
 const[lineForm,setLineForm]=useState({product_name:'',supplier_sku:'',article_code:'',quantity:1,pack_units:1,unit:'ud',net_total:'',tax_rate:10,sale_price:'',category:'Materia prima',sub_category:''});
 useEffect(()=>{loadAll();runCleanup()},[]);
 useEffect(()=>{const active=invoices.some(x=>['queued','processing'].includes(x.status));if(!active)return;const timer=setInterval(()=>loadAll(false),5000);return()=>clearInterval(timer)},[invoices]);
 async function runCleanup(){try{await supabase?.functions.invoke('cleanup-purchase-invoices')}catch(e){console.warn('Limpieza aplazada',e)}}
 async function loadAll(showLoading=true){
  if(!supabase){setError('Supabase no configurado');setLoading(false);return}
  if(showLoading)setLoading(true);setError('');
  const [sRes,iRes,lRes]=await Promise.all([
   supabase.from('purchase_suppliers').select('*').order('name'),
   supabase.from('purchase_invoices').select('*,purchase_suppliers(name)').order('created_at',{ascending:false}).limit(500),
   supabase.from('purchase_invoice_items').select('*,purchase_invoices(invoice_date,supplier_id,purchase_suppliers(name))').order('created_at',{ascending:false}).limit(10000)
  ]);
  const e=sRes.error||iRes.error||lRes.error;if(e)setError(e.message);
  setSuppliers(sRes.data||[]);setInvoices(iRes.data||[]);setItems(lRes.data||[]);setLoading(false);
 }
 async function createSupplier(nameOverride){const name=String(nameOverride||newSupplier).trim();if(!name)return null;const existing=suppliers.find(x=>normalizeProductName(x.name)===normalizeProductName(name));if(existing)return existing;const{data,error}=await supabase.from('purchase_suppliers').insert({name,active:true}).select().single();if(error){alert(error.message);return null}setNewSupplier('');setSuppliers(v=>[...v,data].sort((a,b)=>a.name.localeCompare(b.name)));setInvForm(v=>({...v,supplier_id:data.id}));return data}
 async function processInvoice(id){
  setBusy(true);
  const{error}=await supabase.functions.invoke('process-purchase-invoice',{body:{invoice_id:id}});
  if(error){await supabase.from('purchase_invoices').update({status:'failed',processing_error:error.message,processing_progress:0}).eq('id',id);alert('No se pudo iniciar el procesamiento: '+error.message+'\nRevisa que la Edge Function y OPENAI_API_KEY estén configuradas.');}
  await loadAll(false);setBusy(false);
 }
 async function createInvoice(){
  if(!file&&!invForm.supplier_id)return alert('Adjunta una foto/PDF o selecciona un proveedor para un registro manual');
  setBusy(true);let file_path=null,file_name=null,file_type=null;
  if(file){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');file_path=`${new Date().getFullYear()}/${Date.now()}_${safe}`;const up=await supabase.storage.from('purchase-invoices').upload(file_path,file,{contentType:file.type,upsert:false});if(up.error){setBusy(false);return alert('No se pudo subir la factura: '+up.error.message)}file_name=file.name;file_type=file.type;}
  const auto=Boolean(file);const row={supplier_id:invForm.supplier_id||null,invoice_number:invForm.invoice_number||null,invoice_date:invForm.invoice_date||today(),subtotal:Number(invForm.subtotal||0),tax_total:Number(invForm.tax_total||0),total:Number(invForm.total||0),file_path,file_name,file_type,status:auto?'queued':'awaiting_review',source:auto?'upload':'manual',processing_progress:auto?5:100,processing_step:auto?'Factura recibida':'Pendiente de revisión',retention_delete_at:addMonthsISO(4)};
  const{data,error}=await supabase.from('purchase_invoices').insert(row).select().single();if(error){setBusy(false);return alert(error.message)}
  setInvForm({supplier_id:invForm.supplier_id,invoice_number:'',invoice_date:today(),subtotal:'',tax_total:'',total:''});setFile(null);setSelectedId(data.id);await loadAll(false);setT('facturas');setBusy(false);
  if(auto)processInvoice(data.id);
 }
 async function approveDetectedSupplier(inv){const name=String(inv.detected_supplier_name||'').trim();if(!name)return alert('No hay proveedor detectado');const supplier=await createSupplier(name);if(!supplier)return;await supabase.from('purchase_invoices').update({supplier_id:supplier.id}).eq('id',inv.id);await loadAll(false)}
 async function addLine(){
  if(!selectedId)return alert('Selecciona una factura');if(!lineForm.product_name.trim())return alert('Indica el producto');
  const unit_cost=calcUnitCost(lineForm);
  const row={invoice_id:selectedId,product_name:lineForm.product_name.trim(),supplier_sku:lineForm.supplier_sku||null,article_code:lineForm.article_code||null,quantity:Number(lineForm.quantity||0),pack_units:Number(lineForm.pack_units||1),unit:lineForm.unit||'ud',net_total:Number(lineForm.net_total||0),tax_rate:Number(lineForm.tax_rate||0),unit_cost,sale_price:Number(lineForm.sale_price||0),category:lineForm.category,sub_category:lineForm.sub_category||null,review_status:'confirmed',source:'manual'};
  const{error}=await supabase.from('purchase_invoice_items').insert(row);if(error)return alert(error.message);
  setLineForm({product_name:'',supplier_sku:'',article_code:'',quantity:1,pack_units:1,unit:'ud',net_total:'',tax_rate:10,sale_price:'',category:'Materia prima',sub_category:''});loadAll(false)
 }
 async function updateExtractedLine(id,patch){const{error}=await supabase.from('purchase_invoice_items').update(patch).eq('id',id);if(error)alert(error.message);else loadAll(false)}
 async function removeLine(id){if(!confirm('¿Eliminar esta línea?'))return;const{error}=await supabase.from('purchase_invoice_items').delete().eq('id',id);if(error)alert(error.message);else loadAll(false)}
 async function markReviewed(inv){const lines=items.filter(x=>x.invoice_id===inv.id);if(!inv.supplier_id)return alert('Primero confirma o selecciona el proveedor');if(lines.some(x=>x.review_status!=='confirmed'))return alert('Hay artículos nuevos pendientes de clasificar');const{error}=await supabase.from('purchase_invoices').update({status:'reviewed',reviewed_at:new Date().toISOString(),processing_step:'Factura validada',processing_progress:100}).eq('id',inv.id);if(error)alert(error.message);else loadAll(false)}
 async function openFile(inv){if(!inv.file_path)return alert(inv.file_deleted_at?'El archivo original se eliminó al superar los 4 meses. Los datos permanecen guardados.':'Esta factura no tiene archivo');const{data,error}=await supabase.storage.from('purchase-invoices').createSignedUrl(inv.file_path,300);if(error)return alert(error.message);window.open(data.signedUrl,'_blank','noopener,noreferrer')}
 const selected=invoices.find(x=>x.id===selectedId)||null;
 const selectedLines=items.filter(x=>x.invoice_id===selectedId);
 const monthPrefix=today().slice(0,7);const monthInvoices=invoices.filter(x=>String(x.invoice_date||'').startsWith(monthPrefix));
 const monthPurchases=monthInvoices.reduce((a,x)=>a+Number(x.total||0),0);
 const latestByProduct=useMemo(()=>{const map=new Map();[...items].filter(x=>x.review_status==='confirmed'||!x.review_status).sort((a,b)=>String(b.purchase_invoices?.invoice_date||'').localeCompare(String(a.purchase_invoices?.invoice_date||''))).forEach(x=>{const k=normalizeProductName(x.product_name);if(k&&!map.has(k))map.set(k,x)});return [...map.values()]},[items]);
 const histories=useMemo(()=>{const map=new Map();items.filter(x=>x.review_status==='confirmed'||!x.review_status).forEach(x=>{const k=normalizeProductName(x.product_name);if(!map.has(k))map.set(k,[]);map.get(k).push(x)});return [...map.entries()].map(([key,rows])=>{rows.sort((a,b)=>String(b.purchase_invoices?.invoice_date||'').localeCompare(String(a.purchase_invoices?.invoice_date||'')));const latest=rows[0],previous=rows[1];const change=previous?.unit_cost?((Number(latest.unit_cost)-Number(previous.unit_cost))/Number(previous.unit_cost))*100:null;const cheapest=rows.reduce((m,r)=>!m||Number(r.unit_cost)<Number(m.unit_cost)?r:m,null);return{key,name:latest.product_name,latest,previous,change,cheapest,rows}}).sort((a,b)=>a.name.localeCompare(b.name))},[items]);
 const priceAlerts=histories.filter(x=>x.change!==null&&x.change>8);
 const marginRows=latestByProduct.filter(x=>Number(x.sale_price)>0).map(x=>({...x,margin:marginPct(x.sale_price,x.unit_cost),profit:Number(x.sale_price)-Number(x.unit_cost)})).sort((a,b)=>a.margin-b.margin);
 const avgMargin=marginRows.length?marginRows.reduce((a,x)=>a+x.margin,0)/marginRows.length:0;
 function exportCosts(){const rows=[['Producto','Categoría','Proveedor','Fecha','Coste unidad','PVP','Margen %','Código NUMIER'],...latestByProduct.map(x=>[x.product_name,x.category||'',x.purchase_invoices?.purchase_suppliers?.name||'',x.purchase_invoices?.invoice_date||'',Number(x.unit_cost||0).toFixed(4),Number(x.sale_price||0).toFixed(2),marginPct(x.sale_price,x.unit_cost).toFixed(2),x.article_code||''])];downloadFile(`costes_${today()}.csv`,asCSV(rows),'text/csv;charset=utf-8')}
 function statusMeta(inv){return INVOICE_STATUS[inv.status]||[inv.status||'Pendiente','statusPending']}
 if(loading)return <div className="card"><h2>📦 Cargando Costes y Rentabilidad...</h2></div>;
 return <div className="profitabilityModule">
  <div className="card hero profitHero"><div><h2>📦 Costes y Rentabilidad</h2><p>Facturas procesadas automáticamente, artículos clasificados y archivos eliminados a los 4 meses.</p></div><div className="row"><button onClick={()=>loadAll()}>Actualizar</button><button onClick={exportCosts}>Exportar costes</button></div></div>
  {error&&<div className="card errorBox">{error}. Ejecuta el SQL incluido en la RC 3.7.0.</div>}
  <div className="profitTabs">{[['resumen','Resumen'],['facturas','Facturas IA'],['costes','Costes'],['margenes','Márgenes'],['proveedores','Proveedores']].map(([id,label])=><button key={id} className={t===id?'active':''} onClick={()=>setT(id)}>{label}</button>)}</div>
  {t==='resumen'&&<><div className="grid profitKpis"><div className="card kpi"><span>Compras este mes</span><b>{money(monthPurchases)}</b></div><div className="card kpi"><span>Procesando</span><b>{invoices.filter(x=>['queued','processing'].includes(x.status)).length}</b></div><div className="card kpi"><span>Por revisar</span><b>{invoices.filter(x=>x.status==='awaiting_review').length}</b></div><div className="card kpi"><span>Margen medio</span><b className={avgMargin>=60?'ok':avgMargin>=40?'info':'bad'}>{avgMargin.toFixed(1)}%</b></div></div><div className="grid"><div className="card"><h2>⚠️ Subidas de precio</h2>{priceAlerts.length?priceAlerts.slice(0,10).map(x=><div className="profitAlert" key={x.key}><div><b>{x.name}</b><small>{x.latest.purchase_invoices?.purchase_suppliers?.name||'Proveedor'} · {x.latest.purchase_invoices?.invoice_date}</small></div><strong>+{x.change.toFixed(1)}%</strong></div>):<p className="positiveText">No se detectan subidas superiores al 8%.</p>}</div><div className="card"><h2>🗄️ Conservación de archivos</h2><p className="infoText">Las fotos y PDF se conservan durante <b>4 meses</b>. Después se elimina solo el archivo; proveedor, líneas, costes e histórico permanecen.</p><p className="mutedText">Antes de que venza el plazo puedes descargar las facturas y agruparlas en un ZIP para la gestoría.</p></div></div></>}
  {t==='facturas'&&<div className="profitInvoices"><div className="card"><h2>Subir factura para procesamiento IA</h2><div className="formGrid"><label>Proveedor conocido (opcional)<select value={invForm.supplier_id} onChange={e=>setInvForm({...invForm,supplier_id:e.target.value})}><option value="">Detectar automáticamente</option>{suppliers.filter(x=>x.active!==false).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Número (opcional)<input value={invForm.invoice_number} onChange={e=>setInvForm({...invForm,invoice_number:e.target.value})}/></label><label>Fecha<input type="date" value={invForm.invoice_date} onChange={e=>setInvForm({...invForm,invoice_date:e.target.value})}/></label><label className="wideField">Foto o PDF<input type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div><button disabled={busy} onClick={createInvoice}>{busy?'Procesando...':'Guardar y procesar factura'}</button><p className="infoText">El estado se actualiza automáticamente cada 5 segundos. Los datos no afectan a costes hasta que confirmes proveedor y artículos nuevos.</p><hr/><div className="row"><input placeholder="Crear proveedor manualmente" value={newSupplier} onChange={e=>setNewSupplier(e.target.value)}/><button onClick={()=>createSupplier()}>Crear proveedor</button></div></div><div className="card"><h2>Cola de facturas</h2><div className="invoiceList">{invoices.map(inv=>{const [label,cls]=statusMeta(inv);return <button key={inv.id} className={selectedId===inv.id?'selected':''} onClick={()=>setSelectedId(inv.id)}><span><b>{inv.purchase_suppliers?.name||inv.detected_supplier_name||'Detectando proveedor...'}</b><small>{inv.invoice_date} · {inv.invoice_number||'Sin número'}</small><small>{inv.processing_step||''}</small></span><strong>{money(inv.total)}</strong><em className={cls}>{label}</em>{['queued','processing'].includes(inv.status)&&<i className="invoiceProgress"><u style={{width:`${Number(inv.processing_progress||0)}%`}}></u></i>}</button>})}</div></div>{selected&&<div className="card wide"><div className="row between"><div><h2>Detalle de factura</h2><p>{selected.purchase_suppliers?.name||selected.detected_supplier_name||'Proveedor pendiente'} · {selected.invoice_date} · {money(selected.total)}</p><p className="mutedText">Archivo disponible hasta: {selected.retention_delete_at?new Date(selected.retention_delete_at).toLocaleDateString('es-ES'):'4 meses desde la carga'}</p></div><div className="row">{selected.file_path&&<button onClick={()=>openFile(selected)}>Ver archivo</button>}{selected.status==='failed'&&<button disabled={busy} onClick={()=>processInvoice(selected.id)}>Reintentar IA</button>}{selected.status==='awaiting_review'&&<button onClick={()=>markReviewed(selected)}>Finalizar revisión</button>}</div></div>{['queued','processing'].includes(selected.status)&&<div className="processingPanel"><b>🤖 {selected.processing_step||'Procesando factura'}</b><div className="progress"><i style={{width:`${Number(selected.processing_progress||0)}%`}}></i></div><span>{Number(selected.processing_progress||0)}%</span></div>}{selected.status==='failed'&&<div className="criticalText">Error: {selected.processing_error||'No se pudo procesar la factura.'}</div>}{!selected.supplier_id&&selected.detected_supplier_name&&<div className="reviewNotice"><div><b>Proveedor nuevo detectado</b><span>{selected.detected_supplier_name}</span></div><button onClick={()=>approveDetectedSupplier(selected)}>Crear y vincular proveedor</button></div>}<h3>Artículos detectados</h3><div className="invoiceReviewItems">{selectedLines.map(x=><div className={'reviewItem '+(x.review_status==='confirmed'?'confirmed':'pending')} key={x.id}><div><b>{x.product_name}</b><small>{x.quantity} × {x.pack_units} {x.unit} · Neto {money(x.net_total)} · Coste/ud {money(x.unit_cost)}</small></div><select value={x.category||''} onChange={e=>updateExtractedLine(x.id,{category:e.target.value,review_status:'confirmed'})}><option value="">Clasificar...</option>{PURCHASE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><input placeholder="Subcategoría" value={x.sub_category||''} onChange={e=>updateExtractedLine(x.id,{sub_category:e.target.value})}/><button className={x.review_status==='confirmed'?'':'blue'} onClick={()=>updateExtractedLine(x.id,{review_status:x.review_status==='confirmed'?'pending':'confirmed'})}>{x.review_status==='confirmed'?'✓ Confirmado':'Confirmar'}</button><button className="red" onClick={()=>removeLine(x.id)}>×</button></div>)}</div><details><summary>Añadir línea manual</summary><div className="formGrid lineForm"><label>Producto<input value={lineForm.product_name} onChange={e=>setLineForm({...lineForm,product_name:e.target.value})}/></label><label>Categoría<select value={lineForm.category} onChange={e=>setLineForm({...lineForm,category:e.target.value})}>{PURCHASE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Subcategoría<input value={lineForm.sub_category} onChange={e=>setLineForm({...lineForm,sub_category:e.target.value})}/></label><label>Bultos<input type="number" step="0.001" value={lineForm.quantity} onChange={e=>setLineForm({...lineForm,quantity:e.target.value})}/></label><label>Unidades/bulto<input type="number" step="0.001" value={lineForm.pack_units} onChange={e=>setLineForm({...lineForm,pack_units:e.target.value})}/></label><label>Unidad<input value={lineForm.unit} onChange={e=>setLineForm({...lineForm,unit:e.target.value})}/></label><label>Neto línea<input type="number" step="0.01" value={lineForm.net_total} onChange={e=>setLineForm({...lineForm,net_total:e.target.value})}/></label><label>IVA %<input type="number" step="0.01" value={lineForm.tax_rate} onChange={e=>setLineForm({...lineForm,tax_rate:e.target.value})}/></label><label>PVP<input type="number" step="0.01" value={lineForm.sale_price} onChange={e=>setLineForm({...lineForm,sale_price:e.target.value})}/></label></div><button onClick={addLine}>Añadir artículo</button></details></div>}</div>}
  {t==='costes'&&<div className="card"><div className="row between"><div><h2>Histórico de costes</h2><p>Último precio, variación y proveedor más económico.</p></div><button onClick={exportCosts}>Exportar CSV</button></div><table><thead><tr><th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Coste</th><th>Variación</th><th>Mejor histórico</th></tr></thead><tbody>{histories.map(x=><tr key={x.key}><td><b>{x.name}</b></td><td>{x.latest.category||'-'}</td><td>{x.latest.purchase_invoices?.purchase_suppliers?.name||'-'}</td><td>{money(x.latest.unit_cost)}</td><td className={x.change>5?'bad':x.change<0?'ok':''}>{x.change===null?'-':`${x.change>=0?'+':''}${x.change.toFixed(1)}%`}</td><td>{money(x.cheapest?.unit_cost)}</td></tr>)}</tbody></table></div>}
  {t==='margenes'&&<div className="card"><h2>Márgenes por artículo</h2><table><thead><tr><th>Producto</th><th>Categoría</th><th>Coste</th><th>PVP</th><th>Beneficio</th><th>Margen</th><th>Estado</th></tr></thead><tbody>{marginRows.map(x=><tr key={x.id}><td><b>{x.product_name}</b></td><td>{x.category||'-'}</td><td>{money(x.unit_cost)}</td><td>{money(x.sale_price)}</td><td>{money(x.profit)}</td><td>{x.margin.toFixed(1)}%</td><td className={x.margin>=60?'ok':x.margin>=40?'info':'bad'}>{x.margin>=60?'Rentable':x.margin>=40?'Revisar':'Crítico'}</td></tr>)}</tbody></table>{!marginRows.length&&<p>Añade el PVP a los artículos para calcular los márgenes.</p>}</div>}
  {t==='proveedores'&&<div className="grid"><div className="card"><h2>Proveedores</h2><div className="row"><input placeholder="Nombre del proveedor" value={newSupplier} onChange={e=>setNewSupplier(e.target.value)}/><button onClick={()=>createSupplier()}>Añadir</button></div>{suppliers.map(s=><div className="employee" key={s.id}><b>{s.name}</b><span>{invoices.filter(i=>i.supplier_id===s.id).length} facturas</span><span>{money(invoices.filter(i=>i.supplier_id===s.id).reduce((a,i)=>a+Number(i.total||0),0))}</span></div>)}</div><div className="card"><h2>Comparador de compra</h2>{histories.slice(0,30).map(x=><div className="supplierCompare" key={x.key}><b>{x.name}</b><span>Mejor histórico: {money(x.cheapest?.unit_cost)} · {x.cheapest?.purchase_invoices?.purchase_suppliers?.name||'-'}</span></div>)}</div></div>}
 </div>
}

function Settings(){const[settings,setSettings]=useState(null);useEffect(()=>{supabase?.from('settings').select('*').single().then(({data})=>setSettings(data))},[]);async function save(){const{error}=await supabase.from('settings').upsert(settings);if(error)alert(error.message);else alert('Guardado')}if(!settings)return <div className="card">Cargando...</div>;return <div className="card"><h2>Configuración</h2><label>Latitud<input value={settings.bar_lat} onChange={e=>setSettings({...settings,bar_lat:e.target.value})}/></label><label>Longitud<input value={settings.bar_lng} onChange={e=>setSettings({...settings,bar_lng:e.target.value})}/></label><label>Radio metros<input value={settings.gps_radius_m} onChange={e=>setSettings({...settings,gps_radius_m:e.target.value})}/></label><button onClick={save}>Guardar</button><div className="qrprint"><h3>QR físico del bar</h3><p>Imprime este código y colócalo en zona de personal.</p><img src="/qr_bar_colibri.png"/></div></div>}


class ModuleErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('Error módulo',this.props.name,error,info)}
 render(){if(this.state.error)return <div className="card"><h2>⚠️ Error en {this.props.name}</h2><p>El módulo ha fallado, pero el ERP sigue operativo.</p><pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error?.message||this.state.error)}</pre><button onClick={()=>{localStorage.removeItem('colibriSchedule');localStorage.removeItem('colibriScheduleEmployees');this.setState({error:null});location.reload()}}>Reiniciar datos locales del cuadrante</button></div>;return this.props.children}
}

function App(){const host=location.hostname;const onlyClock=host.startsWith('fichar.')||location.pathname.includes('fichar');const [authed,setAuthed]=useState(false);return <>{onlyClock?<ClockPage/>:<>{!authed?<Login onOk={()=>setAuthed(true)}/>:<Manager/>}</>}</>}
function Login({onOk}){const[pin,setPin]=useState('');return <main className="login"><Brand/><div className="card narrow"><h2>Acceso Manager</h2><input placeholder="Clave gerente" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={()=>pin===ADMIN_PIN?onOk():alert('Clave incorrecta')}>Entrar</button><a href="/fichar" className="muted">Ir a fichaje empleados</a></div></main>}
function Brand(){return <div className="brand"><div className="brandMark"><img src="/colibri-brand.png" onError={e=>e.currentTarget.style.display='none'}/></div><div><h1>Colibrí <span>ERP</span></h1><p>Brasería El Colibrí</p></div></div>}
function Manager(){
 const initial=history.state?.colibriRoute||{tab:'dashboard',section:null,payload:null};
 const[route,setRoute]=useState(initial);
 const tabs=[['dashboard','⌂','Dashboard'],['servicio','◉','Servicio'],['inteligencia','✦','Inteligencia'],['tpv','▣','TPV'],['gestoria','▤','Gestoría'],['rentabilidad','€','Rentabilidad'],['empleados','♟','Empleados'],['fichajes','◷','Fichajes'],['cuadrantes','▦','Cuadrantes'],['comparador','⇄','Comparador'],['config','⚙','Configuración']];
 useEffect(()=>{const onPop=e=>setRoute(e.state?.colibriRoute||{tab:'dashboard',section:null,payload:null});addEventListener('popstate',onPop);return()=>removeEventListener('popstate',onPop)},[]);
 function navigate(tab,section=null,payload=null,{replace=false}={}){const next={tab,section,payload};setRoute(next);const fn=replace?'replaceState':'pushState';history[fn]({...(history.state||{}),colibriRoute:next},'',location.href);requestAnimationFrame(()=>scrollTo({top:0,behavior:'smooth'}));}
 const tab=route.tab;
 return <div className="erpShell"><aside className="erpSidebar"><Brand/><nav className="sideNav">{tabs.map(([id,icon,label])=><button className={tab===id?'active':''} onClick={()=>navigate(id)} key={id}><span>{icon}</span><b>{label}</b></button>)}</nav><div className="sidebarFooter"><div className="userAvatar">A</div><div><b>Alfonso</b><small>Gerencia</small></div></div></aside><main className="erpMain"><div className="mobileTop"><Brand/></div><section className="page"><ModuleErrorBoundary key={`${tab}-${route.section||''}-${JSON.stringify(route.payload||{})}`} name={tab}>{tab==='dashboard'&&<Dashboard onNavigate={navigate}/>} {tab==='servicio'&&<EstadoServicio initialView={route.section||'plano'} focusAccount={route.payload}/>} {tab==='inteligencia'&&<BusinessIntelligence/>}{tab==='empleados'&&<Employees/>}{tab==='fichajes'&&<ClockPanel/>}{tab==='cuadrantes'&&<Schedule/>}{tab==='comparador'&&<Compare/>}{tab==='tpv'&&<TPV/>}{tab==='gestoria'&&<Gestoria/>}{tab==='rentabilidad'&&<Profitability/>}{tab==='config'&&<Settings/>}</ModuleErrorBoundary></section></main></div>}

function getGreeting(){const h=new Date().getHours();if(h<12)return 'Buenos días';if(h<20)return 'Buenas tardes';return 'Buenas noches'}
function pctDiff(a,b){a=Number(a||0);b=Number(b||0);if(!b)return null;return ((a-b)/b)*100}
function formatPct(v){if(v===null||v===undefined||!isFinite(v))return '-';return `${v>=0?'+':''}${v.toFixed(1)}%`}
function safeHour(d){try{return new Date(d).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}catch{return '-'}}
function buildDashboardTimeline(tickets,clockRows,daily,objective){
 const events=[];
 const sortedTickets=(tickets||[]).slice().sort((a,b)=>new Date(a.hora||a.created_at)-new Date(b.hora||b.created_at));
 const firstTicket=sortedTickets[0];
 const lastTicket=sortedTickets[sortedTickets.length-1];
 if(firstTicket)events.push({time:firstTicket.hora||firstTicket.created_at,icon:'🧾',text:`Primer ticket · ${money(firstTicket.total)}`});
 if(lastTicket&&lastTicket!==firstTicket)events.push({time:lastTicket.hora||lastTicket.created_at,icon:'🧾',text:`Último ticket · ${money(lastTicket.total)}`});
 const maxTicket=sortedTickets.reduce((m,t)=>Number(t.total||0)>Number(m?.total||0)?t:m,null);
 if(maxTicket)events.push({time:maxTicket.hora||maxTicket.created_at,icon:'💎',text:`Ticket más alto · ${money(maxTicket.total)}`});
 let acc=0, passed25=false, passed50=false, passed75=false;
 sortedTickets.forEach(t=>{acc+=Number(t.total||0); if(objective>0&&!passed25&&acc>=objective*.25){passed25=true;events.push({time:t.hora||t.created_at,icon:'🎯',text:'25% del objetivo alcanzado'})} if(objective>0&&!passed50&&acc>=objective*.5){passed50=true;events.push({time:t.hora||t.created_at,icon:'🎯',text:'50% del objetivo alcanzado'})} if(objective>0&&!passed75&&acc>=objective*.75){passed75=true;events.push({time:t.hora||t.created_at,icon:'🎯',text:'75% del objetivo alcanzado'})}});
 (clockRows||[]).slice(0,8).forEach(r=>events.push({time:r.created_at,icon:String(r.type).toLowerCase()==='entrada'?'👤':'🚪',text:`${r.employee_name} ${String(r.type).toLowerCase()==='entrada'?'entra':'sale'}`}));
 return events.sort((a,b)=>new Date(a.time)-new Date(b.time)).slice(0,10);
}
function workingFromClock(rows){const latest=new Map();(rows||[]).forEach(r=>{const k=r.employee_id||r.employee_name;if(!latest.has(k))latest.set(k,r)});return [...latest.values()].filter(r=>String(r.type).toLowerCase()==='entrada')}
function dashboardStatus({summary,open,terrace,salon,barra,totalPending,oldest,occTerrace,occSalon}){
 const alerts=[];
 if(oldest>=90)alerts.push({level:'critical',icon:'🔴',title:'Cuenta demasiado antigua',text:`La cuenta más antigua lleva ${durationShort(oldest)} abierta.`});
 else if(oldest>=60)alerts.push({level:'warning',icon:'🟠',title:'Revisar permanencia',text:`La cuenta más antigua lleva ${durationShort(oldest)} abierta.`});
 if(barra.length>=6)alerts.push({level:'critical',icon:'🔴',title:'Barra muy cargada',text:`Hay ${barra.length} cuentas abiertas en barra.`});
 else if(barra.length>=4)alerts.push({level:'warning',icon:'🟠',title:'Barra con actividad alta',text:`Hay ${barra.length} cuentas abiertas en barra.`});
 if(occTerrace>=85)alerts.push({level:'warning',icon:'🟠',title:'Terraza casi completa',text:`Ocupación estimada del ${occTerrace}%.`});
 if(occSalon>=85)alerts.push({level:'warning',icon:'🟠',title:'Salón casi completo',text:`Ocupación estimada del ${occSalon}%.`});
 if(totalPending>=250)alerts.push({level:'warning',icon:'🟠',title:'Pendiente elevado',text:`Hay ${money(totalPending)} pendientes de cobro.`});
 if(!alerts.length)alerts.push({level:'positive',icon:'🟢',title:'Todo bajo control',text:'No hay incidencias operativas relevantes ahora mismo.'});
 let label='SERVICIO NORMAL',tone='positive',message='Todo bajo control. El servicio está funcionando con normalidad.';
 if(alerts.some(a=>a.level==='critical')){label='ATENCIÓN NECESARIA';tone='critical';message='Hay situaciones que conviene revisar ahora.'}
 else if(alerts.some(a=>a.level==='warning')){label='SERVICIO CON ACTIVIDAD';tone='warning';message='El negocio está activo. Conviene vigilar los avisos destacados.'}
 return {alerts:alerts.slice(0,5),label,tone,message};
}
function colibriIndex({summary,totalPending,oldest,occTotal,alerts}){
 let score=100;
 if(oldest>=120)score-=28;else if(oldest>=90)score-=20;else if(oldest>=60)score-=10;
 if(totalPending>=300)score-=15;else if(totalPending>=150)score-=8;
 if(occTotal>=95)score-=8;
 score-=alerts.filter(a=>a.level==='critical').length*10;
 score-=alerts.filter(a=>a.level==='warning').length*4;
 if(summary.total>0)score+=3;
 return Math.max(0,Math.min(100,Math.round(score)));
}
function dashboardRecommendation({projected,objective,barra,oldest,occTerrace,totalPending,summary}){
 if(oldest>=90)return `Revisa la cuenta más antigua: lleva ${durationShort(oldest)} abierta.`;
 if(barra.length>=6)return `La barra tiene ${barra.length} cuentas abiertas. Conviene reforzar su seguimiento.`;
 if(occTerrace>=85)return `La terraza está al ${occTerrace}%. Prepárate para gestionar rotación y cobros.`;
 if(totalPending>=200)return `Hay ${money(totalPending)} pendientes. Conviene revisar las cuentas antes del siguiente pico.`;
 if(projected>summary.total&&objective>0)return `Con el ritmo actual, la previsión de cierre es de ${money(projected)}.`;
 return 'Servicio estable. Mantén el ritmo actual y vigila nuevas aperturas.';
}
function Dashboard({onNavigate}){
 const[date,setDate]=useState(today());
 const[state,setState]=useState({tickets:[],lines:[],articles:new Map(),clock:[],sync:null,syncStatus:null,prev:null,avgSameDay:null,goal:null,service:{open:[],audit:[]},loading:true,error:null});
 useEffect(()=>{load();const t=setInterval(load,15000);return()=>clearInterval(t)},[date]);
 async function load(){
  if(!supabase){setState(s=>({...s,error:'Supabase no configurado',loading:false}));return}
  try{
   const start=date+'T00:00:00';const end=addDays(date,1)+'T00:00:00';
   const prevDate=addDays(date,-7);
   const sameDays=[addDays(date,-7),addDays(date,-14),addDays(date,-21),addDays(date,-28)];
   const [rangeData,clockRes,syncStatus,prevData,serviceData,...avgData]=await Promise.all([
    loadSalesRange(date,addDays(date,1)),
    supabase.from('clock_records').select('*').gte('created_at',start).lt('created_at',end).order('created_at',{ascending:false}).limit(500),
    loadSyncStatus(),
    loadSalesForDate(prevDate),
    date===today()?loadServiceState():Promise.resolve({open:[],audit:[],status:null}),
    ...sameDays.map(d=>loadSalesForDate(d))
   ]);
   const summary=summarizeTickets(rangeData.tickets||[]);
   const smart=await loadSmartGoal(date,summary.total);
   const avgTotals=avgData.map(x=>Number(x?.daily?.total||0)).filter(v=>v>0);
   const avgSameDay=avgTotals.length?avgTotals.reduce((a,b)=>a+b,0)/avgTotals.length:0;
   setState({tickets:rangeData.tickets||[],lines:rangeData.lines||[],articles:rangeData.articles||new Map(),clock:clockRes.data||[],sync:rangeData.sync||null,syncStatus,prev:prevData.daily||null,avgSameDay,goal:smart,service:serviceData||{open:[],audit:[]},loading:false,error:null});
  }catch(e){setState(s=>({...s,loading:false,error:e.message||String(e)}))}
 }
 const summary=summarizeTickets(state.tickets);
 const working=workingFromClock(state.clock);
 const objective=Number(state.goal?.goal||750);
 const projected=Number(state.goal?.projected||summary.total);
 const vsPrev=pctDiff(summary.total,state.prev?.total);
 const open=state.service?.open||[];
 const terrace=open.filter(o=>o.zona==='terraza');
 const salon=open.filter(o=>o.zona==='salon');
 const barra=open.filter(o=>o.zona==='barra');
 const totalPending=open.reduce((a,o)=>a+Number(o.total||0),0);
 const oldest=open.length?Math.max(...open.map(o=>minutesOpen(o.opened_at))):0;
 const occTerrace=Math.round((terrace.length/15)*100);
 const occSalon=Math.round((salon.length/8)*100);
 const occTotal=Math.round(((terrace.length+salon.length)/23)*100);
 const business=dashboardStatus({summary,open,terrace,salon,barra,totalPending,oldest,occTerrace,occSalon});
 const index=colibriIndex({summary,totalPending,oldest,occTotal,alerts:business.alerts});
 const recommendation=dashboardRecommendation({projected,objective,barra,oldest,occTerrace,totalPending,summary});
 const recentOpen=open.slice().sort((a,b)=>new Date(b.opened_at)-new Date(a.opened_at)).slice(0,5);
 const latestTickets=(state.tickets||[]).slice().sort((a,b)=>new Date(b.hora||b.created_at)-new Date(a.hora||a.created_at)).slice(0,5);
 const activity=[...recentOpen.map((o,i)=>({time:o.opened_at,icon:'●',text:`${accountLabel(o,i)} abierta`,amount:money(o.total),target:{tab:'servicio',section:o.zona==='barra'?'barra':'lista',payload:{cab_id:o.cab_id,mesa_numero:o.mesa_numero}}})),...latestTickets.map(t=>({time:t.hora||t.created_at,icon:'✓',text:`Ticket ${t.numdoc||t.cab_id||''} cobrado`,amount:money(t.total),target:{tab:'tpv'}}))].sort((a,b)=>new Date(b.time)-new Date(a.time)).slice(0,6);
 const go=(tab,section=null,payload=null)=>onNavigate?.(tab,section,payload);
 const keyGo=(e,tab,section=null,payload=null)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go(tab,section,payload)}};
 const indexLabel=index>=90?'Excelente':index>=75?'Bien':index>=55?'Vigilancia':'Atención';
 return <div className="executiveDashboard">
  <div className={'executiveHero '+business.tone}>
   <div><span className="pill">Colibrí ERP PRO · Dashboard Ejecutivo</span><h1>{getGreeting()}, Alfonso</h1><p>{fmtDate(date)} · Resumen del negocio de un vistazo</p></div>
   <div className="businessStatus"><b>{business.tone==='critical'?'🔴':business.tone==='warning'?'🟠':'🟢'} {business.label}</b><span>{business.message}</span><small>Actualizado {secondsAgo(state.service?.status?.updated_at||state.syncStatus?.updated_at||state.sync?.synced_at)}</small></div>
  </div>
  {state.error&&<div className="card error">{state.error}</div>}
  <div className="executiveKpis">
   <div className="execKpi sales dashboardLink" role="button" tabIndex="0" onClick={()=>go('tpv')} onKeyDown={e=>keyGo(e,'tpv')}><span>Ventas hoy</span><b>{money(summary.total)}</b><em>{formatPct(vsPrev)} vs sábado/semana anterior</em><small>Ver TPV →</small></div>
   <div className="execKpi pending dashboardLink" role="button" tabIndex="0" onClick={()=>go('servicio','lista')} onKeyDown={e=>keyGo(e,'servicio','lista')}><span>Pendiente de cobro</span><b>{money(totalPending)}</b><em>{open.length} cuentas abiertas</em><small>Ver cuentas →</small></div>
   <div className="execKpi accounts dashboardLink" role="button" tabIndex="0" onClick={()=>go('servicio','lista')} onKeyDown={e=>keyGo(e,'servicio','lista')}><span>Cuentas activas</span><b>{open.length}</b><em>{terrace.length} terraza · {salon.length} salón · {barra.length} barra</em><small>Ver listado →</small></div>
   <div className="execKpi occupancy dashboardLink" role="button" tabIndex="0" onClick={()=>go('servicio','plano')} onKeyDown={e=>keyGo(e,'servicio','plano')}><span>Ocupación mesas</span><b>{occTotal}%</b><em>Terraza {occTerrace}% · Salón {occSalon}%</em><small>Ver plano →</small></div>
  </div>
  <div className="executiveColumns">
   <div className="card attentionCenter dashboardLink" role="button" tabIndex="0" onClick={()=>go('servicio','lista')} onKeyDown={e=>keyGo(e,'servicio','lista')}><div className="row between"><h2>⚠ Centro de atención</h2><span className="attentionCount">{business.alerts.filter(a=>a.level!=='positive').length}</span></div>{business.alerts.map((a,i)=><div className={'attentionItem '+a.level} key={i}><span>{a.icon}</span><div><b>{a.title}</b><p>{a.text}</p></div></div>)}</div>
   <div className="card colibriScore dashboardLink" role="button" tabIndex="0" onClick={()=>go('inteligencia')} onKeyDown={e=>keyGo(e,'inteligencia')}><h2>Índice Colibrí</h2><div className={'scoreCircle '+(index>=90?'excellent':index>=75?'good':index>=55?'watch':'risk')}><b>{index}</b><span>/100</span></div><h3>{indexLabel}</h3><p>Resume ventas, ocupación, antigüedad de cuentas y alertas operativas.</p></div>
   <div className="card aiExecutive dashboardLink" role="button" tabIndex="0" onClick={()=>go('inteligencia')} onKeyDown={e=>keyGo(e,'inteligencia')}><h2>💡 Recomendación</h2><p>{recommendation}</p><div className="forecastLine"><span>Previsión de cierre</span><b>{money(projected)}</b></div><div className="forecastLine"><span>Objetivo inteligente</span><b>{money(objective)}</b></div></div>
  </div>
  <div className="executiveColumns lower">
   <div className="card zoneSnapshot dashboardLink" role="button" tabIndex="0" onClick={()=>go('servicio','plano')} onKeyDown={e=>keyGo(e,'servicio','plano')}><h2>Estado por zonas</h2><div className="zoneRow"><span>Terraza</span><b>{terrace.length}/15</b><em>{occTerrace}%</em></div><OccupancyBar value={occTerrace}/><div className="zoneRow"><span>Salón</span><b>{salon.length}/8</b><em>{occSalon}%</em></div><OccupancyBar value={occSalon}/><div className="zoneRow"><span>Barra</span><b>{barra.length} cuentas</b><em>{money(barra.reduce((a,o)=>a+Number(o.total||0),0))}</em></div></div>
   <div className="card daySummary"><h2>Resumen del día</h2><div className="summaryTiles"><div className="dashboardLink" role="button" tabIndex="0" onClick={()=>go('tpv')}><span>Tickets</span><b>{summary.tickets}</b></div><div className="dashboardLink" role="button" tabIndex="0" onClick={()=>go('tpv')}><span>Ticket medio</span><b>{money(summary.ticket_medio)}</b></div><div className="dashboardLink" role="button" tabIndex="0" onClick={()=>go('fichajes')}><span>Personal ahora</span><b>{working.length}</b></div><div className="dashboardLink" role="button" tabIndex="0" onClick={()=>go('servicio','lista')}><span>Cuenta más antigua</span><b>{durationShort(oldest)}</b></div></div></div>
   <div className="card activityExecutive"><h2>Actividad reciente</h2>{activity.length?activity.map((e,i)=><button type="button" className="activityExecutiveRow dashboardActivityLink" key={i} onClick={()=>go(e.target.tab,e.target.section,e.target.payload)}><span>{safeHour(e.time)}</span><b>{e.icon} {e.text}</b><em>{e.amount}</em><i>›</i></button>):<p>No hay actividad reciente.</p>}</div>
  </div>
  <nav className="dashboardQuickActions" aria-label="Acciones rápidas"><button onClick={()=>go('servicio','plano')}><span>▦</span>Plano</button><button onClick={()=>go('servicio','barra')}><span>▰</span>Barra</button><button onClick={()=>go('tpv')}><span>€</span>TPV</button><button onClick={()=>go('cuadrantes')}><span>▦</span>Cuadrantes</button><button onClick={()=>go('inteligencia')}><span>✦</span>IA</button></nav>
 </div>}

function Employees(){const[employees,setEmployees]=useState([]);const[name,setName]=useState('');const[pin,setPin]=useState('');useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data}=await supabase.from('employees').select('*').order('name');setEmployees(data||[])}async function add(){if(!name||!pin)return alert('Nombre y PIN');const color=EMP_COLORS[employees.length%EMP_COLORS.length];const{error}=await supabase.from('employees').insert({name,pin,role:'empleado',color,can_clock:true,active:true});if(error)alert(error.message);setName('');setPin('');load()}async function update(e,patch){const{error}=await supabase.from('employees').update(patch).eq('id',e.id);if(error)alert(error.message);load()}return <div className="card"><h2>Empleados</h2><div className="row"><input placeholder="Nuevo empleado" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={add}>Añadir</button></div>{employees.map(e=><div className="employee" key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><span>{e.active?'Activo':'Inactivo'}</span><input placeholder="Nuevo PIN" onBlur={ev=>ev.target.value&&update(e,{pin:ev.target.value})}/><button onClick={()=>update(e,{active:!e.active})}>{e.active?'Desactivar':'Activar'}</button></div>)}</div>}
function ClockPage(){const[employees,setEmployees]=useState([]);const[emp,setEmp]=useState('');const[pin,setPin]=useState('');const[note,setNote]=useState('');const[msg,setMsg]=useState('');const[qr,setQr]=useState(false);useEffect(()=>{load()},[]);async function load(){if(!supabase){setMsg('Supabase no configurado');return}const{data}=await supabase.from('employees').select('name').eq('active',true).eq('can_clock',true).order('name');setEmployees(data||[])}async function clock(type,method='gps'){if(!supabase)return setMsg('Supabase no configurado');setMsg('Comprobando...');let coords=null;if(method==='gps'){try{coords=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));}catch(e){setQr(true);return setMsg('GPS no disponible. Usa el QR del bar.')}}const payload={p_employee_name:emp,p_pin:pin,p_type:type,p_note:note,p_gps_lat:coords?.coords?.latitude||null,p_gps_lng:coords?.coords?.longitude||null,p_accuracy:coords?.coords?.accuracy||null,p_method:method};const{data,error}=await supabase.rpc('registrar_fichaje_v2',payload);if(error)return setMsg('❌ '+error.message);setMsg((data?.ok?'✅ ':'❌ ')+(data?.message||'Respuesta recibida')+(data?.distance_m?` · Distancia ${Math.round(data.distance_m)} m`:''));if(!data?.ok&&data?.outside_radius)setQr(true)}return <main className="login"><Brand/><div className="card narrow"><h2>Fichaje empleados</h2><select value={emp} onChange={e=>setEmp(e.target.value)}><option value="">Empleado</option>{employees.map(e=><option key={e.name}>{e.name}</option>)}</select><input placeholder="PIN" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><textarea placeholder="Observaciones" value={note} onChange={e=>setNote(e.target.value)}/><div className="row"><button onClick={()=>clock('entrada')}>Entrada GPS</button><button className="red" onClick={()=>clock('salida')}>Salida GPS</button></div>{qr&&<div className="qrbox"><p>Escanea/usa QR físico del bar como respaldo.</p><button onClick={()=>clock('entrada','qr')}>Entrada QR</button><button className="red" onClick={()=>clock('salida','qr')}>Salida QR</button></div>}<p className="msg">{msg}</p></div></main>}
function ClockPanel(){const[rows,setRows]=useState([]);const[open,setOpen]=useState([]);useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data,error}=await supabase.from('clock_records').select('*').order('created_at',{ascending:false}).limit(500);if(error){alert(error.message);return}const list=data||[];setRows(list);const latest=new Map();list.forEach(r=>{if(!latest.has(r.employee_id||r.employee_name))latest.set(r.employee_id||r.employee_name,r)});setOpen([...latest.values()].filter(r=>r.type==='entrada'))}async function closeManual(r){const now=new Date();const suggested=now.toISOString().slice(0,16);const value=prompt(`Hora de salida real para ${r.employee_name} (formato YYYY-MM-DDTHH:mm)`,suggested);if(!value)return;const reason=prompt('Motivo del cierre manual','Olvido de fichaje')||'Cierre manual por manager';const exitIso=new Date(value).toISOString();const {error}=await supabase.from('clock_records').insert({employee_id:r.employee_id,employee_name:r.employee_name,type:'salida',method:'manual',inside_radius:true,note:`SALIDA MANUAL POR MANAGER · ${reason}`,created_at:exitIso});if(error){alert(error.message);return}alert('Turno cerrado manualmente');load()}const expected=expectedStartMapToday();const entradaRows=rows.filter(r=>String(r.type).toLowerCase()==='entrada');const late5=entradaRows.filter(r=>punctualityFor(r,expected).cls==='late5').length;const late10=entradaRows.filter(r=>punctualityFor(r,expected).cls==='late10').length;return <div className="grid"><div className="card"><h2>Fichajes abiertos</h2><button onClick={load}>Actualizar</button>{open.length===0&&<p>✅ No hay turnos abiertos.</p>}{open.map(r=><div className="employee" key={r.id}><b>{r.employee_name}</b><span>Entrada: {new Date(r.created_at).toLocaleString()}</span><span>{Math.max(0,((Date.now()-new Date(r.created_at))/3600000)).toFixed(1)} h abierto</span><button className="red" onClick={()=>closeManual(r)}>Cerrar turno</button></div>)}</div><div className="card"><h2>Puntualidad</h2><p>🟢 Puntual · 🟡 +5 min · ⚠️ +10 min · 🔴 Salida</p><p>Entradas amarillas: <b>{late5}</b></p><p>Alertas +10 min: <b>{late10}</b></p><p className="mutedText">La puntualidad se compara con el cuadrante semanal guardado en este navegador.</p></div><div className="card wide"><h2>Historial de fichajes</h2><table><tbody>{rows.slice(0,160).map(r=>{const p=punctualityFor(r,expected);return <tr key={r.id} className={'clockRow '+p.cls}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.employee_name}</td><td>{p.icon} {p.label}</td><td>{r.type}</td><td>{r.method}</td><td>{r.note||''}</td><td>{r.distance_m?Math.round(r.distance_m)+' m':''}</td></tr>})}</tbody></table></div></div>}

function TPV(){const[date,setDate]=useState(today());const[data,setData]=useState({daily:null,tickets:[],sync:null,error:null});const[selected,setSelected]=useState(null);const[query,setQuery]=useState('');const[loading,setLoading]=useState(false);useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[date]);async function load(){setLoading(true);const d=await loadSalesForDate(date);setData(d);setLoading(false)}const tickets=data.tickets||[];const filtered=tickets.filter(t=>!query||String(t.numdoc||'').includes(query)||String(t.cab_id||'').includes(query)||String(t.total||'').replace('.',',').includes(query));return <div><div className="card hero"><div><h2>NUMIER LIVE</h2><p>Ventas, tickets y formas de pago desde Colibrí Engine.</p></div><div className="row controls"><button onClick={()=>setDate(today())}>Hoy</button><button onClick={()=>setDate(addDays(today(),-1))}>Ayer</button><button onClick={()=>setDate(addDays(date,-1))}>◀ Día</button><button onClick={()=>setDate(addDays(date,1))}>Día ▶</button><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div><SyncStatusCard/><SalesCards daily={data.daily} sync={data.sync}/><div className="grid"><div className="card"><h2>Ventas por hora</h2><SalesByHour tickets={tickets}/></div><div className="card"><div className="row between"><h2>Últimos tickets</h2><input placeholder="Buscar nº, CAB_ID o importe" value={query} onChange={e=>setQuery(e.target.value)}/></div><table><thead><tr><th>Hora</th><th>Ticket</th><th>Pago</th><th>Total</th></tr></thead><tbody>{filtered.slice(-40).reverse().map(t=><tr className="clickable" key={t.id||t.cab_id} onClick={()=>setSelected(t.cab_id)}><td>{t.hora?new Date(t.hora).toLocaleTimeString('es-ES'):''}</td><td>{t.numdoc||t.cab_id}</td><td>{t.forma_pago||''}</td><td>{money(t.total)}</td></tr>)}</tbody></table></div><div className="card"><h2>Resumen</h2><p>Fecha: <b>{fmtDate(date)}</b></p><p>Tickets cargados: <b>{tickets.length}</b></p><p>Última sincronización: <b>{data.sync?.synced_at?new Date(data.sync.synced_at).toLocaleString('es-ES'):'-'}</b></p>{data.error&&<p className="error">{data.error}</p>}</div></div><TicketModal cabId={selected} onClose={()=>setSelected(null)}/></div>}
function Gestoria(){
 const yNow=new Date().getFullYear();
 const[year,setYear]=useState(yNow);const[type,setType]=useState('trimestre');const[period,setPeriod]=useState(1);
 const[data,setData]=useState({tickets:[],lines:[],sync:null,articles:new Map()});const[loading,setLoading]=useState(false);const[progress,setProgress]=useState('');
 const range=type==='trimestre'?quarterRange(Number(year),Number(period)):monthRange(Number(year),Number(period));
 useEffect(()=>{load()},[year,type,period]);
 async function load(){
  try{setLoading(true);setProgress('Preparando gestoría...');setData(await loadSalesRangeGestoria(range.from,range.to,setProgress));}
  catch(e){alert('Error cargando gestoría: '+(e.message||String(e)));}
  finally{setLoading(false);}
 }
 const sum=summarizeTickets(data.tickets);const iva=ivaSummary(data.lines);const fiscalRows=ticketFiscalRows(data.tickets,data.lines);
 const exportResumen=()=>{const rows=[['Informe gestoría',range.label],['Rango',range.from,range.to],['Tickets incluidos',fiscalRows.length],[],['Concepto','Importe'],['Ventas totales',sum.total.toFixed(2)],['Tickets',sum.tickets],['Ticket medio',sum.ticket_medio.toFixed(2)],['Efectivo',sum.efectivo.toFixed(2)],['Tarjeta',sum.tarjeta.toFixed(2)],['Cheque/Otros',sum.cheque.toFixed(2)],[],['IVA','Base imponible','Cuota IVA','Total'],...iva.map(r=>[r.iva+'%',r.base.toFixed(2),r.cuota.toFixed(2),r.total.toFixed(2)])];downloadFile(`Gestoria_RESUMEN_${range.label.replaceAll(' ','_')}.csv`,asCSV(rows),'text/csv;charset=utf-8')};
 const exportTickets=()=>{const rows=[['Nº ticket','CAB_ID','Fecha','Hora','Forma pago','Mesa','Estado','Base 0%','IVA 0%','Total 0%','Base 10%','IVA 10%','Total 10%','Base 21%','IVA 21%','Total 21%','Base otros','IVA otros','Total otros','Base total','IVA total','Total ticket','Efectivo','Tarjeta','Cheque/Otros'],...fiscalRows.map(r=>[r.numdoc,r.cab_id,r.fecha,r.hora,r.forma,r.mesa,r.estado,r.base0.toFixed(2),r.iva0.toFixed(2),r.total0.toFixed(2),r.base10.toFixed(2),r.iva10.toFixed(2),r.total10.toFixed(2),r.base21.toFixed(2),r.iva21.toFixed(2),r.total21.toFixed(2),r.baseOtros.toFixed(2),r.ivaOtros.toFixed(2),r.totalOtros.toFixed(2),r.baseTotal.toFixed(2),r.ivaTotal.toFixed(2),r.total.toFixed(2),r.efectivo.toFixed(2),r.tarjeta.toFixed(2),r.otros.toFixed(2)])];downloadFile(`Gestoria_TICKETS_${range.label.replaceAll(' ','_')}.csv`,asCSV(rows),'text/csv;charset=utf-8')};
 return <div><div className="card hero"><div><h2>📁 Gestoría contable PRO</h2><p>Informe fiscal completo sin límite de 1000 tickets. Incluye listado de tickets con IVA y forma de pago.</p></div><div className="row controls"><select value={type} onChange={e=>{setType(e.target.value);setPeriod(1)}}><option value="trimestre">Trimestre</option><option value="mes">Mes</option></select><input type="number" value={year} onChange={e=>setYear(e.target.value)}/>{type==='trimestre'?<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="1">1T</option><option value="2">2T</option><option value="3">3T</option><option value="4">4T</option></select>:<select value={period} onChange={e=>setPeriod(e.target.value)}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{String(i+1).padStart(2,'0')}</option>)}</select>}<button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div>{loading&&<div className="card"><h2>Procesando informe...</h2><p>{progress}</p></div>}<SalesCards daily={sum} sync={data.sync}/><div className="grid"><div className="card"><h2>Resumen fiscal · {range.label}</h2><table><tbody><tr><td>Ventas totales</td><td>{money(sum.total)}</td></tr><tr><td>Tickets reales incluidos</td><td>{sum.tickets}</td></tr><tr><td>Ticket medio</td><td>{money(sum.ticket_medio)}</td></tr><tr><td>Efectivo</td><td>{money(sum.efectivo)}</td></tr><tr><td>Tarjeta</td><td>{money(sum.tarjeta)}</td></tr><tr><td>Cheque/Otros</td><td>{money(sum.cheque)}</td></tr></tbody></table><div className="row"><button onClick={exportResumen}>Exportar resumen CSV</button><button onClick={exportTickets}>Exportar listado tickets CSV</button><button onClick={()=>window.print()}>Imprimir / PDF</button></div><p className="mutedText">El listado de tickets se ordena por número de ticket e incluye base imponible, IVA, total y forma de pago.</p></div><div className="card"><h2>Desglose IVA</h2><table><thead><tr><th>IVA</th><th>Base imponible</th><th>Cuota IVA</th><th>Total</th></tr></thead><tbody>{iva.map(r=><tr key={r.iva}><td>{r.iva}%</td><td>{money(r.base)}</td><td>{money(r.cuota)}</td><td>{money(r.total)}</td></tr>)}</tbody></table>{iva.length===0&&<p>No hay líneas de IVA para este periodo.</p>}</div></div><div className="card"><h2>Listado de tickets incluidos</h2><p>{fiscalRows.length.toLocaleString('es-ES')} tickets cargados en este periodo.</p><table><thead><tr><th>Nº ticket</th><th>Fecha</th><th>Hora</th><th>Forma pago</th><th>Base</th><th>IVA</th><th>Total</th></tr></thead><tbody>{fiscalRows.slice(0,200).map(r=><tr key={r.cab_id}><td>{r.numdoc||r.cab_id}</td><td>{r.fecha}</td><td>{r.hora}</td><td>{r.forma}</td><td>{money(r.baseTotal)}</td><td>{money(r.ivaTotal)}</td><td>{money(r.total)}</td></tr>)}</tbody></table>{fiscalRows.length>200&&<p className="mutedText">Mostrando 200 primeros en pantalla. La exportación incluye todos.</p>}</div></div>
}


// ARRANQUE REACT - FIX PANTALLA BLANCA
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}

