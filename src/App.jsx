import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import './styles.css';
import './profitability-rc392.css';
import ProfessionalRecipes from './modules/profitability/ProfessionalRecipes';
import EditableMargins from './modules/profitability/EditableMargins';
import RealBusinessProfitability,{loadRealProfitability} from './modules/profitability/RealBusinessProfitability';
import PeoplePortal from './modules/people/PeoplePortal';
import {buildMarginProducts,includedMarginAverage} from './modules/profitability/profitabilityModel';
import {buildNumierCatalog,mergeResolvedNumierPrice,numierPriceText,resolveLinkSalePrice} from './modules/profitability/numierPricing';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {jsPDF} from 'jspdf';

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
 const endToday=addDays(today(),1);
 if(mode==='hoy') return {from:today(),to:endToday,label:'Hoy'};
 if(mode==='ayer') {const d=addDays(today(),-1);return {from:d,to:addDays(d,1),label:'Ayer'}};
 if(mode==='tresdias') return {from:addDays(today(),-2),to:endToday,label:'Últimos 3 días'};
 if(mode==='semana') return {from:addDays(today(),-6),to:endToday,label:'Últimos 7 días'};
 if(mode==='treinta') return {from:addDays(today(),-29),to:endToday,label:'Últimos 30 días'};
 if(mode==='mes'){const d=new Date();const f=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);return {from:f,to:endToday,label:'Mes actual'}};
 if(mode==='anio'){const d=new Date();const f=new Date(d.getFullYear(),0,1).toISOString().slice(0,10);return {from:f,to:endToday,label:'Año actual'}};
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
function isRealSaleTicket(t){
 const state=String(t?.estado??t?.status??'C').trim().toUpperCase();
 return state!=='X'&&state!=='G'&&state!=='A'&&Number(t?.total||0)>0;
}
function normalizePeriodLines(tickets,rawLines){
 const ticketByCab=new Map((tickets||[]).map(t=>[String(t.cab_id),t]));
 const grouped=new Map();
 (rawLines||[]).forEach(l=>{const k=String(l.cab_id);if(!ticketByCab.has(k))return;if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(l)});
 const clean=[];
 grouped.forEach((rows,k)=>clean.push(...normalizeTicketLines(rows,ticketByCab.get(k)?.total)));
 return clean;
}
async function loadSalesRange(from,to){
 if(!supabase)return {tickets:[],lines:[],sync:null,articles:new Map()};
 const start=from+'T00:00:00'; const end=to+'T00:00:00';
 const [{data:ticketsData},{data:syncData},articles]=await Promise.all([
  supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(10000),
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1),
  loadArticlesMap()
 ]);
 const tickets=(ticketsData||[]).filter(isRealSaleTicket); const cabIds=tickets.map(t=>t.cab_id).filter(Boolean); let rawLines=[];
 for(let i=0;i<cabIds.length;i+=200){const chunk=cabIds.slice(i,i+200);const {data}=await supabase.from('numier_ticket_lines').select('*').in('cab_id',chunk).order('line_key',{ascending:true}).limit(10000);if(data)rawLines=rawLines.concat(data);}
 const lines=normalizePeriodLines(tickets,rawLines);
 return {tickets,lines,sync:syncData?.[0]||null,articles};
}

async function loadProfitabilityCostMap(){
 if(!supabase)return new Map();
 const [mRes,lRes,rRes,riRes,pRes,nRes,tlRes,aRes]=await Promise.all([
  supabase.from('purchase_master_items').select('*').limit(20000),
  supabase.from('purchase_product_numier_links').select('*').limit(20000),
  supabase.from('profitability_recipes').select('*').limit(20000),
  supabase.from('profitability_recipe_ingredients').select('*').limit(30000),
  supabase.from('purchase_invoice_items').select('*,purchase_invoices(id,invoice_number,invoice_date,total,supplier_id,purchase_suppliers(name))').limit(20000),
  supabase.from('numier_articles').select('article_code,article_name,family,category_name,price,iva,active').limit(20000),
  supabase.from('numier_ticket_lines').select('articulo,descripcion,cantidad,precio,importe,cab_id,line_key').gt('precio',0).order('cab_id',{ascending:false}).limit(10000),
  supabase.from('profitability_article_costs').select('*').limit(20000)
 ]);
 const catalog=buildNumierCatalog(nRes.data||[],tlRes.data||[]);
 const rows=buildMarginProducts({links:lRes.data||[],masters:mRes.data||[],recipes:rRes.data||[],ingredients:riRes.data||[],purchaseItems:pRes.data||[],numierCatalog:catalog,articleCosts:aRes.data||[]});
 const map=new Map();
 rows.forEach(row=>{const code=String(row.articleCode||'').trim();if(code&&!map.has(code))map.set(code,{cost:row.cost,sale:row.sale,margin:row.margin,excluded:row.excluded,name:row.articleName||row.productName,source:row.entityType})});
 return map;
}
function lineFinancials(line,costMap){
 const code=String(line.articulo||'').trim();const qty=Math.abs(Number(line.cantidad||0));const revenue=Number(line.importe||0);const info=costMap?.get?.(code);const unitCost=info&&!info.excluded&&info.cost!==null?Number(info.cost):null;const cost=unitCost===null?null:unitCost*qty;const profit=cost===null?null:revenue-cost;return {code,qty,revenue,unitCost,cost,profit,known:cost!==null,info};
}
function periodFinancials(lines,costMap){let revenue=0,cost=0,unknownRevenue=0;for(const line of lines||[]){const f=lineFinancials(line,costMap);revenue+=f.revenue;if(f.known)cost+=f.cost;else unknownRevenue+=f.revenue}return {revenue,cost,profit:revenue-cost,margin:revenue?((revenue-cost)/revenue)*100:0,unknownRevenue};}

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

function normalizeTicketLines(lines,ticketTotal){
 const rows=Array.isArray(lines)?lines:[];
 const target=Math.round(Number(ticketTotal||0)*100);
 const sum=rows.reduce((a,l)=>a+Math.round(Number(l.importe||0)*100),0);
 if(!target||sum<=target+1)return rows;
 // Protección frente a dos instantáneas del mismo ticket guardadas con line_key distinto.
 // Busca un bloque completo cuyo total coincida con la cabecera y conserva el último,
 // que corresponde normalmente a la instantánea definitiva al cerrar el ticket.
 let start=0,current=0,best=null;
 for(let end=0;end<rows.length;end++){
  current+=Math.round(Number(rows[end].importe||0)*100);
  while(start<=end&&current>target+1){current-=Math.round(Number(rows[start].importe||0)*100);start++;}
  if(Math.abs(current-target)<=1)best=[start,end+1];
 }
 return best?rows.slice(best[0],best[1]):rows;
}
async function loadTicketFull(cabId){
 if(!supabase||!cabId)return {ticket:null,lines:[],articles:new Map()};
 const [ticketRes,lineRes,articles]=await Promise.all([
  supabase.from('numier_tickets').select('*').eq('cab_id',cabId).maybeSingle(),
  supabase.from('numier_ticket_lines').select('*').eq('cab_id',cabId).order('line_key',{ascending:true}).limit(500),
  loadArticlesMap()
 ]);
 const ticket=ticketRes.data||null;
 const lines=normalizeTicketLines(lineRes.data||[],ticket?.total);
 return {ticket,lines,articles,error:ticketRes.error?.message||lineRes.error?.message||null};
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
function ProductRanking({lines,articles,costMap,onCostSaved}){
 const[sort,setSort]=useState('qty');const[selected,setSelected]=useState(null);const[costDraft,setCostDraft]=useState('');const[reason,setReason]=useState('');const[saving,setSaving]=useState(false);
 const top=productRank(lines,sort,articles).map(p=>{const info=costMap?.get?.(String(p.code));const unitCost=info&&!info.excluded&&info.cost!==null?Number(info.cost):null;const cost=unitCost===null?null:unitCost*p.qty;const profit=cost===null?null:p.total-cost;const avgSale=p.qty?p.total/p.qty:0;const pvp=Number(info?.sale||0)>0?Number(info.sale):avgSale;return {...p,cost,profit,margin:profit===null||!p.total?null:(profit/p.total)*100,unitCost,pvp,avgSale}});
 function openProduct(p){setSelected(p);setCostDraft(p.unitCost===null?'':String(p.unitCost));setReason('')}
 async function saveCost(){if(!selected?.code)return alert('Este producto no tiene código NUMIER');const value=Number(String(costDraft).replace(',','.'));if(!Number.isFinite(value)||value<0)return alert('Introduce un coste por unidad válido');setSaving(true);const payload={article_code:String(selected.code),manual_unit_cost:value,reason:String(reason||'Coste configurado desde Inteligencia').trim(),updated_by:'Usuario ERP',updated_at:new Date().toISOString(),excluded_from_margin:false};const{error}=await supabase.from('profitability_article_costs').upsert(payload,{onConflict:'article_code'});setSaving(false);if(error)return alert(error.message);const nextCost=value*selected.qty;const nextProfit=selected.total-nextCost;setSelected({...selected,unitCost:value,cost:nextCost,profit:nextProfit,margin:selected.total?(nextProfit/selected.total)*100:0});if(onCostSaved)await onCostSaved();alert('Coste guardado correctamente')}
 return <><div className="card"><div className="row between intelligenceCardTitle"><div><h2>🍽️ Ranking y beneficio por producto</h2><p className="mutedText">Calculado para el rango seleccionado arriba. Pulsa un producto para ver y configurar su rentabilidad.</p></div><div><button className={sort==='qty'?'active':''} onClick={()=>setSort('qty')}>Unidades</button><button className={sort==='total'?'active':''} onClick={()=>setSort('total')}>Facturación</button></div></div><div className="tableScroll"><table className="clickableTable"><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Ventas</th><th>Coste</th><th>Beneficio</th><th>Margen</th></tr></thead><tbody>{top.map((p,i)=><tr key={p.name} onClick={()=>openProduct(p)}><td>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td><b>{p.name}</b>{p.code&&<small className="mutedCode"> {p.code}</small>}</td><td>{p.qty.toFixed(2)}</td><td>{money(p.total)}</td><td>{p.cost===null?<span className="warningText">Sin coste</span>:money(p.cost)}</td><td><b className={p.profit===null?'info':'ok'}>{p.profit===null?'Pendiente':money(p.profit)}</b></td><td>{p.margin===null?'—':`${p.margin.toFixed(1)}%`}</td></tr>)}</tbody></table></div><p className="mutedText rankingCount">Mostrando {top.length} productos vendidos · {top.filter(p=>p.cost===null).length} sin coste configurado</p>{top.length===0&&<p>No hay líneas de productos para este periodo.</p>}</div>{selected&&<div className="modal productProfitOverlay" onClick={()=>setSelected(null)}><div className="card intelligenceModal productProfitModal" onClick={e=>e.stopPropagation()}><div className="row between productProfitHeader"><div><span className="sectionEyebrow">RENTABILIDAD DEL PERIODO</span><h2>{selected.name}</h2><p>Código {selected.code||'sin código'} · {selected.ticketCount} tickets</p></div><button className="red" onClick={()=>setSelected(null)}>Cerrar</button></div><div className="intelligenceDetailGrid productProfitGrid"><p><span>Unidades vendidas</span><b>{selected.qty.toFixed(2)}</b></p><p><span>Facturación total</span><b>{money(selected.total)}</b></p><p><span>PVP unitario NUMIER</span><b>{money(selected.pvp)}</b><small>{Math.abs(selected.pvp-selected.avgSale)>.01?`Precio medio vendido: ${money(selected.avgSale)}`:'Coincide con el precio medio vendido'}</small></p><p className="editableCostCard"><span>Coste por unidad</span><input inputMode="decimal" type="number" min="0" step="0.0001" value={costDraft} onChange={e=>setCostDraft(e.target.value)} placeholder="Ej. 0,65"/><small>Puedes modificarlo directamente aquí.</small></p><p><span>Coste total del periodo</span><b>{costDraft!==''&&Number.isFinite(Number(String(costDraft).replace(',','.')))?money(Number(String(costDraft).replace(',','.'))*selected.qty):(selected.cost===null?'Sin configurar':money(selected.cost))}</b></p><p className="featured"><span>Beneficio total real</span><b>{costDraft!==''&&Number.isFinite(Number(String(costDraft).replace(',','.')))?money(selected.total-(Number(String(costDraft).replace(',','.'))*selected.qty)):(selected.profit===null?'Coste pendiente':money(selected.profit))}</b></p><p><span>Margen total real</span><b>{costDraft!==''&&Number.isFinite(Number(String(costDraft).replace(',','.')))&&selected.total?`${((selected.total-(Number(String(costDraft).replace(',','.'))*selected.qty))/selected.total*100).toFixed(1)}%`:(selected.margin===null?'—':`${selected.margin.toFixed(1)}%`)}</b></p></div><label className="costReasonLabel">Motivo / nota del coste<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej. coste estimado de cerveza de barril"/></label><div className="productProfitActions"><button onClick={saveCost} disabled={saving}>{saving?'Guardando...':'Guardar coste y recalcular'}</button></div></div></div>}</>;
}
function ShiftProfitability({tickets,lines,scheduleRows,costMap}){
 const[selected,setSelected]=useState(null);const[selectedTicket,setSelectedTicket]=useState(null);const linesByCab=new Map();(lines||[]).forEach(l=>{const k=String(l.cab_id);if(!linesByCab.has(k))linesByCab.set(k,[]);linesByCab.get(k).push(l)});
 const shiftStats=SHIFT_DEFS.map(s=>({ ...s, sales:0,tickets:0,staffHours:0,staffCost:0,productCost:0,knownRevenue:0,unknownRevenue:0,benefit:0,ticketRows:[] }));
 tickets.forEach(t=>{const id=shiftForTicket(t);const st=shiftStats.find(x=>x.id===id);if(st){st.sales+=Number(t.total||0);st.tickets++;st.ticketRows.push(t);const financial=periodFinancials(linesByCab.get(String(t.cab_id))||[],costMap);st.productCost+=financial.cost;st.unknownRevenue+=financial.unknownRevenue;st.knownRevenue+=financial.revenue-financial.unknownRevenue}});
 (scheduleRows||[]).forEach(r=>{const[a,b]=String(r.slot||'').split('-');if(!a||!b)return;const toDec=x=>{const[h,m]=x.split(':').map(Number);return h+m/60};const start=toDec(a),end=toDec(b);shiftStats.forEach(s=>s.staffHours+=overlapHours(start,end,s.start,s.end)*Number(r.employees||0))});
 shiftStats.forEach(s=>{s.staffCost=s.staffHours*EMPLOYEE_HOUR_COST;s.benefit=s.sales-s.productCost-s.staffCost;s.margin=s.sales?(s.benefit/s.sales)*100:0});
 const detail=selected?shiftStats.find(s=>s.id===selected):null;
 return <><div className="card"><h2>⏰ Ventas, margen y beneficio por franja</h2><p className="mutedText">Pulsa Desayuno, Almuerzo, Tarde o Cena para consultar sus tickets reales.</p><div className="tableScroll"><table className="clickableTable"><thead><tr><th>Franja</th><th>Ventas</th><th>Tickets</th><th>Coste productos</th><th>Personal</th><th>Beneficio</th><th>Margen</th></tr></thead><tbody>{shiftStats.map(s=><tr key={s.id} onClick={()=>setSelected(s.id)}><td><b>{s.name}</b></td><td>{money(s.sales)}</td><td>{s.tickets}</td><td>{money(s.productCost)}{s.unknownRevenue>0&&<small className="warningText"> + costes pendientes</small>}</td><td>{money(s.staffCost)}</td><td><b className={s.benefit>=0?'ok':'bad'}>{money(s.benefit)}</b></td><td>{s.sales?`${s.margin.toFixed(1)}%`:'—'}</td></tr>)}</tbody></table></div></div>{detail&&<div className="modal" onClick={()=>setSelected(null)}><div className="card intelligenceModal shiftModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">DETALLE DE FRANJA</span><h2>{detail.name}</h2><p>{detail.start}:00–{detail.end===23.5?'23:30':`${detail.end}:00`} · {detail.tickets} tickets</p></div><button className="red" onClick={()=>setSelected(null)}>Cerrar</button></div><div className="intelligenceDetailGrid"><p><span>Ventas</span><b>{money(detail.sales)}</b></p><p><span>Coste productos</span><b>{money(detail.productCost)}</b></p><p><span>Coste personal</span><b>{money(detail.staffCost)}</b></p><p className="featured"><span>Beneficio estimado</span><b>{money(detail.benefit)}</b></p></div><div className="tableScroll"><table className="clickableTable"><thead><tr><th>Hora</th><th>Ticket / mesa</th><th>Pago</th><th>Total</th><th>Acción</th></tr></thead><tbody>{detail.ticketRows.slice().reverse().map(t=>{const table=t.mesa||t.table_name||t.nombre_mesa||t.servicio||'';return <tr key={t.cab_id} onClick={()=>{setSelectedTicket(t.cab_id);setSelected(null)}}><td>{new Date(t.hora||t.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</td><td><b>{t.numdoc||t.ticket||t.cab_id}</b>{table&&<small> · Mesa {table}</small>}</td><td>{t.forma_pago||t.pago||'-'}</td><td>{money(t.total)}</td><td><button type="button" onClick={e=>{e.stopPropagation();setSelectedTicket(t.cab_id);setSelected(null)}}>Ver ticket</button></td></tr>})}</tbody></table></div></div></div>}<TicketModal cabId={selectedTicket} onClose={()=>setSelectedTicket(null)}/></>;
}
function articlesFromMap(costMap){const map=new Map();costMap?.forEach((v,k)=>map.set(k,{name:v.name||k,family:''}));return map}
function PredictionBox({mode,date,tickets}){const total=tickets.reduce((a,t)=>a+Number(t.total||0),0);const projected=mode==='hoy'? total/Math.max(0.25,(new Date().getHours()+new Date().getMinutes()/60-8)/15.5) : total;return <div className="card"><h2>🔮 Predicción rápida</h2>{mode==='hoy'?<><p>Ventas actuales: <b>{money(total)}</b></p><p>Si el ritmo se mantiene, cierre estimado: <b>{money(Math.max(total,projected))}</b></p></>:<p>Selecciona <b>Hoy</b> para ver predicción de cierre.</p>}<p className="mutedText">La predicción mejorará cuando acumulemos más histórico por día de semana.</p></div>}

function IntelligenceKpiModal({type,onClose,financial,daily,realCosts}){
 const fixed=realCosts?.details?.fixed||[],variable=realCosts?.details?.variable||[];
 const content={
  ventas:{title:'Ventas del periodo',text:'Facturación real cobrada en Numier para el rango seleccionado.',rows:[['Ventas',money(financial.revenue)],['Tickets',daily.tickets],['Ticket medio',money(daily.ticket_medio)],['Efectivo',money(daily.efectivo)],['Tarjeta',money(daily.tarjeta)]]},
  productos:{title:'Coste de productos',text:'Coste conocido de los artículos vendidos. Los productos sin coste quedan pendientes.',rows:[['Coste conocido',money(financial.cost)],['Ventas sin coste configurado',money(financial.unknownRevenue)],['Cobertura de costes',financial.revenue?`${Math.max(0,100-financial.unknownRevenue/financial.revenue*100).toFixed(1)}%`:'—']]},
  margen:{title:'Margen bruto',text:'Ventas menos coste de los productos, antes de personal y gastos del local.',rows:[['Ventas',money(financial.revenue)],['Coste productos',`- ${money(financial.cost)}`],['Margen bruto',money(financial.profit)],['Porcentaje',`${financial.margin.toFixed(1)}%`]]},
  personal:{title:'Personal estimado por cuadrante',text:'Se calcula siempre con las horas planificadas en el cuadrante a 7 €/hora, aunque un empleado olvide fichar.',rows:[['Horas de cuadrante',`${Number(realCosts.hours||0).toFixed(1)} h`],['Coste por hora','7,00 €'],['Coste estimado',money(realCosts.laborAccrued)],['Horas fichadas informativas',`${Number(realCosts.clockHours||0).toFixed(1)} h`]]},
  fijos:{title:'Gastos fijos imputados',text:'Parte proporcional por días naturales de los gastos fijos vigentes.',rows:[['Total imputado',money(realCosts.fixed)],...fixed.map(x=>[x.name,money(x.imputed)])]},
  variables:{title:'Gastos variables',text:'Imprevistos y otros gastos registrados dentro del periodo.',rows:[['Total',money(realCosts.variable)],...variable.map(x=>[`${String(x.expense_date||'').slice(0,10)} · ${x.name}`,money(x.amount)])]},
  beneficio:{title:'Beneficio real estimado',text:'Margen bruto menos personal estimado por cuadrante, gastos fijos y gastos variables.',rows:[['Margen bruto',money(financial.profit)],['Personal',`- ${money(realCosts.laborAccrued)}`],['Gastos fijos',`- ${money(realCosts.fixed)}`],['Gastos variables',`- ${money(realCosts.variable)}`],['Beneficio estimado',money(financial.realProfit)],['Margen real',`${financial.realMargin.toFixed(1)}%`]]},
  tickets:{title:'Tickets y ticket medio',text:'Volumen de operaciones cobradas y gasto medio por ticket.',rows:[['Tickets',daily.tickets],['Ticket medio',money(daily.ticket_medio)],['Ventas totales',money(daily.total)]]}
 }[type];
 if(!content)return null;
 return <div className="modal" onClick={onClose}><div className="card intelligenceModal kpiDetailModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">DETALLE DEL INDICADOR</span><h2>{content.title}</h2><p>{content.text}</p></div><button className="red" onClick={onClose}>Cerrar</button></div><div className="kpiDetailRows">{content.rows.map((r,i)=><p key={i}><span>{r[0]}</span><b>{r[1]}</b></p>)}</div></div></div>
}

function intelligencePctChange(current,previous){
 const c=Number(current||0),p=Number(previous||0);
 if(!p)return c>0?100:0;
 return ((c-p)/Math.abs(p))*100;
}
function ChangePill({value}){const v=Number(value||0);return <span className={'changePill '+(v>1?'up':v<-1?'down':'flat')}>{v>0?'+':''}{v.toFixed(1)}%</span>}
function IntelligenceDecisionCenter({tickets,lines,articles,costMap,financial,daily,previous}){
 const prevDaily=summarizeTickets(previous?.tickets||[]);const prevFin=periodFinancials(previous?.lines||[],costMap);const prevGross=prevDaily.total-prevFin.cost;
 const salesChange=intelligencePctChange(daily.total,prevDaily.total);const ticketsChange=intelligencePctChange(daily.tickets,prevDaily.tickets);const avgChange=intelligencePctChange(daily.ticket_medio,prevDaily.ticket_medio);const marginChange=financial.margin-(prevDaily.total?prevGross/prevDaily.total*100:0);
 const ranked=productRank(lines,'total',articles).map(p=>{const c=costMap?.get?.(String(p.code));const unit=c&&!c.excluded&&c.cost!==null?Number(c.cost):null;const cost=unit===null?null:unit*p.qty;const profit=cost===null?null:p.total-cost;return {...p,unitCost:unit,cost,profit,margin:profit===null||!p.total?null:profit/p.total*100}});
 const missing=ranked.filter(p=>p.unitCost===null).sort((a,b)=>b.total-a.total);
 const lowMargin=ranked.filter(p=>p.margin!==null&&p.margin<45).sort((a,b)=>b.total-a.total).slice(0,8);
 const stars=ranked.filter(p=>p.margin!==null&&p.margin>=65).sort((a,b)=>b.profit-a.profit).slice(0,8);
 const byDay=new Map();(tickets||[]).forEach(t=>{const d=new Date(t.hora||t.created_at);const key=d.toISOString().slice(0,10);const r=byDay.get(key)||{date:key,sales:0,tickets:0};r.sales+=Number(t.total||0);r.tickets++;byDay.set(key,r)});
 const days=[...byDay.values()].sort((a,b)=>a.date.localeCompare(b.date));const bestDay=days.slice().sort((a,b)=>b.sales-a.sales)[0];const weakestDay=days.slice().sort((a,b)=>a.sales-b.sales)[0];
 let score=50;score+=Math.max(-20,Math.min(20,salesChange));score+=Math.max(-10,Math.min(10,marginChange*2));score+=financial.realProfit>=0?15:-20;score-=Math.min(20,missing.length*2);score=Math.max(0,Math.min(100,Math.round(score)));
 const tone=score>=75?'Muy buen pulso':score>=55?'Pulso estable':score>=35?'Atención':'Pulso débil';
 return <div className="intelligence5Stack">
  <section className="card intelligencePulse5"><div><span className="sectionEyebrow">PULSO COLIBRÍ 5.0</span><h2>{tone}</h2><p>Lectura combinada de ventas, margen, beneficio real y calidad de costes.</p></div><div className="pulseScore"><b>{score}</b><span>/100</span></div></section>
  <section className="card"><div className="row between"><div><h2>Comparación con el periodo anterior</h2><p className="mutedText">Mismo número de días inmediatamente anteriores.</p></div></div><div className="comparisonGrid"><article><span>Ventas</span><b>{money(daily.total)}</b><ChangePill value={salesChange}/></article><article><span>Tickets</span><b>{daily.tickets}</b><ChangePill value={ticketsChange}/></article><article><span>Ticket medio</span><b>{money(daily.ticket_medio)}</b><ChangePill value={avgChange}/></article><article><span>Margen bruto</span><b>{financial.margin.toFixed(1)}%</b><ChangePill value={marginChange}/></article></div></section>
  <section className="card"><h2>Mapa de decisiones por producto</h2><p className="mutedText">Dónde ganas dinero, dónde vendes con poco margen y qué costes faltan.</p><div className="decisionColumns"><div><h3>⭐ Estrellas de beneficio</h3>{stars.map(p=><p key={p.name}><span>{p.name}</span><b>{money(p.profit)}</b><small>{p.margin.toFixed(1)}%</small></p>)}{!stars.length&&<em>Sin datos suficientes</em>}</div><div><h3>⚠️ Margen bajo</h3>{lowMargin.map(p=><p key={p.name}><span>{p.name}</span><b>{money(p.total)}</b><small>{p.margin.toFixed(1)}%</small></p>)}{!lowMargin.length&&<em>No hay productos con margen bajo</em>}</div><div><h3>🧾 Coste pendiente</h3>{missing.slice(0,8).map(p=><p key={p.name}><span>{p.name}</span><b>{money(p.total)}</b><small>{p.qty.toFixed(0)} uds.</small></p>)}{!missing.length&&<em>Todos los productos vendidos tienen coste</em>}</div></div></section>
  <section className="card"><h2>Ritmo por día</h2><div className="dayPulseSummary"><p><span>Mejor día</span><b>{bestDay?`${fmtDate(bestDay.date)} · ${money(bestDay.sales)}`:'—'}</b></p><p><span>Día más débil</span><b>{weakestDay?`${fmtDate(weakestDay.date)} · ${money(weakestDay.sales)}`:'—'}</b></p><p><span>Media diaria</span><b>{money(days.length?daily.total/days.length:daily.total)}</b></p></div><div className="dailyBars5">{days.map(d=>{const max=Math.max(1,...days.map(x=>x.sales));return <div key={d.date}><span>{fmtDate(d.date)}</span><i><b style={{width:`${Math.max(4,d.sales/max*100)}%`}}></b></i><strong>{money(d.sales)}</strong></div>})}</div></section>
 </div>
}

function BusinessIntelligence(){
 const[mode,setMode]=useState('hoy');const[date,setDate]=useState(today());const[bi,setBi]=useState({tickets:[],lines:[],sync:null,articles:new Map(),costMap:new Map()});const[previous,setPrevious]=useState({tickets:[],lines:[]});const[clock,setClock]=useState([]);const[realCosts,setRealCosts]=useState({fixed:0,variable:0,laborAccrued:0,payments:0,hours:0});const[loading,setLoading]=useState(false);const[selectedKpi,setSelectedKpi]=useState(null);const r=rangeDates(mode,date);
 useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[mode,date]);
 async function load(){if(!supabase)return;setLoading(true);const periodDays=Math.max(1,Math.round((new Date(r.to)-new Date(r.from))/86400000));const prevFrom=addDays(r.from,-periodDays),prevTo=r.from;const [{tickets,lines,sync,articles},{data:clockData},costMap,previousData]=await Promise.all([loadSalesRange(r.from,r.to),supabase.from('clock_records').select('*').gte('created_at',r.from+'T00:00:00').lt('created_at',r.to+'T00:00:00').order('created_at',{ascending:true}).limit(5000),loadProfitabilityCostMap(),loadSalesRange(prevFrom,prevTo)]);const clocks=clockData||[];const real=await loadRealProfitability(supabase,r.from,r.to,clocks);setBi({tickets,lines,sync,articles,costMap});setPrevious(previousData||{tickets:[],lines:[]});setClock(clocks);setRealCosts(real);setLoading(false)}
 const daily=summarizeTickets(bi.tickets);const lineFinancial=periodFinancials(bi.lines,bi.costMap);const grossProfit=daily.total-lineFinancial.cost;const realProfit=grossProfit-Number(realCosts.laborAccrued||0)-Number(realCosts.fixed||0)-Number(realCosts.variable||0);const financial={...lineFinancial,revenue:daily.total,profit:grossProfit,margin:daily.total?(grossProfit/daily.total)*100:0,realProfit,realMargin:daily.total?(realProfit/daily.total)*100:0};
 const buttons=[['hoy','Hoy'],['ayer','Ayer'],['tresdias','3 días'],['semana','7 días'],['treinta','30 días'],['mes','Mes'],['anio','Año']];
 return <div className="businessIntelligencePro"><div className="card hero intelligenceHero"><div><span className="sectionEyebrow">INTELIGENCIA REAL DEL NEGOCIO</span><h2>Ventas, margen y beneficio</h2><p>{r.label}. Todos los rankings y franjas usan este mismo periodo.</p></div><div className="row controls intelligenceRange">{buttons.map(([id,label])=><button key={id} className={mode===id?'active':''} onClick={()=>setMode(id)}>{label}</button>)}<input type="date" value={date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/><button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div><div className="grid intelligenceKpis"><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('ventas')}><span>Ventas</span><b>{money(financial.revenue)}</b><small>Ver desglose</small></button><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('productos')}><span>Coste productos</span><b>{money(financial.cost)}</b><small>Costes conocidos</small></button><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('margen')}><span>Margen bruto</span><b>{money(financial.profit)}</b><small>{financial.revenue?`${financial.margin.toFixed(1)}%`:'—'}</small></button><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('personal')}><span>Personal estimado</span><b>{money(realCosts.laborAccrued)}</b><small>{Number(realCosts.hours||0).toFixed(1)} h de cuadrante · 7 €/h</small></button><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('fijos')}><span>Gastos fijos imputados</span><b>{money(realCosts.fixed)}</b><small>Ver conceptos</small></button><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('variables')}><span>Gastos variables</span><b>{money(realCosts.variable)}</b><small>Ver movimientos</small></button><button className="card kpi realProfitKpi intelligenceKpiButton" onClick={()=>setSelectedKpi('beneficio')}><span>Beneficio real estimado</span><b className={financial.realProfit>=0?'ok':'bad'}>{money(financial.realProfit)}</b><small>{financial.revenue?`${financial.realMargin.toFixed(1)}% sobre ventas`:'—'}</small></button><button className="card kpi intelligenceKpiButton" onClick={()=>setSelectedKpi('tickets')}><span>Tickets / ticket medio</span><b>{daily.tickets}</b><small>{money(daily.ticket_medio)}</small></button></div>{financial.unknownRevenue>0&&<div className="warnBox">Hay {money(financial.unknownRevenue)} en ventas con coste pendiente. Configura esos artículos en Rentabilidad → Márgenes editables para completar el beneficio real.</div>}<IntelligenceDecisionCenter tickets={bi.tickets} lines={bi.lines} articles={bi.articles} costMap={bi.costMap} financial={financial} daily={daily} previous={previous}/><div className="grid"><PredictionBox mode={mode} date={date} tickets={bi.tickets}/><div className="card"><h2>📈 Ventas por hora</h2><SalesByHour tickets={bi.tickets}/></div></div><ShiftProfitability tickets={bi.tickets} lines={bi.lines} scheduleRows={realCosts.scheduleRows||[]} costMap={bi.costMap}/><ProductRanking lines={bi.lines} articles={bi.articles} costMap={bi.costMap} onCostSaved={load}/><DailyReport summary={daily} lines={bi.lines} tickets={bi.tickets} clockRows={clock} period={r} costMap={bi.costMap} articles={bi.articles}/><IntelligenceKpiModal type={selectedKpi} onClose={()=>setSelectedKpi(null)} financial={financial} daily={daily} realCosts={realCosts}/></div>;
}


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
 return <div className="modal ticketOverlay" onClick={onClose}><div className="card ticketModal" onClick={e=>e.stopPropagation()}><div className="row between"><h2>{account?(account.zona==='barra'?`Cuenta rápida ${account.mesa||account.mesa_numero}`:`Mesa ${account.mesa_numero}`):`Ticket ${detail.ticket?.numdoc||cabId}`}</h2><button className="red" onClick={onClose}>Cerrar</button></div>
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
 const[view,setView]=useState(()=>typeof window!=='undefined'&&window.innerWidth<=700&&initialView==='plano'?'lista':(initialView||'plano'));
 const[barDetails,setBarDetails]=useState(new Map());
 useEffect(()=>{setView(typeof window!=='undefined'&&window.innerWidth<=700&&initialView==='plano'?'lista':(initialView||'plano'))},[initialView]);
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


function ticketDateKey(t){return new Date(t.hora||t.created_at).toISOString().slice(0,10)}
function ticketsUntilHour(tickets,hour){return (tickets||[]).filter(t=>decimalHour(t.hora||t.created_at)<=hour)}
function summarizeTicketRows(rows){const total=(rows||[]).reduce((a,t)=>a+Number(t.total||0),0);return {total,tickets:(rows||[]).length,ticketMean:(rows||[]).length?total/(rows||[]).length:0}}
function comparisonPercent(current,base){if(!Number(base))return current>0?100:0;return ((Number(current)-Number(base))/Math.abs(Number(base)))*100}
function scheduledHoursUntil(rows,date,hour){let total=0;(rows||[]).filter(r=>String(r.date)===String(date)).forEach(r=>{const [a,b]=String(r.slot||'').split('-');if(!a||!b)return;const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);const start=ah+am/60,end=bh+bm/60;total+=Math.max(0,Math.min(hour,end)-start)*Number(r.employees||0)});return total}
function currentShiftForHour(hour){return SHIFT_DEFS.find(s=>hour>=s.start&&hour<s.end)||SHIFT_DEFS[hour<8?0:SHIFT_DEFS.length-1]}
function ComparisonMetric({label,current,base}){const pct=comparisonPercent(current,base);return <div className="commandCompareRow"><span>{label}</span><b>{money(base)}</b><em className={pct>=0?'ok':'bad'}>{pct>=0?'+':''}{pct.toFixed(1)}%</em></div>}

function CommandCenter({initialView='plano',focusAccount=null}){
 const[data,setData]=useState({today:{tickets:[],lines:[]},history:{tickets:[],lines:[]},service:null,profit:null,costMap:new Map(),sync:null});
 const[loading,setLoading]=useState(false);const[now,setNow]=useState(new Date());
 async function load(){
  setLoading(true);
  try{
   const date=today(),to=addDays(date,1),historyFrom=addDays(date,-35);
   const [todayData,history,service,profit,sync,costMap]=await Promise.all([
    loadSalesRange(date,to),loadSalesRange(historyFrom,to),loadServiceState(),loadRealProfitability(supabase,date,to,[]),loadSyncStatus(),loadProfitabilityCostMap()
   ]);
   setData({today:todayData,history,service,profit,costMap,sync});setNow(new Date());
  }finally{setLoading(false)}
 }
 useEffect(()=>{load();const t=setInterval(load,30000);return()=>clearInterval(t)},[]);
 const date=today(),hour=now.getHours()+now.getMinutes()/60,operatingProgress=Math.max(0,Math.min(1,(hour-8)/(23.5-8)));
 const allToday=data.today?.tickets||[],currentTickets=ticketsUntilHour(allToday,hour),currentIds=new Set(currentTickets.map(t=>String(t.cab_id)));
 const currentLines=(data.today?.lines||[]).filter(l=>currentIds.has(String(l.cab_id)));
 const fullSummary=summarizeTicketRows(allToday),currentSummary=summarizeTicketRows(currentTickets),open=data.service?.open||[];
 const pending=open.reduce((a,x)=>a+Number(x.total||0),0),p=data.profit||{};
 const fullFin=periodFinancials(data.today?.lines||[],data.costMap),currentFin=periodFinancials(currentLines,data.costMap);
 const fullGross=fullSummary.total-fullFin.cost,fullReal=fullGross-Number(p.laborAccrued||0)-Number(p.fixed||0)-Number(p.variable||0),fullMargin=fullSummary.total?fullReal/fullSummary.total*100:0;
 const accruedLaborHours=scheduledHoursUntil(p.scheduleRows||[],date,hour),accruedLabor=accruedLaborHours*7,accruedFixed=Number(p.fixed||0)*operatingProgress;
 const accruedReal=currentSummary.total-currentFin.cost-accruedLabor-accruedFixed-Number(p.variable||0),accruedMargin=currentSummary.total?accruedReal/currentSummary.total*100:0;
 const historyTickets=(data.history?.tickets||[]).filter(t=>ticketDateKey(t)!==date),byDate=new Map();historyTickets.forEach(t=>{const k=ticketDateKey(t);if(!byDate.has(k))byDate.set(k,[]);byDate.get(k).push(t)});
 const yesterday=addDays(date,-1),yesterdayNow=summarizeTicketRows(ticketsUntilHour(byDate.get(yesterday)||[],hour));
 const recentDates=[...byDate.keys()].sort().reverse();
 const avgAtHour=(days,filter=()=>true)=>{const selected=recentDates.filter(filter).slice(0,days).map(d=>summarizeTicketRows(ticketsUntilHour(byDate.get(d)||[],hour)).total);return selected.length?selected.reduce((a,b)=>a+b,0)/selected.length:0};
 const avgWeek=avgAtHour(7),avgMonth=avgAtHour(30),weekday=new Date(date+'T12:00:00').getDay(),avgSameWeekday=avgAtHour(4,d=>new Date(d+'T12:00:00').getDay()===weekday);
 const shift=currentShiftForHour(hour),shiftElapsedEnd=Math.min(hour,shift.end),shiftRows=currentTickets.filter(t=>{const h=decimalHour(t.hora||t.created_at);return h>=shift.start&&h<shift.end});
 const shiftNow=summarizeTicketRows(shiftRows),historicShiftTotals=recentDates.slice(0,30).map(d=>summarizeTicketRows((byDate.get(d)||[]).filter(t=>{const h=decimalHour(t.hora||t.created_at);return h>=shift.start&&h<=shiftElapsedEnd})).total),shiftAvg=historicShiftTotals.length?historicShiftTotals.reduce((a,b)=>a+b,0)/historicShiftTotals.length:0;
 const comparableFullShift=recentDates.slice(0,30).map(d=>summarizeTicketRows((byDate.get(d)||[]).filter(t=>{const h=decimalHour(t.hora||t.created_at);return h>=shift.start&&h<shift.end})).total),fullShiftAvg=comparableFullShift.length?comparableFullShift.reduce((a,b)=>a+b,0)/comparableFullShift.length:0;
 const shiftProgress=Math.max(.08,Math.min(1,(hour-shift.start)/(shift.end-shift.start))),shiftForecast=hour>=shift.end?shiftNow.total:Math.max(shiftNow.total,shiftNow.total/shiftProgress*.55+fullShiftAvg*.45);
 const dayProgress=Math.max(.08,operatingProgress),historicalFullDays=recentDates.slice(0,30).map(d=>summarizeTicketRows(byDate.get(d)||[]).total),avgFullDay=historicalFullDays.length?historicalFullDays.reduce((a,b)=>a+b,0)/historicalFullDays.length:0;
 const dayForecast=Math.max(currentSummary.total,currentSummary.total/dayProgress*.45+avgFullDay*.55)+pending;
 const rate=currentSummary.total/Math.max(1,hour-8),oldest=open.length?Math.max(...open.map(o=>minutesOpen(o.opened_at))):0,coverage=currentSummary.total?Math.max(0,100-currentFin.unknownRevenue/currentSummary.total*100):100;
 const alerts=[];if(oldest>120)alerts.push(`Hay una cuenta abierta desde hace ${durationShort(oldest)}.`);if(currentFin.unknownRevenue>0)alerts.push(`${money(currentFin.unknownRevenue)} de ventas hasta ahora no tienen coste configurado.`);if(data.sync&&Number(data.sync.pending_tickets||0)>0)alerts.push(`${data.sync.pending_tickets} tickets pendientes de sincronizar.`);if(accruedReal<0&&currentSummary.total>0)alerts.push(`El resultado acumulado hasta esta hora es ${money(accruedReal)}.`);
 const rhythm=comparisonPercent(currentSummary.total,avgMonth);const rhythmText=rhythm>=10?'Ritmo fuerte':rhythm>=-5?'Ritmo normal':'Ritmo por debajo de la media';
 return <div className="commandCenter">
  <div className="commandHero"><div><span className="sectionEyebrow">COLIBRÍ 6.1 · CENTRO DE MANDO</span><h1>Negocio en directo</h1><p>Lectura real hasta las {now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}, comparada con la misma hora histórica.</p></div><div className="commandLive"><b>● EN DIRECTO</b><span>{now.toLocaleTimeString('es-ES')}</span><button onClick={load}>{loading?'Actualizando...':'Actualizar ahora'}</button></div></div>
  <div className="commandKpis"><div><span>Ventas hasta ahora</span><b>{money(currentSummary.total)}</b><small>{currentSummary.tickets} tickets</small></div><div><span>Resultado acumulado</span><b className={accruedReal>=0?'ok':'bad'}>{money(accruedReal)}</b><small>{accruedMargin.toFixed(1)}% · gastos imputados hasta ahora</small></div><div><span>Beneficio día completo</span><b className={fullReal>=0?'ok':'bad'}>{money(fullReal)}</b><small>Mismo cálculo que Rentabilidad</small></div><div><span>Cuentas abiertas</span><b>{open.length}</b><small>{money(pending)} pendiente</small></div><div><span>Previsión cierre</span><b>{money(dayForecast)}</b><small>hora actual + histórico + abiertas</small></div><div><span>Sync</span><b>{Number(data.sync?.pending_tickets||0)===0?'OK':'REVISAR'}</b><small>{secondsAgo(data.sync?.updated_at)}</small></div></div>
  <section className="card commandNow"><div className="commandSectionHead"><div><span className="sectionEyebrow">CÓMO VOY AHORA</span><h2>{rhythmText}</h2><p>Comparación de ventas acumuladas exactamente hasta esta misma hora.</p></div><strong>{money(currentSummary.total)}</strong></div><div className="commandCompareGrid"><ComparisonMetric label="Ayer, misma hora" current={currentSummary.total} base={yesterdayNow.total}/><ComparisonMetric label="Media últimos 7 días" current={currentSummary.total} base={avgWeek}/><ComparisonMetric label="Media últimos 30 días" current={currentSummary.total} base={avgMonth}/><ComparisonMetric label="Mismo día de semana" current={currentSummary.total} base={avgSameWeekday}/></div></section>
  <div className="commandGrid commandGrid61"><section className="card commandShift"><span className="sectionEyebrow">TURNO ACTUAL</span><h2>{shift.name}</h2><div className="commandShiftKpis"><p><span>Ventas del turno</span><b>{money(shiftNow.total)}</b></p><p><span>Media a esta hora</span><b>{money(shiftAvg)}</b></p><p><span>Previsión fin de turno</span><b>{money(shiftForecast)}</b></p><p><span>Tickets / medio</span><b>{shiftNow.tickets} · {money(shiftNow.ticketMean)}</b></p></div><div className={comparisonPercent(shiftNow.total,shiftAvg)>=0?'commandGood':'commandAlert'}>{comparisonPercent(shiftNow.total,shiftAvg)>=0?'✓':'⚠'} Vas {Math.abs(comparisonPercent(shiftNow.total,shiftAvg)).toFixed(1)}% {comparisonPercent(shiftNow.total,shiftAvg)>=0?'por encima':'por debajo'} de la media del turno a esta hora.</div></section>
  <section className="card commandEconomy"><h2>Resultado hasta ahora</h2><p><span>Ventas cobradas</span><b>{money(currentSummary.total)}</b></p><p><span>Coste de producto</span><b>- {money(currentFin.cost)}</b></p><p><span>Personal transcurrido</span><b>- {money(accruedLabor)}</b></p><p><span>Gastos fijos imputados</span><b>- {money(accruedFixed)}</b></p><p><span>Variables registrados</span><b>- {money(p.variable)}</b></p><p className="total"><span>Resultado acumulado</span><b className={accruedReal>=0?'ok':'bad'}>{money(accruedReal)}</b></p></section>
  <section className="card commandQuality"><h2>Calidad de datos</h2><div className="qualityGauge"><b>{coverage.toFixed(0)}%</b><span>cobertura de costes</span></div><p><span>Venta conocida</span><b>{money(currentSummary.total-currentFin.unknownRevenue)}</b></p><p><span>Pendiente de coste</span><b>{money(currentFin.unknownRevenue)}</b></p><p><span>Venta por hora</span><b>{money(rate)}</b></p></section></div>
  <section className="card commandAlerts"><h2>Radar de incidencias</h2>{alerts.length?alerts.map((a,i)=><div className="commandAlert" key={i}>⚠ {a}</div>):<div className="commandGood">✓ Servicio estable. No hay incidencias relevantes.</div>}</section>
  <EstadoServicio initialView={initialView} focusAccount={focusAccount}/>
 </div>
}

function DailyReport({summary,lines,tickets,clockRows,period,costMap,articles}){
 const rankedQty=productRank(lines,'qty',articles);const rankedMoney=productRank(lines,'total',articles);const topQty=rankedQty[0];const topMoney=rankedMoney[0];const fin=periodFinancials(lines,costMap);const productCost=fin.cost;const grossProfit=summary.total-productCost;const margin=summary.total?(grossProfit/summary.total)*100:0;
 const byShift=SHIFT_DEFS.map(s=>{const rows=(tickets||[]).filter(t=>shiftForTicket(t)===s.id);return {...s,total:rows.reduce((a,t)=>a+Number(t.total||0),0),count:rows.length}}).sort((a,b)=>b.total-a.total);const bestShift=byShift[0];
 const cashPct=summary.total?summary.efectivo/summary.total*100:0;const unknown=fin.unknownRevenue;let tone='Día estable';let opinion=`El periodo registra ${summary.tickets} tickets con un ticket medio de ${money(summary.ticket_medio)}.`;
 if(summary.total>=1000)tone='Día muy fuerte';else if(summary.total>=500)tone='Buen día';else if(summary.total<250)tone='Día flojo';
 if(bestShift?.total>0)opinion+=` La franja más fuerte ha sido ${bestShift.name.replace(/^.. /,'')} con ${money(bestShift.total)} (${bestShift.count} tickets).`;
 if(topQty)opinion+=` El producto más vendido ha sido ${topQty.name}, con ${topQty.qty.toFixed(0)} unidades.`;
 opinion+=` El margen bruto conocido es del ${margin.toFixed(1)}%, antes de otros gastos fijos y variables.`;
 if(unknown>0)opinion+=` Hay ${money(unknown)} de ventas cuyos costes aún no están configurados, por lo que el beneficio debe considerarse provisional.`;
 const recommendations=[];if(unknown>0)recommendations.push('Completar los costes pendientes para obtener un margen totalmente fiable.');if(summary.ticket_medio<8)recommendations.push('El ticket medio es bajo; conviene revisar venta adicional, complementos y promociones combinadas.');if(cashPct>70)recommendations.push('El peso del efectivo es alto; revisar especialmente el cuadre de caja.');if(bestShift&&bestShift.total>summary.total*.55)recommendations.push(`La venta está muy concentrada en ${bestShift.name.replace(/^.. /,'')}; valorar acciones para reforzar las otras franjas.`);if(!recommendations.length)recommendations.push('El comportamiento del periodo es equilibrado; mantener seguimiento de margen y ticket medio.');
 const copy=`INFORME IA COLIBRÍ ERP
${period.label}
Ventas: ${money(summary.total)}
Tickets: ${summary.tickets}
Ticket medio: ${money(summary.ticket_medio)}
Coste productos: ${money(productCost)}
Beneficio bruto estimado: ${money(grossProfit)}
Margen bruto conocido: ${margin.toFixed(1)}%
Efectivo: ${money(summary.efectivo)}
Tarjeta: ${money(summary.tarjeta)}
Producto más vendido: ${topQty?topQty.name:'-'}
Mejor franja: ${bestShift?.name||'-'}

VALORACIÓN
${opinion}

RECOMENDACIONES
- ${recommendations.join('\n- ')}`;
 return <div className="card report aiDailyReport"><div className="row between"><div><span className="sectionEyebrow">ANÁLISIS IA DEL PERIODO</span><h2>🧾 Resumen ejecutivo</h2></div><span className="aiTone">{tone}</span></div><div className="reportGrid"><p><span>Ventas</span><b>{money(summary.total)}</b></p><p><span>Tickets</span><b>{summary.tickets}</b></p><p><span>Ticket medio</span><b>{money(summary.ticket_medio)}</b></p><p><span>Coste productos</span><b>{money(productCost)}</b></p><p><span>Beneficio bruto estimado</span><b>{money(grossProfit)}</b></p><p><span>Margen bruto conocido</span><b>{margin.toFixed(1)}%</b></p><p><span>Producto más vendido</span><b>{topQty?`${topQty.name} · ${topQty.qty.toFixed(0)} uds`:'-'}</b></p><p><span>Mejor franja</span><b>{bestShift?.total?`${bestShift.name} · ${money(bestShift.total)}`:'-'}</b></p></div><div className="aiOpinion"><h3>Lectura del negocio</h3><p>{opinion}</p><h3>Recomendaciones</h3><ul>{recommendations.map((r,i)=><li key={i}>{r}</li>)}</ul></div><button onClick={()=>navigator.clipboard.writeText(copy)}>Copiar informe IA</button></div>;
}

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

function isoWeekMonday(weekId){
 const {year,week}=parseWeekId(weekId);const jan4=new Date(year,0,4);const day=jan4.getDay()||7;const monday=new Date(jan4);monday.setDate(jan4.getDate()-day+1+(week-1)*7);monday.setHours(0,0,0,0);return monday
}
function slotForHour(hour){return SLOTS.find(slot=>{const [a,b]=slot.split('-');const toN=v=>{const[x,y]=v.split(':').map(Number);return x+y/60};return hour>=toN(a)&&hour<toN(b)})||null}
function SmartStaffPlanner({weekId,weekData,onApply}){
 const [loading,setLoading]=useState(false),[error,setError]=useState(''),[history,setHistory]=useState([]),[open,setOpen]=useState(true);
 useEffect(()=>{loadHistory()},[]);
 async function loadHistory(){
  if(!supabase){setError('Supabase no está configurado. El planificador necesita el histórico de Numier.');return}
  setLoading(true);setError('');
  try{const end=new Date(),start=new Date();start.setDate(end.getDate()-90);const{data,error}=await supabase.from('numier_tickets').select('hora,total,estado').gte('hora',start.toISOString()).lt('hora',end.toISOString()).order('hora',{ascending:true}).limit(20000);if(error)throw error;setHistory((data||[]).filter(t=>String(t.estado||'C').toUpperCase()==='C'))}catch(e){setError(e?.message||String(e))}finally{setLoading(false)}
 }
 const analysis=useMemo(()=>{
  const byDaySlot=new Map(),datesByDay=new Map();
  history.forEach(t=>{const d=new Date(t.hora);if(Number.isNaN(d.getTime()))return;const di=(d.getDay()+6)%7,day=DAYS[di],slot=slotForHour(d.getHours()+d.getMinutes()/60);if(!slot)return;const date=d.toISOString().slice(0,10);datesByDay.set(day,(datesByDay.get(day)||new Set()).add(date));const key=`${day}|${slot}`,r=byDaySlot.get(key)||{sales:0,tickets:0};r.sales+=Number(t.total||0);r.tickets++;byDaySlot.set(key,r)});
  const rows=[];DAYS.forEach(day=>SLOTS.forEach(slot=>{const raw=byDaySlot.get(`${day}|${slot}`)||{sales:0,tickets:0};const n=Math.max(1,datesByDay.get(day)?.size||1);const sales=raw.sales/n,tickets=raw.tickets/n;let recommended=Math.max(1,Math.ceil(sales/120),Math.ceil(tickets/14));if(sales<35&&tickets<5)recommended=1;recommended=Math.min(MAX_PER_SLOT,recommended);const current=(weekData?.[day]?.[slot]||[]).filter(id=>id!==CLOSED_ID).length;const hours=h(slot),cost=recommended*hours*7,ratio=sales>0?cost/sales*100:0;rows.push({day,slot,sales,tickets,recommended,current,cost,ratio,diff:current-recommended})}));return rows
 },[history,weekData]);
 const summary=useMemo(()=>{const sales=analysis.reduce((a,r)=>a+r.sales,0),recommendedCost=analysis.reduce((a,r)=>a+r.cost,0),currentCost=analysis.reduce((a,r)=>a+r.current*h(r.slot)*7,0);return{sales,recommendedCost,currentCost,diff:currentCost-recommendedCost,ratio:sales?recommendedCost/sales*100:0,alerts:analysis.filter(r=>r.diff!==0).length}},[analysis]);
 const proposal=useMemo(()=>Object.fromEntries(analysis.map(r=>[`${r.day}|${r.slot}`,r.recommended])),[analysis]);
 return <div className="card smartPlanner">
  <div className="row between smartPlannerHead"><div><span className="sectionEyebrow">PERSONAL 6.0 · PLANIFICADOR INTELIGENTE</span><h2>Plantilla recomendada para {weekId}</h2><p>Calculada con los últimos 90 días: ventas y tickets medios de cada día y franja.</p></div><button onClick={()=>setOpen(v=>!v)}>{open?'Ocultar':'Ver análisis'}</button></div>
  {error&&<div className="warnBox">{error}</div>}
  <div className="plannerKpis"><div><span>Ventas previstas</span><b>{money(summary.sales)}</b></div><div><span>Coste recomendado</span><b>{money(summary.recommendedCost)}</b></div><div><span>Personal / ventas</span><b>{summary.ratio.toFixed(1)}%</b></div><div><span>Ajustes detectados</span><b>{summary.alerts}</b></div></div>
  <div className="plannerActions"><button onClick={loadHistory}>{loading?'Analizando...':'Actualizar histórico'}</button><button className="plannerPrimary" disabled={!history.length} onClick={()=>{if(confirm('¿Aplicar la propuesta inteligente? Se reemplazarán las asignaciones de la semana, sin marcar días como cerrados.'))onApply(proposal)}}>Generar y aplicar propuesta</button></div>
  {open&&<><div className="plannerLegend"><span className="okDot"></span>Correcto <span className="warnDot"></span>Falta personal <span className="overDot"></span>Exceso estimado</div><div className="plannerTableWrap"><table className="plannerTable"><thead><tr><th>Día</th><th>Franja</th><th>Venta prevista</th><th>Tickets</th><th>Actual</th><th>Recomendado</th><th>Lectura</th></tr></thead><tbody>{analysis.map(r=><tr key={r.day+r.slot} className={r.diff<0?'plannerUnder':r.diff>0?'plannerOver':'plannerOk'}><td>{r.day}</td><td>{r.slot}</td><td>{money(r.sales)}</td><td>{r.tickets.toFixed(1)}</td><td>{r.current}</td><td><b>{r.recommended}</b></td><td>{r.diff<0?`Faltan ${Math.abs(r.diff)}`:r.diff>0?`Sobran ${r.diff}`:'Equilibrado'}</td></tr>)}</tbody></table></div></>}
 </div>
}

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
 function applySmartProposal(proposal){const w=cleanWeek(weekData);const loads=Object.fromEntries(employees.map(e=>[e.id,0]));DAYS.forEach(day=>SLOTS.forEach(slot=>{if(isClosed(day,slot))return;const count=Math.max(0,Math.min(MAX_PER_SLOT,Number(proposal?.[`${day}|${slot}`]||0)));const chosen=employees.slice().sort((a,b)=>(loads[a.id]||0)-(loads[b.id]||0)).slice(0,count);w[day][slot]=chosen.map(e=>e.id);chosen.forEach(e=>loads[e.id]=(loads[e.id]||0)+h(slot))}));saveWeek(weekId,w);alert('Propuesta inteligente aplicada. Revisa las asignaciones antes de publicar el cuadrante.')}
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
  <SmartStaffPlanner weekId={weekId} weekData={weekData} onApply={applySmartProposal}/>
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
 const[suppliers,setSuppliers]=useState([]),[invoices,setInvoices]=useState([]),[items,setItems]=useState([]);
 const[masterItems,setMasterItems]=useState([]),[numierCatalog,setNumierCatalog]=useState([]),[links,setLinks]=useState([]),[articleCosts,setArticleCosts]=useState([]);
 const[recipes,setRecipes]=useState([]),[recipeIngredients,setRecipeIngredients]=useState([]);
 const[linking,setLinking]=useState(null),[editingRecipe,setEditingRecipe]=useState(null),[catalogBusy,setCatalogBusy]=useState(false);
 const numierPriceLookups=useRef(new Set());
 const[selectedId,setSelectedId]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[newSupplier,setNewSupplier]=useState(''),[file,setFile]=useState(null),[busy,setBusy]=useState(false);
 const[invForm,setInvForm]=useState({supplier_id:'',invoice_number:'',invoice_date:today(),subtotal:'',tax_total:'',total:''});
 const[lineForm,setLineForm]=useState({product_name:'',supplier_sku:'',article_code:'',quantity:1,pack_units:1,unit:'ud',net_total:'',tax_rate:10,sale_price:'',category:'Materia prima',sub_category:''});
 useEffect(()=>{loadAll();runCleanup()},[]);
 useEffect(()=>{const active=invoices.some(x=>['queued','processing'].includes(x.status));if(!active)return;const timer=setInterval(()=>loadAll(false),5000);return()=>clearInterval(timer)},[invoices]);
 useEffect(()=>{if(!linking)return;const timer=setTimeout(()=>resolveVisibleNumierPrices(linking.search),250);return()=>clearTimeout(timer)},[linking?.search,numierCatalog]);
 async function runCleanup(){try{await supabase?.functions.invoke('cleanup-purchase-invoices')}catch(e){console.warn('Limpieza aplazada',e)}}
 async function loadAll(showLoading=true){
  if(!supabase){setError('Supabase no configurado');setLoading(false);return}
  if(showLoading)setLoading(true);setError('');
  const [sRes,iRes,lRes,mRes,nRes,tlRes,kRes,rRes,riRes,acRes]=await Promise.all([
   supabase.from('purchase_suppliers').select('*').order('name'),
   supabase.from('purchase_invoices').select('*,purchase_suppliers(name)').order('created_at',{ascending:false}).limit(500),
   supabase.from('purchase_invoice_items').select('*,purchase_invoices(id,invoice_number,invoice_date,total,supplier_id,purchase_suppliers(name))').order('created_at',{ascending:false}).limit(10000),
   supabase.from('purchase_master_items').select('*').order('name').limit(20000),
   supabase.from('numier_articles').select('article_code,article_name,family,category_name,price,iva,active').limit(20000),
   supabase.from('numier_ticket_lines').select('articulo,descripcion,cantidad,precio,importe,cab_id,line_key').gt('precio',0).order('cab_id',{ascending:false}).order('line_key',{ascending:false}).limit(10000),
   supabase.from('purchase_product_numier_links').select('*').order('is_primary',{ascending:false}),
   supabase.from('profitability_recipes').select('*').order('name'),
   supabase.from('profitability_recipe_ingredients').select('*').order('position'),
   supabase.from('profitability_article_costs').select('*').order('article_code')
  ]);
  const e=sRes.error||iRes.error||lRes.error||mRes.error||nRes.error||tlRes.error||kRes.error||rRes.error||riRes.error||(acRes.error?.code==='42P01'?null:acRes.error);if(e)setError(e.message);
  const catalog=buildNumierCatalog(nRes.data||[],tlRes.data||[]);
  setSuppliers(sRes.data||[]);setInvoices(iRes.data||[]);setItems(lRes.data||[]);setMasterItems(mRes.data||[]);setNumierCatalog(catalog);setLinks(kRes.data||[]);setRecipes(rRes.data||[]);setRecipeIngredients(riRes.data||[]);setArticleCosts(acRes.data||[]);setLoading(false);
 }
 async function resolveVisibleNumierPrices(search){if(!supabase)return;const q=normalizeProductName(search);const pending=numierCatalog.filter(a=>{const code=String(a.article_code),name=normalizeProductName(a.article_name);return(!q||name.includes(q)||code.includes(String(search||'').trim()))&&!a.price_checked&&!a.price_loading&&!numierPriceLookups.current.has(code)}).slice(0,30);if(!pending.length)return;pending.forEach(a=>numierPriceLookups.current.add(String(a.article_code)));const codes=new Set(pending.map(a=>String(a.article_code)));setNumierCatalog(current=>current.map(a=>codes.has(String(a.article_code))?{...a,price_loading:true,price_error:false}:a));const results=await Promise.all(pending.map(async a=>{const code=String(a.article_code);const{data,error}=await supabase.from('numier_ticket_lines').select('articulo,descripcion,cantidad,precio,importe,cab_id,line_key').eq('articulo',code).gt('precio',0).order('cab_id',{ascending:false}).order('line_key',{ascending:false}).limit(1).maybeSingle();return{code,line:data||null,error:Boolean(error)}}));const byCode=new Map(results.map(result=>[result.code,result]));setNumierCatalog(current=>current.map(a=>{const result=byCode.get(String(a.article_code));return result?mergeResolvedNumierPrice(a,result.line,result.error):a}))}
 async function createSupplier(nameOverride){const name=String(nameOverride||newSupplier).trim();if(!name)return null;const existing=suppliers.find(x=>normalizeProductName(x.name)===normalizeProductName(name));if(existing)return existing;const{data,error}=await supabase.from('purchase_suppliers').insert({name,active:true}).select().single();if(error){alert(error.message);return null}setNewSupplier('');setSuppliers(v=>[...v,data].sort((a,b)=>a.name.localeCompare(b.name)));setInvForm(v=>({...v,supplier_id:data.id}));return data}
 async function processInvoice(id){setBusy(true);const{error}=await supabase.functions.invoke('process-purchase-invoice',{body:{invoice_id:id}});if(error){await supabase.from('purchase_invoices').update({status:'failed',processing_error:error.message,processing_progress:0}).eq('id',id);alert('No se pudo iniciar el procesamiento: '+error.message)}await loadAll(false);setBusy(false)}
 async function createInvoice(){if(!file&&!invForm.supplier_id)return alert('Adjunta una foto/PDF o selecciona un proveedor');setBusy(true);let file_path=null,file_name=null,file_type=null;if(file){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');file_path=`${new Date().getFullYear()}/${Date.now()}_${safe}`;const up=await supabase.storage.from('purchase-invoices').upload(file_path,file,{contentType:file.type,upsert:false});if(up.error){setBusy(false);return alert(up.error.message)}file_name=file.name;file_type=file.type}const auto=Boolean(file);const row={supplier_id:invForm.supplier_id||null,invoice_number:invForm.invoice_number||null,invoice_date:invForm.invoice_date||today(),subtotal:Number(invForm.subtotal||0),tax_total:Number(invForm.tax_total||0),total:Number(invForm.total||0),file_path,file_name,file_type,status:auto?'queued':'awaiting_review',source:auto?'upload':'manual',processing_progress:auto?5:100,processing_step:auto?'Factura recibida':'Pendiente de revisión',retention_delete_at:addMonthsISO(4)};const{data,error}=await supabase.from('purchase_invoices').insert(row).select().single();if(error){setBusy(false);return alert(error.message)}setInvForm({supplier_id:invForm.supplier_id,invoice_number:'',invoice_date:today(),subtotal:'',tax_total:'',total:''});setFile(null);setSelectedId(data.id);await loadAll(false);setT('facturas');setBusy(false);if(auto)processInvoice(data.id)}
 async function approveDetectedSupplier(inv){const name=String(inv.detected_supplier_name||'').trim();if(!name)return alert('No hay proveedor detectado');const supplier=await createSupplier(name);if(!supplier)return;await supabase.from('purchase_invoices').update({supplier_id:supplier.id}).eq('id',inv.id);await loadAll(false)}
 async function addLine(){if(!selectedId||!lineForm.product_name.trim())return alert('Selecciona factura e indica producto');const row={invoice_id:selectedId,product_name:lineForm.product_name.trim(),quantity:Number(lineForm.quantity||0),pack_units:Number(lineForm.pack_units||1),unit:lineForm.unit||'ud',net_total:Number(lineForm.net_total||0),tax_rate:Number(lineForm.tax_rate||0),unit_cost:calcUnitCost(lineForm),sale_price:Number(lineForm.sale_price||0),category:lineForm.category,sub_category:lineForm.sub_category||null,review_status:'confirmed',source:'manual'};const{error}=await supabase.from('purchase_invoice_items').insert(row);if(error)return alert(error.message);setLineForm({...lineForm,product_name:'',net_total:''});loadAll(false)}
 async function updateExtractedLine(id,patch){const{error}=await supabase.from('purchase_invoice_items').update(patch).eq('id',id);if(error)alert(error.message);else loadAll(false)}
 async function removeLine(id){if(!confirm('¿Eliminar esta línea?'))return;await supabase.from('purchase_invoice_items').delete().eq('id',id);loadAll(false)}
 async function ensureMasterForLine(line){const normalized=normalizeProductName(line.product_name);if(!normalized)return null;let master=masterItems.find(x=>x.normalized_name===normalized);if(!master){const usage=line.category==='Materia prima'?'recipe':line.category==='Bebidas'?'sale':['Consumibles de servicio','Limpieza e higiene'].includes(line.category)?'consumable':['Menaje','Utensilios y pequeño equipamiento'].includes(line.category)?'asset':'expense';const{data,error}=await supabase.from('purchase_master_items').insert({name:line.product_name,normalized_name:normalized,category:line.category||'Otros gastos',sub_category:line.sub_category||null,base_unit:line.unit||'ud',usage_type:usage,active:true,waste_percent:0}).select().single();if(error&&error.code!=='23505')throw error;master=data||((await supabase.from('purchase_master_items').select('*').eq('normalized_name',normalized).single()).data)}if(master){await supabase.from('purchase_invoice_items').update({master_item_id:master.id}).eq('id',line.id)}return master}
 async function consolidateCatalog(){setCatalogBusy(true);try{for(const line of items.filter(x=>x.review_status==='confirmed'&&!x.master_item_id))await ensureMasterForLine(line);await loadAll(false);alert('Catálogo consolidado')}catch(e){alert(e.message)}finally{setCatalogBusy(false)}}
 async function markReviewed(inv){const lines=items.filter(x=>x.invoice_id===inv.id);if(!inv.supplier_id)return alert('Primero confirma el proveedor');if(lines.some(x=>x.review_status!=='confirmed'))return alert('Hay artículos pendientes');setCatalogBusy(true);try{for(const line of lines)await ensureMasterForLine(line);await supabase.from('purchase_invoices').update({status:'reviewed',reviewed_at:new Date().toISOString(),processing_step:'Factura validada',processing_progress:100}).eq('id',inv.id);await loadAll(false)}finally{setCatalogBusy(false)}}
 async function openFile(inv){if(!inv.file_path)return alert('Archivo no disponible');const{data,error}=await supabase.storage.from('purchase-invoices').createSignedUrl(inv.file_path,300);if(error)return alert(error.message);window.open(data.signedUrl,'_blank')}
 const selected=invoices.find(x=>x.id===selectedId)||null,selectedLines=items.filter(x=>x.invoice_id===selectedId);
 const reviewed=invoices.filter(x=>x.status==='reviewed'),monthKey=today().slice(0,7),monthInvoices=reviewed.filter(x=>String(x.invoice_date||'').startsWith(monthKey));
 const histories=useMemo(()=>{const groups={};for(const x of items.filter(i=>i.review_status==='confirmed')){const key=String(x.master_item_id||normalizeProductName(x.product_name));(groups[key]??=[]).push(x)}return Object.entries(groups).map(([key,rows])=>{rows.sort((a,b)=>String(b.purchase_invoices?.invoice_date||'').localeCompare(String(a.purchase_invoices?.invoice_date||'')));const latest=rows[0],prev=rows[1];return{key,name:latest.product_name,latest,rows,master:masterItems.find(m=>String(m.id)===String(latest.master_item_id)),change:prev&&Number(prev.unit_cost)>0?((Number(latest.unit_cost)-Number(prev.unit_cost))/Number(prev.unit_cost))*100:null}}).sort((a,b)=>a.name.localeCompare(b.name))},[items,masterItems]);
  const marginRows=useMemo(()=>buildMarginProducts({links,masters:masterItems,recipes,ingredients:recipeIngredients,purchaseItems:items,numierCatalog,articleCosts}),[links,masterItems,recipes,recipeIngredients,items,numierCatalog,articleCosts]);
  const avgMargin=includedMarginAverage(marginRows);
 const unlinkedCount=masterItems.filter(m=>['sale','recipe','purchase'].includes(m.usage_type)&&!links.some(l=>String(l.master_item_id)===String(m.id))).length;
 function statusMeta(inv){return INVOICE_STATUS[inv.status]||[inv.status||'Pendiente','statusPending']}
  async function saveMultiLink(){const m=linking.master;if(linking.selected.some(code=>numierCatalog.find(a=>String(a.article_code)===String(code))?.price_loading))return alert('Espera a que NUMIER termine de comprobar los precios');const nextManual=Number(linking.manualCost||0),previousManual=Number(m.manual_unit_cost||0);if(nextManual!==previousManual&&!String(linking.manualReason||'').trim())return alert('Indica el motivo del cambio de coste manual');await supabase.from('purchase_master_items').update({usage_type:linking.usage,base_unit:linking.baseUnit||'ud',waste_percent:Number(linking.waste||0),updated_at:new Date().toISOString()}).eq('id',m.id);if(nextManual!==previousManual){const{error}=await supabase.rpc('set_profitability_cost_control',{p_entity_type:'master_item',p_entity_id:m.id,p_action:nextManual>0?'set_manual':'restore_auto',p_manual_cost:nextManual>0?nextManual:null,p_reason:String(linking.manualReason||'Coste automático restaurado').trim(),p_actor:'Usuario ERP'});if(error)return alert(error.message)}await supabase.from('purchase_product_numier_links').delete().eq('master_item_id',m.id);if(['sale','recipe'].includes(linking.usage)&&linking.selected.length){const rows=linking.selected.map((code,i)=>{const a=numierCatalog.find(x=>String(x.article_code)===String(code));return{master_item_id:m.id,numier_article_code:String(code),numier_article_name:a?.article_name||String(code),sale_price:resolveLinkSalePrice(a,linking.prices?.[code]),quantity_factor:Number(linking.factors?.[code]||1),is_primary:i===0}});const{error}=await supabase.from('purchase_product_numier_links').insert(rows);if(error)return alert(error.message);const first=rows[0],firstArticle=numierCatalog.find(a=>String(a.article_code)===String(first.numier_article_code));await supabase.from('purchase_master_items').update({numier_article_code:first.numier_article_code,numier_article_name:first.numier_article_name,sale_price:first.sale_price,sale_price_source:firstArticle?.price_source||'manual'}).eq('id',m.id)}setLinking(null);await loadAll(false)}
  function openLink(m){const current=links.filter(l=>String(l.master_item_id)===String(m.id));setLinking({master:m,usage:m.usage_type||'purchase',search:m.name,selected:current.map(x=>String(x.numier_article_code)),prices:Object.fromEntries(current.map(x=>[String(x.numier_article_code),x.sale_price||''])),factors:Object.fromEntries(current.map(x=>[String(x.numier_article_code),x.quantity_factor||1])),baseUnit:m.base_unit||'ud',waste:m.waste_percent||0,manualCost:m.manual_unit_cost||'',manualReason:''})}
 async function saveRecipe(){if(!editingRecipe?.name||!editingRecipe?.numier_article_code)return alert('Selecciona producto NUMIER');const payload={name:editingRecipe.name,numier_article_code:String(editingRecipe.numier_article_code),numier_article_name:editingRecipe.numier_article_name,sale_price:Number(editingRecipe.sale_price||0),yield_quantity:Number(editingRecipe.yield_quantity||1),yield_unit:editingRecipe.yield_unit||'ración',active:true,updated_at:new Date().toISOString()};let recipeId=editingRecipe.id;if(recipeId){await supabase.from('profitability_recipes').update(payload).eq('id',recipeId)}else{const{data,error}=await supabase.from('profitability_recipes').insert(payload).select().single();if(error)return alert(error.message);recipeId=data.id}for(const old of recipeIngredients.filter(i=>String(i.recipe_id)===String(recipeId)))await supabase.from('profitability_recipe_ingredients').delete().eq('id',old.id);const rows=(editingRecipe.ingredients||[]).filter(i=>i.master_item_id&&Number(i.quantity)>0).map((i,p)=>({recipe_id:recipeId,master_item_id:i.master_item_id,quantity:Number(i.quantity),unit:i.unit||'g',waste_percent:i.waste_percent===''?null:Number(i.waste_percent),position:p}));if(rows.length){const{error}=await supabase.from('profitability_recipe_ingredients').insert(rows);if(error)return alert(error.message)}setEditingRecipe(null);await loadAll(false)}
 function editRecipe(r){setEditingRecipe({...r,ingredients:recipeIngredients.filter(i=>String(i.recipe_id)===String(r.id)).map(i=>({...i}))})}
 function newRecipe(){setEditingRecipe({name:'',numier_article_code:'',numier_article_name:'',sale_price:'',yield_quantity:1,yield_unit:'ración',ingredients:[]})}
 function exportCosts(){const rows=['Producto;Categoría;Coste;Unidad'];histories.forEach(h=>rows.push([h.name,h.master?.category||h.latest.category,Number(h.master?.manual_unit_cost||h.latest.unit_cost||0).toFixed(4),h.master?.base_unit||h.latest.unit].join(';')));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));a.download='costes_colibri.csv';a.click()}
 if(loading)return <div className="profitPage"><div className="card profitLoadingSkeleton" aria-label="Cargando Costes y Rentabilidad"><span></span><i></i><div><b></b><b></b><b></b><b></b></div><i></i><i></i></div></div>;
 return <div className="profitPage"><Brand/>{error&&<div className="warnBox">{error}. Ejecuta el SQL de RC 3.8.0 si aún no lo has hecho.</div>}
  <div className="card hero profitHero"><div><h2>📦 Costes, Márgenes y Escandallos</h2><p>Facturas IA, vinculación múltiple con NUMIER y coste real por receta.</p></div><div className="row"><button onClick={()=>loadAll()}>Actualizar</button><button onClick={exportCosts}>Exportar costes</button></div></div>
  <div className="profitTabs">{[['resumen','Resumen'],['real','Rentabilidad real'],['facturas','Facturas IA'],['costes','Costes'],['escandallos','Escandallos'],['margenes','Márgenes'],['proveedores','Proveedores']].map(([id,label])=><button key={id} className={t===id?'active':''} onClick={()=>setT(id)}>{label}</button>)}</div>
  {t==='resumen'&&<><div className="grid profitKpis"><div className="kpi"><span>Compras mes</span><b>{money(monthInvoices.reduce((a,x)=>a+Number(x.total||0),0))}</b></div><div className="kpi"><span>Artículos maestros</span><b>{masterItems.length}</b></div><div className="kpi"><span>Escandallos</span><b>{recipes.length}</b></div><div className="kpi"><span>Margen medio incluido</span><b>{avgMargin===null?'—':`${avgMargin.toFixed(1)}%`}</b></div></div><div className="card"><h2>Centro de rentabilidad</h2><p className="infoText">Clasifica compras, vincula uno o varios artículos NUMIER y crea escandallos indicando gramos, mililitros o unidades.</p>{unlinkedCount>0&&<div className="warnBox">{unlinkedCount} artículos pendientes de vincular o clasificar.</div>}</div></>}
  {t==='real'&&<RealBusinessProfitability supabase={supabase} loadSalesRange={loadSalesRange} loadCostMap={loadProfitabilityCostMap}/>}
  {t==='facturas'&&<div className="profitInvoices"><div className="card"><h2>Subir factura</h2><div className="formGrid"><label>Proveedor<select value={invForm.supplier_id} onChange={e=>setInvForm({...invForm,supplier_id:e.target.value})}><option value="">Detectar automáticamente</option>{suppliers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Fecha<input type="date" value={invForm.invoice_date} onChange={e=>setInvForm({...invForm,invoice_date:e.target.value})}/></label><label className="wideField">Foto/PDF<input type="file" accept="image/*,.pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label></div><button disabled={busy} onClick={createInvoice}>Guardar y procesar</button><hr/><div className="row"><input placeholder="Crear proveedor manualmente" value={newSupplier} onChange={e=>setNewSupplier(e.target.value)}/><button onClick={()=>createSupplier()}>Crear proveedor</button></div></div><div className="card"><h2>Cola de facturas</h2><div className="invoiceList invoiceListPro">{invoices.map(inv=>{const [label,cls]=statusMeta(inv);return <button key={inv.id} className={selectedId===inv.id?'selected':''} onClick={()=>setSelectedId(inv.id)}><span className="invoiceMain"><b>{inv.purchase_suppliers?.name||inv.detected_supplier_name||'Detectando proveedor...'}</b><small>{inv.invoice_date} · {inv.invoice_number||'Sin número'}</small><small>{inv.processing_step||''}</small></span><strong>{money(inv.total)}</strong><em className={cls}>{label}</em>{['queued','processing'].includes(inv.status)&&<i className="invoiceProgress"><u style={{width:`${Number(inv.processing_progress||0)}%`}}/></i>}</button>})}</div></div>{selected&&<div className="card wide"><div className="row between"><div><h2>Detalle de factura</h2><p>{selected.purchase_suppliers?.name||selected.detected_supplier_name||'Proveedor pendiente'} · {selected.invoice_date} · {money(selected.total)}</p></div><div className="row">{selected.file_path&&<button onClick={()=>openFile(selected)}>Ver archivo</button>}{selected.status==='failed'&&<button onClick={()=>processInvoice(selected.id)}>Reintentar IA</button>}{selected.status==='awaiting_review'&&<button onClick={()=>markReviewed(selected)}>Finalizar revisión</button>}</div></div>{['queued','processing'].includes(selected.status)&&<div className="processingPanel"><b>🤖 {selected.processing_step}</b><div className="progress"><i style={{width:`${Number(selected.processing_progress||0)}%`}}/></div></div>}{!selected.supplier_id&&selected.detected_supplier_name&&<div className="reviewNotice"><div><b>Proveedor nuevo detectado</b><span>{selected.detected_supplier_name}</span></div><button onClick={()=>approveDetectedSupplier(selected)}>Crear y vincular</button></div>}<h3>Artículos detectados</h3><div className="invoiceReviewItems">{selectedLines.map(x=><div className={'reviewItem '+(x.review_status==='confirmed'?'confirmed':'pending')} key={x.id}><div><b>{x.product_name}</b><small>{x.quantity} × {x.pack_units} {x.unit} · Neto {money(x.net_total)} · Coste/ud {money(x.unit_cost)}</small></div><select value={x.category||''} onChange={e=>updateExtractedLine(x.id,{category:e.target.value,review_status:'confirmed'})}><option value="">Clasificar...</option>{PURCHASE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select><input placeholder="Subcategoría" value={x.sub_category||''} onChange={e=>updateExtractedLine(x.id,{sub_category:e.target.value})}/><button onClick={()=>updateExtractedLine(x.id,{review_status:x.review_status==='confirmed'?'pending':'confirmed'})}>{x.review_status==='confirmed'?'✓ Confirmado':'Confirmar'}</button><button className="red" onClick={()=>removeLine(x.id)}>×</button></div>)}</div><details><summary>Añadir línea manual</summary><div className="formGrid"><label>Producto<input value={lineForm.product_name} onChange={e=>setLineForm({...lineForm,product_name:e.target.value})}/></label><label>Categoría<select value={lineForm.category} onChange={e=>setLineForm({...lineForm,category:e.target.value})}>{PURCHASE_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Cantidad<input type="number" value={lineForm.quantity} onChange={e=>setLineForm({...lineForm,quantity:e.target.value})}/></label><label>Unidades/bulto<input type="number" value={lineForm.pack_units} onChange={e=>setLineForm({...lineForm,pack_units:e.target.value})}/></label><label>Unidad<input value={lineForm.unit} onChange={e=>setLineForm({...lineForm,unit:e.target.value})}/></label><label>Neto<input type="number" value={lineForm.net_total} onChange={e=>setLineForm({...lineForm,net_total:e.target.value})}/></label></div><button onClick={addLine}>Añadir</button></details></div>}</div>}
  {t==='costes'&&<div className="card"><div className="row between"><div><h2>Catálogo maestro de costes</h2><p>Edita unidad base y merma. Un producto puede vincularse con varios artículos NUMIER.</p></div><button disabled={catalogBusy} onClick={consolidateCatalog}>Sincronizar catálogo</button></div><div className="costCatalog">{histories.map(h=>{const m=h.master,ml=m?links.filter(l=>String(l.master_item_id)===String(m.id)):[];return <article className="costItemCard" key={h.key}><div><b>{h.name}</b><small>{m?.category||h.latest.category} · {h.latest.purchase_invoices?.purchase_suppliers?.name||'-'}</small><strong>{money(m?.manual_unit_cost||h.latest.unit_cost)} / {m?.base_unit||h.latest.unit||'ud'}</strong><small className={h.change>5?'bad':h.change<0?'ok':''}>{h.change===null?'Primer precio':`${h.change>=0?'+':''}${h.change.toFixed(1)}%`}</small></div><div className="costLinkState">{ml.length?<><span className="statusOk">{ml.length} vínculo{ml.length>1?'s':''}</span>{ml.map(l=><small key={l.id}>{l.numier_article_name}</small>)}</>:['expense','consumable','asset'].includes(m?.usage_type)?<span className="statusInfo">No vendible</span>:<span className="statusPending">Sin vincular</span>}{m&&<button onClick={()=>openLink(m)}>Vincular / clasificar</button>}</div></article>})}</div></div>}
  {t==='escandallos'&&<ProfessionalRecipes supabase={supabase} recipes={recipes} recipeIngredients={recipeIngredients} masterItems={masterItems} purchaseItems={items} numierCatalog={numierCatalog} onRefresh={loadAll}/>}
  {t==='margenes'&&<EditableMargins supabase={supabase} links={links} masterItems={masterItems} recipes={recipes} recipeIngredients={recipeIngredients} purchaseItems={items} numierCatalog={numierCatalog} articleCosts={articleCosts} onRefresh={loadAll}/>}
  {t==='proveedores'&&<div className="card"><h2>Proveedores</h2>{suppliers.map(s=><div className="employee" key={s.id}><b>{s.name}</b><span>{invoices.filter(i=>i.supplier_id===s.id).length} facturas</span></div>)}</div>}
  {linking&&<div className="modal" onClick={()=>setLinking(null)}>
   <div className="card linkModal linkModalPro" onClick={e=>e.stopPropagation()}>
    <div className="row between"><div><h2>Vincular artículo</h2><p>{linking.master.name}</p></div><button className="red" onClick={()=>setLinking(null)}>Cerrar</button></div>
    <label>Uso<select value={linking.usage} onChange={e=>setLinking({...linking,usage:e.target.value})}><option value="sale">Se vende directamente</option><option value="recipe">Materia prima / escandallos</option><option value="consumable">Consumible</option><option value="asset">Menaje/equipamiento</option><option value="expense">Gasto/suministro</option><option value="purchase">Pendiente</option></select></label>
    <div className="linkSettings"><label>Unidad base<select value={linking.baseUnit} onChange={e=>setLinking({...linking,baseUnit:e.target.value})}><option>g</option><option>kg</option><option>ml</option><option>l</option><option>ud</option><option>caja</option><option>paquete</option></select></label><label>Merma %<input type="number" value={linking.waste} onChange={e=>setLinking({...linking,waste:e.target.value})}/></label><label>Coste manual por unidad base<input type="number" step="0.0001" value={linking.manualCost} onChange={e=>setLinking({...linking,manualCost:e.target.value})}/></label>{Number(linking.manualCost||0)!==Number(linking.master.manual_unit_cost||0)&&<label>Motivo del cambio<input value={linking.manualReason} onChange={e=>setLinking({...linking,manualReason:e.target.value})}/></label>}</div>
    {['sale','recipe'].includes(linking.usage)&&<>
     <label>Buscar en NUMIER<input value={linking.search} onChange={e=>setLinking({...linking,search:e.target.value})}/></label>
     <p className="infoText">El PVP se recupera del catálogo NUMIER o de su última venta real. El valor manual solo aparece como respaldo cuando NUMIER no dispone de precio.</p>
     <div className="numierMatches multi">{numierCatalog.filter(a=>{const q=normalizeProductName(linking.search),n=normalizeProductName(a.article_name),code=String(a.article_code);return !q||n.includes(q)||code.includes(String(linking.search||'').trim())||q.split(' ').some(w=>w&&n.includes(w))}).slice(0,30).map(a=>{const code=String(a.article_code),checked=linking.selected.includes(code),realPrice=Number(a.sale_price||0);return <div className={'numierChoice '+(checked?'selected':'')} key={code}>
      <button onClick={()=>setLinking({...linking,selected:checked?linking.selected.filter(x=>x!==code):[...linking.selected,code]})}><span className="checkBox">{checked?'✓':''}</span><b>{a.article_name}</b><small className={realPrice>0?'numierPriceAvailable':a.price_loading?'numierPriceLoading':'numierPriceUnavailable'}>{code} · {numierPriceText(a)}</small></button>
      {checked&&<div className="linkDetail"><label>Factor usado<input type="number" step="0.001" value={linking.factors[code]||1} onChange={e=>setLinking({...linking,factors:{...linking.factors,[code]:e.target.value}})}/></label>{a.price_loading?<div className="numierPricePanel loading"><span>Consultando NUMIER</span><b>Recuperando PVP…</b></div>:realPrice>0?<div className="numierPricePanel"><span>PVP recuperado automáticamente</span><b>{money(realPrice)}</b><small>{a.price_source==='catalog'?'Catálogo NUMIER':'Última venta real en NUMIER'}</small></div>:<label>PVP manual opcional<input type="number" min="0" step="0.01" placeholder="Solo si NUMIER no tiene precio" value={linking.prices[code]??''} onChange={e=>setLinking({...linking,prices:{...linking.prices,[code]:e.target.value}})}/></label>}</div>}
     </div>})}</div>
    </>}
    <button disabled={linking.selected.some(code=>numierCatalog.find(a=>String(a.article_code)===String(code))?.price_loading)} onClick={saveMultiLink}>Guardar clasificación y vínculos</button>
   </div>
  </div>}
 </div>
}

function Settings(){
 const[settings,setSettings]=useState(null);
 const[runtime,setRuntime]=useState([]);
 const[runtimeError,setRuntimeError]=useState('');
 useEffect(()=>{
  supabase?.from('settings').select('*').single().then(({data})=>setSettings(data));
  loadRuntime();
  const t=setInterval(loadRuntime,15000);
  return()=>clearInterval(t);
 },[]);
 async function loadRuntime(){
  if(!supabase)return;
  const{data,error}=await supabase.from('colibri_runtime_status').select('*').order('heartbeat_at',{ascending:false});
  if(error){setRuntimeError(error.message);return}
  setRuntime(data||[]);setRuntimeError('');
 }
 async function save(){const{error}=await supabase.from('settings').upsert(settings);if(error)alert(error.message);else alert('Guardado')}
 const guardian=runtime.find(x=>x.status_key==='guardian');
 const sync=runtime.find(x=>x.status_key==='sync');
 const age=(date)=>date?Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/1000)):99999;
 const guardianOnline=guardian&&age(guardian.heartbeat_at)<120;
 const syncOnline=sync&&age(sync.heartbeat_at)<150;
 const statusClass=v=>v?'runtimeOk':'runtimeBad';
 if(!settings)return <div className="card">Cargando...</div>;
 return <div className="settingsPage">
  <div className="card">
   <h2>Configuración</h2>
   <label>Latitud<input value={settings.bar_lat} onChange={e=>setSettings({...settings,bar_lat:e.target.value})}/></label>
   <label>Longitud<input value={settings.bar_lng} onChange={e=>setSettings({...settings,bar_lng:e.target.value})}/></label>
   <label>Radio metros<input value={settings.gps_radius_m} onChange={e=>setSettings({...settings,gps_radius_m:e.target.value})}/></label>
   <button onClick={save}>Guardar</button>
  </div>
  <div className="card runtimePanel">
   <div className="row between">
    <div><h2>Colibrí Sync Guardian</h2><p>Estado del TPV y la sincronización en este restaurante.</p></div>
    <button onClick={loadRuntime}>Actualizar estado</button>
   </div>
   {runtimeError&&<div className="runtimeWarn">Ejecuta el SQL RC 3.9.3 para activar el diagnóstico: {runtimeError}</div>}
   <div className="runtimeGrid">
    <div className={statusClass(guardianOnline)}><span>Guardian</span><b>{guardianOnline?'ACTIVO':'SIN CONTACTO'}</b><small>{guardian?.heartbeat_at?secondsAgo(guardian.heartbeat_at):'Sin datos'}</small></div>
    <div className={statusClass(Boolean(guardian?.numier_running))}><span>NUMIER</span><b>{guardian?.numier_running?'EJECUTÁNDOSE':'DETENIDO'}</b><small>{guardian?.equipment_name||guardian?.machine_name||'-'}</small></div>
    <div className={statusClass(Boolean(guardian?.sync_running||syncOnline))}><span>Colibrí Sync</span><b>{guardian?.sync_running||syncOnline?'ACTIVO':'DETENIDO'}</b><small>{sync?.version||guardian?.version||'-'}</small></div>
    <div className={statusClass(syncOnline)}><span>Último heartbeat</span><b>{syncOnline?'ONLINE':'ATRASADO'}</b><small>{sync?.heartbeat_at?secondsAgo(sync.heartbeat_at):'Sin datos'}</small></div>
   </div>
   <div className="runtimeDetails">
    <p><b>Equipo:</b> {guardian?.equipment_name||guardian?.machine_name||sync?.machine_name||'Sin identificar'}</p>
    <p><b>Estado:</b> {guardian?.state||sync?.state||'Sin datos'}</p>
    <p><b>Último reinicio Sync:</b> {guardian?.last_sync_restart_at?new Date(guardian.last_sync_restart_at).toLocaleString('es-ES'):'-'}</p>
    <p><b>Último reinicio NUMIER:</b> {guardian?.last_numier_restart_at?new Date(guardian.last_numier_restart_at).toLocaleString('es-ES'):'-'}</p>
    {(guardian?.last_error||sync?.last_error)&&<p className="runtimeError"><b>Último error:</b> {guardian?.last_error||sync?.last_error}</p>}
   </div>
  </div>
  <div className="card qrprint"><h3>QR físico del bar</h3><p>Imprime este código y colócalo en zona de personal.</p><img src="/qr_bar_colibri.png"/></div>
 </div>
}


class ModuleErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('Error módulo',this.props.name,error,info)}
 render(){if(this.state.error)return <div className="card"><h2>⚠️ Error en {this.props.name}</h2><p>El módulo ha fallado, pero el ERP sigue operativo.</p><pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error?.message||this.state.error)}</pre><button onClick={()=>{localStorage.removeItem('colibriSchedule');localStorage.removeItem('colibriScheduleEmployees');this.setState({error:null});location.reload()}}>Reiniciar datos locales del cuadrante</button></div>;return this.props.children}
}

function App(){const host=location.hostname;const onlyClock=host.startsWith('fichar.')||location.pathname.includes('fichar');const [authed,setAuthed]=useState(false);return <>{onlyClock?<PeoplePortal supabase={supabase} Brand={Brand}/>:<>{!authed?<Login onOk={()=>setAuthed(true)}/>:<Manager/>}</>}</>}
function Login({onOk}){const[pin,setPin]=useState('');return <main className="login"><Brand/><div className="card narrow"><h2>Acceso Manager</h2><input placeholder="Clave gerente" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={()=>pin===ADMIN_PIN?onOk():alert('Clave incorrecta')}>Entrar</button><a href="/fichar" className="muted">Ir a fichaje empleados</a></div></main>}
function Brand(){return <div className="brand"><div className="brandMark"><img src="/colibri-brand.png" onError={e=>e.currentTarget.style.display='none'}/></div><div><h1>Colibrí <span>ERP</span></h1><p>Brasería El Colibrí</p></div></div>}
function Manager(){
 const initial=history.state?.colibriRoute||{tab:'dashboard',section:null,payload:null};
 const[route,setRoute]=useState(initial);
 const tabs=[['dashboard','⌂','Dashboard'],['servicio','◉','Centro mando'],['inteligencia','✦','Inteligencia'],['tpv','▣','TPV'],['gestoria','▤','Gestoría'],['rentabilidad','€','Rentabilidad'],['empleados','♟','Empleados'],['fichajes','◷','Fichajes'],['cuadrantes','▦','Cuadrantes'],['comparador','⇄','Comparador'],['config','⚙','Configuración']];
 useEffect(()=>{const onPop=e=>setRoute(e.state?.colibriRoute||{tab:'dashboard',section:null,payload:null});addEventListener('popstate',onPop);return()=>removeEventListener('popstate',onPop)},[]);
 function navigate(tab,section=null,payload=null,{replace=false}={}){const next={tab,section,payload};setRoute(next);const fn=replace?'replaceState':'pushState';history[fn]({...(history.state||{}),colibriRoute:next},'',location.href);requestAnimationFrame(()=>scrollTo({top:0,behavior:'smooth'}));}
 const tab=route.tab;
 return <div className="erpShell"><aside className="erpSidebar"><Brand/><nav className="sideNav">{tabs.map(([id,icon,label])=><button className={tab===id?'active':''} onClick={()=>navigate(id)} key={id}><span>{icon}</span><b>{label}</b></button>)}</nav><div className="sidebarFooter"><div className="userAvatar">A</div><div><b>Alfonso</b><small>Gerencia</small></div></div></aside><main className="erpMain"><div className="mobileTop"><Brand/></div><section className="page"><ModuleErrorBoundary key={`${tab}-${route.section||''}-${JSON.stringify(route.payload||{})}`} name={tab}>{tab==='dashboard'&&<Dashboard onNavigate={navigate}/>} {tab==='servicio'&&<CommandCenter initialView={route.section||'plano'} focusAccount={route.payload}/>} {tab==='inteligencia'&&<BusinessIntelligence/>}{tab==='empleados'&&<Employees/>}{tab==='fichajes'&&<ClockPanel/>}{tab==='cuadrantes'&&<Schedule/>}{tab==='comparador'&&<Compare/>}{tab==='tpv'&&<TPV/>}{tab==='gestoria'&&<Gestoria/>}{tab==='rentabilidad'&&<Profitability/>}{tab==='config'&&<Settings/>}</ModuleErrorBoundary></section></main></div>}

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
 const[state,setState]=useState({tickets:[],lines:[],costMap:new Map(),clock:[],real:null,month:null,closure:null,prev:null,avgSameDay:0,goal:null,service:{open:[],audit:[]},loading:true,error:null});
 useEffect(()=>{load();const t=setInterval(()=>{if(date===today())load(false)},30000);return()=>clearInterval(t)},[date]);
 async function load(show=true){
  if(!supabase){setState(s=>({...s,error:'Supabase no configurado',loading:false}));return}
  if(show)setState(s=>({...s,loading:true}));
  try{
   const next=addDays(date,1),start=date+'T00:00:00',end=next+'T00:00:00';
   const monthStart=date.slice(0,7)+'-01',monthEnd=addDays(date,1);
   const sameDays=[addDays(date,-7),addDays(date,-14),addDays(date,-21),addDays(date,-28)];
   const [rangeData,costMap,clockRes,prevData,serviceData,closure,...avgData]=await Promise.all([
    loadSalesRange(date,next),loadProfitabilityCostMap(),
    supabase.from('clock_records').select('*').gte('created_at',start).lt('created_at',end).order('created_at',{ascending:true}).limit(1000),
    loadSalesForDate(addDays(date,-7)),date===today()?loadServiceState():Promise.resolve({open:[],audit:[],status:null}),loadCashClosure(date),
    ...sameDays.map(d=>loadSalesForDate(d))
   ]);
   const clocks=clockRes.data||[];
   const real=await loadRealProfitability(supabase,date,next,clocks);
   const monthSales=await loadSalesRange(monthStart,monthEnd);
   const monthClock=(await supabase.from('clock_records').select('*').gte('created_at',monthStart+'T00:00:00').lt('created_at',monthEnd+'T00:00:00').order('created_at',{ascending:true}).limit(10000)).data||[];
   const monthReal=await loadRealProfitability(supabase,monthStart,monthEnd,monthClock);
   const monthFin=periodFinancials(monthSales.lines||[],costMap);
   const monthSummary=summarizeTickets(monthSales.tickets||[]);
   const monthProfit=monthSummary.total-monthFin.cost-monthReal.laborAccrued-monthReal.fixed-monthReal.variable;
   const summary=summarizeTickets(rangeData.tickets||[]);
   const smart=await loadSmartGoal(date,summary.total);
   const avgTotals=avgData.map(x=>Number(x?.daily?.total||0)).filter(v=>v>0);
   setState({tickets:rangeData.tickets||[],lines:rangeData.lines||[],costMap,clock:clocks,real,month:{summary:monthSummary,fin:monthFin,real:monthReal,profit:monthProfit},closure,prev:prevData.daily||null,avgSameDay:avgTotals.length?avgTotals.reduce((a,b)=>a+b,0)/avgTotals.length:0,goal:smart,service:serviceData||{open:[],audit:[]},loading:false,error:null});
  }catch(e){setState(s=>({...s,loading:false,error:e.message||String(e)}))}
 }
 const summary=summarizeTickets(state.tickets),productFin=periodFinancials(state.lines,state.costMap),real=state.real||{fixed:0,variable:0,laborAccrued:0,hours:0};
 const gross=summary.total-productFin.cost,realProfit=gross-real.laborAccrued-real.fixed-real.variable,realMargin=summary.total?realProfit/summary.total*100:0;
 const objective=Number(state.goal?.goal||750),goalPct=objective?Math.min(100,summary.total/objective*100):0,vsPrev=pctDiff(summary.total,state.prev?.total),vsAvg=pctDiff(summary.total,state.avgSameDay);
 const open=state.service?.open||[],terrace=open.filter(o=>o.zona==='terraza'),salon=open.filter(o=>o.zona==='salon'),barra=open.filter(o=>o.zona==='barra');
 const totalPending=open.reduce((a,o)=>a+Number(o.total||0),0),oldest=open.length?Math.max(...open.map(o=>minutesOpen(o.opened_at))):0;
 const occTerrace=Math.round(terrace.length/15*100),occSalon=Math.round(salon.length/8*100);
 const laborPct=summary.total?real.laborAccrued/summary.total*100:0,productPct=summary.total?productFin.cost/summary.total*100:0;
 const missingCost=Number(productFin.unknownRevenue||0);
 const alerts=[];
 if(missingCost>0)alerts.push({tone:'warning',icon:'⚠️',title:'Costes pendientes',text:`Hay ${money(missingCost)} en ventas de productos sin coste configurado.`,tab:'rentabilidad'});
 if(date<today()&&!state.closure)alerts.push({tone:'warning',icon:'🧾',title:'Cierre pendiente',text:`No hay cierre de caja guardado para ${fmtDate(date)}.`,tab:'tpv'});
 if(laborPct>35)alerts.push({tone:'critical',icon:'👥',title:'Personal elevado',text:`El personal estimado representa el ${laborPct.toFixed(1)}% de las ventas.`,tab:'inteligencia'});
 if(realProfit<0&&summary.total>0)alerts.push({tone:'critical',icon:'📉',title:'Día en pérdidas',text:`El resultado real estimado es ${money(realProfit)}.`,tab:'inteligencia'});
 if(oldest>=75)alerts.push({tone:'warning',icon:'⏱️',title:'Cuenta antigua',text:`La cuenta más antigua lleva ${durationShort(oldest)} abierta.`,tab:'servicio'});
 if(!alerts.length)alerts.push({tone:'ok',icon:'✅',title:'Sin incidencias relevantes',text:'Ventas, costes y operativa están dentro de los parámetros actuales.',tab:'inteligencia'});
 const daysElapsed=Math.max(1,new Date(date+'T12:00:00').getDate()),daysMonth=new Date(new Date(date+'T12:00:00').getFullYear(),new Date(date+'T12:00:00').getMonth()+1,0).getDate();
 const monthProjection=state.month?state.month.profit/daysElapsed*daysMonth:0;
 const topProduct=productRank(state.lines,'qty',new Map())[0];
 const go=(tab,section=null,payload=null)=>onNavigate?.(tab,section,payload);
 const kpi=(cls,label,value,sub,tab)=><button className={'dash5Kpi '+cls} onClick={()=>go(tab)}><span>{label}</span><b>{value}</b><small>{sub}</small></button>;
 return <div className="dashboard5">
  <section className="dash5Hero"><div><span>COLIBRÍ 5.0 · DIRECCIÓN DEL NEGOCIO</span><h1>{getGreeting()}, Alfonso</h1><p>{fmtDate(date)} · Resultado real y estado operativo</p></div><div className="dash5Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={()=>load()}>{state.loading?'Actualizando…':'Actualizar'}</button></div></section>
  {state.error&&<div className="card error">{state.error}</div>}
  <section className="dash5Kpis">
   {kpi('sales','Ventas',money(summary.total),`${formatPct(vsPrev)} vs mismo día anterior`,'tpv')}
   {kpi(realProfit>=0?'profit':'loss','Beneficio real estimado',money(realProfit),`${realMargin.toFixed(1)}% de margen real`,'inteligencia')}
   {kpi('margin','Margen bruto',money(gross),`${productPct.toFixed(1)}% coste de producto`,'rentabilidad')}
   {kpi('goal','Objetivo diario',`${goalPct.toFixed(0)}%`,`${money(summary.total)} de ${money(objective)}`,'inteligencia')}
  </section>
  <div className="dash5Goal"><div><span>Progreso del objetivo</span><b>{money(Math.max(0,objective-summary.total))} para alcanzarlo</b></div><div className="dash5GoalTrack"><i style={{width:`${goalPct}%`}}/></div><small>Vs media de cuatro semanas: <b className={(vsAvg||0)>=0?'ok':'bad'}>{formatPct(vsAvg)}</b></small></div>
  <section className="dash5Grid">
   <article className="card dash5Result"><div className="dash5Title"><div><span>RESULTADO REAL DE HOY</span><h2>Cuenta de resultados</h2></div><button onClick={()=>go('rentabilidad')}>Ver rentabilidad</button></div>
    <div className="dash5ResultRows"><p><span>Ventas</span><b>{money(summary.total)}</b></p><p><span>Coste de productos</span><b>- {money(productFin.cost)}</b></p><p><span>Margen bruto</span><b>{money(gross)}</b></p><p><span>Personal estimado ({Number(real.hours||0).toFixed(1)} h × 7 €)</span><b>- {money(real.laborAccrued)}</b></p><p><span>Gastos fijos imputados</span><b>- {money(real.fixed)}</b></p><p><span>Gastos variables</span><b>- {money(real.variable)}</b></p><p className="total"><span>Beneficio real estimado</span><b className={realProfit>=0?'ok':'bad'}>{money(realProfit)}</b></p></div>
   </article>
   <article className="card dash5Alerts"><div className="dash5Title"><div><span>ATENCIÓN HOY</span><h2>{alerts.length===1&&alerts[0].tone==='ok'?'Todo controlado':`${alerts.length} asuntos a revisar`}</h2></div></div>{alerts.slice(0,5).map((a,i)=><button className={'dash5Alert '+a.tone} key={i} onClick={()=>go(a.tab)}><span>{a.icon}</span><div><b>{a.title}</b><p>{a.text}</p></div><i>›</i></button>)}</article>
  </section>
  <section className="dash5Grid three">
   <article className="card dash5Service" onClick={()=>go('servicio','plano')}><div className="dash5Title"><div><span>SERVICIO AHORA</span><h2>Estado operativo</h2></div></div><div className="dash5MiniGrid"><div><span>Mesas abiertas</span><b>{terrace.length+salon.length}</b></div><div><span>Barra</span><b>{barra.length}</b></div><div><span>Pendiente</span><b>{money(totalPending)}</b></div><div><span>Más antigua</span><b>{durationShort(oldest)}</b></div></div><p>Terraza {terrace.length}/15 · Salón {salon.length}/8 · Barra {barra.length} cuentas</p></article>
   <article className="card dash5Summary" onClick={()=>go('tpv')}><div className="dash5Title"><div><span>RESUMEN DEL DÍA</span><h2>Ventas y clientes</h2></div></div><div className="dash5MiniGrid"><div><span>Tickets</span><b>{summary.tickets}</b></div><div><span>Ticket medio</span><b>{money(summary.ticket_medio)}</b></div><div><span>Producto líder</span><b>{topProduct?.name||'—'}</b></div><div><span>Cierre</span><b>{state.closure?'Realizado':'Pendiente'}</b></div></div></article>
   <article className="card dash5Month" onClick={()=>go('inteligencia')}><div className="dash5Title"><div><span>PREVISIÓN DEL MES</span><h2>Beneficio proyectado</h2></div></div><b className={monthProjection>=0?'ok':'bad'}>{money(monthProjection)}</b><p>Resultado acumulado: <strong>{money(state.month?.profit||0)}</strong></p><p>Ventas acumuladas: <strong>{money(state.month?.summary?.total||0)}</strong></p><small>Proyección basada en el ritmo real del mes, incluidos productos, personal y gastos.</small></article>
  </section>
  <nav className="dashboardQuickActions"><button onClick={()=>go('servicio','plano')}><span>▦</span>Servicio</button><button onClick={()=>go('tpv')}><span>€</span>TPV</button><button onClick={()=>go('inteligencia')}><span>✦</span>Inteligencia</button><button onClick={()=>go('rentabilidad')}><span>↗</span>Rentabilidad</button><button onClick={()=>go('cuadrantes')}><span>▦</span>Cuadrantes</button></nav>
 </div>
}
function Employees(){const[employees,setEmployees]=useState([]);const[name,setName]=useState('');const[pin,setPin]=useState('');useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data}=await supabase.from('employees').select('*').order('name');setEmployees(data||[])}async function add(){if(!name||!pin)return alert('Nombre y PIN');const color=EMP_COLORS[employees.length%EMP_COLORS.length];const{error}=await supabase.from('employees').insert({name,pin,role:'empleado',color,can_clock:true,active:true});if(error)alert(error.message);setName('');setPin('');load()}async function update(e,patch){const{error}=await supabase.from('employees').update(patch).eq('id',e.id);if(error)alert(error.message);load()}return <div className="card"><h2>Empleados</h2><div className="row"><input placeholder="Nuevo empleado" value={name} onChange={e=>setName(e.target.value)}/><input placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={add}>Añadir</button></div>{employees.map(e=><div className="employee" key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><span>{e.active?'Activo':'Inactivo'}</span><input placeholder="Nuevo PIN" onBlur={ev=>ev.target.value&&update(e,{pin:ev.target.value})}/><button onClick={()=>update(e,{active:!e.active})}>{e.active?'Desactivar':'Activar'}</button></div>)}</div>}
function clockMinutesText(minutes){const m=Math.max(0,Math.round(Number(minutes||0)));return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`}
function mondayISO(date=new Date()){const d=new Date(date);d.setHours(12,0,0,0);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.toISOString().slice(0,10)}
function employeeSessions(rows){
 const ordered=[...(rows||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));const sessions=[];let open=null;
 ordered.forEach(r=>{const type=String(r.type||'').toLowerCase();if(type==='entrada'){if(open)sessions.push({...open,end:null,minutes:0,open:true});open={start:r,employee_id:r.employee_id,employee_name:r.employee_name};}else if(type==='salida'&&open){const minutes=Math.max(0,(new Date(r.created_at)-new Date(open.start.created_at))/60000);sessions.push({...open,end:r,minutes,open:false});open=null;}});
 if(open)sessions.push({...open,end:null,minutes:Math.max(0,(Date.now()-new Date(open.start.created_at))/60000),open:true});return sessions;
}
function ClockPage(){
 const[employees,setEmployees]=useState([]);const[selected,setSelected]=useState('');const[pin,setPin]=useState('');const[user,setUser]=useState(null);const[rows,setRows]=useState([]);const[schedule,setSchedule]=useState(null);const[requests,setRequests]=useState([]);const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);const[qr,setQr]=useState(false);const[tab,setTab]=useState('inicio');const[now,setNow]=useState(Date.now());const[requestOpen,setRequestOpen]=useState(false);const[requestTime,setRequestTime]=useState('');const[requestReason,setRequestReason]=useState('');const[oldPin,setOldPin]=useState('');const[newPin,setNewPin]=useState('');
 useEffect(()=>{loadEmployees();const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t)},[]);
 useEffect(()=>{if(user)loadPortal(user)},[user]);
 async function loadEmployees(){if(!supabase){setMsg('Supabase no configurado');return}const{data,error}=await supabase.from('employees').select('*').eq('active',true).eq('can_clock',true).order('name');if(error)setMsg('❌ '+error.message);setEmployees(data||[])}
 async function login(){const e=employees.find(x=>String(x.id)===String(selected));if(!e||!pin)return setMsg('Selecciona tu nombre e introduce tu PIN.');if(String(e.pin||'')!==String(pin))return setMsg('❌ PIN incorrecto.');sessionStorage.setItem('colibri_employee',JSON.stringify({id:e.id,name:e.name}));setUser(e);setMsg('');}
 async function loadPortal(e){setBusy(true);const from=addDays(today(),-70)+'T00:00:00';const [{data:clockData,error:clockError},{data:scheduleData},{data:reqData}]=await Promise.all([
  supabase.from('clock_records').select('*').or(`employee_id.eq.${e.id},employee_name.eq.${e.name}`).gte('created_at',from).order('created_at',{ascending:true}).limit(1500),
  supabase.from('work_schedule_weeks').select('*').eq('restaurant_id','colibri').eq('week_id',week()).maybeSingle(),
  supabase.from('employee_time_requests').select('*').eq('employee_id',e.id).order('created_at',{ascending:false}).limit(50)
 ]);if(clockError)setMsg('❌ '+clockError.message);setRows(clockData||[]);setSchedule(scheduleData||null);setRequests(reqData||[]);setBusy(false)}
 async function clock(type,method='gps'){if(!user)return;setBusy(true);setMsg('Comprobando ubicación...');let coords=null;if(method==='gps'){try{coords=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));}catch{setQr(true);setBusy(false);return setMsg('No se pudo obtener el GPS. Usa el QR físico del bar.')}}const payload={p_employee_name:user.name,p_pin:pin,p_type:type,p_note:'Portal del empleado',p_gps_lat:coords?.coords?.latitude||null,p_gps_lng:coords?.coords?.longitude||null,p_accuracy:coords?.coords?.accuracy||null,p_method:method};const{data,error}=await supabase.rpc('registrar_fichaje_v2',payload);setBusy(false);if(error)return setMsg('❌ '+error.message);setMsg((data?.ok?'✅ ':'❌ ')+(data?.message||'Respuesta recibida')+(data?.distance_m?` · Distancia ${Math.round(data.distance_m)} m`:''));if(!data?.ok&&data?.outside_radius)setQr(true);if(data?.ok)await loadPortal(user)}
 async function submitRequest(){if(!requestTime||!requestReason.trim())return setMsg('Indica la hora y explica el motivo.');setBusy(true);const proposed=new Date(`${today()}T${requestTime}:00`).toISOString();const{error}=await supabase.from('employee_time_requests').insert({employee_id:user.id,employee_name:user.name,request_type:'salida_olvidada',proposed_at:proposed,reason:requestReason.trim(),status:'pendiente'});setBusy(false);if(error)return setMsg('❌ '+error.message);setRequestOpen(false);setRequestReason('');setRequestTime('');setMsg('✅ Solicitud enviada a gerencia. No contará hasta que sea aprobada.');loadPortal(user)}
 async function changePin(){if(String(oldPin)!==String(user.pin||''))return setMsg('❌ El PIN actual no es correcto.');if(!/^\d{4,8}$/.test(newPin))return setMsg('El nuevo PIN debe tener entre 4 y 8 números.');const{error}=await supabase.from('employees').update({pin:newPin}).eq('id',user.id);if(error)return setMsg('❌ '+error.message);setPin(newPin);setUser({...user,pin:newPin});setOldPin('');setNewPin('');setMsg('✅ PIN cambiado correctamente. Gerencia seguirá pudiendo administrarlo.')}
 function logout(){sessionStorage.removeItem('colibri_employee');setUser(null);setPin('');setSelected('');setRows([]);setTab('inicio');setMsg('')}
 async function notifications(){if(!('Notification'in window))return setMsg('Este navegador no admite notificaciones.');const p=await Notification.requestPermission();setMsg(p==='granted'?'✅ Recordatorios activados en este dispositivo. Instala la web en la pantalla de inicio para una mejor experiencia.':'No se han autorizado las notificaciones.')}
 const sessions=useMemo(()=>employeeSessions(rows),[rows,now]);const latest=rows.length?rows[rows.length-1]:null;const working=String(latest?.type||'').toLowerCase()==='entrada';const weekStart=mondayISO();const weekEnd=addDays(weekStart,7);const weekSessions=sessions.filter(s=>String(s.start.created_at).slice(0,10)>=weekStart&&String(s.start.created_at).slice(0,10)<weekEnd);const weekMinutes=weekSessions.reduce((a,s)=>a+s.minutes,0);const monthKey=today().slice(0,7);const monthSessions=sessions.filter(s=>String(s.start.created_at).startsWith(monthKey));const monthMinutes=monthSessions.reduce((a,s)=>a+s.minutes,0);const closedWeekMinutes=weekSessions.filter(s=>!s.open).reduce((a,s)=>a+s.minutes,0);
 const scheduleInfo=useMemo(()=>{const out={days:{},minutes:0};const data=schedule?.data||{};DAYS.forEach(day=>{let min=0;SLOTS.forEach(slot=>{const entries=data?.[day]?.[slot]||[];if(entries.some(id=>String(id)===String(user?.id)||String(id).toLowerCase()===String(user?.name||'').toLowerCase()))min+=h(slot)*60});out.days[day]=min;out.minutes+=min});return out},[schedule,user]);
 const dayRows=DAYS.map((day,i)=>{const date=addDays(weekStart,i);const mins=weekSessions.filter(s=>String(s.start.created_at).slice(0,10)===date).reduce((a,s)=>a+s.minutes,0);return{day,date,mins,planned:scheduleInfo.days[day]||0}});const difference=weekMinutes-scheduleInfo.minutes;const punctualDays=weekSessions.filter(s=>!s.open).length;const pending=requests.filter(r=>r.status==='pendiente').length;
 function share(){const text=`*${user.name} · Resumen semanal*\n${dayRows.map(d=>`${d.day}: ${clockMinutesText(d.mins)}${d.planned?` / previsto ${clockMinutesText(d.planned)}`:''}`).join('\n')}\n\nTotal fichado: *${clockMinutesText(weekMinutes)}*\nHoras cerradas estimadas: *${clockMinutesText(closedWeekMinutes)}*\nEstimación: *${money(closedWeekMinutes/60*7)}*`;navigator.clipboard?.writeText(text);location.href=`https://wa.me/?text=${encodeURIComponent(text)}`}
 if(!user)return <main className="employeeLogin"><div className="employeeBrand"><img src="/logo_colibri.png"/><div><h1>Colibrí People</h1><p>Tu jornada, tus horas y tu tranquilidad.</p></div></div><section className="employeeLoginCard"><span className="welcomePill">Portal del empleado</span><h2>Bienvenido</h2><p>Accede a tu panel personal para fichar y consultar toda tu información.</p><label>Empleado<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecciona tu nombre</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label>PIN<input inputMode="numeric" type="password" value={pin} onChange={e=>setPin(e.target.value)} placeholder="Tu PIN personal" onKeyDown={e=>e.key==='Enter'&&login()}/></label><button className="employeePrimary" onClick={login}>Entrar en mi panel</button>{msg&&<p className="employeeMessage">{msg}</p>}<small>Tu PIN es personal. No lo compartas con otros compañeros.</small></section></main>;
 return <main className="employeePortal"><header className="employeeTop"><div><span>{working?'🟢 Jornada activa':'Hola 👋'}</span><h1>{user.name}</h1><p>{new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'})}</p></div><button onClick={logout}>Salir</button></header><nav className="employeeNav">{[['inicio','⌂','Inicio'],['semana','◷','Mi semana'],['horario','▦','Horario'],['evolucion','☆','Evolución'],['perfil','●','Perfil']].map(([id,icon,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><span>{icon}</span>{label}</button>)}</nav><section className="employeeContent">{msg&&<div className="employeeToast">{msg}</div>}{busy&&<div className="employeeLoading">Actualizando…</div>}
 {tab==='inicio'&&<><div className={'employeeHero '+(working?'working':'resting')}><div><span>{working?'Estás trabajando desde':'Ahora mismo estás'}</span><h2>{working?new Date(latest.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'Fuera de jornada'}</h2><p>{working?`Llevas ${clockMinutesText((now-new Date(latest.created_at))/60000)}`:'Todo correcto. Ficha cuando comience tu turno.'}</p></div><div className="heroClock">{working?'⏱️':'☀️'}</div></div><div className="employeeClockActions">{!working?<button className="clockIn" onClick={()=>clock('entrada')}>Fichar entrada GPS</button>:<button className="clockOut" onClick={()=>clock('salida')}>Fichar salida GPS</button>}<button className="clockQr" onClick={()=>setQr(!qr)}>Usar QR</button></div>{qr&&<div className="employeeQr"><p>Usa el QR físico del bar como respaldo.</p><button onClick={()=>clock(working?'salida':'entrada','qr')}>{working?'Salida QR':'Entrada QR'}</button></div>}<div className="employeeKpis"><article><span>Esta semana</span><b>{clockMinutesText(weekMinutes)}</b><small>de {clockMinutesText(scheduleInfo.minutes)} previstas</small></article><article><span>Estimación</span><b>{money(closedWeekMinutes/60*7)}</b><small>7 €/h cerrada</small></article><article><span>Este mes</span><b>{clockMinutesText(monthMinutes)}</b><small>{monthSessions.length} jornadas</small></article><article><span>Solicitudes</span><b>{pending}</b><small>pendientes</small></article></div><div className="employeeCard progressCard"><div><h3>Tu progreso semanal</h3><p>{scheduleInfo.minutes?difference>=0?`Has alcanzado el horario previsto. ${clockMinutesText(difference)} adicionales pendientes de revisión.`:`Te quedan ${clockMinutesText(Math.abs(difference))} según el cuadrante.`:'Consulta tus fichajes y tu evolución.'}</p></div><div className="employeeProgress"><i style={{width:`${Math.min(100,scheduleInfo.minutes?weekMinutes/scheduleInfo.minutes*100:0)}%`}}></i></div></div><div className="employeeQuick"><button onClick={()=>setRequestOpen(true)}>📝 Olvidé fichar salida</button><button onClick={share}>📲 Compartir resumen</button><button onClick={notifications}>🔔 Activar recordatorios</button></div></>}
 {tab==='semana'&&<div className="employeeCard"><div className="sectionTitle"><div><span>Resumen personal</span><h2>Mi semana</h2></div><button onClick={share}>WhatsApp</button></div><div className="weekList">{dayRows.map(d=><div key={d.day}><span><b>{d.day}</b><small>{new Date(d.date+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}</small></span><em>{clockMinutesText(d.mins)}</em><small>Previsto {clockMinutesText(d.planned)}</small><i className={d.planned&&Math.abs(d.mins-d.planned)<=15?'good':d.mins?'warn':''}>{d.mins?'✓':'—'}</i></div>)}</div><div className="weekTotal"><span>Total fichado</span><b>{clockMinutesText(weekMinutes)}</b><span>Estimación cerrada</span><b>{money(closedWeekMinutes/60*7)}</b></div></div>}
 {tab==='horario'&&<div className="employeeCard"><div className="sectionTitle"><div><span>Cuadrante publicado</span><h2>Mi horario</h2></div></div>{schedule?<div className="schedulePersonal">{dayRows.map(d=><article key={d.day} className={d.planned?'hasShift':''}><b>{d.day}</b><span>{d.planned?clockMinutesText(d.planned):'Libre'}</span>{d.planned&&<small>{SLOTS.filter(slot=>(schedule.data?.[d.day]?.[slot]||[]).some(id=>String(id)===String(user.id)||String(id).toLowerCase()===String(user.name).toLowerCase())).join(' · ')}</small>}</article>)}</div>:<p>No hay un cuadrante publicado para esta semana.</p>}</div>}
 {tab==='evolucion'&&<><div className="employeeKpis evolution"><article><span>Jornadas cerradas</span><b>{punctualDays}</b><small>últimos 70 días</small></article><article><span>Horas del mes</span><b>{clockMinutesText(monthMinutes)}</b><small>control personal</small></article><article><span>Fichajes correctos</span><b>{Math.max(0,100-Math.min(100,pending*10))}%</b><small>según incidencias</small></article><article><span>Olvidos pendientes</span><b>{pending}</b><small>por revisar</small></article></div><div className="employeeCard"><h2>Mi evolución</h2><p className="positiveCopy">Cada fichaje correcto mejora tu resumen y evita dudas al cerrar la semana.</p><div className="achievement">🏅 <div><b>{punctualDays} jornadas registradas</b><span>Tu historial personal está siempre disponible.</span></div></div><div className="achievement">🎯 <div><b>{pending===0?'Todo al día':'Tienes solicitudes pendientes'}</b><span>{pending===0?'No hay correcciones esperando revisión.':'Gerencia debe validarlas antes de que cuenten.'}</span></div></div></div></>}
 {tab==='perfil'&&<><div className="employeeCard profileCard"><div className="profileAvatar">{user.name?.[0]||'E'}</div><h2>{user.name}</h2><p>Empleado activo · Acceso personal</p><button onClick={notifications}>Activar notificaciones</button></div><div className="employeeCard"><h2>Cambiar mi PIN</h2><p>El PIN debe ser personal. Gerencia siempre podrá verlo, restablecerlo o bloquear tu acceso.</p><label>PIN actual<input type="password" inputMode="numeric" value={oldPin} onChange={e=>setOldPin(e.target.value)}/></label><label>Nuevo PIN<input type="password" inputMode="numeric" value={newPin} onChange={e=>setNewPin(e.target.value)}/></label><button className="employeePrimary" onClick={changePin}>Guardar nuevo PIN</button></div><div className="employeeCard"><h2>Mis solicitudes</h2>{requests.length===0?<p>No tienes solicitudes registradas.</p>:requests.map(r=><div className="requestRow" key={r.id}><span><b>{r.request_type==='salida_olvidada'?'Salida olvidada':'Corrección'}</b><small>{new Date(r.proposed_at||r.created_at).toLocaleString('es-ES')}</small></span><em className={r.status}>{r.status}</em></div>)}</div></>}
 </section>{requestOpen&&<div className="employeeModal"><div><button className="modalClose" onClick={()=>setRequestOpen(false)}>×</button><span className="welcomePill">Solicitud a gerencia</span><h2>Olvidé fichar la salida</h2><p>No pasa nada. Indica la hora real y cuéntanos qué ocurrió. No sumará hasta que gerencia la apruebe.</p><label>Hora aproximada<input type="time" value={requestTime} onChange={e=>setRequestTime(e.target.value)}/></label><label>Motivo<textarea value={requestReason} onChange={e=>setRequestReason(e.target.value)} placeholder="Ej.: Se me olvidó fichar al terminar de cerrar la caja."/></label><button className="employeePrimary" onClick={submitRequest}>Enviar para revisión</button></div></div>}</main>
}
function ClockPanel(){const[rows,setRows]=useState([]);const[open,setOpen]=useState([]);useEffect(()=>{load()},[]);async function load(){if(!supabase)return;const{data,error}=await supabase.from('clock_records').select('*').order('created_at',{ascending:false}).limit(500);if(error){alert(error.message);return}const list=data||[];setRows(list);const latest=new Map();list.forEach(r=>{if(!latest.has(r.employee_id||r.employee_name))latest.set(r.employee_id||r.employee_name,r)});setOpen([...latest.values()].filter(r=>r.type==='entrada'))}async function closeManual(r){const now=new Date();const suggested=now.toISOString().slice(0,16);const value=prompt(`Hora de salida real para ${r.employee_name} (formato YYYY-MM-DDTHH:mm)`,suggested);if(!value)return;const reason=prompt('Motivo del cierre manual','Olvido de fichaje')||'Cierre manual por manager';const exitIso=new Date(value).toISOString();const {error}=await supabase.from('clock_records').insert({employee_id:r.employee_id,employee_name:r.employee_name,type:'salida',method:'manual',inside_radius:true,note:`SALIDA MANUAL POR MANAGER · ${reason}`,created_at:exitIso});if(error){alert(error.message);return}alert('Turno cerrado manualmente');load()}const expected=expectedStartMapToday();const entradaRows=rows.filter(r=>String(r.type).toLowerCase()==='entrada');const late5=entradaRows.filter(r=>punctualityFor(r,expected).cls==='late5').length;const late10=entradaRows.filter(r=>punctualityFor(r,expected).cls==='late10').length;return <div className="grid"><div className="card"><h2>Fichajes abiertos</h2><button onClick={load}>Actualizar</button>{open.length===0&&<p>✅ No hay turnos abiertos.</p>}{open.map(r=><div className="employee" key={r.id}><b>{r.employee_name}</b><span>Entrada: {new Date(r.created_at).toLocaleString()}</span><span>{Math.max(0,((Date.now()-new Date(r.created_at))/3600000)).toFixed(1)} h abierto</span><button className="red" onClick={()=>closeManual(r)}>Cerrar turno</button></div>)}</div><div className="card"><h2>Puntualidad</h2><p>🟢 Puntual · 🟡 +5 min · ⚠️ +10 min · 🔴 Salida</p><p>Entradas amarillas: <b>{late5}</b></p><p>Alertas +10 min: <b>{late10}</b></p><p className="mutedText">La puntualidad se compara con el cuadrante semanal guardado en este navegador.</p></div><div className="card wide"><h2>Historial de fichajes</h2><table><tbody>{rows.slice(0,160).map(r=>{const p=punctualityFor(r,expected);return <tr key={r.id} className={'clockRow '+p.cls}><td>{new Date(r.created_at).toLocaleString()}</td><td>{r.employee_name}</td><td>{p.icon} {p.label}</td><td>{r.type}</td><td>{r.method}</td><td>{r.note||''}</td><td>{r.distance_m?Math.round(r.distance_m)+' m':''}</td></tr>})}</tbody></table></div></div>}


function paymentLabel(t){const p=String(t.forma_pago||'').toUpperCase();return p==='E'?'Efectivo':p==='T'?'Tarjeta':p==='A'?'Ambas':p==='CH'?'Cheque':p||'-'}
function ticketStatusLabel(t){const e=String(t.estado||'C').toUpperCase();return e==='X'?'Anulado':e==='G'?'Gasto':e==='C'?'Cobrado':e}
function cashClosureKey(date){return `colibri_cash_closure_${date}`}
async function loadCashClosure(date){
 if(supabase){const {data,error}=await supabase.from('numier_cash_closures').select('*').eq('fecha',date).maybeSingle();if(!error&&data)return data;}
 try{return JSON.parse(localStorage.getItem(cashClosureKey(date))||'null')}catch{return null}
}
async function saveCashClosure(row){
 const complete={...row,updated_at:new Date().toISOString()};
 localStorage.setItem(cashClosureKey(row.fecha),JSON.stringify(complete));
 if(supabase){const {error}=await supabase.from('numier_cash_closures').upsert(complete,{onConflict:'fecha'});if(error&&!String(error.message||'').toLowerCase().includes('does not exist'))throw error;}
 return complete;
}
async function listCashClosures(){
 if(supabase){const {data,error}=await supabase.from('numier_cash_closures').select('*').order('fecha',{ascending:false}).limit(365);if(!error)return data||[];}
 const rows=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('colibri_cash_closure_')){try{rows.push(JSON.parse(localStorage.getItem(k)))}catch{}}}return rows.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
}
async function loadPulseData(){
 if(!supabase)return {recent:[],previous:[],error:'Supabase no configurado'};
 const end=addDays(today(),1),mid=addDays(today(),-6),from=addDays(today(),-13);
 const {data,error}=await supabase.from('numier_tickets').select('*').gte('hora',from+'T00:00:00').lt('hora',end+'T00:00:00').order('hora',{ascending:true}).limit(20000);
 const all=data||[];return {recent:all.filter(t=>String(t.hora||'').slice(0,10)>=mid),previous:all.filter(t=>String(t.hora||'').slice(0,10)<mid),error:error?.message||null};
}
function pctChange(a,b){return b?((a-b)/b)*100:(a>0?100:0)}
function signPct(v){return `${v>=0?'+':''}${v.toFixed(1)}%`}
function TPVSummary({date,daily,tickets,onTicket,pulse,comparison,closure,onOpenControl}){
 const prev=summarizeTickets(pulse.previous||[]),recent=summarizeTickets(pulse.recent||[]);const growth=pctChange(recent.total,prev.total);
 const comp=summarizeTickets(comparison||[]);const dayGrowth=pctChange(Number(daily?.total||0),comp.total);
 const anulados=tickets.filter(t=>String(t.estado||'').toUpperCase()==='X');const gastos=tickets.filter(t=>String(t.estado||'').toUpperCase()==='G');
 const paid=tickets.filter(t=>!['X','G'].includes(String(t.estado||'C').toUpperCase()));
 const avg=Number(daily?.ticket_medio||0);const unusual=paid.filter(t=>Number(t.total||0)>=Math.max(50,avg*3));
 const low=paid.filter(t=>Number(t.total||0)>0&&Number(t.total||0)<=2);
 return <>
  <div className="tpvKpis tpv5Kpis">
   <button className="card kpi tpv5KpiButton" onClick={onOpenControl}><span>💶 Ventas</span><b>{money(daily?.total)}</b><small>Vs. mismo día: <strong className={dayGrowth>=0?'ok':'bad'}>{signPct(dayGrowth)}</strong></small></button>
   <button className="card kpi tpv5KpiButton" onClick={onOpenControl}><span>🎫 Tickets</span><b>{daily?.tickets||tickets.length}</b><small>{comp.tickets?`${daily?.tickets||0-comp.tickets>=0?'+':''}${(daily?.tickets||0)-comp.tickets} vs. semana anterior`:'Sin referencia'}</small></button>
   <button className="card kpi tpv5KpiButton" onClick={onOpenControl}><span>📊 Ticket medio</span><b>{money(daily?.ticket_medio)}</b><small>Referencia: {money(comp.ticket_medio)}</small></button>
   <div className="card kpi"><span>💵 Efectivo</span><b>{money(daily?.efectivo)}</b><small>{daily?.total?`${(Number(daily.efectivo||0)/Number(daily.total)*100).toFixed(1)}% de ventas`:'—'}</small></div>
   <div className="card kpi"><span>💳 Tarjeta</span><b>{money(daily?.tarjeta)}</b><small>{daily?.total?`${(Number(daily.tarjeta||0)/Number(daily.total)*100).toFixed(1)}% de ventas`:'—'}</small></div>
   <button className="card kpi tpv5KpiButton" onClick={onOpenControl}><span>🧭 Control</span><b className={(anulados.length||gastos.length||unusual.length)?'bad':'ok'}>{anulados.length+gastos.length+unusual.length}</b><small>incidencias a revisar</small></button>
  </div>
  <div className="grid tpvOverviewGrid"><div className="card"><h2>Ventas por hora</h2><SalesByHour tickets={paid}/><p className="mutedText">Comparación del día: <b className={dayGrowth>=0?'ok':'bad'}>{signPct(dayGrowth)}</b> frente al mismo día de la semana anterior.</p></div><div className="card"><h2>Estado del día</h2><div className="reportGrid"><p><span>Anulados</span><b className={anulados.length?'bad':''}>{anulados.length}</b></p><p><span>Importe anulado</span><b>{money(anulados.reduce((a,t)=>a+Number(t.total||0),0))}</b></p><p><span>Gastos Numier</span><b>{gastos.length}</b></p><p><span>Importe gastos</span><b>{money(gastos.reduce((a,t)=>a+Number(t.total||0),0))}</b></p><p><span>Tickets altos</span><b>{unusual.length}</b></p><p><span>Tickets ≤ 2 €</span><b>{low.length}</b></p></div><div className={'closureBadge '+(closure?'ok':'bad')}>{closure?'✅ CIERRE GUARDADO':'⚠️ CIERRE PENDIENTE'}</div><button className="tpvControlAction" onClick={onOpenControl}>Abrir control del día</button></div></div>
  <div className="card"><div className="row between"><div><h2>Últimos tickets</h2><p className="mutedText">Control rápido del contenido real de cada venta.</p></div></div><div className="tableScroll"><table><thead><tr><th>Hora</th><th>Ticket</th><th>Pago</th><th>Total</th></tr></thead><tbody>{tickets.slice(-12).reverse().map(t=><tr className="clickable" key={t.id||t.cab_id} onClick={()=>onTicket(t.cab_id)}><td>{t.hora?new Date(t.hora).toLocaleTimeString('es-ES'):''}</td><td>{t.numdoc||t.cab_id}</td><td>{paymentLabel(t)}</td><td>{money(t.total)}</td></tr>)}</tbody></table></div></div>
 </>
}
function TPVControlDay({tickets,lines,onTicket,closure}){
 const paid=tickets.filter(t=>!['X','G'].includes(String(t.estado||'C').toUpperCase()));const summary=summarizeTickets(paid);const avg=summary.ticket_medio;
 const lineCount=new Map();(lines||[]).forEach(l=>lineCount.set(String(l.cab_id),(lineCount.get(String(l.cab_id))||0)+1));
 const groups=[
  {id:'X',title:'Tickets anulados',rows:tickets.filter(t=>String(t.estado||'').toUpperCase()==='X'),tone:'bad'},
  {id:'G',title:'Gastos registrados en Numier',rows:tickets.filter(t=>String(t.estado||'').toUpperCase()==='G'),tone:'warn'},
  {id:'HIGH',title:'Tickets de importe inusual',rows:paid.filter(t=>Number(t.total||0)>=Math.max(50,avg*3)),tone:'warn'},
  {id:'LOW',title:'Tickets muy bajos (≤ 2 €)',rows:paid.filter(t=>Number(t.total||0)>0&&Number(t.total||0)<=2),tone:'notice'},
  {id:'EMPTY',title:'Tickets sin contenido sincronizado',rows:paid.filter(t=>!lineCount.get(String(t.cab_id))),tone:'bad'}
 ];
 const totalIssues=groups.reduce((a,g)=>a+g.rows.length,0);
 return <div className="tpv5Control"><div className="card tpv5ControlHero"><div><span className="sectionEyebrow">CONTROL DEL DÍA</span><h2>{totalIssues?`${totalIssues} elementos para revisar`:'Todo correcto'}</h2><p>Detección automática sobre anulaciones, gastos, importes atípicos y tickets sin contenido.</p></div><div className={'closureBadge '+(closure?'ok':'bad')}>{closure?'Cierre guardado':'Cierre pendiente'}</div></div>{groups.map(g=><section className="card" key={g.id}><div className="row between"><h2>{g.title}</h2><b className={g.rows.length?g.tone:'ok'}>{g.rows.length}</b></div>{g.rows.length?<div className="tableScroll"><table><thead><tr><th>Hora</th><th>Ticket</th><th>Pago</th><th>Total</th><th></th></tr></thead><tbody>{g.rows.slice().reverse().map(t=><tr key={t.cab_id} className="clickable" onClick={()=>onTicket(t.cab_id)}><td>{t.hora?new Date(t.hora).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'—'}</td><td><b>{t.numdoc||t.cab_id}</b></td><td>{paymentLabel(t)}</td><td>{money(t.total)}</td><td><button onClick={e=>{e.stopPropagation();onTicket(t.cab_id)}}>Ver</button></td></tr>)}</tbody></table></div>:<p className="mutedText">Sin incidencias en este apartado.</p>}</section>)}</div>
}
function TPVTickets({tickets,lines,onTicket}){const[q,setQ]=useState('');const[pay,setPay]=useState('TODOS');const[status,setStatus]=useState('TODOS');const lineByCab=useMemo(()=>{const m=new Map();(lines||[]).forEach(l=>{const k=String(l.cab_id);m.set(k,(m.get(k)||'')+' '+String(l.descripcion||l.articulo||''))});return m},[lines]);const filtered=tickets.filter(t=>{const text=`${t.numdoc||''} ${t.cab_id||''} ${t.total||''} ${lineByCab.get(String(t.cab_id))||''}`.toLowerCase();const p=String(t.forma_pago||'').toUpperCase();const e=String(t.estado||'C').toUpperCase();return(!q||text.includes(q.toLowerCase()))&&(pay==='TODOS'||p===pay)&&(status==='TODOS'||e===status)});return <div className="card"><div className="ticketTools"><div><h2>Tickets del día</h2><p className="mutedText">Busca por ticket, CAB_ID, importe o producto.</p></div><input placeholder="Buscar ticket, producto o importe" value={q} onChange={e=>setQ(e.target.value)}/></div><div className="filterChips">{[['TODOS','Todos'],['E','Efectivo'],['T','Tarjeta'],['A','Ambas']].map(([v,l])=><button className={pay===v?'active':''} onClick={()=>setPay(v)} key={v}>{l}</button>)}<span></span>{[['TODOS','Todos estados'],['C','Cobrados'],['X','Anulados'],['G','Gastos']].map(([v,l])=><button className={status===v?'active':''} onClick={()=>setStatus(v)} key={v}>{l}</button>)}</div><div className="ticketTotals"><b>{filtered.length} tickets</b><span>Total filtrado: <b>{money(filtered.reduce((a,t)=>a+Number(t.total||0),0))}</b></span></div><div className="tableScroll"><table><thead><tr><th>Hora</th><th>Ticket</th><th>Estado</th><th>Pago</th><th>Total</th></tr></thead><tbody>{filtered.slice().reverse().map(t=><tr className="clickable" key={t.id||t.cab_id} onClick={()=>onTicket(t.cab_id)}><td>{t.hora?new Date(t.hora).toLocaleTimeString('es-ES'):''}</td><td><b>{t.numdoc||t.cab_id}</b></td><td>{ticketStatusLabel(t)}</td><td>{paymentLabel(t)}</td><td>{money(t.total)}</td></tr>)}</tbody></table></div></div>}
function TPVCash({date,daily,closure,onSaved}){const[f,setF]=useState(()=>({fondo_inicial:closure?.fondo_inicial||0,entradas:closure?.entradas||0,salidas:closure?.salidas||0,efectivo_contado:closure?.efectivo_contado||'',tarjeta_datáfono:closure?.tarjeta_datáfono??closure?.tarjeta_datafono??'',responsable:closure?.responsable||'',notas:closure?.notas||''}));useEffect(()=>setF({fondo_inicial:closure?.fondo_inicial||0,entradas:closure?.entradas||0,salidas:closure?.salidas||0,efectivo_contado:closure?.efectivo_contado||'',tarjeta_datáfono:closure?.tarjeta_datáfono??closure?.tarjeta_datafono??'',responsable:closure?.responsable||'',notas:closure?.notas||''}),[closure,date]);const expectedCash=Number(f.fondo_inicial)+Number(daily?.efectivo||0)+Number(f.entradas)-Number(f.salidas);const cashDiff=Number(f.efectivo_contado||0)-expectedCash;const cardDiff=Number(f.tarjeta_datáfono||0)-Number(daily?.tarjeta||0);async function save(){const row=await saveCashClosure({fecha:date,...f,tarjeta_datafono:Number(f.tarjeta_datáfono||0),ventas_total:Number(daily?.total||0),ventas_efectivo:Number(daily?.efectivo||0),ventas_tarjeta:Number(daily?.tarjeta||0),tickets:Number(daily?.tickets||0),ticket_medio:Number(daily?.ticket_medio||0),efectivo_esperado:expectedCash,diferencia_efectivo:cashDiff,diferencia_tarjeta:cardDiff,estado:Math.abs(cashDiff)<=0.5&&Math.abs(cardDiff)<=0.5?'CUADRADO':'REVISAR',closed_at:new Date().toISOString()});onSaved(row)}return <div className="cashGrid"><div className="card"><h2>Cuadre de caja · {fmtDate(date)}</h2><div className="cashForm"><label>Fondo inicial<input type="number" step="0.01" value={f.fondo_inicial} onChange={e=>setF({...f,fondo_inicial:e.target.value})}/></label><label>Entradas manuales<input type="number" step="0.01" value={f.entradas} onChange={e=>setF({...f,entradas:e.target.value})}/></label><label>Salidas / retiradas<input type="number" step="0.01" value={f.salidas} onChange={e=>setF({...f,salidas:e.target.value})}/></label><label>Efectivo contado<input type="number" step="0.01" value={f.efectivo_contado} onChange={e=>setF({...f,efectivo_contado:e.target.value})}/></label><label>Datáfono contado<input type="number" step="0.01" value={f.tarjeta_datáfono} onChange={e=>setF({...f,tarjeta_datáfono:e.target.value})}/></label><label>Responsable<input value={f.responsable} onChange={e=>setF({...f,responsable:e.target.value})}/></label></div><label>Notas / incidencias<textarea rows="3" value={f.notas} onChange={e=>setF({...f,notas:e.target.value})}/></label><button onClick={save}>Guardar cierre de caja</button></div><div className="card cashResult"><h2>Resultado</h2><p><span>Ventas del día</span><b>{money(daily?.total)}</b></p><p><span>Efectivo esperado</span><b>{money(expectedCash)}</b></p><p><span>Efectivo contado</span><b>{money(f.efectivo_contado)}</b></p><p><span>Diferencia efectivo</span><b className={Math.abs(cashDiff)<=.5?'ok':'bad'}>{money(cashDiff)}</b></p><p><span>Tarjeta esperada</span><b>{money(daily?.tarjeta)}</b></p><p><span>Datáfono</span><b>{money(f.tarjeta_datáfono)}</b></p><p><span>Diferencia tarjeta</span><b className={Math.abs(cardDiff)<=.5?'ok':'bad'}>{money(cardDiff)}</b></p><div className={'closureBadge '+(Math.abs(cashDiff)<=.5&&Math.abs(cardDiff)<=.5?'ok':'bad')}>{Math.abs(cashDiff)<=.5&&Math.abs(cardDiff)<=.5?'✅ CAJA CUADRADA':'⚠️ REVISAR DESCUADRE'}</div></div></div>}
function TPVClosures({rows,onReload}){const[sel,setSel]=useState(null);return <div className="card"><div className="row between"><div><h2>Histórico de cierres</h2><p className="mutedText">Consulta diferencias, responsables e incidencias.</p></div><button onClick={onReload}>Actualizar</button></div><div className="tableScroll"><table><thead><tr><th>Fecha</th><th>Ventas</th><th>Efectivo</th><th>Tarjeta</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>{rows.map(r=><tr className="clickable" key={r.fecha} onClick={()=>setSel(r)}><td>{new Date(r.fecha+'T12:00:00').toLocaleDateString('es-ES')}</td><td>{money(r.ventas_total)}</td><td>{money(r.ventas_efectivo)}</td><td>{money(r.ventas_tarjeta)}</td><td>{money(Number(r.diferencia_efectivo||0)+Number(r.diferencia_tarjeta||0))}</td><td><b className={r.estado==='CUADRADO'?'ok':'bad'}>{r.estado||'-'}</b></td></tr>)}</tbody></table></div>{!rows.length&&<p>No hay cierres guardados todavía.</p>}{sel&&<div className="closureDetail"><div className="row between"><h3>Cierre {fmtDate(sel.fecha)}</h3><button onClick={()=>setSel(null)}>Cerrar detalle</button></div><div className="reportGrid"><p><span>Responsable</span><b>{sel.responsable||'-'}</b></p><p><span>Tickets</span><b>{sel.tickets||0}</b></p><p><span>Ticket medio</span><b>{money(sel.ticket_medio)}</b></p><p><span>Efectivo contado</span><b>{money(sel.efectivo_contado)}</b></p><p><span>Datáfono</span><b>{money(sel.tarjeta_datafono)}</b></p><p><span>Estado</span><b>{sel.estado}</b></p></div><p><b>Notas:</b> {sel.notas||'Sin incidencias'}</p></div>}</div>}
function TPVPulse({pulse,closures}){const recent=summarizeTickets(pulse.recent||[]),previous=summarizeTickets(pulse.previous||[]);const sales=pctChange(recent.total,previous.total),count=pctChange(recent.tickets,previous.tickets),avg=pctChange(recent.ticket_medio,previous.ticket_medio);const diffs=(closures||[]).slice(0,10).filter(c=>Math.abs(Number(c.diferencia_efectivo||0))+Math.abs(Number(c.diferencia_tarjeta||0))>.5);const byHour={};(pulse.recent||[]).forEach(t=>{const h=new Date(t.hora).getHours();byHour[h]=(byHour[h]||0)+Number(t.total||0)});const best=Object.entries(byHour).sort((a,b)=>b[1]-a[1])[0];const score=sales>8?'Bueno':sales>-8?'Estable':'Atención';const icon=score==='Bueno'?'🟢':score==='Estable'?'🟡':'🔴';return <><div className="card pulseHero"><span>PULSO DEL NEGOCIO · ÚLTIMOS 7 DÍAS</span><h2>{icon} {score}</h2><p>Comparación automática con los 7 días anteriores usando ventas reales de Numier.</p></div><div className="tpvKpis"><div className="card kpi"><span>Ventas</span><b className={sales>=0?'ok':'bad'}>{signPct(sales)}</b><small>{money(recent.total)}</small></div><div className="card kpi"><span>Nº tickets</span><b className={count>=0?'ok':'bad'}>{signPct(count)}</b><small>{recent.tickets}</small></div><div className="card kpi"><span>Ticket medio</span><b className={avg>=0?'ok':'bad'}>{signPct(avg)}</b><small>{money(recent.ticket_medio)}</small></div><div className="card kpi"><span>Cierres a revisar</span><b className={diffs.length?'bad':'ok'}>{diffs.length}</b></div></div><div className="grid"><div className="card"><h2>Lectura automática</h2><p><b>{sales>=0?'La facturación avanza':'La facturación retrocede'} {Math.abs(sales).toFixed(1)}%</b> frente al periodo anterior.</p><p>El volumen de tickets {count>=0?'sube':'baja'} {Math.abs(count).toFixed(1)}% y el ticket medio {avg>=0?'mejora':'cae'} {Math.abs(avg).toFixed(1)}%.</p>{best&&<p>La franja con más facturación reciente empieza a las <b>{String(best[0]).padStart(2,'0')}:00</b>, con {money(best[1])}.</p>}<p>{diffs.length?`Hay ${diffs.length} cierres recientes con diferencias superiores a 0,50 €.`:'Los últimos cierres registrados no presentan descuadres relevantes.'}</p></div><div className="card"><h2>Recomendaciones</h2><p>• {sales<-8?'Revisa qué días y franjas han perdido ventas y plantea una acción comercial concreta.':'Mantén la operativa de las franjas que mejor están funcionando.'}</p><p>• {avg<0?'Trabaja venta sugerida y combinaciones para recuperar el ticket medio.':'El ticket medio evoluciona bien; vigila que el crecimiento no dependa solo de pocos tickets altos.'}</p><p>• {diffs.length?'Revisa cambios, retiradas y apuntes de efectivo en los cierres con diferencias.':'Continúa registrando el cierre diario para mantener el control de caja.'}</p></div></div></>}
function TPV(){const[date,setDate]=useState(today());const[tab,setTab]=useState('resumen');const[data,setData]=useState({daily:null,tickets:[],lines:[],sync:null,error:null});const[comparison,setComparison]=useState([]);const[selected,setSelected]=useState(null);const[loading,setLoading]=useState(false);const[closure,setClosure]=useState(null);const[closures,setClosures]=useState([]);const[pulse,setPulse]=useState({recent:[],previous:[]});useEffect(()=>{load();const t=setInterval(()=>{if(date===today())load(false)},30000);return()=>clearInterval(t)},[date]);useEffect(()=>{loadPulseData().then(setPulse);reloadClosures()},[]);async function load(show=true){if(show)setLoading(true);const[d,cmp]=await Promise.all([loadSalesForDate(date),loadSalesForDate(addDays(date,-7))]);if(supabase&&d.tickets?.length){const ids=d.tickets.map(t=>t.cab_id).filter(Boolean);let lines=[];for(let i=0;i<ids.length;i+=200){const {data:part}=await supabase.from('numier_ticket_lines').select('cab_id,descripcion,articulo,cantidad,importe,line_key').in('cab_id',ids.slice(i,i+200)).limit(10000);lines=lines.concat(part||[])}d.lines=lines}setData(d);setComparison(cmp.tickets||[]);setClosure(await loadCashClosure(date));if(show)setLoading(false)}async function reloadClosures(){setClosures(await listCashClosures())}const tabs=[['resumen','Resumen'],['control','Control'],['tickets','Tickets'],['caja','Caja'],['cierres','Cierres'],['pulso','Pulso IA']];return <div className="tpvControl"><div className="card hero tpvHero"><div><span className="sectionEyebrow">TPV 5.0 · CONTROL DE VENTAS</span><h2>Ventas, tickets, incidencias y cierres</h2><p>Control operativo diario con comparación y detección automática.</p></div><div className="row controls"><button onClick={()=>setDate(today())}>Hoy</button><button onClick={()=>setDate(addDays(today(),-1))}>Ayer</button><button onClick={()=>setDate(addDays(date,-1))}>◀ Día</button><button onClick={()=>setDate(addDays(date,1))}>Día ▶</button><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={()=>load()}>{loading?'Cargando...':'Actualizar'}</button></div></div><nav className="tpvTabs">{tabs.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</nav>{data.error&&<div className="alertBad">{data.error}</div>}{tab==='resumen'&&<TPVSummary date={date} daily={data.daily} tickets={data.tickets||[]} onTicket={setSelected} pulse={pulse} comparison={comparison} closure={closure} onOpenControl={()=>setTab('control')}/>} {tab==='control'&&<TPVControlDay tickets={data.tickets||[]} lines={data.lines||[]} onTicket={setSelected} closure={closure}/>} {tab==='tickets'&&<TPVTickets tickets={data.tickets||[]} lines={data.lines||[]} onTicket={setSelected}/>} {tab==='caja'&&<TPVCash date={date} daily={data.daily||summarizeTickets(data.tickets||[])} closure={closure} onSaved={r=>{setClosure(r);reloadClosures();alert('Cierre guardado correctamente')}}/>} {tab==='cierres'&&<TPVClosures rows={closures} onReload={reloadClosures}/>} {tab==='pulso'&&<TPVPulse pulse={pulse} closures={closures}/>}<TicketModal cabId={selected} onClose={()=>setSelected(null)}/></div>}

function gestoriaDateKey(value){
 const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10);
}
function gestoriaDailyRows(fiscalRows){
 const map=new Map();
 fiscalRows.forEach(r=>{const k=r.fecha||'-';if(!map.has(k))map.set(k,{fecha:k,tickets:0,total:0,efectivo:0,tarjeta:0,otros:0,base:0,iva:0});const x=map.get(k);x.tickets++;x.total+=r.total;x.efectivo+=r.efectivo;x.tarjeta+=r.tarjeta;x.otros+=r.otros;x.base+=r.baseTotal;x.iva+=r.ivaTotal});
 return [...map.values()];
}
function gestoriaSheet(wb,name,rows,widths=[]){
 const ws=XLSX.utils.aoa_to_sheet(rows);if(widths.length)ws['!cols']=widths.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31));
}
async function loadGestoriaExtras(from,to){
 if(!supabase)return {closures:[],fixed:[],variable:[],invoices:[],payments:[]};
 const safe=async(q)=>{try{const {data,error}=await q;if(error)return[];return data||[]}catch{return[]}};
 const [closures,fixed,variable,invoices,payments]=await Promise.all([
  safe(supabase.from('numier_cash_closures').select('*').gte('fecha',from).lt('fecha',to).order('fecha',{ascending:true}).limit(1000)),
  safe(supabase.from('business_fixed_expenses').select('*').limit(5000)),
  safe(supabase.from('business_variable_expenses').select('*').gte('expense_date',from).lt('expense_date',to).order('expense_date',{ascending:true}).limit(5000)),
  safe(supabase.from('purchase_invoices').select('*,purchase_suppliers(name)').gte('invoice_date',from).lt('invoice_date',to).order('invoice_date',{ascending:true}).limit(5000)),
  safe(supabase.from('employee_payments').select('*').gte('payment_date',from).lt('payment_date',to).order('payment_date',{ascending:true}).limit(5000))
 ]);
 return {closures,fixed,variable,invoices,payments};
}
function Gestoria(){
 const yNow=new Date().getFullYear();
 const[year,setYear]=useState(yNow);const[type,setType]=useState('mes');const[period,setPeriod]=useState(new Date().getMonth()+1);
 const[data,setData]=useState({tickets:[],lines:[],sync:null,articles:new Map()});const[extras,setExtras]=useState({closures:[],fixed:[],variable:[],invoices:[],payments:[]});
 const[loading,setLoading]=useState(false);const[progress,setProgress]=useState('');const[tab,setTab]=useState('revision');
 const range=type==='trimestre'?quarterRange(Number(year),Number(period)):monthRange(Number(year),Number(period));
 const lockKey=`colibri_gestoria_lock_${range.from}_${range.to}`;const[locked,setLocked]=useState(()=>localStorage.getItem(lockKey)==='1');
 useEffect(()=>{setLocked(localStorage.getItem(lockKey)==='1');load()},[year,type,period]);
 async function load(){try{setLoading(true);setProgress('Preparando cierre contable...');const[d,x]=await Promise.all([loadSalesRangeGestoria(range.from,range.to,setProgress),loadGestoriaExtras(range.from,range.to)]);setData(d);setExtras(x)}catch(e){alert('Error cargando gestoría: '+(e.message||String(e)))}finally{setLoading(false)}}
 const allTickets=data.tickets||[];const realTickets=allTickets.filter(isRealSaleTicket);const cancelled=allTickets.filter(t=>String(t.estado||'').toUpperCase()==='X');const expensesNumier=allTickets.filter(t=>String(t.estado||'').toUpperCase()==='G');
 const fiscalRows=ticketFiscalRows(realTickets,data.lines);const sum=summarizeTickets(realTickets);const iva=ivaSummary(data.lines);const daily=gestoriaDailyRows(fiscalRows);
 const mixed=fiscalRows.filter(r=>r.efectivo>0&&r.tarjeta>0);const unclear=fiscalRows.filter(r=>r.total>0&&r.efectivo===0&&r.tarjeta===0&&r.otros===0);
 const closureDates=new Set((extras.closures||[]).map(x=>String(x.fecha||'').slice(0,10)));const salesDates=[...new Set(realTickets.map(t=>String(t.hora||'').slice(0,10)).filter(Boolean))];const missingClosures=salesDates.filter(d=>!closureDates.has(d));
 const closureDiffs=(extras.closures||[]).filter(x=>Math.abs(Number(x.diferencia||x.diff||0))>.5);
 const incidents=[
  ...(missingClosures.length?[{type:'bad',title:`${missingClosures.length} días sin cierre de caja`,detail:missingClosures.slice(0,8).join(', ')}]:[]),
  ...(closureDiffs.length?[{type:'warn',title:`${closureDiffs.length} cierres con descuadre`,detail:'Diferencias superiores a 0,50 €'}]:[]),
  ...(unclear.length?[{type:'bad',title:`${unclear.length} tickets sin forma de pago clara`,detail:'Revisar antes de enviar a gestoría'}]:[]),
  ...(cancelled.length?[{type:'info',title:`${cancelled.length} tickets anulados`,detail:'Excluidos de ventas'}]:[]),
  ...(expensesNumier.length?[{type:'info',title:`${expensesNumier.length} gastos Numier`,detail:'Separados de las ventas'}]:[]),
  ...((extras.invoices||[]).filter(i=>!['reviewed','approved'].includes(String(i.status||''))).length?[{type:'warn',title:'Facturas pendientes de revisar',detail:`${(extras.invoices||[]).filter(i=>!['reviewed','approved'].includes(String(i.status||''))).length} documentos`}]:[])
 ];
 const canClose=missingClosures.length===0&&unclear.length===0;
 function toggleLock(){if(!locked&&!canClose&&!confirm('Hay incidencias críticas. ¿Cerrar el periodo igualmente?'))return;const next=!locked;localStorage.setItem(lockKey,next?'1':'0');setLocked(next)}
 function buildWorkbook(){
  const wb=XLSX.utils.book_new();
  gestoriaSheet(wb,'Resumen',[[`COLIBRÍ · CIERRE ${range.label}`],['Periodo',range.from,range.to],['Estado',locked?'CERRADO':'ABIERTO'],[],['Concepto','Importe'],['Ventas',sum.total],['Tickets',sum.tickets],['Ticket medio',sum.ticket_medio],['Efectivo',sum.efectivo],['Tarjeta',sum.tarjeta],['Otros',sum.cheque],['Anulados',cancelled.length],['Gastos Numier',expensesNumier.length]], [28,18,18]);
  gestoriaSheet(wb,'Ventas detalladas',[['Ticket','CAB_ID','Fecha','Hora','Pago','Mesa','Base','IVA','Total','Efectivo','Tarjeta','Otros'],...fiscalRows.map(r=>[r.numdoc,r.cab_id,r.fecha,r.hora,r.forma,r.mesa,r.baseTotal,r.ivaTotal,r.total,r.efectivo,r.tarjeta,r.otros])],[14,12,12,10,24,12,12,12,12,12,12,12]);
  gestoriaSheet(wb,'Totales diarios',[['Fecha','Tickets','Base','IVA','Total','Efectivo','Tarjeta','Otros'],...daily.map(r=>[r.fecha,r.tickets,r.base,r.iva,r.total,r.efectivo,r.tarjeta,r.otros])],[14,12,12,12,12,12,12,12]);
  gestoriaSheet(wb,'Formas de pago',[['Forma','Importe'],['Efectivo',sum.efectivo],['Tarjeta',sum.tarjeta],['Cheque/Otros',sum.cheque],['Total',sum.total]],[22,16]);
  gestoriaSheet(wb,'Pagos mixtos',[['Ticket','Fecha','Total','Efectivo','Tarjeta'],...mixed.map(r=>[r.numdoc,r.fecha,r.total,r.efectivo,r.tarjeta])],[15,14,14,14,14]);
  gestoriaSheet(wb,'Gastos',[['Origen','Fecha','Concepto','Importe'],...expensesNumier.map(x=>['Numier',String(x.hora||'').slice(0,10),x.mesa||x.descripcion||'Gasto',Number(x.total||0)]),...(extras.variable||[]).map(x=>['ERP',x.expense_date||x.date,x.description||x.name||'Gasto variable',Number(x.amount||x.total||0)])],[14,14,32,14]);
  gestoriaSheet(wb,'Anulaciones',[['Ticket','Fecha','Importe','Mesa'],...cancelled.map(x=>[x.numdoc||x.cab_id,String(x.hora||'').slice(0,10),Number(x.total||0),x.mesa||''])],[15,14,14,14]);
  gestoriaSheet(wb,'Cierres de caja',[['Fecha','Esperado','Declarado','Diferencia','Notas'],...(extras.closures||[]).map(x=>[x.fecha,Number(x.efectivo_esperado||x.expected_cash||0),Number(x.efectivo_real||x.declared_cash||0),Number(x.diferencia||x.diff||0),x.notas||x.notes||''])],[14,14,14,14,30]);
  gestoriaSheet(wb,'Facturas y compras',[['Fecha','Proveedor','Factura','Total','Estado'],...(extras.invoices||[]).map(x=>[x.invoice_date,x.purchase_suppliers?.name||'',x.invoice_number||'',Number(x.total||0),x.status||''])],[14,24,18,14,18]);
  gestoriaSheet(wb,'Personal',[['Fecha','Empleado','Concepto','Importe'],...(extras.payments||[]).map(x=>[x.payment_date,x.employee_name||x.employee_id||'',x.payment_type||x.notes||'Pago',Number(x.amount||0)])],[14,22,24,14]);
  gestoriaSheet(wb,'Incidencias',[['Nivel','Incidencia','Detalle'],...incidents.map(i=>[i.type,i.title,i.detail])],[12,34,50]);
  return wb;
 }
 function exportExcel(){const wb=buildWorkbook();XLSX.writeFile(wb,`COLIBRI_GESTORIA_${range.label.replaceAll(' ','_')}.xlsx`)}
 function buildPdf(){const doc=new jsPDF();doc.setFontSize(18);doc.text('COLIBRÍ · CIERRE CONTABLE',14,18);doc.setFontSize(11);doc.text(`${range.label} · ${range.from} a ${range.to}`,14,27);let y=40;[['Ventas',money(sum.total)],['Tickets',String(sum.tickets)],['Ticket medio',money(sum.ticket_medio)],['Efectivo',money(sum.efectivo)],['Tarjeta',money(sum.tarjeta)],['Otros',money(sum.cheque)],['Estado',locked?'CERRADO':'ABIERTO']].forEach(([a,b])=>{doc.text(a,14,y);doc.text(b,90,y);y+=8});y+=4;doc.setFontSize(14);doc.text('Incidencias',14,y);y+=8;doc.setFontSize(9);(incidents.length?incidents:[{title:'Sin incidencias críticas',detail:'Periodo listo para revisión'}]).slice(0,12).forEach(i=>{doc.text(`• ${i.title}`,16,y);y+=5;doc.text(String(i.detail||'').slice(0,95),20,y);y+=7});return doc}
 async function exportPackage(){setProgress('Generando paquete de gestoría...');const zip=new JSZip();const wb=buildWorkbook();zip.file(`COLIBRI_GESTORIA_${range.label}.xlsx`,XLSX.write(wb,{bookType:'xlsx',type:'array'}));zip.file(`RESUMEN_${range.label}.pdf`,buildPdf().output('arraybuffer'));zip.file('INCIDENCIAS.txt',(incidents.length?incidents.map(i=>`${i.title}\n${i.detail}`).join('\n\n'):'Sin incidencias críticas'));zip.file('LEEME.txt',`Paquete generado por Colibrí ERP\nPeriodo: ${range.from} - ${range.to}\nEstado: ${locked?'CERRADO':'ABIERTO'}\nVentas: ${sum.total.toFixed(2)} EUR\nTickets: ${sum.tickets}`);const blob=await zip.generateAsync({type:'blob'});downloadFile(`COLIBRI_PAQUETE_GESTORIA_${range.label.replaceAll(' ','_')}.zip`,blob,'application/zip');setProgress('Paquete generado correctamente')}
 const tabs=[['revision','Revisión'],['resumen','Resumen'],['ventas','Ventas'],['cierres','Cierres'],['documentos','Documentos']];
 return <div className="gestoria6"><div className="card hero gestoriaHero"><div><span className="sectionEyebrow">GESTORÍA 6.0 · CIERRE AUTOMÁTICO</span><h2>Cierre mensual y trimestral guiado</h2><p>Revisa incidencias, valida cobros y genera el paquete completo para la gestoría.</p></div><div className="row controls"><select value={type} onChange={e=>{setType(e.target.value);setPeriod(1)}}><option value="mes">Mes</option><option value="trimestre">Trimestre</option></select><input type="number" value={year} onChange={e=>setYear(e.target.value)}/>{type==='trimestre'?<select value={period} onChange={e=>setPeriod(e.target.value)}>{[1,2,3,4].map(x=><option key={x} value={x}>{x}T</option>)}</select>:<select value={period} onChange={e=>setPeriod(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,'0')}</option>)}</select>}<button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div>
 {loading&&<div className="card"><h3>Procesando periodo</h3><p>{progress}</p></div>}
 <div className="grid kpis"><div className="card kpi"><span>Ventas</span><b>{money(sum.total)}</b></div><div className="card kpi"><span>Tickets</span><b>{sum.tickets}</b></div><div className="card kpi"><span>Incidencias</span><b className={incidents.length?'bad':'ok'}>{incidents.length}</b></div><div className="card kpi"><span>Estado</span><b className={locked?'ok':'warn'}>{locked?'CERRADO':'ABIERTO'}</b></div></div>
 <nav className="tpvTabs">{tabs.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</nav>
 {tab==='revision'&&<><div className="grid"><div className="card"><h2>Checklist de cierre</h2>{incidents.length?incidents.map((i,n)=><div className={`gestoriaIncident ${i.type}`} key={n}><b>{i.title}</b><small>{i.detail}</small></div>):<div className="alertOk">Sin incidencias críticas. El periodo está listo para cerrar.</div>}</div><div className="card"><h2>Control del periodo</h2><p>Ventas detectadas: <b>{money(sum.total)}</b></p><p>Días con ventas: <b>{salesDates.length}</b></p><p>Cierres registrados: <b>{extras.closures.length}</b></p><p>Pagos mixtos: <b>{mixed.length}</b></p><button className={locked?'secondary':''} onClick={toggleLock}>{locked?'Reabrir periodo':'Marcar periodo como cerrado'}</button><p className="mutedText">El cierre bloquea visualmente el periodo y deja constancia local. Los datos originales no se eliminan.</p></div></div></>}
 {tab==='resumen'&&<div className="grid"><div className="card"><h2>Resumen fiscal</h2><table><tbody><tr><td>Ventas</td><td>{money(sum.total)}</td></tr><tr><td>Tickets</td><td>{sum.tickets}</td></tr><tr><td>Ticket medio</td><td>{money(sum.ticket_medio)}</td></tr><tr><td>Efectivo</td><td>{money(sum.efectivo)}</td></tr><tr><td>Tarjeta</td><td>{money(sum.tarjeta)}</td></tr><tr><td>Otros</td><td>{money(sum.cheque)}</td></tr></tbody></table></div><div className="card"><h2>IVA</h2><table><thead><tr><th>Tipo</th><th>Base</th><th>Cuota</th><th>Total</th></tr></thead><tbody>{iva.map(r=><tr key={r.iva}><td>{r.iva}%</td><td>{money(r.base)}</td><td>{money(r.cuota)}</td><td>{money(r.total)}</td></tr>)}</tbody></table></div></div>}
 {tab==='ventas'&&<div className="card"><h2>Ventas detalladas</h2><p>{fiscalRows.length.toLocaleString('es-ES')} tickets reales. Anulados y gastos están excluidos.</p><div className="tableScroll"><table><thead><tr><th>Ticket</th><th>Fecha</th><th>Pago</th><th>Base</th><th>IVA</th><th>Total</th></tr></thead><tbody>{fiscalRows.slice(0,300).map(r=><tr key={r.cab_id}><td>{r.numdoc||r.cab_id}</td><td>{r.fecha}</td><td>{r.forma}</td><td>{money(r.baseTotal)}</td><td>{money(r.ivaTotal)}</td><td>{money(r.total)}</td></tr>)}</tbody></table></div>{fiscalRows.length>300&&<p className="mutedText">La exportación Excel incluye todos los tickets.</p>}</div>}
 {tab==='cierres'&&<div className="card"><h2>Cierres de caja</h2><div className="tableScroll"><table><thead><tr><th>Fecha</th><th>Esperado</th><th>Declarado</th><th>Diferencia</th></tr></thead><tbody>{extras.closures.map((x,i)=><tr key={x.id||i}><td>{x.fecha}</td><td>{money(x.efectivo_esperado||x.expected_cash)}</td><td>{money(x.efectivo_real||x.declared_cash)}</td><td className={Math.abs(Number(x.diferencia||x.diff||0))>.5?'bad':'ok'}>{money(x.diferencia||x.diff)}</td></tr>)}</tbody></table></div></div>}
 {tab==='documentos'&&<div className="grid"><div className="card"><h2>Exportaciones</h2><p>Genera un Excel con hojas separadas o el paquete ZIP completo.</p><div className="row"><button onClick={exportExcel}>Descargar Excel completo</button><button onClick={()=>buildPdf().save(`RESUMEN_${range.label}.pdf`)}>Descargar PDF resumen</button><button onClick={exportPackage}>Generar paquete gestoría</button></div>{progress&&<p className="mutedText">{progress}</p>}</div><div className="card"><h2>Contenido del paquete</h2><p>✓ Resumen fiscal</p><p>✓ Ventas detalladas</p><p>✓ Totales diarios</p><p>✓ Formas de pago y mixtos</p><p>✓ Gastos y anulaciones</p><p>✓ Cierres de caja</p><p>✓ Facturas, compras y personal</p><p>✓ Informe de incidencias</p></div></div>}
 </div>
}


// ARRANQUE REACT - FIX PANTALLA BLANCA
const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
