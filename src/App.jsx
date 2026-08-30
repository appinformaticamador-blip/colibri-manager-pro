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
import {buildClockSessions,calculateProfitability,hourlyCost} from './modules/coreBusiness';
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
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function week(){const d=new Date();const utc=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=utc.getUTCDay()||7;utc.setUTCDate(utc.getUTCDate()+4-day);const year=utc.getUTCFullYear();const jan4=new Date(Date.UTC(year,0,4));const janDay=jan4.getUTCDay()||7;jan4.setUTCDate(jan4.getUTCDate()+4-janDay);const w=1+Math.round((utc-jan4)/604800000);return `${year}-W${String(w).padStart(2,'0')}`}
function slugName(name){return String(name||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')}

function readLocalJSON(key,fallback){
 try{
  const raw=localStorage.getItem(key);
  if(!raw)return fallback;
  const value=JSON.parse(raw);
  return value??fallback;
 }catch{return fallback}
}

function money(v){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v||0))}
function fmtDate(d){return new Date(d+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}
function addDays(dateStr,n){const d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
async function loadSalesForDate(date){
 if(!supabase)return {daily:null,tickets:[],lines:[],sync:null,error:'Supabase no configurado'};
 const start=date+'T00:00:00'; const end=addDays(date,1)+'T00:00:00';
 const [{data:dailyData},{data:ticketsData,error:ticketError},{data:auditExpenseData},{data:syncData}] = await Promise.all([
  supabase.from('numier_daily_sales').select('*').eq('fecha',date).maybeSingle(),
  supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(5000),
  supabase.from('numier_audit_events').select('*').eq('estado','G').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(5000),
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1)
 ]);
 const tickets=ticketsData||[];const saleTickets=tickets.filter(isRealSaleTicket);const expenseTickets=mergeNumierExpenseSources(tickets,auditExpenseData);const numierExpenses=summarizeNumierExpenses(expenseTickets);
 let daily=dailyData;
 if(!daily){
  const saleSummary=summarizeTickets(saleTickets);
  daily={fecha:date,...saleSummary};
 }
 return {daily,tickets,expenseTickets,numierExpenses,lines:[],sync:syncData?.[0]||null,error:ticketError?.message||null};
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
const SMART_GROWTH_TARGET=0.10; // Objetivo inteligente: +10% sobre histórico comparable
function decimalHour(dt){const d=new Date(dt);return d.getHours()+d.getMinutes()/60}
function overlapHours(a1,a2,b1,b2){return Math.max(0,Math.min(a2,b2)-Math.max(a1,b1))}
function shiftForTicket(t){const hh=decimalHour(t.hora||t.created_at);return SHIFT_DEFS.find(s=>hh>=s.start&&hh<s.end)?.id||'otros'}
function monthStartISO(value=today()){const [y,m]=String(value||today()).slice(0,7).split('-');return `${y}-${m}-01`}
function nextMonthStartISO(value=today()){const [y,m]=String(value||today()).slice(0,7).split('-').map(Number);const nm=m===12?1:m+1,ny=m===12?y+1:y;return `${ny}-${String(nm).padStart(2,'0')}-01`}
function yearStartISO(value=today()){return `${String(value||today()).slice(0,4)}-01-01`}
function nextYearStartISO(value=today()){return `${Number(String(value||today()).slice(0,4))+1}-01-01`}
function rangeDates(mode,date,customFrom='',customTo=''){
 const current=today(),endToday=addDays(current,1);
 if(mode==='hoy') return {from:current,to:endToday,label:'Hoy'};
 if(mode==='ayer') {const d=addDays(current,-1);return {from:d,to:addDays(d,1),label:'Ayer'}};
 if(mode==='tresdias') return {from:addDays(current,-2),to:endToday,label:'Últimos 3 días'};
 if(mode==='semana') return {from:addDays(current,-6),to:endToday,label:'Últimos 7 días'};
 if(mode==='treinta') return {from:addDays(current,-29),to:endToday,label:'Últimos 30 días'};
 if(mode==='mes'){
  const from=monthStartISO(date||current),nextMonth=nextMonthStartISO(date||current),to=(from<=current&&current<nextMonth)?endToday:nextMonth;
  return {from,to,label:`Mes · ${fmtDate(from)} a ${fmtDate(addDays(to,-1))}`};
 }
 if(mode==='anio'){
  const from=yearStartISO(date||current),nextYear=nextYearStartISO(date||current),to=(from<=current&&current<nextYear)?endToday:nextYear;
  return {from,to,label:`Año · ${fmtDate(from)} a ${fmtDate(addDays(to,-1))}`};
 }
 if(mode==='rango'){
  const from=customFrom||date||current,end=customTo||from,to=end<from?addDays(from,1):addDays(end,1);
  return {from,to,label:`Rango · ${fmtDate(from)} a ${fmtDate(addDays(to,-1))}`};
 }
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
function isNumierExpenseTicket(t){
 const state=String(t?.estado??t?.status??'').trim().toUpperCase();
 return state==='G'&&Math.abs(Number(t?.total||0))>0;
}
function numierExpenseAmount(t){return Math.abs(Number(t?.total||0));}
function summarizeNumierExpenses(tickets){
 const rows=(tickets||[]).filter(isNumierExpenseTicket);
 return {total:rows.reduce((sum,t)=>sum+numierExpenseAmount(t),0),count:rows.length,rows};
}
function mergeNumierExpenseSources(tickets,auditRows){
 const merged=new Map();
 for(const row of [...(tickets||[]),...(auditRows||[])]){
  if(!isNumierExpenseTicket(row))continue;
  const key=String(row.cab_id||row.id||`${row.hora||''}|${row.numdoc||''}|${row.total||0}`);
  if(!merged.has(key))merged.set(key,{...row,estado:'G'});
 }
 return [...merged.values()];
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
 const [{data:ticketsData},{data:auditExpenseData},{data:syncData},articles]=await Promise.all([
  supabase.from('numier_tickets').select('*').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(10000),
  supabase.from('numier_audit_events').select('*').eq('estado','G').gte('hora',start).lt('hora',end).order('hora',{ascending:true}).limit(10000),
  supabase.from('numier_sync_files').select('*').order('synced_at',{ascending:false}).limit(1),
  loadArticlesMap()
 ]);
 const allTickets=ticketsData||[];const tickets=allTickets.filter(isRealSaleTicket);const expenseTickets=mergeNumierExpenseSources(allTickets,auditExpenseData);const numierExpenses=summarizeNumierExpenses(expenseTickets); const cabIds=tickets.map(t=>t.cab_id).filter(Boolean); let rawLines=[];
 for(let i=0;i<cabIds.length;i+=200){const chunk=cabIds.slice(i,i+200);const {data}=await supabase.from('numier_ticket_lines').select('*').in('cab_id',chunk).order('line_key',{ascending:true}).limit(10000);if(data)rawLines=rawLines.concat(data);}
 const lines=normalizePeriodLines(tickets,rawLines);
 return {tickets,lines,expenseTickets,numierExpenses,sync:syncData?.[0]||null,articles};
}

const LOCAL_COSTS_KEY='colibri_profitability_manual_costs_v1';
function readLocalCostCache(){try{const raw=JSON.parse(localStorage.getItem(LOCAL_COSTS_KEY)||'{}');return raw&&typeof raw==='object'?raw:{}}catch{return {}}}
function saveLocalCost(code,cost,extra={}){if(!code)return;const all=readLocalCostCache();all[String(code)]={cost:Number(cost),updatedAt:new Date().toISOString(),...extra};localStorage.setItem(LOCAL_COSTS_KEY,JSON.stringify(all))}
function removeLocalCost(code){const all=readLocalCostCache();delete all[String(code)];localStorage.setItem(LOCAL_COSTS_KEY,JSON.stringify(all))}
async function persistArticleCost(code,cost,reason='Coste configurado manualmente'){
 const payload={article_code:String(code),manual_unit_cost:Number(cost),reason:String(reason||'Coste configurado manualmente').trim(),updated_by:'Usuario ERP',updated_at:new Date().toISOString(),excluded_from_margin:false};
 saveLocalCost(code,cost,{reason:payload.reason});
 if(!supabase)return {localOnly:true,error:null};
 const {error}=await supabase.from('profitability_article_costs').upsert(payload,{onConflict:'article_code'});
 return {localOnly:Boolean(error),error};
}

async function loadProfitabilityCostMap(){
 const local=readLocalCostCache();
 if(!supabase){const map=new Map();Object.entries(local).forEach(([code,row])=>map.set(code,{cost:Number(row.cost),sale:null,margin:null,excluded:false,name:code,source:'local_manual',manual:true}));return map;}
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
 rows.forEach(row=>{const code=String(row.articleCode||'').trim();if(code&&!map.has(code))map.set(code,{cost:row.cost,sale:row.sale,margin:row.margin,excluded:row.excluded,name:row.articleName||row.productName,source:row.entityType,manual:row.corrected})});
 Object.entries(local).forEach(([code,row])=>{const previous=map.get(code)||{};map.set(code,{...previous,cost:Number(row.cost),excluded:false,source:'local_manual',manual:true})});
 return map;
}
function lineFinancials(line,costMap){
 const code=String(line.articulo||'').trim();const qty=Math.abs(Number(line.cantidad||0));const revenue=Number(line.importe||0);const info=costMap?.get?.(code);
 const configured=info&&!info.excluded&&info.cost!==null&&Number.isFinite(Number(info.cost));
 const averageSale=qty>0?revenue/qty:Number(line.precio||0);
 const unitCost=configured?Number(info.cost):Math.max(0,averageSale/3);
 const cost=unitCost*qty;const profit=revenue-cost;
 return {code,qty,revenue,unitCost,cost,profit,known:true,estimated:!configured,info:{...(info||{}),cost:unitCost,source:configured?info?.source:'automatic_third'}};
}
function periodFinancials(lines,costMap){let revenue=0,cost=0,estimatedRevenue=0;for(const line of lines||[]){const f=lineFinancials(line,costMap);revenue+=f.revenue;cost+=f.cost;if(f.estimated)estimatedRevenue+=f.revenue}return {revenue,cost,profit:revenue-cost,margin:revenue?((revenue-cost)/revenue)*100:0,unknownRevenue:0,estimatedRevenue};}

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
 const auditExpenses=await fetchAllPages(()=>supabase.from('numier_audit_events').select('*').eq('estado','G').gte('hora',start).lt('hora',end).order('hora',{ascending:true}),1000,onProgress,'gastos Numier');
 const mergedExpenses=mergeNumierExpenseSources(tickets,auditExpenses);
 const combinedTickets=[...tickets.filter(t=>!isNumierExpenseTicket(t)),...mergedExpenses];
 const cabIds=tickets.filter(isRealSaleTicket).map(t=>t.cab_id).filter(Boolean);
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
 return {tickets:combinedTickets,expenseTickets:mergedExpenses,numierExpenses:summarizeNumierExpenses(mergedExpenses),lines,sync:syncData?.[0]||null,articles};
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
 const[sort,setSort]=useState('qty');const[selected,setSelected]=useState(null);const[costDraft,setCostDraft]=useState('');const[reason,setReason]=useState('');const[saving,setSaving]=useState(false);const[quickOpen,setQuickOpen]=useState(false);const[quickDrafts,setQuickDrafts]=useState({});const[quickSaving,setQuickSaving]=useState(false);
 const top=productRank(lines,sort,articles).map(p=>{const info=costMap?.get?.(String(p.code));const avgSale=p.qty?p.total/p.qty:0;const pvp=Number(info?.sale||0)>0?Number(info.sale):avgSale;const configured=info&&!info.excluded&&info.cost!==null&&Number.isFinite(Number(info.cost));const unitCost=configured?Number(info.cost):Math.max(0,pvp/3);const cost=unitCost*p.qty;const profit=p.total-cost;return {...p,cost,profit,margin:p.total?(profit/p.total)*100:0,unitCost,pvp,avgSale,estimated:!configured}});
 function openProduct(p){setSelected(p);setCostDraft(String(p.unitCost));setReason(p.estimated?'Estimación automática inicial: 1/3 del PVP':'')}
 function openQuick(){const drafts={};top.forEach(p=>{if(p.code)drafts[String(p.code)]=String(Number(p.unitCost||0).toFixed(4))});setQuickDrafts(drafts);setQuickOpen(true)}
 async function saveCost(){if(!selected?.code)return alert('Este producto no tiene código NUMIER');const value=Number(String(costDraft).replace(',','.'));if(!Number.isFinite(value)||value<0)return alert('Introduce un coste por unidad válido');setSaving(true);const result=await persistArticleCost(selected.code,value,reason||'Coste configurado desde Inteligencia');setSaving(false);const nextCost=value*selected.qty;const nextProfit=selected.total-nextCost;setSelected({...selected,unitCost:value,cost:nextCost,profit:nextProfit,margin:selected.total?(nextProfit/selected.total)*100:0,estimated:false});if(onCostSaved)await onCostSaved();alert(result.error?'Coste guardado en este dispositivo. No se pudo guardar en la nube: '+result.error.message:'Coste guardado correctamente')}
 async function saveQuick(){setQuickSaving(true);let cloudErrors=0;for(const p of top){if(!p.code)continue;const value=Number(String(quickDrafts[String(p.code)]??'').replace(',','.'));if(!Number.isFinite(value)||value<0)continue;const result=await persistArticleCost(p.code,value,p.estimated?'Confirmado desde edición rápida (valor inicial 1/3 del PVP)':'Actualizado desde edición rápida');if(result.error)cloudErrors++}if(onCostSaved)await onCostSaved();setQuickSaving(false);setQuickOpen(false);alert(cloudErrors?`Costes guardados localmente. ${cloudErrors} no pudieron sincronizarse con la nube.`:'Todos los costes se han guardado y el beneficio se ha recalculado.')}
 return <><div className="card"><div className="row between intelligenceCardTitle"><div><h2>🍽️ Ranking y beneficio por producto</h2><p className="mutedText">Los artículos sin coste usan automáticamente 1/3 de su PVP. Puedes confirmar o cambiar todos los costes vendidos rápidamente.</p></div><div className="row wrap"><button onClick={openQuick}>✏️ Costes rápidos</button><button className={sort==='qty'?'active':''} onClick={()=>setSort('qty')}>Unidades</button><button className={sort==='total'?'active':''} onClick={()=>setSort('total')}>Facturación</button></div></div><div className="tableScroll"><table className="clickableTable"><thead><tr><th>#</th><th>Producto</th><th>Unidades</th><th>Ventas</th><th>Coste</th><th>Beneficio</th><th>Margen</th></tr></thead><tbody>{top.map((p,i)=><tr key={`${p.code}-${p.name}`} onClick={()=>openProduct(p)}><td>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td><b>{p.name}</b>{p.code&&<small className="mutedCode"> {p.code}</small>}{p.estimated&&<small className="estimatedCostBadge">Estimado 1/3 PVP</small>}</td><td>{p.qty.toFixed(2)}</td><td>{money(p.total)}</td><td>{money(p.cost)}</td><td><b className="ok">{money(p.profit)}</b></td><td>{`${p.margin.toFixed(1)}%`}</td></tr>)}</tbody></table></div><p className="mutedText rankingCount">Mostrando {top.length} productos vendidos · {top.filter(p=>p.estimated).length} con coste estimado editable</p>{top.length===0&&<p>No hay líneas de productos para este periodo.</p>}</div>{selected&&<div className="modal productProfitOverlay" onClick={()=>setSelected(null)}><div className="card intelligenceModal productProfitModal" onClick={e=>e.stopPropagation()}><div className="row between productProfitHeader"><div><span className="sectionEyebrow">RENTABILIDAD DEL PERIODO</span><h2>{selected.name}</h2><p>Código {selected.code||'sin código'} · {selected.ticketCount} tickets</p></div><button className="red" onClick={()=>setSelected(null)}>Cerrar</button></div>{selected.estimated&&<div className="quickCostNotice">Este coste se ha calculado automáticamente como <b>1/3 del PVP</b>. Cámbialo por el coste real y guárdalo.</div>}<div className="intelligenceDetailGrid productProfitGrid"><p><span>Unidades vendidas</span><b>{selected.qty.toFixed(2)}</b></p><p><span>Facturación total</span><b>{money(selected.total)}</b></p><p><span>PVP unitario NUMIER</span><b>{money(selected.pvp)}</b><small>{Math.abs(selected.pvp-selected.avgSale)>.01?`Precio medio vendido: ${money(selected.avgSale)}`:'Coincide con el precio medio vendido'}</small></p><p className="editableCostCard"><span>Coste por unidad</span><input inputMode="decimal" type="number" min="0" step="0.0001" value={costDraft} onChange={e=>setCostDraft(e.target.value)} placeholder="Ej. 0,65"/><small>Puedes modificarlo directamente aquí.</small></p><p><span>Coste total del periodo</span><b>{money((Number(String(costDraft).replace(',','.'))||0)*selected.qty)}</b></p><p className="featured"><span>Beneficio total estimado</span><b>{money(selected.total-((Number(String(costDraft).replace(',','.'))||0)*selected.qty))}</b></p><p><span>Margen total</span><b>{selected.total?`${((selected.total-((Number(String(costDraft).replace(',','.'))||0)*selected.qty))/selected.total*100).toFixed(1)}%`:'—'}</b></p></div><label className="costReasonLabel">Motivo / nota del coste<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej. coste de cerveza de barril"/></label><div className="productProfitActions"><button onClick={saveCost} disabled={saving}>{saving?'Guardando...':'Guardar coste y recalcular'}</button></div></div></div>}{quickOpen&&<div className="modal productProfitOverlay" onClick={()=>!quickSaving&&setQuickOpen(false)}><div className="card intelligenceModal quickCostsModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">COSTES DE LOS PRODUCTOS VENDIDOS</span><h2>Edición rápida</h2><p>Los nuevos aparecen precargados al 33,33% del PVP. Modifica solo los que necesites.</p></div><button className="red" disabled={quickSaving} onClick={()=>setQuickOpen(false)}>Cerrar</button></div><div className="quickCostsList">{top.filter(p=>p.code).map(p=><label key={p.code} className={p.estimated?'estimated':''}><span><b>{p.name}</b><small>{p.qty.toFixed(2)} uds. · PVP medio {money(p.pvp)}{p.estimated?' · Estimación automática':''}</small></span><div><input inputMode="decimal" type="number" min="0" step="0.0001" value={quickDrafts[String(p.code)]??''} onChange={e=>setQuickDrafts({...quickDrafts,[String(p.code)]:e.target.value})}/><em>€/ud</em></div></label>)}</div><div className="productProfitActions"><button disabled={quickSaving} onClick={saveQuick}>{quickSaving?'Guardando costes...':'Guardar todos y recalcular'}</button></div></div></div>}</>;
}
function ShiftProfitability({tickets,lines,scheduleRows,costMap}){
 const[selected,setSelected]=useState(null);const[selectedTicket,setSelectedTicket]=useState(null);const linesByCab=new Map();(lines||[]).forEach(l=>{const k=String(l.cab_id);if(!linesByCab.has(k))linesByCab.set(k,[]);linesByCab.get(k).push(l)});
 const shiftStats=SHIFT_DEFS.map(s=>({ ...s, sales:0,tickets:0,staffHours:0,staffCost:0,productCost:0,knownRevenue:0,unknownRevenue:0,benefit:0,ticketRows:[] }));
 tickets.forEach(t=>{const id=shiftForTicket(t);const st=shiftStats.find(x=>x.id===id);if(st){st.sales+=Number(t.total||0);st.tickets++;st.ticketRows.push(t);const financial=periodFinancials(linesByCab.get(String(t.cab_id))||[],costMap);st.productCost+=financial.cost;st.unknownRevenue+=financial.unknownRevenue;st.knownRevenue+=financial.revenue-financial.unknownRevenue}});
 (scheduleRows||[]).forEach(r=>{const[a,b]=String(r.slot||'').split('-');if(!a||!b)return;const toDec=x=>{const[h,m]=x.split(':').map(Number);return h+m/60};const start=toDec(a),end=toDec(b),employees=Number(r.employees||1),hourly=Number(r.hourly_cost||7);shiftStats.forEach(s=>{const overlap=overlapHours(start,end,s.start,s.end)*employees;s.staffHours+=overlap;s.staffCost+=overlap*hourly})});
 shiftStats.forEach(s=>{s.benefit=s.sales-s.productCost-s.staffCost;s.margin=s.sales?(s.benefit/s.sales)*100:0});
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
  personal:{title:'Personal imputado por cuadrante',text:'El coste económico se calcula siempre con las horas del cuadrante y el coste/hora individual. Los fichajes son solo referencia operativa.',rows:[['Horas de cuadrante',`${Number(realCosts.hours||0).toFixed(1)} h`],['Coste imputado',money(realCosts.laborAccrued)],['Horas fichadas informativas',`${Number(realCosts.clockHours||0).toFixed(1)} h`],['Diferencia referencia',`${(Number(realCosts.clockHours||0)-Number(realCosts.hours||0)).toFixed(1)} h`]]},
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

function AnalysisInfoModal({detail,onClose,onNavigate}){
 if(!detail)return null;
 return <div className="modal analysisModalOverlay" onClick={onClose}><div className="card analysisDetailModal" onClick={e=>e.stopPropagation()}><div className="row between analysisDetailHead"><div><span className="sectionEyebrow">DETALLE DEL ANÁLISIS</span><h2>{detail.title}</h2>{detail.text&&<p>{detail.text}</p>}</div><button className="red" onClick={onClose}>Cerrar</button></div>{detail.rows?.length>0&&<div className="analysisDetailRows">{detail.rows.map((r,i)=><p key={i}><span>{r[0]}</span><b>{r[1]}</b></p>)}</div>}{detail.action&&<button className="analysisModalAction" onClick={()=>{onClose();onNavigate?.(detail.action.tab,detail.action.section)}}>{detail.action.label}</button>}</div></div>
}
function AnalysisMetricCard({label,value,small,tone='',onClick}){return <button type="button" className={`card analysisMetricCard ${tone}`} onClick={onClick}><span>{label}</span><b>{value}</b><small>{small}</small><em>Ver detalle ›</em></button>}
function analysisShiftStats(tickets,lines,scheduleRows,costMap){
 const linesByCab=new Map();(lines||[]).forEach(l=>{const k=String(l.cab_id);if(!linesByCab.has(k))linesByCab.set(k,[]);linesByCab.get(k).push(l)});
 const stats=SHIFT_DEFS.map(x=>({...x,sales:0,tickets:0,productCost:0,staffHours:0,staffCost:0,profit:0,margin:0}));
 (tickets||[]).forEach(t=>{const st=stats.find(x=>x.id===shiftForTicket(t));if(!st)return;st.sales+=Number(t.total||0);st.tickets++;st.productCost+=periodFinancials(linesByCab.get(String(t.cab_id))||[],costMap).cost});
 (scheduleRows||[]).forEach(r=>{const[a,b]=String(r.slot||'').split('-');if(!a||!b)return;const dec=x=>{const[h,m]=x.split(':').map(Number);return h+(m||0)/60};const aN=dec(a),bN=dec(b),people=Number(r.employees||1),rate=Number(r.hourly_cost||7);stats.forEach(st=>{const hrs=overlapHours(aN,bN,st.start,st.end)*people;st.staffHours+=hrs;st.staffCost+=hrs*rate})});
 stats.forEach(st=>{st.profit=st.sales-st.productCost-st.staffCost;st.margin=st.sales?st.profit/st.sales*100:0;st.salesPerHour=st.staffHours?st.sales/st.staffHours:0;st.profitPerHour=st.staffHours?st.profit/st.staffHours:0;st.laborPct=st.sales?st.staffCost/st.sales*100:0});return stats;
}
function buildAnalysisOpportunities({daily,financial,realCosts,previous,ranked,shifts}){
 const prevDaily=summarizeTickets(previous?.tickets||[]),salesChange=intelligencePctChange(daily.total,prevDaily.total),avgChange=intelligencePctChange(daily.ticket_medio,prevDaily.ticket_medio);
 const laborPct=daily.total?Number(realCosts.laborAccrued||0)/daily.total*100:0;const estimated=ranked.filter(p=>p.estimated);const low=ranked.filter(p=>!p.estimated&&p.margin<45).sort((a,b)=>b.total-a.total)[0];const weakShift=shifts.filter(x=>x.sales>0).sort((a,b)=>a.profitPerHour-b.profitPerHour)[0];
 const out=[];
 if(estimated.length)out.push({tone:'warn',title:`${estimated.length} productos con coste provisional`,text:`Representan ${money(estimated.reduce((a,p)=>a+p.total,0))} de ventas. Confirmarlos mejora la precisión del margen.`,rows:estimated.slice(0,12).map(p=>[p.name,`${money(p.total)} · coste 1/3`]),action:{tab:'almacen',section:'costes',label:'Abrir Costes rápidos'}});
 if(laborPct>30)out.push({tone:'warn',title:'Coste de personal alto sobre ventas',text:`El cuadrante supone el ${laborPct.toFixed(1)}% de las ventas del periodo.`,rows:[['Ventas',money(daily.total)],['Personal según cuadrante',money(realCosts.laborAccrued)],['Horas programadas',`${Number(realCosts.hours||0).toFixed(1)} h`]],action:{tab:'personal',section:'cuadrante',label:'Revisar cuadrante'}});
 if(low)out.push({tone:'warn',title:`Revisar margen de ${low.name}`,text:`Tiene ventas relevantes con un margen de ${low.margin.toFixed(1)}%.`,rows:[['Ventas',money(low.total)],['Coste',money(low.cost)],['Beneficio',money(low.profit)],['Margen',`${low.margin.toFixed(1)}%`]],action:{tab:'almacen',section:'ranking',label:'Abrir ranking de productos'}});
 if(weakShift&&weakShift.staffHours>0)out.push({tone:weakShift.profit<0?'bad':'info',title:`Turno a revisar: ${weakShift.name}`,text:`Es la franja con menor beneficio por hora programada (${money(weakShift.profitPerHour)}/h).`,rows:[['Ventas',money(weakShift.sales)],['Horas cuadrante',`${weakShift.staffHours.toFixed(1)} h`],['Coste personal',money(weakShift.staffCost)],['Beneficio',money(weakShift.profit)]]});
 if(avgChange<-8)out.push({tone:'info',title:'Ticket medio por debajo del periodo anterior',text:`Ha variado ${avgChange.toFixed(1)}%. Conviene revisar mix de productos y venta adicional.`,rows:[['Ticket medio actual',money(daily.ticket_medio)],['Ticket medio anterior',money(prevDaily.ticket_medio)]]});
 if(salesChange<-10)out.push({tone:'bad',title:'Ventas por debajo del periodo anterior',text:`La facturación cae ${Math.abs(salesChange).toFixed(1)}% frente al periodo inmediatamente anterior.`,rows:[['Ventas actuales',money(daily.total)],['Ventas anteriores',money(prevDaily.total)]]});
 if(!out.length)out.push({tone:'ok',title:'Sin oportunidades críticas detectadas',text:'Ventas, margen, personal programado y costes no muestran desviaciones destacadas con las reglas actuales.',rows:[['Beneficio',money(financial.realProfit)],['Margen real',`${financial.realMargin.toFixed(1)}%`],['Personal / ventas',`${laborPct.toFixed(1)}%`]]});
 return out.slice(0,5);
}
function BusinessIntelligence({view='resumen',onNavigate}){
 const[mode,setMode]=useState('semana');const[date,setDate]=useState(today());const[customFrom,setCustomFrom]=useState(monthStartISO(today()));const[customTo,setCustomTo]=useState(today());const[bi,setBi]=useState({tickets:[],lines:[],sync:null,articles:new Map(),costMap:new Map()});const[previous,setPrevious]=useState({tickets:[],lines:[]});const[clock,setClock]=useState([]);const[realCosts,setRealCosts]=useState({fixed:0,variable:0,laborAccrued:0,hours:0,clockHours:0,details:{}});const[previousReal,setPreviousReal]=useState({fixed:0,variable:0,laborAccrued:0,hours:0});const[loading,setLoading]=useState(false);const[selectedKpi,setSelectedKpi]=useState(null);const[detail,setDetail]=useState(null);const r=rangeDates(mode,date,customFrom,customTo);
 useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t)},[mode,date,customFrom,customTo]);
 async function load(){if(!supabase)return;setLoading(true);try{const periodDays=Math.max(1,Math.round((new Date(r.to)-new Date(r.from))/86400000));const prevFrom=addDays(r.from,-periodDays),prevTo=r.from;const loader=(mode==='anio'||mode==='mes'||mode==='treinta'||mode==='rango')?loadSalesRangeGestoria:loadSalesRange;const [current,costMap,previousData,clockRes,real,prevReal]=await Promise.all([loader(r.from,r.to),loadProfitabilityCostMap(),loader(prevFrom,prevTo),supabase.from('clock_records').select('*').gte('created_at',r.from+'T00:00:00').lt('created_at',r.to+'T00:00:00').order('created_at',{ascending:true}).limit(10000),loadRealProfitability(supabase,r.from,r.to,[]),loadRealProfitability(supabase,prevFrom,prevTo,[])]);const clocks=clockRes.data||[];const currentG=Number(current.numierExpenses?.total||0),prevG=Number(previousData.numierExpenses?.total||0);real.variableERP=Number(real.variable||0);real.numierExpenses=currentG;real.variable=real.variableERP+currentG;prevReal.variableERP=Number(prevReal.variable||0);prevReal.numierExpenses=prevG;prevReal.variable=prevReal.variableERP+prevG;setBi({tickets:(current.tickets||[]).filter(isRealSaleTicket),lines:normalizePeriodLines((current.tickets||[]).filter(isRealSaleTicket),current.lines||[]),sync:current.sync,articles:current.articles||new Map(),costMap});setPrevious({tickets:(previousData.tickets||[]).filter(isRealSaleTicket),lines:normalizePeriodLines((previousData.tickets||[]).filter(isRealSaleTicket),previousData.lines||[])});setClock(clocks);const ref=await loadRealProfitability(supabase,r.from,r.to,clocks);ref.variableERP=real.variableERP;ref.numierExpenses=currentG;ref.variable=real.variable;setRealCosts({...real,clockHours:ref.clockHours,details:{...real.details,actualLabor:ref.details?.actualLabor||[]}});setPreviousReal(prevReal)}finally{setLoading(false)}}
 const daily=summarizeTickets(bi.tickets),lineFinancial=periodFinancials(bi.lines,bi.costMap),coreProfit=calculateProfitability({revenue:daily.total,productCost:lineFinancial.cost,laborCost:realCosts.laborAccrued,fixedExpenses:realCosts.fixed,variableExpenses:realCosts.variable});const financial={...lineFinancial,revenue:coreProfit.revenue,profit:coreProfit.grossMargin,margin:coreProfit.grossMarginPct,operatingProfit:coreProfit.operatingMargin,realProfit:coreProfit.realProfit,realMargin:coreProfit.realMarginPct};
 const prevDaily=summarizeTickets(previous.tickets||[]),prevFin=periodFinancials(previous.lines||[],bi.costMap),prevCore=calculateProfitability({revenue:prevDaily.total,productCost:prevFin.cost,laborCost:previousReal.laborAccrued,fixedExpenses:previousReal.fixed,variableExpenses:previousReal.variable}),salesChange=intelligencePctChange(daily.total,prevDaily.total),profitChange=intelligencePctChange(financial.realProfit,prevCore.realProfit),ticketChange=intelligencePctChange(daily.ticket_medio,prevDaily.ticket_medio);
 const ranked=productRank(bi.lines,'total',bi.articles).map(p=>{const info=bi.costMap?.get?.(String(p.code));const pvp=Number(info?.sale||0)>0?Number(info.sale):(p.qty?p.total/p.qty:0);const configured=info&&!info.excluded&&info.cost!==null&&Number.isFinite(Number(info.cost));const unitCost=configured?Number(info.cost):pvp/3,cost=unitCost*p.qty,profit=p.total-cost;return {...p,pvp,unitCost,cost,profit,margin:p.total?profit/p.total*100:0,estimated:!configured}});
 const shifts=analysisShiftStats(bi.tickets,bi.lines,realCosts.scheduleRows||[],bi.costMap),laborPct=daily.total?realCosts.laborAccrued/daily.total*100:0,salesPerLaborHour=realCosts.hours?daily.total/realCosts.hours:0,profitPerLaborHour=realCosts.hours?financial.realProfit/realCosts.hours:0,clockDelta=Number(realCosts.clockHours||0)-Number(realCosts.hours||0);const opportunities=buildAnalysisOpportunities({daily,financial,realCosts,previous,ranked,shifts});
 const buttons=[['hoy','Hoy'],['ayer','Ayer'],['tresdias','3 días'],['semana','7 días'],['treinta','30 días'],['mes','Mes'],['anio','Año'],['rango','Rango']];
 const metricDetails={ventas:{title:'Ventas del periodo',text:'Ventas válidas cobradas en Numier.',rows:[['Ventas',money(daily.total)],['Tickets',daily.tickets],['Ticket medio',money(daily.ticket_medio)],['Variación',`${salesChange>=0?'+':''}${salesChange.toFixed(1)}%`]]},beneficio:{title:'Beneficio real del periodo',text:'Resultado usando productos, personal SIEMPRE según cuadrante y todos los gastos.',rows:[['Ventas',money(daily.total)],['Productos',`- ${money(lineFinancial.cost)}`],['Personal · cuadrante',`- ${money(realCosts.laborAccrued)}`],['Fijos',`- ${money(realCosts.fixed)}`],['Variables ERP',`- ${money(realCosts.variableERP||0)}`],['Numier G',`- ${money(realCosts.numierExpenses||0)}`],['Beneficio',money(financial.realProfit)],['Margen',`${financial.realMargin.toFixed(1)}%`]]},personal:{title:'Productividad del cuadrante',text:'Los fichajes no cambian el coste. Solo se muestran como referencia de cumplimiento.',rows:[['Horas cuadrante',`${Number(realCosts.hours||0).toFixed(1)} h`],['Coste cuadrante',money(realCosts.laborAccrued)],['Ventas / hora programada',money(salesPerLaborHour)],['Beneficio / hora programada',money(profitPerLaborHour)],['Personal / ventas',`${laborPct.toFixed(1)}%`],['Horas fichadas · referencia',`${Number(realCosts.clockHours||0).toFixed(1)} h`],['Desviación fichaje vs cuadrante',`${clockDelta>=0?'+':''}${clockDelta.toFixed(1)} h`]],action:{tab:'personal',section:'cuadrante',label:'Abrir cuadrante'}},costes:{title:'Calidad de costes de producto',text:'Los productos sin coste configurado usan provisionalmente 1/3 de su PVP.',rows:[['Coste productos',money(lineFinancial.cost)],['Venta con coste 1/3',money(lineFinancial.estimatedRevenue)],['Productos provisionales',ranked.filter(p=>p.estimated).length]],action:{tab:'almacen',section:'costes',label:'Abrir Costes rápidos'}},tickets:{title:'Tickets y consumo medio',rows:[['Tickets',daily.tickets],['Ticket medio',money(daily.ticket_medio)],['Cambio ticket medio',`${ticketChange>=0?'+':''}${ticketChange.toFixed(1)}%`]]},gastos:{title:'Impacto de gastos',rows:[['Gastos fijos',money(realCosts.fixed)],['Variables ERP',money(realCosts.variableERP||0)],['Gastos Numier G',money(realCosts.numierExpenses||0)],['Total gastos',money(Number(realCosts.fixed||0)+Number(realCosts.variable||0))]],action:{tab:'finanzas',section:'resumen',label:'Abrir Finanzas'}}};
 const header=<><div className="card hero intelligenceHero"><div><span className="sectionEyebrow">ANÁLISIS 5.1 · INTELIGENCIA DE NEGOCIO</span><h2>Interpretar para decidir</h2><p>{r.label}. Finanzas calcula; Análisis explica; IA recomienda.</p></div><div className="analysisPeriodControls"><div className="row controls intelligenceRange">{buttons.map(([id,label])=><button key={id} className={mode===id?'active':''} onClick={()=>{setMode(id);if(id==='mes')setDate(monthStartISO(today()));if(id==='anio')setDate(yearStartISO(today()))}}>{label}</button>)}</div>{mode==='rango'?<div className="analysisCustomRange"><label>Desde<input type="date" value={customFrom} onChange={e=>{const v=e.target.value;setCustomFrom(v);if(customTo&&v>customTo)setCustomTo(v)}}/></label><label>Hasta<input type="date" value={customTo} min={customFrom} onChange={e=>setCustomTo(e.target.value)}/></label><button onClick={load}>{loading?'Cargando...':'Analizar rango'}</button></div>:<div className="analysisSingleDate"><input type="date" value={date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/><button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div>}</div></div></>;
 const summary=<><div className="grid analysisMainKpis"><AnalysisMetricCard label="Ventas" value={money(daily.total)} small={`${salesChange>=0?'+':''}${salesChange.toFixed(1)}% vs periodo anterior`} onClick={()=>setDetail(metricDetails.ventas)}/><AnalysisMetricCard label="Beneficio real" value={money(financial.realProfit)} small={`${financial.realMargin.toFixed(1)}% de margen`} tone={financial.realProfit>=0?'positive':'negative'} onClick={()=>setDetail(metricDetails.beneficio)}/><AnalysisMetricCard label="Personal · cuadrante" value={money(realCosts.laborAccrued)} small={`${Number(realCosts.hours||0).toFixed(1)} h programadas`} onClick={()=>setDetail(metricDetails.personal)}/><AnalysisMetricCard label="Ventas / h personal" value={money(salesPerLaborHour)} small={`${laborPct.toFixed(1)}% de ventas en personal`} onClick={()=>setDetail(metricDetails.personal)}/><AnalysisMetricCard label="Costes producto" value={money(lineFinancial.cost)} small={`${ranked.filter(p=>p.estimated).length} provisionales`} onClick={()=>setDetail(metricDetails.costes)}/><AnalysisMetricCard label="Tickets / medio" value={String(daily.tickets)} small={money(daily.ticket_medio)} onClick={()=>setDetail(metricDetails.tickets)}/></div><button type="button" className="card analysisNarrative" onClick={()=>setDetail(metricDetails.beneficio)}><span className="sectionEyebrow">LECTURA DEL PERIODO</span><h2>{salesChange>=5?'Ventas en crecimiento':salesChange<=-5?'Ventas por debajo del periodo anterior':'Ventas estables'} · {profitChange>=5?'mejora el beneficio':profitChange<=-5?'empeora el beneficio':'beneficio estable'}</h2><p>Las ventas cambian <b>{salesChange>=0?'+':''}{salesChange.toFixed(1)}%</b> y el beneficio <b>{profitChange>=0?'+':''}{profitChange.toFixed(1)}%</b>. El cuadrante imputa {Number(realCosts.hours||0).toFixed(1)} h y {money(realCosts.laborAccrued)} de personal. Los fichajes ({Number(realCosts.clockHours||0).toFixed(1)} h) son solo una referencia operativa.</p><em>Ver composición del beneficio ›</em></button><IntelligenceDecisionCenter tickets={bi.tickets} lines={bi.lines} articles={bi.articles} costMap={bi.costMap} financial={financial} daily={daily} previous={previous}/><div className="grid"><PredictionBox mode={mode} date={date} tickets={bi.tickets}/><button className="card analysisClickablePanel" onClick={()=>setDetail(metricDetails.ventas)}><h2>📈 Ventas por hora</h2><SalesByHour tickets={bi.tickets}/><small>Pulsa para ver el detalle de ventas</small></button></div></>;
 const comparisons=<><div className="grid analysisComparisonCards"><AnalysisMetricCard label="Ventas" value={money(daily.total)} small={`Anterior ${money(prevDaily.total)} · ${salesChange>=0?'+':''}${salesChange.toFixed(1)}%`} onClick={()=>setDetail(metricDetails.ventas)}/><AnalysisMetricCard label="Beneficio" value={money(financial.realProfit)} small={`Anterior ${money(prevCore.realProfit)} · ${profitChange>=0?'+':''}${profitChange.toFixed(1)}%`} onClick={()=>setDetail(metricDetails.beneficio)}/><AnalysisMetricCard label="Ticket medio" value={money(daily.ticket_medio)} small={`Anterior ${money(prevDaily.ticket_medio)} · ${ticketChange>=0?'+':''}${ticketChange.toFixed(1)}%`} onClick={()=>setDetail(metricDetails.tickets)}/><AnalysisMetricCard label="Margen real" value={`${financial.realMargin.toFixed(1)}%`} small={`Anterior ${prevCore.realMarginPct.toFixed(1)}%`} onClick={()=>setDetail(metricDetails.beneficio)}/></div><section className="card"><h2>Comparación equivalente</h2><p className="mutedText">Se compara el mismo número de días inmediatamente anterior al periodo seleccionado, utilizando el mismo motor de costes y cuadrantes.</p><div className="analysisCompareTable"><p><span>Ventas</span><b>{money(daily.total)}</b><em>{money(prevDaily.total)}</em><ChangePill value={salesChange}/></p><p><span>Tickets</span><b>{daily.tickets}</b><em>{prevDaily.tickets}</em><ChangePill value={intelligencePctChange(daily.tickets,prevDaily.tickets)}/></p><p><span>Ticket medio</span><b>{money(daily.ticket_medio)}</b><em>{money(prevDaily.ticket_medio)}</em><ChangePill value={ticketChange}/></p><p><span>Personal cuadrante</span><b>{money(realCosts.laborAccrued)}</b><em>{money(previousReal.laborAccrued)}</em><ChangePill value={intelligencePctChange(realCosts.laborAccrued,previousReal.laborAccrued)}/></p><p><span>Beneficio</span><b>{money(financial.realProfit)}</b><em>{money(prevCore.realProfit)}</em><ChangePill value={profitChange}/></p></div></section></>;
 const turns=<><section className="analysisShiftGrid">{shifts.map(st=><button key={st.id} className={`card analysisShiftCard ${st.profit<0?'bad':''}`} onClick={()=>setDetail({title:`Turno ${st.name}`,text:'Rentabilidad de la franja con personal imputado exclusivamente desde cuadrante.',rows:[['Ventas',money(st.sales)],['Tickets',st.tickets],['Coste productos',money(st.productCost)],['Horas cuadrante',`${st.staffHours.toFixed(1)} h`],['Coste personal',money(st.staffCost)],['Ventas / h personal',money(st.salesPerHour)],['Beneficio / h personal',money(st.profitPerHour)],['Beneficio',money(st.profit)],['Margen',`${st.margin.toFixed(1)}%`]]})}><span>{st.name}</span><b>{money(st.profit)}</b><small>{st.staffHours.toFixed(1)} h cuadrante · {money(st.sales)} ventas</small><em>{st.margin.toFixed(1)}% margen · ver detalle ›</em></button>)}</section><ShiftProfitability tickets={bi.tickets} lines={bi.lines} scheduleRows={realCosts.scheduleRows||[]} costMap={bi.costMap}/></>;
 const personnel=<><div className="grid analysisMainKpis"><AnalysisMetricCard label="Horas programadas" value={`${Number(realCosts.hours||0).toFixed(1)} h`} small="Fuente económica: cuadrante" onClick={()=>setDetail(metricDetails.personal)}/><AnalysisMetricCard label="Coste personal" value={money(realCosts.laborAccrued)} small={`${laborPct.toFixed(1)}% de ventas`} onClick={()=>setDetail(metricDetails.personal)}/><AnalysisMetricCard label="Ventas / h" value={money(salesPerLaborHour)} small="Por hora programada" onClick={()=>setDetail(metricDetails.personal)}/><AnalysisMetricCard label="Beneficio / h" value={money(profitPerLaborHour)} small="Por hora programada" onClick={()=>setDetail(metricDetails.personal)}/><AnalysisMetricCard label="Fichajes · referencia" value={`${Number(realCosts.clockHours||0).toFixed(1)} h`} small={`${clockDelta>=0?'+':''}${clockDelta.toFixed(1)} h vs cuadrante`} onClick={()=>setDetail(metricDetails.personal)}/></div><section className="card"><div className="row between"><div><h2>Coste por empleado según cuadrante</h2><p className="mutedText">El fichaje no altera ninguna cifra económica.</p></div><button onClick={()=>onNavigate?.('personal','cuadrante')}>Abrir cuadrante</button></div><div className="analysisStaffList">{(realCosts.details?.labor||[]).map((x,i)=><button key={x.employee_id||i} onClick={()=>setDetail({title:x.employee_name||'Empleado',text:'Detalle económico programado en cuadrante.',rows:[['Horas',`${Number(x.hours||0).toFixed(1)} h`],['Coste/hora',money(x.hourly_cost)],['Coste total',money(x.cost)]]})}><span><b>{x.employee_name||'Empleado'}</b><small>{Number(x.hours||0).toFixed(1)} h × {money(x.hourly_cost)}</small></span><strong>{money(x.cost)}</strong><em>›</em></button>)}</div></section></>;
 const products=<ProductRanking lines={bi.lines} articles={bi.articles} costMap={bi.costMap} onCostSaved={load}/>;
 const expenses=<><div className="grid analysisMainKpis"><AnalysisMetricCard label="Gastos fijos" value={money(realCosts.fixed)} small="Prorrateados por días" onClick={()=>setDetail({title:'Gastos fijos imputados',rows:(realCosts.details?.fixed||[]).map(x=>[`${x.name} · ${x.days} días`,money(x.imputed)]),action:{tab:'finanzas',section:'resumen',label:'Abrir Finanzas'}})}/><AnalysisMetricCard label="Variables ERP" value={money(realCosts.variableERP||0)} small={`${(realCosts.details?.variable||[]).length} movimientos`} onClick={()=>setDetail({title:'Gastos variables ERP',rows:(realCosts.details?.variable||[]).map(x=>[`${x.expense_date||''} · ${x.name||'Gasto'}`,money(x.amount)])})}/><AnalysisMetricCard label="Gastos Numier G" value={money(realCosts.numierExpenses||0)} small="Registrados desde TPV" onClick={()=>setDetail(metricDetails.gastos)}/><AnalysisMetricCard label="Impacto total gastos" value={money(Number(realCosts.fixed||0)+Number(realCosts.variable||0))} small={`${daily.total?((Number(realCosts.fixed||0)+Number(realCosts.variable||0))/daily.total*100).toFixed(1):'0.0'}% de ventas`} onClick={()=>setDetail(metricDetails.gastos)}/></div><button type="button" className="card analysisExpenseImpact" onClick={()=>setDetail(metricDetails.gastos)}><h2>Impacto sobre el resultado</h2><p>Antes de gastos: <b>{money(financial.operatingProfit)}</b></p><p>Gastos fijos: <b>- {money(realCosts.fixed)}</b></p><p>Variables ERP: <b>- {money(realCosts.variableERP||0)}</b></p><p>Numier G: <b>- {money(realCosts.numierExpenses||0)}</b></p><p className="total">Beneficio final: <b>{money(financial.realProfit)}</b></p><em>Ver detalle de gastos ›</em></button></>;
 const opportunityView=<section className="analysisOpportunities"><div className="analysisOpportunityIntro"><span className="sectionEyebrow">PRIORIDAD DE GESTIÓN</span><h2>Qué merece tu atención</h2><p>Máximo cinco acciones ordenadas por impacto. Todas son pulsables y llevan al dato o módulo relacionado.</p></div>{opportunities.map((o,i)=><button className={`card analysisOpportunity ${o.tone}`} key={i} onClick={()=>setDetail(o)}><span>PRIORIDAD {i+1}</span><h3>{o.title}</h3><p>{o.text}</p><em>Ver detalle y acción ›</em></button>)}</section>;
 const body=view==='comparativas'?comparisons:view==='turnos'?turns:view==='personal'?personnel:view==='productos'?products:view==='gastos'?expenses:view==='oportunidades'?opportunityView:summary;
 return <div className="businessIntelligencePro analysis51">{header}{body}<IntelligenceKpiModal type={selectedKpi} onClose={()=>setSelectedKpi(null)} financial={financial} daily={daily} realCosts={realCosts}/><AnalysisInfoModal detail={detail} onClose={()=>setDetail(null)} onNavigate={onNavigate}/></div>;
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
 const fullGross=fullSummary.total-fullFin.cost,fullNumierExpenses=Number(data.today?.numierExpenses?.total||0),fullReal=fullGross-Number(p.laborAccrued||0)-Number(p.fixed||0)-Number(p.variable||0)-fullNumierExpenses,fullMargin=fullSummary.total?fullReal/fullSummary.total*100:0;
 const accruedLaborHours=scheduledHoursUntil(p.scheduleRows||[],date,hour),accruedLabor=accruedLaborHours*7,accruedFixed=Number(p.fixed||0)*operatingProgress;
 const currentExpenseTotal=(data.today?.expenseTickets||[]).filter(t=>decimalHour(t.hora||t.created_at)<=hour).reduce((a,t)=>a+numierExpenseAmount(t),0);const accruedReal=currentSummary.total-currentFin.cost-accruedLabor-accruedFixed-Number(p.variable||0)-currentExpenseTotal,accruedMargin=currentSummary.total?accruedReal/currentSummary.total*100:0;
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
  <section className="card commandEconomy"><h2>Resultado hasta ahora</h2><p><span>Ventas cobradas</span><b>{money(currentSummary.total)}</b></p><p><span>Coste de producto</span><b>- {money(currentFin.cost)}</b></p><p><span>Personal transcurrido</span><b>- {money(accruedLabor)}</b></p><p><span>Gastos fijos imputados</span><b>- {money(accruedFixed)}</b></p><p><span>Variables registrados en ERP</span><b>- {money(p.variable)}</b></p><p><span>Gastos registrados en Numier (G)</span><b>- {money(currentExpenseTotal)}</b></p><p className="total"><span>Resultado acumulado</span><b className={accruedReal>=0?'ok':'bad'}>{money(accruedReal)}</b></p></section>
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

function WeeklyStaffPerformance({weekId}){
 const[state,setState]=useState({loading:true,error:'',from:'',to:'',label:'',sales:0,tickets:0,productCost:0,laborCost:0,hours:0,fixed:0,variableERP:0,numierG:0,realProfit:0,realMargin:0,labor:[]});
 const[detail,setDetail]=useState(null);
 useEffect(()=>{load()},[weekId]);
 async function load(){
  if(!supabase){setState(s=>({...s,loading:false,error:'Supabase no configurado'}));return}
  setState(s=>({...s,loading:true,error:''}));
  try{
   const monday=isoWeekMonday(weekId),from=localISODate(monday),weekTo=addDays(from,7),current=today();
   const to=(from<=current&&current<weekTo)?addDays(current,1):weekTo;
   const [sales,costMap,real]=await Promise.all([loadSalesRangeGestoria(from,to),loadProfitabilityCostMap(),loadRealProfitability(supabase,from,to,[])]);
   const tickets=(sales.tickets||[]).filter(isRealSaleTicket),lines=normalizePeriodLines(tickets,sales.lines||[]),summary=summarizeTickets(tickets),products=periodFinancials(lines,costMap);
   const numierG=Number(sales.numierExpenses?.total||0),variableERP=Number(real.variable||0),variable=variableERP+numierG;
   const core=calculateProfitability({revenue:summary.total,productCost:products.cost,laborCost:Number(real.laborAccrued||0),fixedExpenses:Number(real.fixed||0),variableExpenses:variable});
   setState({loading:false,error:'',from,to:addDays(to,-1),label:to===weekTo?'semana completa':'semana hasta hoy',sales:summary.total,tickets:summary.tickets,productCost:products.cost,laborCost:Number(real.laborAccrued||0),hours:Number(real.hours||0),fixed:Number(real.fixed||0),variableERP,numierG,realProfit:core.realProfit,realMargin:core.realMarginPct,labor:real.details?.labor||[]});
  }catch(e){setState(s=>({...s,loading:false,error:e.message||String(e)}))}
 }
 const employeeCount=state.labor.filter(x=>Number(x.hours||0)>0).length,profitPerHour=state.hours?state.realProfit/state.hours:0,profitPerEmployee=employeeCount?state.realProfit/employeeCount:0,laborPct=state.sales?state.laborCost/state.sales*100:0,salesPerHour=state.hours?state.sales/state.hours:0;
 const open=(kind,title)=>setDetail({kind,title});
 const cards=[['sales','Ventas',money(state.sales),`${state.tickets} tickets`],['labor','Coste personal',money(state.laborCost),`${state.hours.toFixed(1)} h de cuadrante`],['profit','Beneficio real',money(state.realProfit),`${state.realMargin.toFixed(1)}% de margen`],['hour','Beneficio / h cuadrante',money(profitPerHour),`${money(salesPerHour)} ventas/h`],['employee','Beneficio / empleado',money(profitPerEmployee),`${employeeCount} empleados programados`],['ratio','Personal / ventas',`${laborPct.toFixed(1)}%`,`${money(state.laborCost)} sobre ${money(state.sales)}`]];
 const detailRows=detail?.kind==='labor'||detail?.kind==='employee'?state.labor.map(x=>[x.employee_name||'Empleado',`${Number(x.hours||0).toFixed(1)} h × ${money(x.hourly_cost)} = ${money(x.cost)}`]):detail?.kind==='profit'?[['Ventas',money(state.sales)],['Coste productos',`− ${money(state.productCost)}`],['Personal (cuadrante)',`− ${money(state.laborCost)}`],['Gastos fijos',`− ${money(state.fixed)}`],['Gastos variables ERP',`− ${money(state.variableERP)}`],['Gastos Numier G',`− ${money(state.numierG)}`],['Beneficio real',money(state.realProfit)]]:detail?.kind==='sales'?[['Ventas',money(state.sales)],['Tickets',state.tickets],['Periodo',`${state.from} → ${state.to}`]]:detail?.kind==='hour'?[['Horas de cuadrante',state.hours.toFixed(1)],['Ventas / hora',money(salesPerHour)],['Beneficio / hora',money(profitPerHour)]]:detail?.kind==='ratio'?[['Coste de personal',money(state.laborCost)],['Ventas',money(state.sales)],['Personal / ventas',`${laborPct.toFixed(1)}%`]]:[['Beneficio real',money(state.realProfit)],['Empleados programados',employeeCount],['Beneficio / empleado',money(profitPerEmployee)]];
 return <section className="card weeklyStaffPerformance"><div className="row between weeklyPerfHead"><div><span className="sectionEyebrow">RENDIMIENTO SEMANAL · BENEFICIO REAL / PERSONAL</span><h2>Rendimiento de {weekId}</h2><p>{state.from&&`${fmtDate(state.from)} a ${fmtDate(state.to)} · ${state.label}.`} El coste de personal procede exclusivamente del cuadrante; los fichajes no intervienen en el cálculo económico.</p></div><button onClick={load} disabled={state.loading}>{state.loading?'Calculando…':'Actualizar'}</button></div>{state.error&&<div className="warnBox">{state.error}</div>}<div className="weeklyPerfKpis">{cards.map(([kind,title,value,sub])=><button type="button" className="weeklyPerfKpi" key={kind} onClick={()=>open(kind,title)}><span>{title}</span><b className={kind==='profit'?(state.realProfit>=0?'ok':'bad'):''}>{value}</b><small>{sub} · ver detalle ›</small></button>)}</div><div className="weeklyEmployeeList"><div className="row between"><div><h3>Coste por empleado según cuadrante</h3><p className="mutedText">Pulsa cualquier empleado para ver su imputación semanal.</p></div></div>{state.labor.length?state.labor.map((x,i)=><button key={x.employee_id||x.employee_name||i} className="weeklyEmployeeRow" onClick={()=>setDetail({kind:'laborOne',title:x.employee_name||'Empleado',employee:x})}><span><b>{x.employee_name||'Empleado'}</b><small>{Number(x.hours||0).toFixed(1)} h programadas</small></span><strong>{money(x.cost)}</strong></button>):!state.loading&&<div className="alertOk">No hay horas de cuadrante imputadas en este periodo.</div>}</div>{detail&&<div className="modal weeklyPerfOverlay" onClick={()=>setDetail(null)}><div className="card weeklyPerfModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">DETALLE SEMANAL</span><h2>{detail.title}</h2></div><button className="red" onClick={()=>setDetail(null)}>Cerrar</button></div>{detail.kind==='laborOne'?<div className="weeklyPerfDetail"><p><span>Horas de cuadrante</span><b>{Number(detail.employee.hours||0).toFixed(1)} h</b></p><p><span>Coste / hora</span><b>{money(detail.employee.hourly_cost)}</b></p><p><span>Coste semanal</span><b>{money(detail.employee.cost)}</b></p><p><span>% del coste personal</span><b>{state.laborCost?`${(Number(detail.employee.cost||0)/state.laborCost*100).toFixed(1)}%`:'0.0%'}</b></p></div>:<div className="weeklyPerfDetail">{detailRows.map((r,i)=><p key={i}><span>{r[0]}</span><b>{r[1]}</b></p>)}</div>}</div></div>}</section>
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
   id=id||slugName(name);
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
    const id=String(e.id||slugName(label));
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
 function empById(id){const normalized=normalizeEmployeeId(id);return employees.find(e=>String(e.id)===String(normalized)||slugName(e.name)===slugName(normalized))||{id,name:id,category:'',color:'#607d8b'}}
 function setCell(day,slot,ids){const w=cleanWeek(weekData);w[day][slot]=Array.isArray(ids)?ids.slice(0,MAX_PER_SLOT):[];saveWeek(weekId,w)}
 function toggleEmployee(id){if(!selected)return;const arr=getCell(selected.day,selected.slot).filter(x=>x!==CLOSED_ID);const next=arr.includes(id)?arr.filter(x=>x!==id):arr.length>=MAX_PER_SLOT?arr:[...arr,id];setCell(selected.day,selected.slot,next)}
 function markClosed(day,slot){setCell(day,slot,[CLOSED_ID]);setSelected(null)}
 function isClosed(day,slot){return getCell(day,slot).includes(CLOSED_ID)}
 async function addEmployee(){alert('Los empleados se crean y modifican desde la pestaña Empleados. Al guardarlos aparecerán aquí automáticamente.')}
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
  <WeeklyStaffPerformance weekId={weekId}/>
  <div className="card mainScheduleCard scheduleCard" id="printSchedule">
   <div className="row between scheduleTitleBar"><div><h2>Cuadrante semanal {weekId}</h2><p className="mutedText">Fuente única: Supabase. En PC arrastra una etiqueta para DUPLICARLA en otra franja. En móvil toca un empleado y luego toca la celda destino.</p></div><b className="scheduleVersion">{totalHours.toFixed(1)} h</b></div>
   {warnings.length>0&&<div className="warnBox">{warnings.join(' · ')}</div>}
   {copyItem&&<div className="copyModeBox">📋 Copiando <b>{empById(copyItem.id).name}</b>. Toca una celda destino para duplicarlo. <button onClick={()=>{setCopyItem(null);setTouchHint('')}}>Cancelar</button></div>}
   {touchHint&&<div className="copyModeBox soft">{touchHint}</div>}
   <div className="scheduleWrap"><table className="schedulePro"><thead><tr><th>Hora</th>{DAYS.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{SLOTS.map(slot=><tr key={slot}><td className="slotHour">{slot}</td>{DAYS.map(day=>{const closed=isClosed(day,slot);const cell=getCell(day,slot).filter(id=>id!==CLOSED_ID);return <td key={day+slot} data-day={day} data-slot={slot} className={(copyItem?'shiftCell copyReady':'shiftCell')+(closed?' closedCell':'')} onClick={()=>{if(!copyEmployeeToCell(day,slot))setSelected({day,slot})}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={e=>copyDrag(day,slot,e)}>{closed?<span className="closedLabel">CERRADO</span>:<>{cell.length===0&&<span className="emptyShift">+ añadir</span>}{cell.map(id=>{const emp=empById(id);return <span key={id} draggable className="badge" style={{background:emp.color,color:emp.color==='#ffee58'?'#073b35':'white'}} title="Arrastra para duplicar. En móvil toca y luego toca destino." onClick={e=>{e.stopPropagation();startCopyEmployee(id,day,slot);}} onPointerDown={e=>{e.stopPropagation();pointerStart(e,id,day,slot)}} onPointerMove={pointerMove} onPointerUp={pointerEnd} onDoubleClick={e=>{e.stopPropagation();setSelected({day,slot})}} onDragStart={e=>{e.stopPropagation();const item={id,day,slot};setDragItem(item);e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/json',JSON.stringify(item));e.dataTransfer.setData('text/plain',JSON.stringify(item));}} onDragEnd={()=>setDragItem(null)}>{emp.name}</span>})}</>}</td>})}</tr>)}</tbody></table></div>
   <div className="employeeSummary">{employees.map(e=><div key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><em>{(totals[e.id]||0).toFixed(1)} h</em></div>)}</div>
   <textarea value={buildWhatsApp()} readOnly rows={10}/>
  </div>
  <div className="card employeeManager"><div className="scheduleEmployeeHeader"><div><h2>Empleados del cuadrante</h2><p>Esta lista se sincroniza automáticamente con la pestaña Empleados. Para crear, renombrar o desactivar personal, usa su ficha individual.</p></div><button onClick={async()=>setEmployees(await loadEmployeesFromSupabase(employees))}>Actualizar empleados</button></div><div className="employeeChips">{employees.map(e=><span className="employeeChip" key={e.id}><span className="sq" style={{background:e.color}}></span><b>{e.name}</b><small>{e.category}</small></span>)}</div></div>
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
function Profitability({initialTab='resumen',hideTabs=false}){
 const[t,setT]=useState(initialTab);
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
{!hideTabs&&<div className="profitTabs">{[['resumen','Resumen'],['real','Rentabilidad real'],['facturas','Facturas IA'],['costes','Costes'],['escandallos','Escandallos'],['margenes','Márgenes'],['proveedores','Proveedores']].map(([id,label])=><button key={id} className={t===id?'active':''} onClick={()=>setT(id)}>{label}</button>)}</div>}
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


function inventoryParseJSON(key,fallback){
 try{
  const raw=localStorage.getItem(key);
  if(!raw)return fallback;
  const parsed=JSON.parse(raw);
  return parsed&&typeof parsed==='object'?parsed:fallback;
 }catch(error){
  console.warn('Datos locales de almacén no válidos; se usarán valores iniciales.',error);
  return fallback;
 }
}

function Inventory({initialTab='resumen',hideTabs=false}){
 const[tab,setTab]=useState(initialTab);
 const[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[data,setData]=useState({masters:[],items:[],recipes:[],ingredients:[],links:[],sales:[],monthSales:[]});
 const[costMap,setCostMap]=useState(new Map()),[costQuery,setCostQuery]=useState(''),[costDrafts,setCostDrafts]=useState({}),[savingCosts,setSavingCosts]=useState(false);
 const[rankFrom,setRankFrom]=useState(today()),[rankTo,setRankTo]=useState(today()),[rankQuery,setRankQuery]=useState(''),[rankSort,setRankSort]=useState('qty'),[rankLines,setRankLines]=useState([]),[rankLoading,setRankLoading]=useState(false),[rankDrafts,setRankDrafts]=useState({}),[rankSaving,setRankSaving]=useState(false),[rankSelected,setRankSelected]=useState(null),[inventoryDetail,setInventoryDetail]=useState(null);
 const[state,setState]=useState(()=>inventoryParseJSON('colibri_inventory_v7',{stocks:{},counts:[],waste:[],minimums:{},adjustments:[]}));
 const[query,setQuery]=useState(''),[countItem,setCountItem]=useState(''),[countQty,setCountQty]=useState('');
 const[wasteItem,setWasteItem]=useState(''),[wasteQty,setWasteQty]=useState(''),[wasteReason,setWasteReason]=useState('');
 const[days,setDays]=useState(7);
 useEffect(()=>{load()},[]);
 useEffect(()=>{localStorage.setItem('colibri_inventory_v7',JSON.stringify(state))},[state]);
 async function load(){
  if(!supabase){setError('Supabase no configurado');setLoading(false);return}
  setLoading(true);setError('');
  try{
   const from=addDays(today(),-30),monthFrom=today().slice(0,7)+'-01';
   const [m,i,r,ri,l,sales,monthSales,nextCostMap]=await Promise.all([
    supabase.from('purchase_master_items').select('*').eq('active',true).order('name').limit(20000),
    supabase.from('purchase_invoice_items').select('*,purchase_invoices(invoice_date,status,purchase_suppliers(name))').eq('review_status','confirmed').limit(20000),
    supabase.from('profitability_recipes').select('*').limit(20000),
    supabase.from('profitability_recipe_ingredients').select('*').limit(30000),
    supabase.from('purchase_product_numier_links').select('*').limit(20000),
    loadSalesRange(from,addDays(today(),1)),
    loadSalesRangeGestoria(monthFrom,addDays(today(),1)),
    loadProfitabilityCostMap()
   ]);
   const e=m.error||i.error||r.error||ri.error||l.error;if(e)throw e;
   setData({masters:m.data||[],items:i.data||[],recipes:r.data||[],ingredients:ri.data||[],links:l.data||[],sales:sales.lines||[],monthSales:monthSales.lines||[]});
   setCostMap(nextCostMap);
  }catch(e){setError(e.message||String(e))}finally{setLoading(false)}
 }
 const movements=useMemo(()=>{
  const purchased=new Map(),consumed=new Map();
  (data.items||[]).forEach(x=>{if(!x.master_item_id)return;const q=Math.max(0,Number(x.quantity||0))*Math.max(1,Number(x.pack_units||1));purchased.set(String(x.master_item_id),(purchased.get(String(x.master_item_id))||0)+q)});
  const recipeByCode=new Map((data.recipes||[]).map(r=>[String(r.numier_article_code||''),r]));
  const ingredientsByRecipe=new Map();(data.ingredients||[]).forEach(i=>{const k=String(i.recipe_id);if(!ingredientsByRecipe.has(k))ingredientsByRecipe.set(k,[]);ingredientsByRecipe.get(k).push(i)});
  const linkByCode=new Map();(data.links||[]).forEach(l=>linkByCode.set(String(l.numier_article_code||''),l));
  (data.sales||[]).forEach(line=>{const code=String(line.articulo||''),qty=Math.abs(Number(line.cantidad||0));const recipe=recipeByCode.get(code);if(recipe){const yieldQty=Math.max(1,Number(recipe.yield_quantity||1));(ingredientsByRecipe.get(String(recipe.id))||[]).forEach(i=>{const used=qty*Number(i.quantity||0)/yieldQty;consumed.set(String(i.master_item_id),(consumed.get(String(i.master_item_id))||0)+used)})}else{const link=linkByCode.get(code);if(link){const used=qty*Math.max(0,Number(link.quantity_factor||1));consumed.set(String(link.master_item_id),(consumed.get(String(link.master_item_id))||0)+used)}}});
  return{purchased,consumed};
 },[data]);
 const rows=useMemo(()=>data.masters.map(m=>{const id=String(m.id),opening=Number(state.stocks?.[id]||0),purchases=movements.purchased.get(id)||0,used=movements.consumed.get(id)||0,waste=(state.waste||[]).filter(x=>String(x.itemId)===id).reduce((a,x)=>a+Number(x.qty||0),0),adjust=(state.adjustments||[]).filter(x=>String(x.itemId)===id).reduce((a,x)=>a+Number(x.qty||0),0),theoretical=opening+purchases-used-waste+adjust,lastCount=[...(state.counts||[])].filter(x=>String(x.itemId)===id).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0],real=lastCount?Number(lastCount.qty||0):null,min=Number(state.minimums?.[id]||0),daily=used/30,coverage=daily>0?theoretical/daily:999,recommended=Math.max(0,(daily*Number(days||7)+min)-theoretical);return{...m,opening,purchases,used,waste,adjust,theoretical,real,diff:real===null?null:real-theoretical,min,daily,coverage,recommended}}).filter(r=>!query||normalizeProductName(r.name).includes(normalizeProductName(query))),[data,state,movements,query,days]);
 const monthCostRows=useMemo(()=>{
  const grouped=new Map();
  (data.monthSales||[]).forEach(line=>{const code=String(line.articulo||'').trim();if(!code)return;const qty=Math.abs(Number(line.cantidad||0)),revenue=Number(line.importe||0);const current=grouped.get(code)||{code,name:String(line.descripcion||line.nombre||code).trim()||code,qty:0,revenue:0};current.qty+=qty;current.revenue+=revenue;grouped.set(code,current)});
  return [...grouped.values()].map(x=>{const info=costMap.get(x.code);const avgSale=x.qty?x.revenue/x.qty:0;const configured=info&&!info.excluded&&info.cost!==null&&Number.isFinite(Number(info.cost));const unitCost=configured?Number(info.cost):Math.max(0,avgSale/3);return {...x,avgSale,unitCost,configured,estimated:!configured,source:configured?(info?.source||'configurado'):'automatic_third'}}).filter(x=>!costQuery||normalizeProductName(`${x.name} ${x.code}`).includes(normalizeProductName(costQuery))).sort((a,b)=>b.revenue-a.revenue);
 },[data.monthSales,costMap,costQuery]);
 async function saveMonthCosts(){const changes=monthCostRows.filter(x=>costDrafts[x.code]!==undefined&&costDrafts[x.code]!==''&&Number.isFinite(Number(String(costDrafts[x.code]).replace(',','.'))));if(!changes.length)return alert('No hay costes modificados para guardar');setSavingCosts(true);try{for(const x of changes){await persistArticleCost(x.code,Number(String(costDrafts[x.code]).replace(',','.')),'Coste rápido desde Almacén');}const next=await loadProfitabilityCostMap();setCostMap(next);setCostDrafts({});alert(`Guardados ${changes.length} costes y recalculados.`)}finally{setSavingCosts(false)}}
 async function loadRanking(){if(!rankFrom||!rankTo)return alert('Selecciona fecha inicial y final');if(rankFrom>rankTo)return alert('La fecha inicial no puede ser posterior a la final');setRankLoading(true);try{const result=await loadSalesRangeGestoria(rankFrom,addDays(rankTo,1));setRankLines(result.lines||[]);setRankSelected(null)}catch(e){alert('No se pudo cargar el ranking: '+(e.message||e))}finally{setRankLoading(false)}}
 const rankingRows=useMemo(()=>{const grouped=new Map();(rankLines||[]).forEach(line=>{const code=String(line.articulo||'').trim();if(!code)return;const qty=Math.abs(Number(line.cantidad||0)),revenue=Number(line.importe||0);const x=grouped.get(code)||{code,name:String(line.descripcion||line.nombre||code).trim()||code,qty:0,revenue:0,tickets:new Set()};x.qty+=qty;x.revenue+=revenue;if(line.cab_id)x.tickets.add(String(line.cab_id));grouped.set(code,x)});return [...grouped.values()].map(x=>{const info=costMap.get(x.code);const avgSale=x.qty?x.revenue/x.qty:0;const configured=info&&!info.excluded&&info.cost!==null&&Number.isFinite(Number(info.cost));const unitCost=configured?Number(info.cost):Math.max(0,avgSale/3),cost=unitCost*x.qty,profit=x.revenue-cost;return {...x,ticketCount:x.tickets.size,avgSale,unitCost,cost,profit,margin:x.revenue?profit/x.revenue*100:0,configured,estimated:!configured,source:configured?(info?.source||'configurado'):'automatic_third'}}).filter(x=>!rankQuery||normalizeProductName(`${x.name} ${x.code}`).includes(normalizeProductName(rankQuery))).sort((a,b)=>rankSort==='revenue'?b.revenue-a.revenue:rankSort==='profit'?b.profit-a.profit:b.qty-a.qty)},[rankLines,costMap,rankQuery,rankSort]);
 async function saveRankingCosts(){const changes=rankingRows.filter(x=>rankDrafts[x.code]!==undefined&&rankDrafts[x.code]!==''&&Number.isFinite(Number(String(rankDrafts[x.code]).replace(',','.'))));if(!changes.length)return alert('No hay costes modificados para guardar');setRankSaving(true);try{for(const x of changes)await persistArticleCost(x.code,Number(String(rankDrafts[x.code]).replace(',','.')),'Coste rápido desde ranking de Almacén');const next=await loadProfitabilityCostMap();setCostMap(next);setRankDrafts({});if(rankSelected){const updated=changes.find(x=>x.code===rankSelected.code);if(updated)setRankSelected({...rankSelected,unitCost:Number(String(rankDrafts[updated.code]).replace(',','.')),configured:true,estimated:false})}alert(`Guardados ${changes.length} costes.`)}finally{setRankSaving(false)}}
 useEffect(()=>{if(tab==='ranking'&&!rankLines.length)loadRanking()},[tab]);
 const alerts=rows.filter(r=>r.theoretical<r.min||r.coverage<2||(r.diff!==null&&Math.abs(r.diff)>Math.max(1,r.theoretical*.1)));const stockValue=rows.reduce((a,r)=>a+Math.max(0,r.theoretical)*Number(r.manual_unit_cost||0),0);const purchaseValue=rows.reduce((a,r)=>a+r.recommended*Number(r.manual_unit_cost||0),0);
 function setOpening(id,value){setState(v=>({...v,stocks:{...v.stocks,[id]:Number(value||0)}}))}
 function setMinimum(id,value){setState(v=>({...v,minimums:{...v.minimums,[id]:Number(value||0)}}))}
 function addCount(){if(!countItem||countQty==='')return alert('Selecciona artículo e indica cantidad');setState(v=>({...v,counts:[...v.counts,{id:Date.now(),itemId:countItem,qty:Number(countQty),date:new Date().toISOString()}]}));setCountQty('');alert('Inventario guardado')}
 function addWaste(){if(!wasteItem||!Number(wasteQty))return alert('Selecciona artículo e indica cantidad');setState(v=>({...v,waste:[...v.waste,{id:Date.now(),itemId:wasteItem,qty:Number(wasteQty),reason:wasteReason||'Merma',date:new Date().toISOString()}]}));setWasteQty('');setWasteReason('');alert('Merma registrada')}
 function exportOrder(){const lines=['ARTICULO;UNIDAD;STOCK TEORICO;COBERTURA DIAS;COMPRAR'];rows.filter(r=>r.recommended>0).forEach(r=>lines.push(`${r.name};${r.base_unit||'ud'};${r.theoretical.toFixed(2)};${r.coverage===999?'':r.coverage.toFixed(1)};${r.recommended.toFixed(2)}`));downloadFile(`PEDIDO_COLIBRI_${today()}.csv`,new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'}),'text/csv')}
 if(loading)return <div className="card"><h2>Cargando Almacén 8.0…</h2></div>;
 const tabs=[['resumen','Resumen'],['costes','Costes rápidos'],['ranking','Ranking por fechas'],['stock','Stock'],['inventario','Inventario'],['mermas','Mermas'],['pedido','Pedido recomendado']];
 return <div className="inventory7"><div className="card hero inventoryHero"><div><span className="sectionEyebrow">ALMACÉN 8.0 · STOCK, COMPRAS Y COSTES</span><h2>Stock teórico, inventario y previsión</h2><p>Entradas desde facturas, consumo desde ventas y escandallos, mermas y pedido recomendado.</p></div><div className="row controls"><input placeholder="Buscar artículo" value={query} onChange={e=>setQuery(e.target.value)}/><button onClick={load}>Actualizar</button></div></div>{error&&<div className="warnBox">{error}</div>}
 <div className="grid inventoryKpis"><button className="card kpi inventoryKpiButton" onClick={()=>setInventoryDetail({title:'Artículos de almacén',body:`${rows.length} artículos activos en el maestro de almacén.`,action:'stock'})}><span>Artículos</span><b>{rows.length}</b><small>Pulsa para ver stock</small></button><button className="card kpi inventoryKpiButton" onClick={()=>setInventoryDetail({title:'Valor de stock estimado',body:`Valor calculado con el stock teórico y los costes disponibles: ${money(stockValue)}.`,action:'stock'})}><span>Valor stock estimado</span><b>{money(stockValue)}</b><small>Pulsa para revisar</small></button><button className="card kpi inventoryKpiButton" onClick={()=>setInventoryDetail({title:'Alertas de almacén',body:alerts.length?`${alerts.length} artículos requieren revisión por mínimo, cobertura o descuadre.`:'No hay alertas críticas de stock.',action:'resumen'})}><span>Alertas</span><b className={alerts.length?'bad':'ok'}>{alerts.length}</b><small>Pulsa para detalle</small></button><button className="card kpi inventoryKpiButton" onClick={()=>setInventoryDetail({title:'Pedido recomendado',body:`Importe estimado del pedido sugerido para la cobertura configurada: ${money(purchaseValue)}.`,action:'pedido'})}><span>Pedido recomendado</span><b>{money(purchaseValue)}</b><small>Pulsa para configurar</small></button></div>
 {!hideTabs&&<nav className="tpvTabs">{tabs.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</nav>}
 {tab==='resumen'&&<div className="grid"><div className="card"><h2>Alertas de almacén</h2>{alerts.length?alerts.slice(0,12).map(r=><div className="inventoryAlert" key={r.id}><div><b>{r.name}</b><small>{r.theoretical<r.min?'Por debajo del mínimo':r.coverage<2?'Menos de 2 días de cobertura':'Descuadre de inventario'}</small></div><strong>{r.coverage===999?'—':`${r.coverage.toFixed(1)} días`}</strong></div>):<div className="alertOk">No hay alertas críticas de stock.</div>}</div><div className="card"><h2>Calidad del control</h2><p>Artículos con escandallo o vínculo: <b>{rows.filter(r=>r.used>0).length}</b></p><p>Artículos con stock mínimo: <b>{rows.filter(r=>r.min>0).length}</b></p><p>Artículos contados: <b>{rows.filter(r=>r.real!==null).length}</b></p><p>Consumo calculado últimos 30 días: <b>{rows.reduce((a,r)=>a+r.used,0).toFixed(1)} unidades base</b></p></div></div>}
 {tab==='costes'&&<section className="card inventoryQuickCosts"><div className="row between inventoryQuickCostHead"><div><span className="sectionEyebrow">PRODUCTOS VENDIDOS ESTE MES</span><h2>Costes rápidos</h2><p>Solo aparecen artículos vendidos durante el mes actual. Si no existe un coste configurado desde compras, escandallo o coste manual, se propone automáticamente 1/3 del PVP medio.</p></div><div className="inventoryQuickCostActions"><input placeholder="Buscar producto o código" value={costQuery} onChange={e=>setCostQuery(e.target.value)}/><button disabled={savingCosts} onClick={saveMonthCosts}>{savingCosts?'Guardando…':'Guardar cambios'}</button></div></div><div className="quickCostSummary"><span><b>{monthCostRows.length}</b> productos vendidos</span><span><b>{monthCostRows.filter(x=>x.estimated).length}</b> con coste provisional 1/3</span><span><b>{monthCostRows.filter(x=>x.configured).length}</b> con coste configurado</span></div><div className="inventoryQuickCostList">{monthCostRows.map(x=>{const cost=x.unitCost*x.qty,profit=x.revenue-cost,margin=x.revenue?profit/x.revenue*100:0;return <article key={x.code} className={x.estimated?'estimated':''} onClick={()=>setRankSelected({...x,cost,profit,margin,ticketCount:0})}><div className="quickCostProduct"><b>{x.name}</b><small>Código {x.code} · {x.qty.toFixed(2)} uds · ventas {money(x.revenue)}</small></div><div className="quickCostMeta"><span>PVP medio</span><b>{money(x.avgSale)}</b></div><div className="quickCostMeta"><span>Origen</span><b>{x.estimated?'Estimado 1/3':x.source==='local_manual'||x.source==='manual'?'Manual':'Compras / escandallo'}</b></div><label onClick={e=>e.stopPropagation()}><span>Coste €/ud</span><input inputMode="decimal" type="number" min="0" step="0.0001" value={costDrafts[x.code]??x.unitCost.toFixed(4)} onChange={e=>setCostDrafts(v=>({...v,[x.code]:e.target.value}))}/></label></article>})}{!monthCostRows.length&&<div className="alertOk">No hay productos vendidos este mes con este filtro.</div>}</div></section>}
 {tab==='ranking'&&<section className="card inventoryRanking"><div className="row between inventoryRankingHead"><div><span className="sectionEyebrow">VENTAS POR PERIODO · COSTE EDITABLE</span><h2>Ranking de artículos vendidos</h2><p>Selecciona un día o rango de fechas. El ranking utiliza los tickets reales de Numier y mantiene la regla de coste provisional de 1/3 del PVP cuando no existe coste configurado.</p></div><div className="inventoryRankingFilters"><label>Desde<input type="date" value={rankFrom} onChange={e=>setRankFrom(e.target.value)}/></label><label>Hasta<input type="date" value={rankTo} onChange={e=>setRankTo(e.target.value)}/></label><input placeholder="Buscar producto o código" value={rankQuery} onChange={e=>setRankQuery(e.target.value)}/><button onClick={loadRanking} disabled={rankLoading}>{rankLoading?'Cargando…':'Buscar ventas'}</button></div></div><div className="rankingToolbar"><div className="rankingSort"><button className={rankSort==='qty'?'active':''} onClick={()=>setRankSort('qty')}>Más unidades</button><button className={rankSort==='revenue'?'active':''} onClick={()=>setRankSort('revenue')}>Más ventas</button><button className={rankSort==='profit'?'active':''} onClick={()=>setRankSort('profit')}>Más beneficio</button></div><button onClick={saveRankingCosts} disabled={rankSaving}>{rankSaving?'Guardando…':'Guardar costes modificados'}</button></div><div className="quickCostSummary"><span><b>{rankingRows.length}</b> artículos</span><span><b>{rankingRows.reduce((a,x)=>a+x.qty,0).toFixed(0)}</b> unidades</span><span><b>{money(rankingRows.reduce((a,x)=>a+x.revenue,0))}</b> ventas</span><span><b>{rankingRows.filter(x=>x.estimated).length}</b> coste 1/3</span></div><div className="inventoryRankingList">{rankingRows.map((x,i)=><article key={x.code} className={x.estimated?'estimated':''} onClick={()=>setRankSelected(x)}><div className="rankingPosition"><b>{i+1}</b></div><div className="rankingProduct"><b>{x.name}</b><small>Código {x.code} · {x.ticketCount} tickets</small></div><div className="rankingStat"><span>Unidades</span><b>{x.qty.toFixed(2)}</b></div><div className="rankingStat"><span>Ventas</span><b>{money(x.revenue)}</b></div><div className="rankingStat"><span>Beneficio</span><b>{money(x.profit)}</b><small>{x.margin.toFixed(1)}%</small></div><label onClick={e=>e.stopPropagation()}><span>Coste €/ud</span><input inputMode="decimal" type="number" min="0" step="0.0001" value={rankDrafts[x.code]??x.unitCost.toFixed(4)} onChange={e=>setRankDrafts(v=>({...v,[x.code]:e.target.value}))}/><small>{x.estimated?'Provisional 1/3':'Configurado'}</small></label></article>)}{!rankingRows.length&&!rankLoading&&<div className="alertOk">No hay artículos vendidos para este rango o filtro.</div>}</div></section>}
 {tab==='stock'&&<div className="card"><div className="row between"><div><h2>Stock teórico</h2><p>Stock inicial + compras − consumo − mermas + ajustes.</p></div></div><div className="tableScroll"><table><thead><tr><th>Artículo</th><th>Unidad</th><th>Inicial</th><th>Entradas</th><th>Consumo 30d</th><th>Merma</th><th>Teórico</th><th>Real</th><th>Diferencia</th><th>Mínimo</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.name}</b><small>{r.category||''}</small></td><td>{r.base_unit||'ud'}</td><td><input className="inventoryNumber" type="number" step="0.01" value={r.opening} onChange={e=>setOpening(String(r.id),e.target.value)}/></td><td>{r.purchases.toFixed(2)}</td><td>{r.used.toFixed(2)}</td><td>{r.waste.toFixed(2)}</td><td><b>{r.theoretical.toFixed(2)}</b></td><td>{r.real===null?'—':r.real.toFixed(2)}</td><td className={r.diff===null?'':Math.abs(r.diff)>.01?'bad':'ok'}>{r.diff===null?'—':r.diff.toFixed(2)}</td><td><input className="inventoryNumber" type="number" step="0.01" value={r.min} onChange={e=>setMinimum(String(r.id),e.target.value)}/></td></tr>)}</tbody></table></div></div>}
 {tab==='inventario'&&<div className="grid"><div className="card"><h2>Nuevo recuento</h2><label>Artículo<select value={countItem} onChange={e=>setCountItem(e.target.value)}><option value="">Seleccionar…</option>{data.masters.map(m=><option value={m.id} key={m.id}>{m.name} ({m.base_unit||'ud'})</option>)}</select></label><label>Cantidad real<input type="number" step="0.01" value={countQty} onChange={e=>setCountQty(e.target.value)}/></label><button onClick={addCount}>Guardar inventario</button></div><div className="card"><h2>Últimos recuentos</h2>{[...(state.counts||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,20).map(x=>{const m=data.masters.find(i=>String(i.id)===String(x.itemId));return <div className="inventoryHistory" key={x.id}><div><b>{m?.name||'Artículo'}</b><small>{new Date(x.date).toLocaleString('es-ES')}</small></div><strong>{Number(x.qty).toFixed(2)} {m?.base_unit||'ud'}</strong></div>})}</div></div>}
 {tab==='mermas'&&<div className="grid"><div className="card"><h2>Registrar merma</h2><label>Artículo<select value={wasteItem} onChange={e=>setWasteItem(e.target.value)}><option value="">Seleccionar…</option>{data.masters.map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label><label>Cantidad<input type="number" step="0.01" value={wasteQty} onChange={e=>setWasteQty(e.target.value)}/></label><label>Motivo<input value={wasteReason} onChange={e=>setWasteReason(e.target.value)} placeholder="Rotura, caducidad, invitación…"/></label><button onClick={addWaste}>Registrar merma</button></div><div className="card"><h2>Historial de mermas</h2>{[...(state.waste||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,30).map(x=>{const m=data.masters.find(i=>String(i.id)===String(x.itemId));return <div className="inventoryHistory" key={x.id}><div><b>{m?.name||'Artículo'}</b><small>{x.reason} · {new Date(x.date).toLocaleDateString('es-ES')}</small></div><strong>-{Number(x.qty).toFixed(2)} {m?.base_unit||'ud'}</strong></div>})}</div></div>}
 {tab==='pedido'&&<div className="card"><div className="row between"><div><h2>Pedido recomendado</h2><p>Calculado con consumo medio de los últimos 30 días.</p></div><div className="row"><label className="inventoryDays">Cobertura<input type="number" min="1" max="30" value={days} onChange={e=>setDays(e.target.value)}/> días</label><button onClick={exportOrder}>Exportar pedido CSV</button></div></div><div className="tableScroll"><table><thead><tr><th>Artículo</th><th>Stock</th><th>Mínimo</th><th>Consumo/día</th><th>Cobertura</th><th>Comprar</th><th>Coste estimado</th></tr></thead><tbody>{rows.filter(r=>r.recommended>0).sort((a,b)=>b.recommended-a.recommended).map(r=><tr key={r.id}><td><b>{r.name}</b></td><td>{r.theoretical.toFixed(2)} {r.base_unit||'ud'}</td><td>{r.min.toFixed(2)}</td><td>{r.daily.toFixed(2)}</td><td className={r.coverage<2?'bad':''}>{r.coverage===999?'—':`${r.coverage.toFixed(1)} días`}</td><td><b>{r.recommended.toFixed(2)} {r.base_unit||'ud'}</b></td><td>{money(r.recommended*Number(r.manual_unit_cost||0))}</td></tr>)}</tbody></table></div>{!rows.some(r=>r.recommended>0)&&<div className="alertOk">No es necesario realizar pedidos con la configuración actual.</div>}</div>}
 {inventoryDetail&&<div className="modal inventoryDetailOverlay" onClick={()=>setInventoryDetail(null)}><div className="card inventoryDetailModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">DETALLE DE ALMACÉN</span><h2>{inventoryDetail.title}</h2></div><button className="ghost" onClick={()=>setInventoryDetail(null)}>Cerrar</button></div><p>{inventoryDetail.body}</p><button onClick={()=>{setTab(inventoryDetail.action);setInventoryDetail(null)}}>Abrir detalle y configuración</button></div></div>}
 {rankSelected&&<div className="modal inventoryDetailOverlay" onClick={()=>setRankSelected(null)}><div className="card inventoryDetailModal productRankModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">DETALLE DEL PRODUCTO · {tab==='costes'?'MES ACTUAL':`${fmtDate(rankFrom)}${rankTo!==rankFrom?` A ${fmtDate(rankTo)}`:''}`}</span><h2>{rankSelected.name}</h2><p>Código {rankSelected.code} · {rankSelected.ticketCount} tickets</p></div><button className="ghost" onClick={()=>setRankSelected(null)}>Cerrar</button></div><div className="inventoryProductDetailGrid"><article><span>Unidades</span><b>{rankSelected.qty.toFixed(2)}</b></article><article><span>Ventas</span><b>{money(rankSelected.revenue)}</b></article><article><span>PVP medio</span><b>{money(rankSelected.avgSale)}</b></article><article><span>Coste total</span><b>{money(rankSelected.cost)}</b></article><article><span>Beneficio</span><b>{money(rankSelected.profit)}</b></article><article><span>Margen</span><b>{rankSelected.margin.toFixed(1)}%</b></article></div><label className="rankModalCost"><span>Coste unitario</span><input inputMode="decimal" type="number" min="0" step="0.0001" value={rankDrafts[rankSelected.code]??rankSelected.unitCost.toFixed(4)} onChange={e=>setRankDrafts(v=>({...v,[rankSelected.code]:e.target.value}))}/><small>{rankSelected.estimated?'Actualmente provisional: 1/3 del PVP medio':'Coste configurado desde '+rankSelected.source}</small></label><button onClick={saveRankingCosts} disabled={rankSaving}>{rankSaving?'Guardando…':'Guardar coste y recalcular'}</button></div></div>}
 </div>
}

function Settings(){
 const[settings,setSettings]=useState(null);
 const[runtime,setRuntime]=useState([]);
 const[runtimeError,setRuntimeError]=useState('');
 const[tab,setTab]=useState('resumen');
 const[geo,setGeo]=useState({loading:false,message:'',ok:null,distance:null});
 const[systemCheck,setSystemCheck]=useState({loading:false,supabase:null,message:''});
 const[advanced,setAdvanced]=useState(false);
 const[prefs,setPrefs]=useState(()=>readLocalJSON('colibri_system_preferences',{
  business_name:'Brasería El Colibrí',business_address:'Av. Carlos V, local 3',business_phone:'',
  labour_cost_hour:7,monthly_sales_goal:0,vat_rate:10,currency:'EUR',punctuality_grace:5,
  late_alert_minutes:10,max_open_clock_hours:12,gps_enabled:true,qr_enabled:true,
  allow_remote_clockout:false,manager_incident_confirmation:true
 }));
 const fileRef=useRef(null);
 useEffect(()=>{localStorage.setItem('colibri_system_preferences',JSON.stringify(prefs))},[prefs]);
 useEffect(()=>{
  supabase?.from('settings').select('*').single().then(({data,error})=>{if(data)setSettings(data);else if(error)setRuntimeError(error.message)});
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
 async function save(){
  const clean={...settings,bar_lat:Number(settings.bar_lat),bar_lng:Number(settings.bar_lng),gps_radius_m:Number(settings.gps_radius_m)};
  const{error}=await supabase.from('settings').upsert(clean);
  if(error)alert(error.message);else{setSettings(clean);alert('Ajustes guardados correctamente')}
 }
 function haversine(lat1,lon1,lat2,lon2){const R=6371000,toRad=x=>x*Math.PI/180;const dLat=toRad(lat2-lat1),dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
 function testLocation(){
  if(!navigator.geolocation){setGeo({loading:false,message:'Este dispositivo no permite obtener la ubicación.',ok:false,distance:null});return}
  setGeo({loading:true,message:'Obteniendo ubicación…',ok:null,distance:null});
  navigator.geolocation.getCurrentPosition(pos=>{const distance=haversine(pos.coords.latitude,pos.coords.longitude,Number(settings.bar_lat),Number(settings.bar_lng));const ok=distance<=Number(settings.gps_radius_m||75);setGeo({loading:false,distance,message:`Estás a ${Math.round(distance)} metros del local. El fichaje ${ok?'estaría permitido':'quedaría fuera del radio autorizado'}.`,ok})},err=>setGeo({loading:false,message:`No se pudo obtener la ubicación: ${err.message}`,ok:false,distance:null}),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 }
 function useCurrentLocation(){
  if(!navigator.geolocation)return alert('Este dispositivo no permite obtener la ubicación');
  navigator.geolocation.getCurrentPosition(pos=>{setSettings(v=>({...v,bar_lat:pos.coords.latitude.toFixed(7),bar_lng:pos.coords.longitude.toFixed(7)}));alert('Ubicación actual cargada. Pulsa Guardar para confirmarla.')},err=>alert(err.message),{enableHighAccuracy:true,timeout:15000});
 }
 async function checkSystem(){
  setSystemCheck({loading:true,supabase:null,message:'Comprobando…'});
  const started=Date.now();
  try{const{error}=await supabase.from('settings').select('id').limit(1);if(error)throw error;setSystemCheck({loading:false,supabase:true,message:`Supabase conectado · ${Date.now()-started} ms`})}catch(e){setSystemCheck({loading:false,supabase:false,message:e.message||String(e)})}
 }
 const guardian=runtime.find(x=>x.status_key==='guardian');
 const sync=runtime.find(x=>x.status_key==='sync');
 const age=(date)=>date?Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/1000)):99999;
 const guardianOnline=Boolean(guardian&&age(guardian.heartbeat_at)<120);
 const syncOnline=Boolean(sync&&age(sync.heartbeat_at)<150);
 const numierOnline=Boolean(guardian?.numier_running);
 const everythingOk=guardianOnline&&syncOnline&&numierOnline;
 const systemState=everythingOk?'Todo operativo':guardianOnline||syncOnline?'Requiere atención':'Sin contacto con el equipo del bar';
 const systemTone=everythingOk?'ok':guardianOnline||syncOnline?'warn':'bad';
 const diagnostics={generated_at:new Date().toISOString(),erp_version:'Configuración 8.2',url:location.href,user_agent:navigator.userAgent,online:navigator.onLine,guardian, sync, runtime_error:runtimeError,settings:{bar_lat:settings?.bar_lat,bar_lng:settings?.bar_lng,gps_radius_m:settings?.gps_radius_m},preferences:prefs};
 async function copyDiagnostic(){try{await navigator.clipboard.writeText(JSON.stringify(diagnostics,null,2));alert('Diagnóstico copiado') }catch{alert('No se pudo copiar el diagnóstico')}}
 function exportConfig(){downloadFile(`COLIBRI_CONFIG_${today()}.json`,new Blob([JSON.stringify({settings,prefs},null,2)],{type:'application/json'}),'application/json')}
 function importConfig(e){const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(data.settings)setSettings(v=>({...v,...data.settings}));if(data.prefs)setPrefs(v=>({...v,...data.prefs}));alert('Configuración importada. Revisa y pulsa Guardar.') }catch{alert('El archivo no es una configuración válida')}};reader.readAsText(file);e.target.value=''}
 function clearSystemCache(){if(!confirm('Se limpiará únicamente la caché de diagnóstico y configuración visual. No se borrarán cuadrantes, fichajes ni datos de Supabase.'))return;Object.keys(localStorage).filter(k=>k.startsWith('colibri_system_cache_')).forEach(k=>localStorage.removeItem(k));sessionStorage.clear();alert('Caché técnica limpiada')}
 function showRecovery(){alert('Para recuperar el servicio en el PC del bar:\n\n1. Comprueba que NUMIER está abierto.\n2. Abre Colibri Sync o el acceso directo conjunto.\n3. Espera 60 segundos y pulsa Actualizar estado.\n\nEl reinicio remoto se activará cuando Guardian permita recibir órdenes desde el ERP.')}
 const tabs=[['resumen','Resumen'],['fichajes','Fichajes y ubicación'],['sistema','Estado del sistema'],['negocio','Negocio'],['mantenimiento','Mantenimiento']];
 if(!settings)return <div className="card">Cargando ajustes…</div>;
 return <div className="settings82">
  <div className="card settingsHero"><div><span className="sectionEyebrow">CONFIGURACIÓN 8.2</span><h1>Ajustes y sistema</h1><p>Ubicación de fichaje, diagnóstico del TPV y preferencias generales del negocio.</p></div><div className={`systemPill ${systemTone}`}><span>{everythingOk?'●':'▲'}</span><div><b>{systemState}</b><small>{sync?.heartbeat_at?`Último contacto ${secondsAgo(sync.heartbeat_at)}`:'Sin datos recientes'}</small></div></div></div>
  <nav className="settingsTabs">{tabs.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</nav>

  {tab==='resumen'&&<>
   <div className="settingsSummaryGrid">
    <button className="settingsSummaryCard" onClick={()=>setTab('fichajes')}><span>📍</span><div><small>Ubicación de fichaje</small><b>{prefs.business_address||'Dirección no indicada'}</b><em>Radio autorizado: {settings.gps_radius_m||75} m</em></div></button>
    <button className="settingsSummaryCard" onClick={()=>setTab('sistema')}><span>{everythingOk?'🟢':'🔴'}</span><div><small>Estado del sistema</small><b>{systemState}</b><em>{guardian?.equipment_name||guardian?.machine_name||sync?.machine_name||'Equipo sin identificar'}</em></div></button>
    <button className="settingsSummaryCard" onClick={()=>setTab('negocio')}><span>🏪</span><div><small>Negocio</small><b>{prefs.business_name}</b><em>IVA {prefs.vat_rate}% · Personal {money(prefs.labour_cost_hour)}/h</em></div></button>
    <button className="settingsSummaryCard" onClick={()=>setTab('mantenimiento')}><span>🛠️</span><div><small>Mantenimiento</small><b>Diagnóstico y copias</b><em>ERP v{document.querySelector('meta[name="app-version"]')?.content||'4.1.0'}</em></div></button>
   </div>
   <div className="grid settingsMainGrid"><div className="card"><h2>Acciones rápidas</h2><div className="settingsActionGrid"><button onClick={loadRuntime}>Actualizar estado</button><button onClick={testLocation}>Probar ubicación</button><button onClick={checkSystem}>Comprobar Supabase</button><button className="secondary" onClick={copyDiagnostic}>Copiar diagnóstico</button></div>{geo.message&&<div className={`settingsResult ${geo.ok===true?'ok':geo.ok===false?'bad':''}`}>{geo.message}</div>}{systemCheck.message&&<div className={`settingsResult ${systemCheck.supabase===true?'ok':systemCheck.supabase===false?'bad':''}`}>{systemCheck.message}</div>}</div>
   <div className="card"><h2>Resumen técnico</h2><div className="settingsStatusList"><p><span>Guardian</span><b className={guardianOnline?'ok':'bad'}>{guardianOnline?'Activo':'Sin contacto'}</b></p><p><span>Numier</span><b className={numierOnline?'ok':'bad'}>{numierOnline?'En ejecución':'Detenido'}</b></p><p><span>Colibrí Sync</span><b className={syncOnline?'ok':'bad'}>{syncOnline?'Conectado':'Detenido'}</b></p><p><span>Última sincronización</span><b>{sync?.heartbeat_at?secondsAgo(sync.heartbeat_at):'Sin datos'}</b></p></div></div></div>
  </>}

  {tab==='fichajes'&&<div className="grid settingsMainGrid">
   <div className="card"><span className="sectionEyebrow">UBICACIÓN DEL LOCAL</span><h2>Zona permitida para fichar</h2><p>Los empleados podrán fichar por GPS cuando estén dentro del radio configurado.</p><label>Dirección visible<input value={prefs.business_address} onChange={e=>setPrefs(v=>({...v,business_address:e.target.value}))} placeholder="Dirección del negocio"/></label><label>Radio permitido<select value={String(settings.gps_radius_m||75)} onChange={e=>setSettings(v=>({...v,gps_radius_m:Number(e.target.value)}))}><option value="50">50 metros</option><option value="75">75 metros</option><option value="100">100 metros</option><option value="150">150 metros</option></select></label><div className="settingsActionGrid"><button onClick={testLocation} disabled={geo.loading}>{geo.loading?'Localizando…':'Probar mi ubicación'}</button><button className="secondary" onClick={useCurrentLocation}>Usar ubicación actual como local</button></div>{geo.message&&<div className={`settingsResult ${geo.ok===true?'ok':geo.ok===false?'bad':''}`}>{geo.message}</div>}<button className="advancedToggle" onClick={()=>setAdvanced(v=>!v)}>{advanced?'Ocultar':'Mostrar'} coordenadas avanzadas</button>{advanced&&<div className="advancedCoordinates"><label>Latitud<input type="number" step="0.0000001" value={settings.bar_lat} onChange={e=>setSettings(v=>({...v,bar_lat:e.target.value}))}/></label><label>Longitud<input type="number" step="0.0000001" value={settings.bar_lng} onChange={e=>setSettings(v=>({...v,bar_lng:e.target.value}))}/></label></div>}<button onClick={save}>Guardar ubicación</button></div>
   <div className="card"><span className="sectionEyebrow">REGLAS DE FICHAJE</span><h2>Seguridad y puntualidad</h2><div className="toggleList"><label><input type="checkbox" checked={prefs.gps_enabled} onChange={e=>setPrefs(v=>({...v,gps_enabled:e.target.checked}))}/><span><b>Permitir fichaje por GPS</b><small>Valida la distancia al local.</small></span></label><label><input type="checkbox" checked={prefs.qr_enabled} onChange={e=>setPrefs(v=>({...v,qr_enabled:e.target.checked}))}/><span><b>Permitir fichaje por QR</b><small>Usa el código físico situado en el bar.</small></span></label><label><input type="checkbox" checked={prefs.allow_remote_clockout} onChange={e=>setPrefs(v=>({...v,allow_remote_clockout:e.target.checked}))}/><span><b>Permitir cierre fuera del local</b><small>Debe quedar registrado como incidencia.</small></span></label><label><input type="checkbox" checked={prefs.manager_incident_confirmation} onChange={e=>setPrefs(v=>({...v,manager_incident_confirmation:e.target.checked}))}/><span><b>Confirmación del gerente</b><small>Obligatoria para fichajes con incidencias.</small></span></label></div><div className="settingsFieldGrid"><label>Minutos de cortesía<input type="number" min="0" value={prefs.punctuality_grace} onChange={e=>setPrefs(v=>({...v,punctuality_grace:Number(e.target.value)}))}/></label><label>Alerta de retraso<input type="number" min="1" value={prefs.late_alert_minutes} onChange={e=>setPrefs(v=>({...v,late_alert_minutes:Number(e.target.value)}))}/></label><label>Máximo turno abierto (h)<input type="number" min="1" value={prefs.max_open_clock_hours} onChange={e=>setPrefs(v=>({...v,max_open_clock_hours:Number(e.target.value)}))}/></label></div></div>
   <div className="card qrprint"><h3>QR físico del bar</h3><p>Imprime este código y colócalo en la zona de personal.</p><img src="/qr_bar_colibri.png" alt="QR de fichaje del bar"/></div>
  </div>}

  {tab==='sistema'&&<div className="settingsSystemTab">
   <div className="card runtimePanel"><div className="row between"><div><span className="sectionEyebrow">COLIBRÍ SYNC GUARDIAN</span><h2>Estado del TPV y sincronización</h2><p>Actualización automática cada 15 segundos.</p></div><button onClick={loadRuntime}>Actualizar estado</button></div>{runtimeError&&<div className="runtimeWarn">No se pudo leer el diagnóstico: {runtimeError}</div>}<div className="runtimeGrid"><div className={guardianOnline?'runtimeOk':'runtimeBad'}><span>Guardian</span><b>{guardianOnline?'ACTIVO':'SIN CONTACTO'}</b><small>{guardian?.heartbeat_at?secondsAgo(guardian.heartbeat_at):'Sin datos'}</small></div><div className={numierOnline?'runtimeOk':'runtimeBad'}><span>NUMIER</span><b>{numierOnline?'EJECUTÁNDOSE':'DETENIDO'}</b><small>{guardian?.equipment_name||guardian?.machine_name||'-'}</small></div><div className={syncOnline?'runtimeOk':'runtimeBad'}><span>Colibrí Sync</span><b>{syncOnline?'ACTIVO':'DETENIDO'}</b><small>{sync?.version||guardian?.version||'-'}</small></div><div className={syncOnline?'runtimeOk':'runtimeBad'}><span>Último contacto</span><b>{syncOnline?'ONLINE':'ATRASADO'}</b><small>{sync?.heartbeat_at?secondsAgo(sync.heartbeat_at):'Sin datos'}</small></div></div><div className="runtimeDetails"><p><b>Equipo:</b> {guardian?.equipment_name||guardian?.machine_name||sync?.machine_name||'Sin identificar'}</p><p><b>Estado:</b> {guardian?.state||sync?.state||'Sin datos'}</p><p><b>Versión:</b> {sync?.version||guardian?.version||'No comunicada'}</p><p><b>Último reinicio Sync:</b> {guardian?.last_sync_restart_at?new Date(guardian.last_sync_restart_at).toLocaleString('es-ES'):'-'}</p><p><b>Último reinicio NUMIER:</b> {guardian?.last_numier_restart_at?new Date(guardian.last_numier_restart_at).toLocaleString('es-ES'):'-'}</p>{(guardian?.last_error||sync?.last_error)&&<p className="runtimeError"><b>Último error:</b> {guardian?.last_error||sync?.last_error}</p>}</div><div className="settingsActionGrid"><button onClick={loadRuntime}>Actualizar estado</button><button className="danger" onClick={showRecovery}>Recuperar servicio</button><button className="secondary" onClick={copyDiagnostic}>Copiar diagnóstico</button></div></div>
   <div className="card"><h2>Qué significa cada estado</h2><div className="systemHelp"><p><b>🟢 Todo operativo</b><span>Numier y Colibrí Sync están enviando datos con normalidad.</span></p><p><b>🟡 Requiere atención</b><span>Algún componente comunica, pero otro está detenido o atrasado.</span></p><p><b>🔴 Sin contacto</b><span>El equipo del bar no envía información. Puede estar apagado o Sync cerrado.</span></p></div></div>
  </div>}

  {tab==='negocio'&&<div className="grid settingsMainGrid"><div className="card"><span className="sectionEyebrow">DATOS GENERALES</span><h2>Configuración del negocio</h2><label>Nombre comercial<input value={prefs.business_name} onChange={e=>setPrefs(v=>({...v,business_name:e.target.value}))}/></label><label>Dirección<input value={prefs.business_address} onChange={e=>setPrefs(v=>({...v,business_address:e.target.value}))}/></label><label>Teléfono<input value={prefs.business_phone} onChange={e=>setPrefs(v=>({...v,business_phone:e.target.value}))}/></label><div className="settingsFieldGrid"><label>Coste medio empleado/h<input type="number" step="0.01" value={prefs.labour_cost_hour} onChange={e=>setPrefs(v=>({...v,labour_cost_hour:Number(e.target.value)}))}/></label><label>Objetivo mensual ventas<input type="number" step="1" value={prefs.monthly_sales_goal} onChange={e=>setPrefs(v=>({...v,monthly_sales_goal:Number(e.target.value)}))}/></label><label>IVA habitual (%)<input type="number" step="1" value={prefs.vat_rate} onChange={e=>setPrefs(v=>({...v,vat_rate:Number(e.target.value)}))}/></label><label>Moneda<select value={prefs.currency} onChange={e=>setPrefs(v=>({...v,currency:e.target.value}))}><option value="EUR">Euro (€)</option></select></label></div><div className="settingsResult ok">Los ajustes generales se guardan automáticamente en este navegador.</div></div><div className="card"><h2>Uso de estos datos</h2><div className="systemHelp"><p><b>Coste por hora</b><span>Se utilizará en simulaciones de personal y rentabilidad.</span></p><p><b>Objetivo mensual</b><span>Permitirá medir el progreso en Dashboard y Centro de Mando.</span></p><p><b>IVA habitual</b><span>Se aplicará como referencia en informes estimados.</span></p></div></div></div>}

  {tab==='mantenimiento'&&<div className="grid settingsMainGrid"><div className="card"><span className="sectionEyebrow">DIAGNÓSTICO</span><h2>Comprobaciones del ERP</h2><div className="settingsStatusList"><p><span>Conexión del navegador</span><b className={navigator.onLine?'ok':'bad'}>{navigator.onLine?'Online':'Sin conexión'}</b></p><p><span>Supabase</span><b className={systemCheck.supabase===true?'ok':systemCheck.supabase===false?'bad':''}>{systemCheck.loading?'Comprobando':systemCheck.message||'Sin comprobar'}</b></p><p><span>Versión del proyecto</span><b>4.1.0 · Configuración 8.2</b></p><p><span>Entorno</span><b>{location.hostname}</b></p></div><div className="settingsActionGrid"><button onClick={checkSystem}>Comprobar conexión</button><button className="secondary" onClick={copyDiagnostic}>Copiar diagnóstico</button></div></div><div className="card"><span className="sectionEyebrow">COPIA Y RESTAURACIÓN</span><h2>Configuración</h2><p>Exporta los ajustes de este módulo para guardarlos o trasladarlos a otro dispositivo.</p><div className="settingsActionGrid"><button onClick={exportConfig}>Exportar configuración</button><button className="secondary" onClick={()=>fileRef.current?.click()}>Restaurar configuración</button><input ref={fileRef} type="file" accept="application/json" hidden onChange={importConfig}/></div><button className="danger fullButton" onClick={clearSystemCache}>Limpiar caché técnica</button><small>No se eliminan cuadrantes, fichajes, tickets ni información almacenada en Supabase.</small></div></div>}
 </div>
}



// COLIBRÍ IA 8.0 · asistente conversacional basado en datos reales del ERP
function aiPct(current,base){return base?((current-base)/base)*100:current?100:0}
function aiWords(text){return String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function aiSummary(tickets){const valid=(tickets||[]).filter(isRealSaleTicket);const total=valid.reduce((a,t)=>a+Number(t.total||0),0);const efectivo=valid.reduce((a,t)=>a+Number(t.efectivo||0),0);const tarjeta=valid.reduce((a,t)=>a+Number(t.tarjeta||0),0);return{total,tickets:valid.length,avg:valid.length?total/valid.length:0,efectivo,tarjeta}}
function aiTopProducts(lines,costMap,limit=8){const map=new Map();(lines||[]).forEach(l=>{const f=lineFinancials(l,costMap);const key=f.code||String(l.descripcion||'Sin código');const row=map.get(key)||{code:key,name:f.info?.name||l.descripcion||key,qty:0,revenue:0,cost:0,known:0};row.qty+=f.qty;row.revenue+=f.revenue;if(f.known){row.cost+=f.cost;row.known+=f.revenue}map.set(key,row)});return[...map.values()].map(r=>({...r,profit:r.revenue-r.cost,margin:r.known?r.profit/r.revenue*100:null})).sort((a,b)=>b.revenue-a.revenue).slice(0,limit)}
async function loadAIContext(){
 const end=addDays(today(),1),from30=addDays(today(),-29),prevFrom=addDays(today(),-59),prevTo=from30;
 const [todayData,yesterdayData,weekAgoData,monthData,prevMonthData,costMap,service,closure,todayReal,monthReal,prevMonthReal]=await Promise.all([
  loadSalesRange(today(),end),loadSalesRange(addDays(today(),-1),today()),loadSalesRange(addDays(today(),-7),addDays(today(),-6)),loadSalesRangeGestoria(from30,end),loadSalesRangeGestoria(prevFrom,prevTo),loadProfitabilityCostMap(),loadServiceState(),loadCashClosure(today()),loadRealProfitability(supabase,today(),end,[]),loadRealProfitability(supabase,from30,end,[]),loadRealProfitability(supabase,prevFrom,prevTo,[])
 ]);
 let clocks=[],employees=[],invoices=[];
 if(supabase){const start=today()+'T00:00:00';const [c,e,i]=await Promise.all([supabase.from('clock_records').select('*').gte('created_at',start).order('created_at',{ascending:true}).limit(1000),supabase.from('employees').select('*').eq('active',true).limit(200),supabase.from('purchase_invoices').select('id,status,total,invoice_date,invoice_number').order('invoice_date',{ascending:false}).limit(500)]);clocks=c.data||[];employees=e.data||[];invoices=i.data||[]}
 const applyNumier=(real,data)=>{real.variableERP=Number(real.variable||0);real.numierExpenses=Number(data?.numierExpenses?.total||0);real.variable=real.variableERP+real.numierExpenses;return real};
 return{todayData,yesterdayData,weekAgoData,monthData,prevMonthData,costMap,service,closure,clocks,employees,invoices,todayReal:applyNumier(todayReal,todayData),monthReal:applyNumier(monthReal,monthData),prevMonthReal:applyNumier(prevMonthReal,prevMonthData),loadedAt:new Date().toISOString()};
}
function buildAIAnswer(question,ctx){
 const q=aiWords(question),t=aiSummary(ctx.todayData.tickets),y=aiSummary(ctx.yesterdayData.tickets),w=aiSummary(ctx.weekAgoData.tickets),m=aiSummary(ctx.monthData.tickets),pm=aiSummary(ctx.prevMonthData.tickets),fin=periodFinancials(ctx.monthData.lines,ctx.costMap),todayFin=periodFinancials(ctx.todayData.lines,ctx.costMap),tops=aiTopProducts(ctx.monthData.lines,ctx.costMap,12),open=ctx.service?.open||[];
 const monthCore=calculateProfitability({revenue:m.total,productCost:fin.cost,laborCost:ctx.monthReal?.laborAccrued||0,fixedExpenses:ctx.monthReal?.fixed||0,variableExpenses:ctx.monthReal?.variable||0});const todayCore=calculateProfitability({revenue:t.total,productCost:todayFin.cost,laborCost:ctx.todayReal?.laborAccrued||0,fixedExpenses:ctx.todayReal?.fixed||0,variableExpenses:ctx.todayReal?.variable||0});const prevFin=periodFinancials(ctx.prevMonthData.lines,ctx.costMap),prevCore=calculateProfitability({revenue:pm.total,productCost:prevFin.cost,laborCost:ctx.prevMonthReal?.laborAccrued||0,fixedExpenses:ctx.prevMonthReal?.fixed||0,variableExpenses:ctx.prevMonthReal?.variable||0});
 const pendingInvoices=(ctx.invoices||[]).filter(x=>!['confirmed','reviewed','approved','paid'].includes(String(x.status||'').toLowerCase()));const openClock=new Map();(ctx.clocks||[]).forEach(r=>{const k=r.employee_id||r.employee_name;if(String(r.type).toLowerCase()==='entrada')openClock.set(k,r);else if(String(r.type).toLowerCase()==='salida')openClock.delete(k)});const deltaY=aiPct(t.total,y.total),deltaW=aiPct(t.total,w.total),deltaM=aiPct(m.total,pm.total),deltaProfit=aiPct(monthCore.realProfit,prevCore.realProfit);const laborPct=m.total?(ctx.monthReal?.laborAccrued||0)/m.total*100:0,salesPerHour=ctx.monthReal?.hours?m.total/ctx.monthReal.hours:0;
 let title='Resumen del negocio',body='',facts=[],recommendations=[];
 const aiShifts=analysisShiftStats(ctx.monthData.tickets||[],ctx.monthData.lines||[],ctx.monthReal?.scheduleRows||[],ctx.costMap),weakShift=aiShifts.filter(x=>x.sales>0).sort((a,b)=>a.profitPerHour-b.profitPerHour)[0];
 if(q.includes('turno')){title='Turno que conviene revisar';if(weakShift){body=`La franja ${weakShift.name} presenta la productividad más baja por hora programada: ${money(weakShift.profitPerHour)} de beneficio por hora de cuadrante.`;facts=[`Ventas: ${money(weakShift.sales)}`,`Horas de cuadrante: ${weakShift.staffHours.toFixed(1)} h`,`Coste de personal: ${money(weakShift.staffCost)}`,`Ventas / hora: ${money(weakShift.salesPerHour)}`,`Beneficio: ${money(weakShift.profit)}`];recommendations.push('Revisar primero el cuadrante y la demanda de esta franja antes de modificar precios o plantilla.')}else{body='No hay datos suficientes de ventas y cuadrante para comparar turnos.';facts=['Sin franja comparable'];}
 }else if(q.includes('personal')||q.includes('empleado')||q.includes('fichaje')){title='Análisis de personal y cuadrante';body=`El coste económico de personal se calcula únicamente con el cuadrante: ${money(ctx.monthReal?.laborAccrued||0)} para ${Number(ctx.monthReal?.hours||0).toFixed(1)} horas programadas en los últimos 30 días. Los fichajes se usan solo como referencia operativa.`;facts=[`Horas de cuadrante: ${Number(ctx.monthReal?.hours||0).toFixed(1)} h`,`Coste de cuadrante: ${money(ctx.monthReal?.laborAccrued||0)}`,`Personal / ventas: ${laborPct.toFixed(1)}%`,`Ventas por hora programada: ${money(salesPerHour)}`,`Fichajes abiertos ahora: ${openClock.size}`];recommendations.push(laborPct>30?'Revisar las franjas con menor venta por hora programada antes de aumentar plantilla.':'El peso de personal está contenido con las reglas actuales.');
 }else if(q.includes('producto')||q.includes('margen')||q.includes('rentab')){const low=tops.filter(x=>x.margin!==null).sort((a,b)=>a.margin-b.margin).slice(0,5);title='Productos y rentabilidad';body=`En 30 días las ventas son ${money(m.total)} y el beneficio real estimado, incluyendo cuadrante y gastos, es ${money(monthCore.realProfit)} (${monthCore.realMarginPct.toFixed(1)}%).`;facts=tops.slice(0,5).map(x=>`${x.name}: ${money(x.revenue)} vendidos · ${x.margin===null?'coste pendiente':`${x.margin.toFixed(1)}% margen`}`);if(fin.estimatedRevenue>0)recommendations.push(`Confirmar costes provisionales que afectan a ${money(fin.estimatedRevenue)} de ventas.`);if(low.length)recommendations.push(`Revisar ${low[0].name}, con el margen más bajo entre los productos analizados.`);
 }else if(q.includes('por que')||q.includes('menos')||q.includes('beneficio')){title='Qué está moviendo el beneficio';body=`El beneficio real de los últimos 30 días es ${money(monthCore.realProfit)}, un ${deltaProfit>=0?'+':''}${deltaProfit.toFixed(1)}% frente al periodo anterior. Las ventas cambian ${deltaM>=0?'+':''}${deltaM.toFixed(1)}%.`;facts=[`Margen producto: ${money(monthCore.grossMargin)}`,`Personal de cuadrante: ${money(ctx.monthReal?.laborAccrued||0)}`,`Gastos fijos: ${money(ctx.monthReal?.fixed||0)}`,`Variables + Numier G: ${money(ctx.monthReal?.variable||0)}`];recommendations.push(deltaProfit<deltaM?'El beneficio evoluciona peor que las ventas: revisar producto, cuadrante y gastos por este orden.':'La evolución del beneficio acompaña o mejora la evolución de ventas.');
 }else if(q.includes('efectivo')||q.includes('caja')){title='Situación de caja de hoy';body=`Las ventas cobradas en efectivo suman ${money(t.efectivo)} y en tarjeta ${money(t.tarjeta)}. ${ctx.closure?'Existe un cierre registrado para hoy.':'Todavía no consta un cierre de caja para hoy.'}`;facts=[`Ventas: ${money(t.total)}`,`Efectivo: ${money(t.efectivo)}`,`Tarjeta: ${money(t.tarjeta)}`,`Tickets: ${t.tickets}`];recommendations.push(ctx.closure?'Comprobar que cierre y cobros coinciden.':'Realizar el cierre y conciliación al terminar el servicio.');
 }else if(q.includes('atencion')||q.includes('alerta')||q.includes('problema')||q.includes('revisar')){title='Qué requiere atención';const alerts=[];if(!ctx.closure)alerts.push('Hoy todavía no tiene cierre de caja');if(open.length)alerts.push(`${open.length} cuentas continúan abiertas`);if(pendingInvoices.length)alerts.push(`${pendingInvoices.length} facturas pendientes de revisión`);if(fin.estimatedRevenue>0)alerts.push(`${money(fin.estimatedRevenue)} de ventas usan coste provisional`);if(openClock.size)alerts.push(`${openClock.size} fichajes siguen abiertos (solo referencia operativa)`);body=alerts.length?'He encontrado puntos que conviene revisar.':'No se detectan incidencias importantes con los datos disponibles.';facts=alerts.length?alerts:['Sin alertas críticas'];recommendations.push(alerts[0]||'Mantener la revisión diaria.');
 }else if(q.includes('compar')||q.includes('ayer')||q.includes('semana')){title='Comparación de ventas';body=`Hoy acumulas ${money(t.total)} en ${t.tickets} tickets. Frente a ayer: ${deltaY>=0?'+':''}${deltaY.toFixed(1)}%; frente al mismo día de la semana pasada: ${deltaW>=0?'+':''}${deltaW.toFixed(1)}%.`;facts=[`Hoy: ${money(t.total)}`,`Ayer: ${money(y.total)}`,`Hace 7 días: ${money(w.total)}`,`Ticket medio: ${money(t.avg)}`];recommendations.push(deltaW<0?'Revisar qué franja concentra la caída y su productividad por hora programada.':'El ritmo supera al mismo día de la semana pasada.');
 }else{title='Resumen ejecutivo de hoy';body=`Hoy se han vendido ${money(t.total)} en ${t.tickets} tickets. El beneficio real estimado es ${money(todayCore.realProfit)}, usando el coste de personal del cuadrante.`;facts=[`Ventas: ${money(t.total)}`,`Ticket medio: ${money(t.avg)}`,`Personal cuadrante: ${money(ctx.todayReal?.laborAccrued||0)} · ${Number(ctx.todayReal?.hours||0).toFixed(1)} h`,`Beneficio real: ${money(todayCore.realProfit)}`,`30 días: ${money(m.total)} (${deltaM>=0?'+':''}${deltaM.toFixed(1)}%)`];if(!ctx.closure)recommendations.push('El cierre de caja de hoy aún no consta como registrado.');if(fin.estimatedRevenue>0)recommendations.push('Confirmar costes provisionales aumentará la precisión del análisis.');}
 return{id:Date.now(),question,title,body,facts,recommendations,createdAt:new Date().toISOString(),period:'Datos actualizados hasta '+new Date(ctx.loadedAt).toLocaleString('es-ES')};
}

function AIWhatsApp(answer){return `🤖 COLIBRÍ IA · ${answer.title}\n\n${answer.body}\n\n${answer.facts.map(x=>'• '+x).join('\n')}${answer.recommendations.length?'\n\nRECOMENDACIÓN\n'+answer.recommendations.map(x=>'• '+x).join('\n'):''}\n\n${answer.period}`}
function BusinessAssistant(){
 const[ctx,setCtx]=useState(null),[loading,setLoading]=useState(true),[question,setQuestion]=useState(''),[messages,setMessages]=useState(()=>{try{return JSON.parse(localStorage.getItem('colibri_ai8_history')||'[]')}catch{return[]}}),[error,setError]=useState('');
 useEffect(()=>{refresh()},[]);useEffect(()=>{localStorage.setItem('colibri_ai8_history',JSON.stringify(messages.slice(-30)))},[messages]);
 async function refresh(){try{setLoading(true);setError('');setCtx(await loadAIContext())}catch(e){setError(e.message||String(e))}finally{setLoading(false)}}
 function ask(text=question){const clean=String(text||'').trim();if(!clean||!ctx)return;const answer=buildAIAnswer(clean,ctx);setMessages(v=>[...v,answer]);setQuestion('')}
 async function copy(answer){const txt=AIWhatsApp(answer);try{await navigator.clipboard.writeText(txt);alert('Resumen copiado para WhatsApp')}catch{prompt('Copia el texto:',txt)}}
 const quick=['Resumen de hoy','¿Por qué ha cambiado el beneficio?','¿Qué turno debo revisar?','Analiza productos y rentabilidad','Analiza personal según cuadrante','¿Qué requiere atención?','Compárame con el periodo anterior'];
 return <div className="ai8"><div className="card hero ai8Hero"><div><span className="sectionEyebrow">COLIBRÍ IA 8.0 · ASISTENTE DEL NEGOCIO</span><h2>Pregunta directamente por tu negocio</h2><p>Respuestas calculadas con ventas, costes, TPV, cierres, facturas y cuadrantes. Los fichajes se usan solo como referencia operativa.</p></div><button onClick={refresh} disabled={loading}>{loading?'Actualizando…':'Actualizar datos'}</button></div>
 {error&&<div className="alertBad">{error}</div>}<div className="ai8Quick">{quick.map(x=><button key={x} onClick={()=>ask(x)} disabled={!ctx||loading}>{x}</button>)}</div>
 <div className="card ai8Composer"><textarea value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} placeholder="Ejemplo: ¿Por qué estoy vendiendo menos que la semana pasada?"/><button onClick={()=>ask()} disabled={!question.trim()||!ctx||loading}>Preguntar</button><small>Modo seguro: solo consulta y análisis. No modifica ningún dato del ERP.</small></div>
 <div className="ai8Conversation">{!messages.length&&<div className="card ai8Welcome"><h2>Hola, Alfonso</h2><p>Selecciona una pregunta rápida o escribe lo que quieres saber. El asistente no inventa datos: cuando una cifra no está disponible, lo indicará.</p></div>}{messages.slice().reverse().map(a=><article className="card ai8Answer" key={a.id}><div className="ai8Question">Tú: {a.question}</div><div className="ai8AnswerHead"><div><span>COLIBRÍ IA</span><h2>{a.title}</h2></div><button onClick={()=>copy(a)}>Copiar WhatsApp</button></div><p className="ai8Body">{a.body}</p><div className="ai8Facts">{a.facts.map((x,i)=><div key={i}>{x}</div>)}</div>{a.recommendations.length>0&&<div className="ai8Recommendation"><b>Recomendación</b>{a.recommendations.map((x,i)=><p key={i}>{x}</p>)}</div>}<small>{a.period}</small></article>)}</div>
 {messages.length>0&&<button className="ai8Clear" onClick={()=>{if(confirm('¿Borrar el historial del asistente?'))setMessages([])}}>Borrar historial</button>}</div>
}

class ModuleErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('Error módulo',this.props.name,error,info)}
 render(){if(this.state.error)return <div className="card"><h2>⚠️ Error en {this.props.name}</h2><p>El módulo ha fallado, pero el ERP sigue operativo.</p><pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error?.message||this.state.error)}</pre><button onClick={()=>{if(this.props.name==='almacen'){localStorage.removeItem('colibri_inventory_v7')}else{localStorage.removeItem('colibriSchedule');localStorage.removeItem('colibriScheduleEmployees')}this.setState({error:null});location.reload()}}>Reiniciar datos locales de {this.props.name==='almacen'?'almacén':'cuadrante'}</button></div>;return this.props.children}
}


function UnifiedProfitability(){
 const[mode,setMode]=useState('hoy'),[date,setDate]=useState(today()),[state,setState]=useState({tickets:[],lines:[],costMap:new Map(),real:null}),[loading,setLoading]=useState(false),[fixed,setFixed]=useState([]),[variable,setVariable]=useState([]),[detail,setDetail]=useState(null),[selectedTicket,setSelectedTicket]=useState(null),[fixedForm,setFixedForm]=useState({name:'',category:'Alquiler',monthly_amount:'',start_date:today(),end_date:'',notes:'',active:true}),[variableForm,setVariableForm]=useState({name:'',category:'Otros',expense_date:today(),amount:'',payment_method:'Efectivo',notes:''});
 const r=rangeDates(mode,date);const buttons=[['hoy','Hoy'],['ayer','Ayer'],['semana','7 días'],['treinta','30 días'],['mes','Mes'],['anio','Año']];
 const chooseMode=id=>{setMode(id);if(id==='hoy')setDate(today());else if(id==='ayer')setDate(addDays(today(),-1));else if(id==='mes')setDate(today().slice(0,7)+'-01');else if(id==='anio')setDate(today().slice(0,4)+'-01-01')};
 useEffect(()=>{load()},[mode,date]);
 async function load(){if(!supabase)return;setLoading(true);try{const salesLoader=(mode==='anio'||mode==='treinta'||mode==='mes')?loadSalesRangeGestoria:loadSalesRange;const [loadedSales,costMap,real,{data:f},{data:v}]=await Promise.all([salesLoader(r.from,r.to),loadProfitabilityCostMap(),loadRealProfitability(supabase,r.from,r.to,[]),supabase.from('business_fixed_expenses').select('*').order('active',{ascending:false}).order('start_date',{ascending:false}).limit(1000),supabase.from('business_variable_expenses').select('*').order('expense_date',{ascending:false}).limit(2000)]);const tickets=(loadedSales.tickets||[]).filter(isRealSaleTicket),lines=loadedSales.lines||[];const expenseSummary=loadedSales.numierExpenses||summarizeNumierExpenses(loadedSales.tickets||[]);real.numierExpenses=Number(expenseSummary.total||0);real.variable=Number(real.variable||0)+real.numierExpenses;real.details=real.details||{};real.details.numierExpenses=expenseSummary.rows||[];setState({tickets,lines:normalizePeriodLines(tickets,lines),costMap,real});setFixed(f||[]);setVariable(v||[])}finally{setLoading(false)}}
 async function addFixed(){if(!fixedForm.name.trim()||Number(fixedForm.monthly_amount)<=0)return alert('Indica concepto e importe mensual');const payload={...fixedForm,name:fixedForm.name.trim(),monthly_amount:Number(fixedForm.monthly_amount),end_date:fixedForm.end_date||null};const{error}=await supabase.from('business_fixed_expenses').insert(payload);if(error)return alert(error.message);setFixedForm({...fixedForm,name:'',monthly_amount:'',notes:''});await load()}
 async function addVariable(){if(!variableForm.name.trim()||Number(variableForm.amount)<=0)return alert('Indica concepto e importe');const{error}=await supabase.from('business_variable_expenses').insert({...variableForm,name:variableForm.name.trim(),amount:Number(variableForm.amount)});if(error)return alert(error.message);setVariableForm({...variableForm,name:'',amount:'',notes:''});await load()}
 async function removeFixed(id){if(!confirm('¿Eliminar este gasto fijo?'))return;const{error}=await supabase.from('business_fixed_expenses').delete().eq('id',id);if(error)return alert(error.message);await load()}
 async function removeVariable(id){if(!confirm('¿Eliminar este gasto variable?'))return;const{error}=await supabase.from('business_variable_expenses').delete().eq('id',id);if(error)return alert(error.message);await load()}
 async function toggleFixed(row){const{error}=await supabase.from('business_fixed_expenses').update({active:row.active===false,updated_at:new Date().toISOString()}).eq('id',row.id);if(error)return alert(error.message);await load()}
 const daily=summarizeTickets(state.tickets),products=periodFinancials(state.lines,state.costMap),real=state.real||{laborAccrued:0,fixed:0,variable:0,hours:0,details:{labor:[],fixed:[],variable:[]}};const gross=daily.total-products.cost,operating=gross-real.laborAccrued,profit=operating-real.fixed-real.variable,margin=daily.total?profit/daily.total*100:0;
 const productRows=useMemo(()=>{const m=new Map();(state.lines||[]).forEach(l=>{const f=lineFinancials(l,state.costMap);const k=f.code||l.descripcion||'Sin código';const x=m.get(k)||{code:f.code||'',name:f.info?.name||l.descripcion||k,qty:0,revenue:0,cost:0,estimated:0};x.qty+=f.qty;x.revenue+=f.revenue;x.cost+=f.cost;if(!f.known)x.estimated+=f.revenue;m.set(k,x)});return[...m.values()].sort((a,b)=>b.revenue-a.revenue)},[state.lines,state.costMap]);
 const ticketRows=state.tickets.slice().sort((a,b)=>new Date(b.hora||b.created_at)-new Date(a.hora||a.created_at));
 const details={
  ventas:{title:'Detalle de ventas',kind:'tickets',rows:[['Periodo',`${r.from} → ${addDays(r.to,-1)}`],['Tickets',daily.tickets],['Ticket medio',money(daily.ticket_medio)],['Efectivo',money(daily.efectivo)],['Tarjeta',money(daily.tarjeta)],['Total',money(daily.total)]],items:ticketRows},
  productos:{title:'Coste de productos vendidos',kind:'products',rows:[['Coste total',money(products.cost)],['Venta con coste estimado 1/3',money(products.estimatedRevenue)]],items:productRows.slice(0,120)},
  personal:{title:'Personal devengado',kind:'labor',rows:[['Origen','Cuadrante (fuente económica)'],['Horas imputadas',`${Number(real.hours||0).toFixed(2)} h`],['Coste total',money(real.laborAccrued)],['Horas fichadas · referencia',`${Number(real.clockHours||0).toFixed(2)} h`]],items:real.details?.labor||[]},
  fijos:{title:'Gastos fijos imputados',kind:'fixed',rows:[['Total',money(real.fixed)]],items:real.details?.fixed||[]},
  variables:{title:'Gastos variables del periodo',kind:'variable',rows:[['Total',money(real.variable)],['Incluidos desde Numier (estado G)',money(real.numierExpenses||0)]],items:[...(real.details?.variable||[]),...(real.details?.numierExpenses||[]).map(x=>({expense_date:String(x.hora||'').slice(0,10),name:`Numier · ${x.mesa||x.descripcion||x.numdoc||'Gasto'}`,amount:numierExpenseAmount(x),payment_method:'Numier G'}))]},
  bruto:{title:'Margen bruto',rows:[['Ventas',money(daily.total)],['Coste productos',`- ${money(products.cost)}`],['Margen bruto',money(gross)],['Porcentaje',daily.total?`${(gross/daily.total*100).toFixed(1)}%`:'0%']]},
  operativo:{title:'Margen operativo',rows:[['Margen bruto',money(gross)],['Personal',`- ${money(real.laborAccrued)}`],['Margen operativo',money(operating)] ]},
  beneficio:{title:'Beneficio real',rows:[['Ventas',money(daily.total)],['Productos',`- ${money(products.cost)}`],['Personal',`- ${money(real.laborAccrued)}`],['Gastos fijos',`- ${money(real.fixed)}`],['Gastos variables',`- ${money(real.variable)}`],['Beneficio real',money(profit)],['Margen real',`${margin.toFixed(1)}%`]]}
 };
 async function editProductCost(item){const code=String(item.code||'').trim();if(!code)return alert('Este producto no tiene código para guardar el coste.');const current=item.qty?item.cost/item.qty:0;const value=prompt(`Coste real por unidad de ${item.name}`,Number(current||0).toFixed(4));if(value===null)return;const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<0)return alert('Coste no válido');const result=await persistArticleCost(code,n,'Editado desde Resultado real');if(result.error)alert('Guardado localmente, pero Supabase devolvió: '+result.error.message);else alert('Coste actualizado');setDetail(null);await load()}
 const kpi=(key,label,value,small,extra='')=><button className={`card kpi unifiedProfitKpiButton ${extra}`} onClick={()=>setDetail(details[key])}><span>{label}</span><b className={key==='beneficio'?(profit>=0?'ok':'bad'):''}>{value}</b><small>{small}</small></button>;
 return <div className="unifiedProfit"><div className="card hero"><div><span className="sectionEyebrow">CORE DE RENTABILIDAD · FUENTE ÚNICA</span><h2>Resultado real del negocio</h2><p>{r.label} · {fmtDate(r.from)}{addDays(r.to,-1)!==r.from?` a ${fmtDate(addDays(r.to,-1))}`:''}. El mismo cálculo alimenta Inteligencia, Dashboard y contabilidad.</p></div><div className="row controls">{buttons.map(([id,l])=><button key={id} className={mode===id?'active':''} onClick={()=>chooseMode(id)}>{l}</button>)}<input type="date" value={mode==='ayer'?addDays(today(),-1):mode==='hoy'?today():date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/><button onClick={load}>{loading?'Calculando…':'Actualizar'}</button></div></div>
 <div className="grid unifiedProfitKpis">{kpi('ventas','Ventas',money(daily.total),`${daily.tickets} tickets · ${money(daily.ticket_medio)} medio`)}{kpi('productos','Coste productos',money(products.cost),`${money(products.estimatedRevenue)} con coste 1/3 estimado`)}{kpi('personal','Personal devengado',money(real.laborAccrued),`${Number(real.hours||0).toFixed(1)} h · coste individual`)}{kpi('fijos','Gastos fijos',money(real.fixed),'Prorrateados por días naturales')}{kpi('variables','Gastos variables',money(real.variable),'Movimientos del periodo')}{kpi('bruto','Margen bruto',money(gross),'Ventas menos producto')}{kpi('operativo','Margen operativo',money(operating),'Después de personal')}{kpi('beneficio','Beneficio real',money(profit),`${margin.toFixed(1)}% sobre ventas`,'realProfitKpi')}</div>
 <div className="grid unifiedProfitForms"><section className="card"><h2>Gastos fijos mensuales</h2><div className="formGrid"><label>Concepto<input value={fixedForm.name} onChange={e=>setFixedForm({...fixedForm,name:e.target.value})}/></label><label>Categoría<select value={fixedForm.category} onChange={e=>setFixedForm({...fixedForm,category:e.target.value})}><option>Alquiler</option><option>Luz</option><option>Agua</option><option>Internet</option><option>Seguros</option><option>Gestoría</option><option>Otros</option></select></label><label>Importe mensual<input type="number" step="0.01" value={fixedForm.monthly_amount} onChange={e=>setFixedForm({...fixedForm,monthly_amount:e.target.value})}/></label><label>Desde<input type="date" value={fixedForm.start_date} onChange={e=>setFixedForm({...fixedForm,start_date:e.target.value})}/></label><label>Hasta (opcional)<input type="date" value={fixedForm.end_date} onChange={e=>setFixedForm({...fixedForm,end_date:e.target.value})}/></label></div><button onClick={addFixed}>Añadir gasto fijo</button><div className="expenseList">{fixed.map(x=><div key={x.id}><span><b>{x.name}</b><small>{x.category||'Otros'} · {money(x.monthly_amount)}/mes · desde {x.start_date}</small></span><button className="ghost" onClick={()=>toggleFixed(x)}>{x.active===false?'Activar':'Pausar'}</button><button className="red" onClick={()=>removeFixed(x.id)}>Eliminar</button></div>)}</div></section>
 <section className="card"><h2>Gastos variables</h2><div className="formGrid"><label>Concepto<input value={variableForm.name} onChange={e=>setVariableForm({...variableForm,name:e.target.value})}/></label><label>Categoría<select value={variableForm.category} onChange={e=>setVariableForm({...variableForm,category:e.target.value})}><option>Imprevisto</option><option>Reparación</option><option>Transporte</option><option>Comisiones</option><option>Otros</option></select></label><label>Fecha<input type="date" value={variableForm.expense_date} onChange={e=>setVariableForm({...variableForm,expense_date:e.target.value})}/></label><label>Importe<input type="number" step="0.01" value={variableForm.amount} onChange={e=>setVariableForm({...variableForm,amount:e.target.value})}/></label><label>Pago<select value={variableForm.payment_method} onChange={e=>setVariableForm({...variableForm,payment_method:e.target.value})}><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Domiciliado</option></select></label></div><button onClick={addVariable}>Añadir gasto variable</button><div className="expenseList">{variable.slice(0,30).map(x=><div key={x.id}><span><b>{x.name}</b><small>{x.expense_date} · {x.category||'Otros'} · {x.payment_method||'—'}</small></span><strong>{money(x.amount)}</strong><button className="red" onClick={()=>removeVariable(x.id)}>Eliminar</button></div>)}</div></section></div>
 <div className="grid"><section className="card"><h2>Personal imputado</h2>{(real.details?.labor||[]).length?(real.details.labor||[]).map(x=><p className="profitDetailRow" key={x.employee_id||x.employee_name}><span>{x.employee_name}</span><b>{Number(x.hours).toFixed(1)} h × {money(x.hourly_cost)} = {money(x.cost)}</b></p>):<p>Sin horas imputadas para este periodo.</p>}</section><section className="card"><h2>Fijos imputados al periodo</h2>{(real.details?.fixed||[]).length?(real.details.fixed||[]).map(x=><p className="profitDetailRow" key={x.id}><span>{x.name} · {x.days} días</span><b>{money(x.imputed)}</b></p>):<p>Sin gastos fijos activos.</p>}</section></div>
 {detail&&<div className="modal unifiedProfitModalOverlay" onClick={()=>setDetail(null)}><div className="modalbox unifiedProfitDetail" onClick={e=>e.stopPropagation()}><div className="row between unifiedProfitDetailHeader"><div><span className="sectionEyebrow">DETALLE Y TRAZABILIDAD</span><h2>{detail.title}</h2></div><button className="ghost" onClick={()=>setDetail(null)}>Cerrar</button></div><div className="profitDetailList">{detail.rows.map((x,i)=><p className="profitDetailRow" key={i}><span>{x[0]}</span><b>{x[1]}</b></p>)}</div>
 {detail.kind==='tickets'&&<div className="tableScroll unifiedTraceTable"><table><thead><tr><th>Fecha/hora</th><th>Ticket</th><th>Pago</th><th>Total</th><th></th></tr></thead><tbody>{detail.items.slice(0,250).map(t=><tr key={t.cab_id||t.id}><td>{new Date(t.hora||t.created_at).toLocaleString('es-ES')}</td><td>{t.numdoc||t.cab_id}</td><td>{paymentLabel(t)}</td><td>{money(t.total)}</td><td><button onClick={()=>{setSelectedTicket(t.cab_id);setDetail(null)}}>Ver ticket</button></td></tr>)}</tbody></table></div>}
 {detail.kind==='products'&&<div className="unifiedTraceList">{detail.items.map((x,i)=><article key={x.code||x.name||i}><div><b>{x.name}</b><small>{x.qty.toFixed(2)} uds. · venta {money(x.revenue)} · coste {money(x.cost)}</small><em className={x.estimated?'warn':'ok'}>{x.estimated?'Coste estimado 1/3':'Coste configurado'}</em></div><button onClick={()=>editProductCost(x)}>Editar coste</button></article>)}</div>}
 {detail.kind==='labor'&&<div className="unifiedTraceList">{detail.items.map((x,i)=><article key={x.employee_id||x.employee_name||i}><div><b>{x.employee_name||'Empleado'}</b><small>{Number(x.hours||0).toFixed(2)} h × {money(x.hourly_cost)} = {money(x.cost)}</small>{x.anomalies?.length>0&&<em className="warn">{x.anomalies.join(' · ')}</em>}</div></article>)}</div>}
 {detail.kind==='fixed'&&<div className="unifiedTraceList">{detail.items.map((x,i)=><article key={x.id||i}><div><b>{x.name||'Gasto fijo'}</b><small>{x.category||'Sin categoría'} · {x.days} días · {money(x.amount)}/mes</small></div><strong>{money(x.imputed)}</strong></article>)}</div>}
 {detail.kind==='variable'&&<div className="unifiedTraceList">{detail.items.map((x,i)=><article key={x.id||i}><div><b>{x.name||x.description||'Gasto variable'}</b><small>{x.expense_date||x.date||''} · {x.category||'Sin categoría'} · {x.payment_method||'Sin forma de pago'}</small></div><strong>{money(x.amount||x.total)}</strong></article>)}</div>}
 </div></div>}{selectedTicket&&<TicketModal cabId={selectedTicket} onClose={()=>setSelectedTicket(null)}/>}</div>
}

function App(){const host=location.hostname;const onlyClock=host.startsWith('fichar.')||location.pathname.includes('fichar');const [authed,setAuthed]=useState(false);return <>{onlyClock?<PeoplePortal supabase={supabase} Brand={Brand}/>:<>{!authed?<Login onOk={()=>setAuthed(true)}/>:<Manager/>}</>}</>}
function Login({onOk}){const[pin,setPin]=useState('');return <main className="login"><Brand/><div className="card narrow"><h2>Acceso Manager</h2><input placeholder="Clave gerente" type="password" value={pin} onChange={e=>setPin(e.target.value)}/><button onClick={()=>pin===ADMIN_PIN?onOk():alert('Clave incorrecta')}>Entrar</button><a href="/fichar" className="muted">Ir a fichaje empleados</a></div></main>}
function Brand(){return <div className="brand"><div className="brandMark"><img src="/colibri-brand.png" onError={e=>e.currentTarget.style.display='none'}/></div><div><h1>Colibrí <span>ERP</span></h1><p>Brasería El Colibrí</p></div></div>}

function DecisionCenter({onNavigate}){
 const [date,setDate]=useState(today());
 const [state,setState]=useState({loading:true,error:null,tickets:[],lines:[],costMap:new Map(),real:null,service:{open:[]},sync:null,clocks:[],employees:[],closure:null});
 const [resolved,setResolved]=useState(()=>readLocalJSON('colibri46_resolved_alerts',{}));
 const [audit,setAudit]=useState(()=>readLocalJSON('colibri46_decision_audit',[]));
 const [checks,setChecks]=useState(()=>readLocalJSON(`colibri46_close_checks_${today()}`,{}));
 const [goals,setGoals]=useState(()=>readLocalJSON('colibri46_business_goals',{dailySales:700,minMargin:25,maxLaborPct:25,minTicket:10,monthlyProfit:6000}));
 useEffect(()=>{load()},[date]);
 useEffect(()=>localStorage.setItem('colibri46_resolved_alerts',JSON.stringify(resolved)),[resolved]);
 useEffect(()=>localStorage.setItem('colibri46_decision_audit',JSON.stringify(audit.slice(0,300))),[audit]);
 useEffect(()=>localStorage.setItem(`colibri46_close_checks_${date}`,JSON.stringify(checks)),[checks,date]);
 useEffect(()=>localStorage.setItem('colibri46_business_goals',JSON.stringify(goals)),[goals]);
 async function load(){
  if(!supabase){setState(s=>({...s,loading:false,error:'Supabase no configurado'}));return}
  setState(s=>({...s,loading:true,error:null}));
  try{
   const to=addDays(date,1),start=date+'T00:00:00',end=to+'T00:00:00';
   const [salesData,costMap,service,sync,clockRes,employeeRes,closure]=await Promise.all([
    loadSalesRange(date,to),loadProfitabilityCostMap(),date===today()?loadServiceState():Promise.resolve({open:[]}),loadSyncStatus(),
    supabase.from('clock_records').select('*').gte('created_at',start).lt('created_at',end).order('created_at',{ascending:true}).limit(3000),
    supabase.from('employees').select('*').eq('active',true).limit(500),loadCashClosure(date)
   ]);
   const tickets=salesData.tickets||[],lines=salesData.lines||[],clocks=clockRes.data||[],employees=employeeRes.data||[];
   const real=await loadRealProfitability(supabase,date,to,clocks);
   setState({loading:false,error:null,tickets,lines,costMap,real:{...real,numierExpenses:Number(salesData.numierExpenses?.total||0)},service,sync,clocks,employees,closure});
  }catch(e){setState(s=>({...s,loading:false,error:e.message||String(e)}))}
 }
 const summary=summarizeTickets((state.tickets||[]).filter(t=>!['X','G'].includes(String(t.estado||'C').toUpperCase())));
 const products=periodFinancials(state.lines||[],state.costMap||new Map());
 const real=state.real||{laborAccrued:0,fixed:0,variable:0,hours:0,details:{}};
 const profit=summary.total-products.cost-Number(real.laborAccrued||0)-Number(real.fixed||0)-Number(real.variable||0)-Number(real.numierExpenses||0);
 const margin=summary.total?profit/summary.total*100:0;
 const {sessions=[]}=buildClockSessions(state.clocks||[],null,new Date());
 const openSessions=sessions.filter(x=>x.open);
 const tooLong=openSessions.filter(x=>x.start?.created_at&&((Date.now()-new Date(x.start.created_at).getTime())/3600000)>10);
 const openAccounts=state.service?.open||[];
 const estimatedRevenue=Number(products.estimatedRevenue||0);
 const syncAge=state.sync?.updated_at?(Date.now()-new Date(state.sync.updated_at).getTime())/60000:null;
 const alerts=[];
 if(!state.closure)alerts.push({id:`closure-${date}`,tone:'critical',title:'Cierre de caja pendiente',text:'El día todavía no tiene cierre registrado.',impact:'Cierre',tab:'tpv'});
 if(openAccounts.length)alerts.push({id:`accounts-${date}`,tone:openAccounts.some(x=>minutesOpen(x.opened_at)>90)?'critical':'warning',title:`${openAccounts.length} cuentas abiertas`,text:`Importe pendiente: ${money(openAccounts.reduce((a,x)=>a+Number(x.total||0),0))}.`,impact:'Operación',tab:'servicio'});
 if(tooLong.length)alerts.push({id:`clocks-${date}`,tone:'critical',title:`${tooLong.length} turnos abiertos demasiado tiempo`,text:tooLong.map(x=>x.employee_name||x.employee_id).join(', '),impact:'Personal',tab:'fichajes'});
 else if(openSessions.length)alerts.push({id:`openclocks-${date}`,tone:'info',title:`${openSessions.length} empleados trabajando`,text:'Revisa que los turnos abiertos correspondan al personal presente.',impact:'Personal',tab:'fichajes'});
 if(estimatedRevenue>0)alerts.push({id:`costs-${date}`,tone:'warning',title:'Productos con coste provisional',text:`${money(estimatedRevenue)} de venta usa estimación de 1/3 del PVP.`,impact:'Rentabilidad',tab:'rentabilidad'});
 if(syncAge===null||syncAge>10)alerts.push({id:`sync-${date}`,tone:'critical',title:'Sincronización detenida o antigua',text:syncAge===null?'No hay estado reciente de Colibrí Sync.':`Última actualización hace ${Math.round(syncAge)} minutos.`,impact:'Datos',tab:'config'});
 if((Number(real.variable||0)+Number(real.numierExpenses||0))===0&&summary.total>0)alerts.push({id:`variables-${date}`,tone:'info',title:'Sin gastos variables registrados',text:'Confirma que no hubo compras, retiradas o imprevistos.',impact:'Gastos',tab:'resultado'});
 const pending=alerts.filter(a=>!resolved[a.id]);
 const costCoverage=summary.total?Math.max(0,100-(estimatedRevenue/summary.total*100)):100;
 const laborQuality=Number(real.hours||0)>0?100:35;
 const closureQuality=state.closure?100:55;
 const syncQuality=syncAge!==null&&syncAge<=10?100:50;
 const expenseQuality=Number(real.fixed||0)>0?100:70;
 const reliability=Math.round(costCoverage*.35+laborQuality*.25+closureQuality*.15+syncQuality*.15+expenseQuality*.10);
 const reliabilityTone=reliability>=90?'good':reliability>=75?'warn':'bad';
 const goalSales=Number(goals.dailySales||0),goalMargin=Number(goals.minMargin||0),laborPct=summary.total?Number(real.laborAccrued||0)/summary.total*100:0;
 const currentHour=Math.max(1,new Date().getHours()-8);const projected=summary.total/currentHour*15;
 const closeItems=[
  ['sales','Ventas válidas revisadas',summary.total>0],['payments','Formas de pago revisadas',summary.total>0],['accounts','No quedan cuentas abiertas',openAccounts.length===0],['clocks','Fichajes cerrados o justificados',openSessions.length===0],['costs','Costes provisionales revisados',estimatedRevenue===0],['expenses','Gastos y retiradas registrados',Number(real.variable||0)>0||summary.total===0],['sync','Sincronización actualizada',syncAge!==null&&syncAge<=10]
 ];
 function resolveAlert(a){const next={...resolved,[a.id]:{at:new Date().toISOString(),title:a.title}};setResolved(next);setAudit(v=>[{at:new Date().toISOString(),action:'Alerta revisada',detail:a.title,user:'Gerencia'},...v])}
 function toggleCheck(id){setChecks(v=>({...v,[id]:!v[id]}))}
 function finishGuidedClose(){const incomplete=closeItems.filter(([id,,auto])=>!(auto||checks[id]));if(incomplete.length)return alert(`Quedan ${incomplete.length} comprobaciones pendientes.`);const row={at:new Date().toISOString(),action:'Cierre guiado completado',detail:`${date} · ventas ${money(summary.total)} · beneficio ${money(profit)} · fiabilidad ${reliability}%`,user:'Gerencia'};setAudit(v=>[row,...v]);localStorage.setItem(`colibri46_guided_close_${date}`,JSON.stringify(row));alert('Revisión guiada completada. Ahora puedes registrar el cierre definitivo en TPV y caja.')}
 return <div className="decision46">
  <div className="card decisionHero"><div><span className="sectionEyebrow">COLIBRÍ ERP 4.6 · CONTROL Y DECISIONES</span><h2>Centro de decisiones</h2><p>Problemas accionables, calidad del dato, objetivos y cierre diario en una sola pantalla.</p></div><div className="row"><input type="date" value={date} onChange={e=>{setDate(e.target.value);setChecks(readLocalJSON(`colibri46_close_checks_${e.target.value}`,{}))}}/><button onClick={load}>{state.loading?'Actualizando…':'Actualizar'}</button></div></div>
  {state.error&&<div className="alertBad">{state.error}</div>}
  <div className="decisionKpis"><article><span>Ventas</span><b>{money(summary.total)}</b><small>{summary.tickets} tickets</small></article><article><span>Beneficio real</span><b className={profit>=0?'ok':'bad'}>{money(profit)}</b><small>{margin.toFixed(1)}% margen</small></article><article><span>Fiabilidad del dato</span><b className={reliabilityTone}>{reliability}%</b><small>{reliability>=90?'Resultado muy fiable':reliability>=75?'Hay datos estimados':'Revisión necesaria'}</small></article><article><span>Pendientes</span><b>{pending.length}</b><small>{alerts.length-pending.length} revisados</small></article></div>
  <div className="decisionLayout"><section className="card"><div className="row between"><div><h2>Pendientes de hoy</h2><p className="mutedText">Solo incidencias que requieren una decisión.</p></div><span className="decisionCount">{pending.length}</span></div><div className="decisionAlerts">{pending.map(a=><article className={a.tone} key={a.id}><div><span>{a.impact}</span><h3>{a.title}</h3><p>{a.text}</p></div><div className="decisionActions"><button onClick={()=>onNavigate(a.tab)}>Corregir</button><button className="ghost" onClick={()=>resolveAlert(a)}>Revisado</button></div></article>)}{!pending.length&&<div className="decisionEmpty"><b>Todo revisado</b><p>No hay incidencias pendientes para este periodo.</p></div>}</div></section>
  <section className="card reliabilityCard"><h2>Calidad del resultado</h2>{[['Costes de producto',costCoverage],['Personal',laborQuality],['Cierre de caja',closureQuality],['Sincronización',syncQuality],['Gastos fijos',expenseQuality]].map(([l,v])=><div className="qualityRow" key={l}><span>{l}</span><div><i style={{width:`${v}%`}}></i></div><b>{Math.round(v)}%</b></div>)}<p className="mutedText">La cifra de beneficio sigue siendo estimada mientras existan costes provisionales, cuadrantes usados como respaldo o cierres pendientes.</p></section></div>
  <div className="decisionLayout"><section className="card guidedClose"><h2>Cierre diario guiado</h2><p className="mutedText">Completa la revisión antes de registrar el cierre definitivo.</p>{closeItems.map(([id,label,auto])=>{const done=auto||checks[id];return <button className={done?'done':''} onClick={()=>!auto&&toggleCheck(id)} key={id}><span>{done?'✓':'○'}</span><b>{label}</b><small>{auto?'Comprobado automáticamente':'Confirmación manual'}</small></button>})}<div className="row"><button onClick={finishGuidedClose}>Completar revisión guiada</button><button className="ghost" onClick={()=>onNavigate('tpv')}>Ir a TPV y caja</button></div></section>
  <section className="card goalCard"><h2>Objetivos y previsión</h2><div className="goalForm"><label>Venta diaria<input type="number" value={goals.dailySales} onChange={e=>setGoals({...goals,dailySales:e.target.value})}/></label><label>Margen mínimo %<input type="number" value={goals.minMargin} onChange={e=>setGoals({...goals,minMargin:e.target.value})}/></label><label>Personal máximo %<input type="number" value={goals.maxLaborPct} onChange={e=>setGoals({...goals,maxLaborPct:e.target.value})}/></label><label>Ticket medio mínimo<input type="number" value={goals.minTicket} onChange={e=>setGoals({...goals,minTicket:e.target.value})}/></label></div><div className="goalResults"><p><span>Objetivo de venta</span><b>{goalSales?`${Math.min(100,summary.total/goalSales*100).toFixed(0)}%`: '—'}</b></p><p><span>Previsión de cierre</span><b>{money(projected)}</b></p><p><span>Margen real</span><b className={margin>=goalMargin?'ok':'bad'}>{margin.toFixed(1)}%</b></p><p><span>Personal / ventas</span><b className={laborPct<=Number(goals.maxLaborPct||0)?'ok':'bad'}>{laborPct.toFixed(1)}%</b></p></div><div className="decisionAdvice">{summary.total<goalSales*.75?`La venta está por debajo del ritmo objetivo. Previsión actual: ${money(projected)}.`:margin<goalMargin?`La venta avanza, pero el margen está ${Math.abs(margin-goalMargin).toFixed(1)} puntos por debajo del objetivo.`:laborPct>Number(goals.maxLaborPct||0)?'El coste de personal está por encima del límite definido.':'Ritmo y márgenes dentro de los objetivos configurados.'}</div></section></div>
  <section className="card auditCard"><div className="row between"><div><h2>Historial de decisiones</h2><p className="mutedText">Registro local de revisiones y cierres guiados.</p></div><button className="ghost" onClick={()=>{if(confirm('¿Borrar el historial de decisiones?'))setAudit([])}}>Limpiar</button></div>{audit.slice(0,20).map((x,i)=><p key={i}><span>{new Date(x.at).toLocaleString('es-ES')}</span><b>{x.action}</b><small>{x.detail}</small></p>)}{!audit.length&&<p>Sin acciones registradas todavía.</p>}</section>
 </div>
}

function AreaTabs({items,active,onChange}){
 return <nav className="areaTabs" aria-label="Secciones del área">{items.map(([id,label,icon])=><button type="button" key={id} className={active===id?'active':''} onClick={()=>onChange(id)}>{icon&&<span aria-hidden="true">{icon}</span>}<b>{label}</b></button>)}</nav>
}
function AreaHeader({eyebrow,title,copy}){
 return <div className="card areaHeader"><div><span className="sectionEyebrow">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div></div>
}
function HomeArea({section='resumen',onNavigate}){
 const active=['resumen','decisiones'].includes(section)?section:'resumen';
 return <div className="erpArea"><AreaHeader eyebrow="INICIO" title="Resumen ejecutivo" copy="Lo importante del negocio en una sola entrada. Pulsa cualquier dato para llegar a su origen."/><AreaTabs active={active} onChange={x=>onNavigate('inicio',x)} items={[[ 'resumen','Resumen','⌂'],['decisiones','Pendientes y decisiones','✓']]}/>{active==='resumen'?<Dashboard onNavigate={onNavigate}/>:<DecisionCenter onNavigate={onNavigate}/>}</div>
}
function OperationArea({section='directo',onNavigate}){
 const allowed=['directo','tpv','control','tickets','conciliacion','caja','cierres','pulso'];const active=allowed.includes(section)?section:'directo';
 const tpvTab={tpv:'resumen',control:'control',tickets:'tickets',conciliacion:'conciliacion',caja:'caja',cierres:'cierres',pulso:'pulso'}[active]||'resumen';
 return <div className="erpArea"><AreaHeader eyebrow="OPERACIÓN" title="Operación y cobros" copy="Servicio en directo, tickets, conciliación, caja y cierres sin salir del área operativa."/><AreaTabs active={active} onChange={x=>onNavigate('operacion',x)} items={[[ 'directo','En directo','◉'],['tpv','Resumen TPV','▣'],['control','Control','✓'],['tickets','Tickets','▤'],['conciliacion','Conciliación','⇄'],['caja','Caja','€'],['cierres','Cierres','◫'],['pulso','Pulso IA','✦']]}/>{active==='directo'?<CommandCenter initialView="plano"/>:<TPV key={tpvTab} initialTab={tpvTab} hideTabs/>}</div>
}
function FinanceArea({section='resumen',onNavigate}){
 const allowed=['resumen','compras','costes','facturas','escandallos','margenes','proveedores'];const active=allowed.includes(section)?section:'resumen';
 return <div className="erpArea"><AreaHeader eyebrow="FINANZAS" title="Resultado, costes y rentabilidad" copy="Una única área financiera: el resumen explica la cifra y las demás pestañas permiten corregir su origen."/><AreaTabs active={active} onChange={x=>onNavigate('finanzas',x)} items={[[ 'resumen','Resultado real','◎'],['compras','Compras','◫'],['costes','Productos y costes','€'],['facturas','Facturas','▤'],['escandallos','Escandallos','◫'],['margenes','Márgenes','%'],['proveedores','Proveedores','♢']]}/>{active==='resumen'?<UnifiedProfitability/>:<Profitability key={active} initialTab={active==='compras'?'resumen':active} hideTabs/>}</div>
}
function PeopleArea({section='ahora',onNavigate}){
 const allowed=['ahora','plantilla','puntualidad','historial','cuadrante','comparador'];const active=allowed.includes(section)?section:'ahora';
 const staffTab={ahora:'presencia',plantilla:'plantilla',puntualidad:'puntualidad',historial:'historial'}[active];
 return <div className="erpArea"><AreaHeader eyebrow="PERSONAL" title="Equipo, fichajes y planificación" copy="La misma ficha de empleado alimenta presencia, puntualidad, cuadrantes, comparación y costes."/><AreaTabs active={active} onChange={x=>onNavigate('personal',x)} items={[[ 'ahora','Ahora','◷'],['plantilla','Plantilla','♟'],['puntualidad','Puntualidad','⌁'],['historial','Historial','≡'],['cuadrante','Cuadrante','▦'],['comparador','Comparador','⇄']]}/>{staffTab?<StaffControl key={staffTab} initialTab={staffTab} hideTabs/>:active==='cuadrante'?<Schedule/>:<Compare/>}</div>
}
function AnalysisArea({section='resumen',onNavigate}){
 const allowed=['resumen','comparativas','turnos','personal','productos','gastos','oportunidades','asistente'];const active=allowed.includes(section)?section:'resumen';
 const tabs=[['resumen','Resumen','✦'],['comparativas','Comparativas','⇄'],['turnos','Turnos','◷'],['personal','Personal','♟'],['productos','Productos','▥'],['gastos','Gastos','€'],['oportunidades','Oportunidades','!'],['asistente','Asistente IA','✧']];
 return <div className="erpArea analysisArea51"><AreaHeader eyebrow="ANÁLISIS" title="Interpretación del negocio" copy="Finanzas calcula. Análisis encuentra causas. IA propone decisiones. El coste de personal siempre procede del cuadrante."/><AreaTabs active={active} onChange={x=>onNavigate('analisis',x)} items={tabs}/>{active==='asistente'?<BusinessAssistant/>:<BusinessIntelligence view={active} onNavigate={onNavigate}/>}</div>
}

function Manager(){
 const legacyMap={dashboard:['inicio','resumen'],decisiones:['inicio','decisiones'],servicio:['operacion','directo'],tpv:['operacion','tpv'],resultado:['finanzas','resumen'],rentabilidad:['finanzas','costes'],empleados:['personal','plantilla'],fichajes:['personal','ahora'],cuadrantes:['personal','cuadrante'],comparador:['personal','comparador'],inteligencia:['analisis','resumen'],asistente:['analisis','asistente'],gestoria:['gestoria',null],almacen:['almacen',null],config:['config',null]};
 function normalizeRoute(raw){const r=raw||{tab:'inicio',section:'resumen',payload:null};if(legacyMap[r.tab]){const [tab,def]=legacyMap[r.tab];return {tab,section:r.section||def,payload:r.payload||null}}return {tab:r.tab||'inicio',section:r.section||null,payload:r.payload||null}}
 const initial=normalizeRoute(history.state?.colibriRoute||{tab:'inicio',section:'resumen',payload:null});
 const[route,setRoute]=useState(initial);const[menuOpen,setMenuOpen]=useState(false);
 const mainItems=[['inicio','⌂','Inicio'],['operacion','◉','Operación'],['finanzas','€','Finanzas'],['personal','♟','Personal'],['gestoria','▤','Gestoría'],['analisis','✦','Análisis'],['almacen','▥','Almacén'],['config','⚙','Configuración']];
 const groupBy={inicio:'Inicio',operacion:'Operación',finanzas:'Finanzas',personal:'Personal',gestoria:'Control',analisis:'Control',almacen:'Control',config:'Sistema'};
 const sectionNames={inicio:{resumen:'Resumen',decisiones:'Pendientes y decisiones'},operacion:{directo:'En directo',tpv:'Resumen TPV',control:'Control',tickets:'Tickets',conciliacion:'Conciliación',caja:'Caja',cierres:'Cierres',pulso:'Pulso IA'},finanzas:{resumen:'Resultado real',compras:'Compras',costes:'Productos y costes',facturas:'Facturas',escandallos:'Escandallos',margenes:'Márgenes',proveedores:'Proveedores'},personal:{ahora:'Ahora',plantilla:'Plantilla',puntualidad:'Puntualidad',historial:'Historial',cuadrante:'Cuadrante',comparador:'Comparador'},analisis:{resumen:'Resumen',comparativas:'Comparativas',turnos:'Turnos',personal:'Personal',productos:'Productos',gastos:'Gastos',oportunidades:'Oportunidades',asistente:'Asistente IA'},almacen:{resumen:'Resumen',costes:'Costes rápidos',ranking:'Ranking por fechas',stock:'Stock',inventario:'Inventario',mermas:'Mermas',pedido:'Pedido recomendado'}};
 useEffect(()=>{const onPop=e=>{setRoute(normalizeRoute(e.state?.colibriRoute));setMenuOpen(false)};addEventListener('popstate',onPop);return()=>removeEventListener('popstate',onPop)},[]);
 useEffect(()=>{document.body.classList.toggle('erpMenuOpen',menuOpen);return()=>document.body.classList.remove('erpMenuOpen')},[menuOpen]);
 function navigate(tab,section=null,payload=null,{replace=false}={}){let next=normalizeRoute({tab,section,payload});setRoute(next);setMenuOpen(false);const fn=replace?'replaceState':'pushState';history[fn]({...(history.state||{}),colibriRoute:next},'',location.href);requestAnimationFrame(()=>scrollTo({top:0,behavior:'smooth'}));}
 const tab=route.tab;const activeMain=mainItems.find(x=>x[0]===tab)||mainItems[0];const sectionLabel=sectionNames[tab]?.[route.section]||activeMain[2];
 const renderNav=(mobile=false)=><nav className={mobile?'appDrawerNav compactMainNav':'sideNav compactMainNav'} aria-label="Áreas de Colibrí ERP">{[['inicio','Inicio'],['operacion','Operación'],['finanzas','Finanzas'],['personal','Personal'],['control','Control y análisis'],['sistema','Sistema']].map(([gid,glabel])=>{const ids=gid==='control'?['gestoria','analisis','almacen']:gid==='sistema'?['config']:[gid];const items=mainItems.filter(x=>ids.includes(x[0]));if(!items.length)return null;return <section className="navGroup" key={gid}><h3>{glabel}</h3>{items.map(([id,icon,label])=><button type="button" className={tab===id?'active':''} onClick={()=>navigate(id)} key={id}><span aria-hidden="true">{icon}</span><b>{label}</b>{mobile&&<i aria-hidden="true">›</i>}</button>)}</section>})}</nav>;
 return <div className="erpShell erp50">
  <aside className="erpSidebar"><Brand/>{renderNav(false)}<div className="sidebarFooter"><div className="userAvatar">A</div><div><b>Alfonso</b><small>Gerencia</small></div></div></aside>
  <main className="erpMain">
   <header className="mobileAppBar"><button type="button" className="hamburgerButton" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><span></span><span></span><span></span></button><div className="mobileAppIdentity"><small>{groupBy[tab]||activeMain[2]}</small><b>{activeMain[2]}{sectionLabel!==activeMain[2]?` · ${sectionLabel}`:''}</b></div><div className="mobileAppMark" aria-hidden="true">◉</div></header>
   {menuOpen&&<div className="appDrawerLayer" role="presentation" onClick={()=>setMenuOpen(false)}><aside className="appDrawer" role="dialog" aria-modal="true" aria-label="Navegación principal" onClick={e=>e.stopPropagation()}><div className="appDrawerHeader"><Brand/><button type="button" className="drawerClose" aria-label="Cerrar menú" onClick={()=>setMenuOpen(false)}>×</button></div>{renderNav(true)}<div className="appDrawerUser"><div className="userAvatar">A</div><div><b>Alfonso</b><small>Gerencia · Colibrí ERP 5.0</small></div></div></aside></div>}
   <section className="page"><ModuleErrorBoundary key={`${tab}-${route.section||''}-${JSON.stringify(route.payload||{})}`} name={tab}>{tab==='inicio'&&<HomeArea section={route.section||'resumen'} onNavigate={navigate}/>} {tab==='operacion'&&<OperationArea section={route.section||'directo'} onNavigate={navigate}/>} {tab==='finanzas'&&<FinanceArea section={route.section||'resumen'} onNavigate={navigate}/>} {tab==='personal'&&<PeopleArea section={route.section||'ahora'} onNavigate={navigate}/>} {tab==='gestoria'&&<Gestoria/>}{tab==='analisis'&&<AnalysisArea section={route.section||'resumen'} onNavigate={navigate}/>} {tab==='almacen'&&<Inventory key={route.section||'resumen'} initialTab={route.section||'resumen'}/>}{tab==='config'&&<Settings/>}</ModuleErrorBoundary></section>
  </main>
 </div>
}

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
   const monthNumierExpenses=Number(monthSales.numierExpenses?.total||0);const monthProfit=monthSummary.total-monthFin.cost-monthReal.laborAccrued-monthReal.fixed-monthReal.variable-monthNumierExpenses;
   const summary=summarizeTickets(rangeData.tickets||[]);
   const smart=await loadSmartGoal(date,summary.total);
   const avgTotals=avgData.map(x=>Number(x?.daily?.total||0)).filter(v=>v>0);
   setState({tickets:rangeData.tickets||[],lines:rangeData.lines||[],costMap,clock:clocks,real:{...real,numierExpenses:Number(rangeData.numierExpenses?.total||0)},month:{summary:monthSummary,fin:monthFin,real:{...monthReal,numierExpenses:monthNumierExpenses},profit:monthProfit},closure,prev:prevData.daily||null,avgSameDay:avgTotals.length?avgTotals.reduce((a,b)=>a+b,0)/avgTotals.length:0,goal:smart,service:serviceData||{open:[],audit:[]},loading:false,error:null});
  }catch(e){setState(s=>({...s,loading:false,error:e.message||String(e)}))}
 }
 const summary=summarizeTickets(state.tickets),productFin=periodFinancials(state.lines,state.costMap),real=state.real||{fixed:0,variable:0,laborAccrued:0,hours:0};
 const gross=summary.total-productFin.cost,realProfit=gross-real.laborAccrued-real.fixed-real.variable-Number(real.numierExpenses||0),realMargin=summary.total?realProfit/summary.total*100:0;
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
    <div className="dash5ResultRows"><p><span>Ventas</span><b>{money(summary.total)}</b></p><p><span>Coste de productos</span><b>- {money(productFin.cost)}</b></p><p><span>Margen bruto</span><b>{money(gross)}</b></p><p><span>Personal según cuadrante ({Number(real.hours||0).toFixed(1)} h)</span><b>- {money(real.laborAccrued)}</b></p><p><span>Gastos fijos imputados</span><b>- {money(real.fixed)}</b></p><p><span>Gastos variables ERP</span><b>- {money(real.variable)}</b></p><p><span>Gastos Numier (G)</span><b>- {money(real.numierExpenses||0)}</b></p><p className="total"><span>Beneficio real estimado</span><b className={realProfit>=0?'ok':'bad'}>{money(realProfit)}</b></p></div>
   </article>
   <article className="card dash5Alerts"><div className="dash5Title"><div><span>ATENCIÓN HOY</span><h2>{alerts.length===1&&alerts[0].tone==='ok'?'Todo controlado':`${alerts.length} asuntos a revisar`}</h2></div></div>{alerts.slice(0,5).map((a,i)=><button className={'dash5Alert '+a.tone} key={i} onClick={()=>go(a.tab)}><span>{a.icon}</span><div><b>{a.title}</b><p>{a.text}</p></div><i>›</i></button>)}</article>
  </section>
  <section className="dash5Grid three">
   <article className="card dash5Service" onClick={()=>go('servicio','plano')}><div className="dash5Title"><div><span>SERVICIO AHORA</span><h2>Estado operativo</h2></div></div><div className="dash5MiniGrid"><div><span>Mesas abiertas</span><b>{terrace.length+salon.length}</b></div><div><span>Barra</span><b>{barra.length}</b></div><div><span>Pendiente</span><b>{money(totalPending)}</b></div><div><span>Más antigua</span><b>{durationShort(oldest)}</b></div></div><p>Terraza {terrace.length}/15 · Salón {salon.length}/8 · Barra {barra.length} cuentas</p></article>
   <article className="card dash5Summary" onClick={()=>go('tpv')}><div className="dash5Title"><div><span>RESUMEN DEL DÍA</span><h2>Ventas y clientes</h2></div></div><div className="dash5MiniGrid"><div><span>Tickets</span><b>{summary.tickets}</b></div><div><span>Ticket medio</span><b>{money(summary.ticket_medio)}</b></div><div><span>Producto líder</span><b>{topProduct?.name||'—'}</b></div><div><span>Cierre</span><b>{state.closure?'Realizado':'Pendiente'}</b></div></div></article>
   <article className="card dash5Month" onClick={()=>go('inteligencia')}><div className="dash5Title"><div><span>PREVISIÓN DEL MES</span><h2>Beneficio proyectado</h2></div></div><b className={monthProjection>=0?'ok':'bad'}>{money(monthProjection)}</b><p>Resultado acumulado: <strong>{money(state.month?.profit||0)}</strong></p><p>Ventas acumuladas: <strong>{money(state.month?.summary?.total||0)}</strong></p><small>Proyección basada en el ritmo real del mes, incluidos productos, personal y gastos.</small></article>
  </section>
  <nav className="dashboardQuickActions"><button onClick={()=>go('servicio','plano')}><span>▦</span>Servicio</button><button onClick={()=>go('tpv')}><span>€</span>TPV</button><button onClick={()=>go('inteligencia')}><span>✦</span>Inteligencia</button><button onClick={()=>go('resultado')}><span>◎</span>Resultado real</button><button onClick={()=>go('cuadrantes')}><span>▦</span>Cuadrantes</button></nav>
 </div>
}

function minutesBetween(a,b){return Math.max(0,Math.round((new Date(b)-new Date(a))/60000))}
function formatHours(mins){const m=Math.max(0,Math.round(Number(mins||0)));return `${Math.floor(m/60)} h ${String(m%60).padStart(2,'0')} min`}
function clockMinutesText(minutes){const m=Math.max(0,Math.round(Number(minutes||0)));return `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m`}
function mondayISO(date=new Date()){const d=new Date(date);d.setHours(12,0,0,0);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return d.toISOString().slice(0,10)}
function employeeMatches(employee,value){return String(employee?.id||'')===String(value||'')||slugName(employee?.name)===slugName(value)}
function groupClockRowsByEmployee(employees,rows){
 const map=new Map((employees||[]).map(e=>[String(e.id),[]]));
 (rows||[]).forEach(r=>{
  const employee=(employees||[]).find(e=>employeeMatches(e,r.employee_id)||slugName(e.name)===slugName(r.employee_name));
  if(!employee)return;
  const key=String(employee.id);if(!map.has(key))map.set(key,[]);map.get(key).push(r);
 });
 map.forEach(list=>list.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)));
 return map;
}
function buildEmployeeSessions(employee,rows){
 return buildClockSessions(rows,employee,new Date()).sessions;
}
function scheduleMinutesForEmployee(schedule,employee){
 let mins=0;const detail=[];const data=schedule?.data||{};
 DAYS.forEach(day=>SLOTS.forEach(slot=>{const assigned=Array.isArray(data?.[day]?.[slot])?data[day][slot]:[];if(assigned.some(id=>employeeMatches(employee,id))){const slotMinutes=Math.round(h(slot)*60);mins+=slotMinutes;detail.push({day,slot,minutes:slotMinutes})}}));
 return {minutes:mins,detail};
}
function expectedStartForRecord(record,schedule,employee){
 if(String(record?.type||'').toLowerCase()!=='entrada'||!schedule)return null;
 const dt=new Date(record.created_at);const jsDay=(dt.getDay()+6)%7;const day=DAYS[jsDay];
 const slots=SLOTS.filter(slot=>(schedule?.data?.[day]?.[slot]||[]).some(id=>employeeMatches(employee,id)));
 if(!slots.length)return null;
 const [hh,mm]=slots[0].split('-')[0].split(':').map(Number);const expected=new Date(dt);expected.setHours(hh,mm,0,0);return expected;
}
function punctualityInfo(record,schedule,employee){
 const expected=expectedStartForRecord(record,schedule,employee);if(!expected)return {label:'Sin turno previsto',cls:'none',icon:'⚪',minutes:null};
 const diff=Math.round((new Date(record.created_at)-expected)/60000);
 if(diff<=5)return {label:diff<0?`${Math.abs(diff)} min antes`:'Puntual',cls:'ontime',icon:'🟢',minutes:diff};
 if(diff<=10)return {label:`+${diff} min`,cls:'late5',icon:'🟡',minutes:diff};
 return {label:`+${diff} min`,cls:'late10',icon:'🔴',minutes:diff};
}
async function migrateEmployeeScheduleReferences(employee,oldName){
 if(!supabase)return;
 try{
  const {data,error}=await supabase.from('work_schedule_weeks').select('restaurant_id,week_id,data,employees,revision').eq('restaurant_id','colibri').limit(150);
  if(error)throw error;
  for(const row of data||[]){let changed=false;const next=JSON.parse(JSON.stringify(row.data||{}));DAYS.forEach(day=>SLOTS.forEach(slot=>{const arr=Array.isArray(next?.[day]?.[slot])?next[day][slot]:[];const replaced=arr.map(id=>{if(String(id)===String(employee.id)||slugName(id)===slugName(oldName)||slugName(id)===slugName(employee.name)){changed=true;return employee.id}return id});if(next?.[day])next[day][slot]=[...new Set(replaced)]}));
   const emps=Array.isArray(row.employees)?row.employees.map(e=>employeeMatches(employee,e.id)||slugName(e.name)===slugName(oldName)?{...e,id:employee.id,name:String(employee.name).toUpperCase(),color:employee.color,category:employee.role||e.category||'Sala'}:e):row.employees;
   if(changed){await supabase.from('work_schedule_weeks').update({data:next,employees:emps,revision:Number(row.revision||0)+1,updated_at:new Date().toISOString()}).eq('restaurant_id',row.restaurant_id).eq('week_id',row.week_id)}
  }
 }catch(err){console.warn('No se pudieron migrar referencias antiguas del cuadrante',err)}
}
function StaffControl({initialTab='plantilla',hideTabs=false}){
 const[tab,setTab]=useState(initialTab),[employees,setEmployees]=useState([]),[rows,setRows]=useState([]),[schedule,setSchedule]=useState(null),[loading,setLoading]=useState(false),[selected,setSelected]=useState(null),[draft,setDraft]=useState(null),[range,setRange]=useState('30'),[filter,setFilter]=useState('todos'),[createOpen,setCreateOpen]=useState(false),[newEmployee,setNewEmployee]=useState({name:'',pin:'',role:'Sala',hourly_rate:7,color:EMP_COLORS[0],can_clock:true,active:true});
 useEffect(()=>{load()},[]);
 async function load(){if(!supabase)return;setLoading(true);const from=addDays(today(),-370)+'T00:00:00';const [{data:emps,error:e1},{data:clocks,error:e2},{data:weekRow,error:e3}]=await Promise.all([supabase.from('employees').select('*').order('active',{ascending:false}).order('name'),supabase.from('clock_records').select('*').gte('created_at',from).order('created_at',{ascending:true}).limit(10000),supabase.from('work_schedule_weeks').select('*').eq('restaurant_id','colibri').eq('week_id',week()).maybeSingle()]);setLoading(false);if(e1)return alert(e1.message);if(e2)console.warn(e2);if(e3)console.warn(e3);setEmployees(emps||[]);setRows(clocks||[]);setSchedule(weekRow||null)}
 const stats=useMemo(()=>{const now=new Date(),weekStart=new Date(mondayISO()+'T00:00:00'),monthStart=new Date(now.getFullYear(),now.getMonth(),1),cut=new Date(Date.now()-Number(range)*86400000);return employees.map(e=>{const sessions=buildEmployeeSessions(e,rows);const planned=scheduleMinutesForEmployee(schedule,e);const sumFrom=d=>sessions.filter(s=>s.start&&new Date(s.start.created_at)>=d).reduce((a,s)=>a+s.minutes,0);const entries=rows.filter(r=>(employeeMatches(e,r.employee_id)||slugName(r.employee_name)===slugName(e.name))&&String(r.type).toLowerCase()==='entrada'&&new Date(r.created_at)>=cut);const punctual=entries.map(r=>punctualityInfo(r,schedule,e));const open=sessions.find(s=>s.open);return {employee:e,sessions,planned,weekMinutes:sumFrom(weekStart),monthMinutes:sumFrom(monthStart),periodMinutes:sumFrom(cut),open,punctual:punctual.filter(x=>x.cls==='ontime').length,late5:punctual.filter(x=>x.cls==='late5').length,late10:punctual.filter(x=>x.cls==='late10').length,without:punctual.filter(x=>x.cls==='none').length,entries:entries.length}})},[employees,rows,schedule,range]);
 const visible=stats.filter(s=>filter==='todos'||String(s.employee.id)===filter);
 const totals=visible.reduce((a,s)=>({working:a.working+(s.open?1:0),week:a.week+s.weekMinutes,month:a.month+s.monthMinutes,planned:a.planned+s.planned.minutes,cost:a.cost+s.planned.minutes/60*Number(hourlyCost(s.employee)),late:a.late+s.late5+s.late10,without:a.without+s.without}),{working:0,week:0,month:0,planned:0,cost:0,late:0,without:0});
 async function createEmployee(){const n=newEmployee.name.trim(),p=String(newEmployee.pin||'').trim();if(!n||!p)return alert('Indica nombre y PIN');const payload={...newEmployee,name:n,pin:p,hourly_rate:hourlyCost(newEmployee),hire_date:newEmployee.hire_date||today()};const {data,error}=await supabase.from('employees').insert(payload).select('*').single();if(error)return alert(error.message);setCreateOpen(false);setNewEmployee({name:'',pin:'',role:'Sala',hourly_rate:7,color:EMP_COLORS[(employees.length+1)%EMP_COLORS.length],can_clock:true,active:true});await load();alert(`${data.name} ya está disponible en Cuadrantes y en el portal de fichaje.`)}
 function editEmployee(e){setSelected(e.id);setDraft({...e,role:e.role||e.category||'Sala',hourly_rate:Number(e.hourly_rate||7),oldName:e.name})}
 async function saveEmployee(){if(!draft?.name?.trim())return alert('El nombre no puede quedar vacío');const patch={name:draft.name.trim(),pin:String(draft.pin||''),role:draft.role||'Sala',color:draft.color||'#31b9d4',can_clock:draft.can_clock!==false,active:draft.active!==false,hourly_rate:hourlyCost(draft)};const {data,error}=await supabase.from('employees').update(patch).eq('id',draft.id).select('*').single();if(error)return alert(error.message);await migrateEmployeeScheduleReferences(data,draft.oldName);setSelected(null);setDraft(null);await load();alert('Ficha guardada y sincronizada con el cuadrante.')}
 async function closeManual(stat){const open=stat.open?.start;if(!open)return;const suggested=new Date().toISOString().slice(0,16);const value=prompt(`Hora de salida real para ${stat.employee.name}`,suggested);if(!value)return;const closedAt=new Date(value);if(Number.isNaN(closedAt.getTime())||closedAt<new Date(open.created_at))return alert('La salida debe ser una fecha válida y posterior a la entrada.');const reason=prompt('Motivo del cierre manual','Olvido de fichaje')||'Cierre manual por gerencia';const rpc=await supabase.rpc('close_employee_open_shift',{p_employee_id:stat.employee.id,p_closed_at:closedAt.toISOString(),p_reason:reason});if(rpc.error&&String(rpc.error.message||'').toLowerCase().includes('could not find')){const fallback=await supabase.from('clock_records').insert({employee_id:stat.employee.id,employee_name:stat.employee.name,type:'salida',method:'manual',inside_radius:true,note:`SALIDA MANUAL POR GERENCIA · ${reason}`,created_at:closedAt.toISOString()});if(fallback.error)return alert(fallback.error.message)}else if(rpc.error||rpc.data?.ok===false)return alert(rpc.error?.message||rpc.data?.message||'No se pudo cerrar el turno');await load()}
 async function addManualClock(employee,type){const status=buildClockSessions(rows,employee,new Date());if(type==='entrada'&&status.openSession)return alert(`${employee.name} ya tiene un turno abierto. Debes cerrarlo antes de registrar otra entrada.`);if(type==='salida'&&!status.openSession)return alert(`${employee.name} no tiene ningún turno abierto.`);const value=prompt(`${type==='entrada'?'Entrada':'Salida'} manual para ${employee.name}`,new Date().toISOString().slice(0,16));if(!value)return;const reason=prompt('Motivo','Corrección manual por gerencia')||'Corrección manual';const {error}=await supabase.from('clock_records').insert({employee_id:employee.id,employee_name:employee.name,type,method:'manual',inside_radius:true,note:`${type.toUpperCase()} MANUAL · ${reason}`,created_at:new Date(value).toISOString()});if(error)return alert(error.message);await load()}
 const chosen=selected?stats.find(s=>String(s.employee.id)===String(selected)):null;
 return <div className="staffCenter"><div className="card staffHero"><div><span className="sectionEyebrow">PERSONAL · CENTRO DE CONTROL</span><h2>Plantilla, fichajes y costes en una sola pantalla</h2><p>La ficha del empleado es la fuente única para cuadrantes, fichajes, puntualidad y rentabilidad.</p></div><div className="staffHeroActions"><button onClick={()=>setCreateOpen(true)}>＋ Nuevo empleado</button><button onClick={load}>{loading?'Actualizando…':'Actualizar'}</button></div></div>
 {!hideTabs&&<nav className="staffTabs"><button className={tab==='plantilla'?'active':''} onClick={()=>setTab('plantilla')}>Plantilla</button><button className={tab==='presencia'?'active':''} onClick={()=>setTab('presencia')}>Presencia y horas</button><button className={tab==='puntualidad'?'active':''} onClick={()=>setTab('puntualidad')}>Puntualidad</button><button className={tab==='historial'?'active':''} onClick={()=>setTab('historial')}>Historial</button></nav>}
 <div className="staffFilters"><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="todos">Toda la plantilla</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><select value={range} onChange={e=>setRange(e.target.value)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="365">Último año</option></select></div>
 <div className="staffKpis"><article><span>Trabajando ahora</span><b>{totals.working}</b></article><article><span>Horas esta semana</span><b>{formatHours(totals.week)}</b></article><article><span>Horas previstas</span><b>{formatHours(totals.planned)}</b></article><article><span>Coste previsto semanal</span><b>{money(totals.cost)}</b></article><article><span>Retrasos del periodo</span><b>{totals.late}</b></article><article><span>Sin turno previsto</span><b>{totals.without}</b></article></div>
 {tab==='plantilla'&&<div className="staffGrid">{visible.map(s=><article className={'staffCard '+(!s.employee.active?'inactive':'')} key={s.employee.id}><header><span className="staffAvatar" style={{background:s.employee.color||'#31b9d4'}}>{String(s.employee.name||'?').slice(0,1).toUpperCase()}</span><div><h3>{s.employee.name}</h3><p>{s.employee.role||s.employee.category||'Sala'} · {s.employee.active?'Activo':'Inactivo'}</p></div><em className={s.open?'working':'off'}>{s.open?'● Trabajando':'○ Fuera de turno'}</em></header><div className="staffCardStats"><div><span>Semana fichada</span><b>{formatHours(s.weekMinutes)}</b></div><div><span>Semana prevista</span><b>{formatHours(s.planned.minutes)}</b></div><div><span>Mes fichado</span><b>{formatHours(s.monthMinutes)}</b></div><div><span>Coste/hora</span><b>{money(hourlyCost(s.employee))}</b></div></div>{s.open&&<div className="staffOpen"><span>Entrada {new Date(s.open.start.created_at).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span><b>{formatHours(s.open.minutes)}</b></div>}<footer><button onClick={()=>editEmployee(s.employee)}>Abrir ficha</button>{s.open?<button className="red" onClick={()=>closeManual(s)}>Cerrar turno</button>:<button className="ghost" onClick={()=>addManualClock(s.employee,'entrada')}>Entrada manual</button>}</footer></article>)}</div>}
 {tab==='presencia'&&<div className="card staffPresence"><h2>Estado actual de la plantilla</h2><div className="staffPresenceList">{visible.map(s=><article key={s.employee.id}><span className="staffAvatar small" style={{background:s.employee.color||'#31b9d4'}}>{String(s.employee.name||'?')[0]}</span><div><b>{s.employee.name}</b><small>{s.open?`Entró ${new Date(s.open.start.created_at).toLocaleString('es-ES')}`:'Sin fichaje abierto'}</small></div><strong>{s.open?formatHours(s.open.minutes):'—'}</strong><span>Previsto: {formatHours(s.planned.minutes)}</span>{s.open?<button className="red" onClick={()=>closeManual(s)}>Cerrar</button>:<button onClick={()=>addManualClock(s.employee,'entrada')}>Entrada manual</button>}</article>)}</div></div>}
 {tab==='puntualidad'&&<div className="staffGrid">{visible.map(s=>{const total=s.entries||0;const pct=total?Math.round(s.punctual/total*100):0;return <article className="staffCard punctuality" key={s.employee.id}><header><span className="staffAvatar" style={{background:s.employee.color||'#31b9d4'}}>{String(s.employee.name||'?')[0]}</span><div><h3>{s.employee.name}</h3><p>{total} entradas analizadas</p></div><b>{pct}%</b></header><div className="punctualityBars"><span>🟢 Puntuales <b>{s.punctual}</b></span><span>🟡 5–10 min <b>{s.late5}</b></span><span>🔴 +10 min <b>{s.late10}</b></span><span>⚪ Sin turno <b>{s.without}</b></span></div></article>})}</div>}
 {tab==='historial'&&<div className="card"><h2>Historial de fichajes</h2><div className="staffHistory">{rows.filter(r=>filter==='todos'||String(r.employee_id)===filter).filter(r=>new Date(r.created_at)>=new Date(Date.now()-Number(range)*86400000)).slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,500).map(r=>{const employee=employees.find(e=>employeeMatches(e,r.employee_id)||slugName(e.name)===slugName(r.employee_name));const p=punctualityInfo(r,schedule,employee||{id:r.employee_id,name:r.employee_name});return <article key={r.id}><div><b>{r.employee_name}</b><span>{new Date(r.created_at).toLocaleString('es-ES')}</span></div><strong>{String(r.type).toLowerCase()==='entrada'?`${p.icon} ${p.label}`:'🔴 Salida'}</strong><span>{r.method||'—'}</span><small>{r.note||''}</small></article>})}</div></div>}
 {createOpen&&<div className="staffModal"><div><button className="modalClose" onClick={()=>setCreateOpen(false)}>×</button><span className="sectionEyebrow">ALTA DE EMPLEADO</span><h2>Nueva ficha</h2><div className="staffForm"><label>Nombre<input value={newEmployee.name} onChange={e=>setNewEmployee({...newEmployee,name:e.target.value})}/></label><label>PIN<input inputMode="numeric" value={newEmployee.pin} onChange={e=>setNewEmployee({...newEmployee,pin:e.target.value})}/></label><label>Puesto<select value={newEmployee.role} onChange={e=>setNewEmployee({...newEmployee,role:e.target.value})}><option>Sala</option><option>Barra</option><option>Cocina</option><option>Gerencia</option></select></label><label>Coste por hora<input type="number" min="0" step="0.01" value={newEmployee.hourly_rate} onChange={e=>setNewEmployee({...newEmployee,hourly_rate:e.target.value})}/></label><label>Color<input type="color" value={newEmployee.color} onChange={e=>setNewEmployee({...newEmployee,color:e.target.value})}/></label><label className="checkLine"><input type="checkbox" checked={newEmployee.can_clock} onChange={e=>setNewEmployee({...newEmployee,can_clock:e.target.checked})}/> Puede fichar</label></div><button onClick={createEmployee}>Crear empleado</button></div></div>}
 {chosen&&draft&&<div className="staffModal"><div><button className="modalClose" onClick={()=>{setSelected(null);setDraft(null)}}>×</button><span className="sectionEyebrow">FICHA INDIVIDUAL</span><h2>{chosen.employee.name}</h2><div className="employeeDetailKpis"><article><span>Semana</span><b>{formatHours(chosen.weekMinutes)}</b></article><article><span>Previstas</span><b>{formatHours(chosen.planned.minutes)}</b></article><article><span>Mes</span><b>{formatHours(chosen.monthMinutes)}</b></article><article><span>Coste previsto</span><b>{money(chosen.planned.minutes/60*Number(hourlyCost(draft)))}</b></article></div><div className="staffForm"><label>Nombre<input value={draft.name||''} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>PIN<input inputMode="numeric" value={draft.pin||''} onChange={e=>setDraft({...draft,pin:e.target.value})}/></label><label>Puesto<select value={draft.role||'Sala'} onChange={e=>setDraft({...draft,role:e.target.value})}><option>Sala</option><option>Barra</option><option>Cocina</option><option>Gerencia</option></select></label><label>Coste por hora<input type="number" min="0" step="0.01" value={hourlyCost(draft)} onChange={e=>setDraft({...draft,hourly_rate:e.target.value})}/></label><label>Color<input type="color" value={draft.color||'#31b9d4'} onChange={e=>setDraft({...draft,color:e.target.value})}/></label><label className="checkLine"><input type="checkbox" checked={draft.can_clock!==false} onChange={e=>setDraft({...draft,can_clock:e.target.checked})}/> Puede fichar</label><label className="checkLine"><input type="checkbox" checked={draft.active!==false} onChange={e=>setDraft({...draft,active:e.target.checked})}/> Empleado activo</label></div><div className="modalActions"><button onClick={saveEmployee}>Guardar y sincronizar</button>{chosen.open?<button className="red" onClick={()=>closeManual(chosen)}>Cerrar turno abierto</button>:<button className="ghost" onClick={()=>addManualClock(chosen.employee,'entrada')}>Registrar entrada manual</button>}<button className="ghost" onClick={()=>addManualClock(chosen.employee,'salida')}>Registrar salida manual</button></div><div className="employeeScheduleDetail"><h3>Cuadrante de esta semana</h3>{chosen.planned.detail.length?chosen.planned.detail.map((x,i)=><span key={i}>{x.day} · {x.slot}</span>):<p>Sin turnos asignados.</p>}</div></div></div>}
 </div>
}
function Employees(){return <StaffControl initialTab="plantilla"/>}
function ClockPanel(){return <StaffControl initialTab="presencia"/>}

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

const PAYMENT_MONTHS={ene:0,feb:1,mar:2,abr:3,may:4,jun:5,jul:6,ago:7,sep:8,oct:9,nov:10,dic:11};
function localISODate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parsePaymentDate(value){
 if(value instanceof Date&&!Number.isNaN(value.getTime()))return value;
 if(typeof value==='number'&&XLSX?.SSF?.parse_date_code){const x=XLSX.SSF.parse_date_code(value);if(x)return new Date(x.y,x.m-1,x.d,x.H||0,x.M||0,x.S||0)}
 const raw=String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
 const spanish=raw.match(/(\d{1,2})\s+([a-záéíóú]{3,})\s+(\d{4})\s*,?\s*(\d{1,2}):(\d{2})/i);
 if(spanish){const month=PAYMENT_MONTHS[spanish[2].slice(0,3).normalize('NFD').replace(/[\u0300-\u036f]/g,'')];if(month!==undefined)return new Date(Number(spanish[3]),month,Number(spanish[1]),Number(spanish[4]),Number(spanish[5]),0,0)}
 const parsed=new Date(value);return Number.isNaN(parsed.getTime())?null:parsed;
}
function paymentField(row,names){for(const key of Object.keys(row||{})){const normalized=String(key).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');if(names.includes(normalized))return row[key]}return null}
function normalizePaymentAccount(value){return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
const COLIBRI_SUMUP_ACCOUNTS=new Set(['bar colibri','bar el colibri','braseria el colibri']);
function parseCardPaymentWorkbook(buffer,fileName=''){const book=XLSX.read(buffer,{type:'array',cellDates:true});const sheet=book.Sheets[book.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(sheet,{defval:null,raw:false});const seen=new Set();const duplicates=[];const payments=[];const excludedPayments=[];
 rows.forEach((row,index)=>{const type=String(paymentField(row,['tipo','type'])||'Venta').trim();if(type&&!/venta|sale|payment|pago/i.test(type))return;const account=String(paymentField(row,['cuenta','account'])||'').trim();if(!COLIBRI_SUMUP_ACCOUNTS.has(normalizePaymentAccount(account))){excludedPayments.push({account:account||'Sin cuenta',sourceRow:index+2});return}const date=parsePaymentDate(paymentField(row,['fecha','date','fecha y hora','fecha hora']));const amount=Number(String(paymentField(row,['precio (neto)','precio neto','importe neto','importe','precio (bruto)','precio bruto','amount'])??'').replace(',','.'));const id=String(paymentField(row,['id de transaccion','id transaccion','transaction id','referencia','id'])||`${fileName}-${index}`).trim();if(!date||!Number.isFinite(amount)||amount<=0)return;const item={id,date,dateISO:localISODate(date),amount:Math.round(amount*100)/100,method:String(paymentField(row,['forma de pago','metodo de pago','payment method'])||'Tarjeta'),account,sourceRow:index+2};if(seen.has(id))duplicates.push(item);else{seen.add(id);payments.push(item)}});
 payments.sort((a,b)=>a.date-b.date);const excludedAccounts=excludedPayments.reduce((map,x)=>{map[x.account]=(map[x.account]||0)+1;return map},{});return {payments,duplicates,excludedPayments,excludedAccounts,acceptedAccount:'Bar Colibri',sheetName:book.SheetNames[0],fileName};}
function cardExpectedForTicket(t){const explicit=Number(t.tarjeta||0);const form=String(t.forma_pago||'').trim().toUpperCase();if(explicit>0)return explicit;if(form==='T')return Number(t.total||0);return 0}
function ticketDateValue(t){const d=new Date(t.hora||t.created_at||t.fecha||0);return Number.isNaN(d.getTime())?null:d}
function paymentCombinations(rows,target,ticketDate,maxItems=4,maxMinutes=45){
 const candidates=(rows||[]).filter(p=>p.dateISO===localISODate(ticketDate)&&Math.abs(p.date-ticketDate)/60000<=maxMinutes).sort((a,b)=>Math.abs(a.date-ticketDate)-Math.abs(b.date-ticketDate)).slice(0,12);
 let best=null;
 function walk(index,chosen,total){
  if(chosen.length>=2&&Math.abs(total-target)<=.02){const spread=Math.max(...chosen.map(x=>x.date))-Math.min(...chosen.map(x=>x.date));const avgDiff=chosen.reduce((a,x)=>a+Math.abs(x.date-ticketDate)/60000,0)/chosen.length;const score=chosen.length*4+avgDiff+spread/600000;if(!best||score<best.score)best={payments:[...chosen],total:Math.round(total*100)/100,score,avgDiff};return}
  if(chosen.length>=maxItems||index>=candidates.length||total>target+.02)return;
  for(let i=index;i<candidates.length;i++)walk(i+1,[...chosen,candidates[i]],total+candidates[i].amount);
 }
 walk(0,[],0);return best;
}
function reconcileCardPayments(payments,tickets){
 const validTickets=(tickets||[]).filter(isRealSaleTicket).map(t=>({...t,_date:ticketDateValue(t),_card:cardExpectedForTicket(t),_total:Number(t.total||0)})).filter(t=>t._date);
 const usedTickets=new Set(),usedPayments=new Set(),matches=[];
 for(const payment of payments){let best=null;for(const ticket of validTickets){if(usedTickets.has(String(ticket.cab_id)))continue;if(localISODate(ticket._date)!==payment.dateISO)continue;const diffMin=Math.abs(payment.date-ticket._date)/60000;const cardDiff=Math.abs(payment.amount-ticket._card);const totalDiff=Math.abs(payment.amount-ticket._total);let kind=null,score=-1;
   if(ticket._card>0&&cardDiff<=.02){kind=diffMin<=15?'correct':'probable';score=150-Math.min(diffMin,120)}
   else if(ticket._card===0&&totalDiff<=.02){kind='wrong_method';score=130-Math.min(diffMin,120)}
   else if(diffMin<=10&&ticket._card>0&&cardDiff<=Math.max(2,payment.amount*.12)){kind='amount_mismatch';score=85-cardDiff*8-diffMin}
   else if(diffMin<=5&&totalDiff<=Math.max(2,payment.amount*.12)){kind=ticket._card===0?'wrong_method':'amount_mismatch';score=75-totalDiff*8-diffMin}
   if(score>(best?.score??-1))best={ticket,kind,score,diffMin,expected:ticket._card,amountDiff:payment.amount-(ticket._card||ticket._total)};
  }
  if(best&&best.score>20){usedTickets.add(String(best.ticket.cab_id));usedPayments.add(payment.id);matches.push({payment,payments:[payment],...best,status:best.kind})}
 }
 // Segunda pasada: varias operaciones SumUp pueden corresponder a una sola cuenta/ticket.
 const splitMatches=[];
 for(const ticket of validTickets){if(usedTickets.has(String(ticket.cab_id)))continue;const target=ticket._card>0?ticket._card:ticket._total;if(target<=0)continue;const freePayments=payments.filter(p=>!usedPayments.has(p.id));const combo=paymentCombinations(freePayments,target,ticket._date,4,45);if(!combo)continue;combo.payments.forEach(p=>usedPayments.add(p.id));usedTickets.add(String(ticket.cab_id));const status=ticket._card>0?'split_payment':'split_wrong_method';splitMatches.push({payment:combo.payments[0],payments:combo.payments,ticket,status,diffMin:combo.avgDiff,expected:ticket._card,combinedAmount:combo.total,amountDiff:combo.total-target});
 }
 const unmatchedPayments=payments.filter(p=>!usedPayments.has(p.id)).map(payment=>({payment,payments:[payment],status:'payment_without_ticket'}));
 matches.push(...splitMatches,...unmatchedPayments);
 const ticketWithoutPayment=validTickets.filter(t=>t._card>0&&!usedTickets.has(String(t.cab_id))).map(ticket=>({ticket,status:'ticket_without_payment',expected:ticket._card,payments:[]}));
 const counts={correct:0,probable:0,wrong_method:0,amount_mismatch:0,split_payment:0,split_wrong_method:0,payment_without_ticket:0,ticket_without_payment:0};[...matches,...ticketWithoutPayment].forEach(x=>{counts[x.status]=(counts[x.status]||0)+1});
 const realTotal=payments.reduce((a,p)=>a+p.amount,0),tpvCard=validTickets.reduce((a,t)=>a+t._card,0);return {matches,ticketWithoutPayment,counts,realTotal,tpvCard,difference:realTotal-tpvCard,tickets:validTickets,splitMatches};
}
function paymentStatusMeta(status){return {correct:['Coincide: tarjeta correcta','ok'],probable:['Coincidencia probable','info'],wrong_method:['Numier marcó otra forma de pago','bad'],amount_mismatch:['Importe no coincide','warn'],split_payment:['Varias tarjetas para un ticket','ok'],split_wrong_method:['Varias tarjetas corrigen el pago','warn'],payment_without_ticket:['Cobro SumUp sin ticket','bad'],ticket_without_payment:['Numier marca tarjeta sin cobro SumUp','bad']}[status]||[status,'info']}
function PaymentReconciliation({initialDate}){
 const[fileInfo,setFileInfo]=useState(null),[result,setResult]=useState(null),[rawImport,setRawImport]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('incidencias'),[selectedTicket,setSelectedTicket]=useState(null);
 const[startDate,setStartDate]=useState(initialDate||today()),[startTime,setStartTime]=useState('00:00'),[endEnabled,setEndEnabled]=useState(false),[endDate,setEndDate]=useState(initialDate||today()),[endTime,setEndTime]=useState('23:59');
 useEffect(()=>{if(initialDate){setStartDate(initialDate);if(!endEnabled)setEndDate(initialDate)}},[initialDate]);
 function localDateTime(date,time,end=false){if(!date)return null;const [h,m]=String(time||(end?'23:59':'00:00')).split(':').map(Number);const d=new Date(`${date}T00:00:00`);if(Number.isNaN(d.getTime()))return null;d.setHours(Number.isFinite(h)?h:0,Number.isFinite(m)?m:0,end?59:0,end?999:0);return d}
 async function reconcileParsed(parsed){
  const startAt=localDateTime(startDate,startTime,false),endAt=endEnabled?localDateTime(endDate,endTime,true):null;
  if(!startAt)throw new Error('Indica una fecha y hora de inicio válidas.');
  if(endAt&&endAt<startAt)throw new Error('La fecha/hora final no puede ser anterior al inicio.');
  const payments=parsed.payments.filter(p=>p.date>=startAt&&(!endAt||p.date<=endAt));
  if(!payments.length)throw new Error('No hay cobros de Bar Colibri dentro del periodo seleccionado. Revisa la fecha y la hora de inicio.');
  const dateKeys=payments.map(x=>x.dateISO).sort(),from=dateKeys[0],lastDate=dateKeys[dateKeys.length-1],queryTo=addDays(lastDate,1);
  const sales=await loadSalesRangeGestoria(from,queryTo);
  const tickets=(sales.tickets||[]).filter(isRealSaleTicket).filter(t=>{const d=ticketDateValue(t);return d&&d>=startAt&&(!endAt||d<=endAt)});
  const reconciliation=reconcileCardPayments(payments,tickets);
  const payload={...parsed,payments,...reconciliation,from,to:lastDate,startAt:startAt.toISOString(),endAt:endAt?.toISOString()||null,startLabel:`${startDate} ${startTime}`,endLabel:endEnabled?`${endDate} ${endTime}`:null,excludedByWindow:parsed.payments.length-payments.length,importedAt:new Date().toISOString()};
  setFileInfo(payload);setResult(payload);
  try{localStorage.setItem('colibri47_last_reconciliation',JSON.stringify({fileName:parsed.fileName,from,startLabel:payload.startLabel,endLabel:payload.endLabel,payments:payments.length,realTotal:reconciliation.realTotal,tpvCard:reconciliation.tpvCard,difference:reconciliation.difference,counts:reconciliation.counts,importedAt:payload.importedAt}))}catch{}
 }
 async function importFile(file){if(!file)return;setLoading(true);setError('');try{const parsed=parseCardPaymentWorkbook(await file.arrayBuffer(),file.name);if(!parsed.payments.length)throw new Error('No se han encontrado cobros válidos en el archivo.');setRawImport(parsed);await reconcileParsed(parsed)}catch(e){setError(e.message||String(e));setFileInfo(null);setResult(null)}finally{setLoading(false)}}
 async function applyWindow(){if(!rawImport)return setError('Primero sube el listado de SumUp.');setLoading(true);setError('');try{await reconcileParsed(rawImport)}catch(e){setError(e.message||String(e));setResult(null)}finally{setLoading(false)}}
 function exportReport(){if(!result)return;const rows=[['Estado','Fecha cobro','Hora cobro','ID/transacciones','Cobro SumUp','Ticket Numier','Hora ticket','Marcado en Numier','Tarjeta esperada','Total ticket','Diferencia minutos','Explicación']];result.matches.forEach(x=>{const [label]=paymentStatusMeta(x.status);rows.push([label,x.payment.dateISO,x.payment.date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),(x.payments||[x.payment]).map(p=>p.id).join(' + '),(x.payments||[x.payment]).reduce((a,p)=>a+Number(p.amount||0),0),x.ticket?.numdoc||x.ticket?.cab_id||'',x.ticket?x.ticket._date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'',x.ticket?formaPagoText(x.ticket):'',x.ticket?x.ticket._card:'',x.ticket?x.ticket._total:'',x.diffMin!=null?Math.round(x.diffMin):'',x.status==='wrong_method'?'SumUp confirma tarjeta, pero Numier registró efectivo u otra forma':x.status==='split_payment'?'La suma de varios cobros SumUp coincide con la tarjeta esperada del ticket':x.status==='split_wrong_method'?'La suma de varios cobros SumUp coincide con el total, pero Numier no lo marcó como tarjeta':'' ])});result.ticketWithoutPayment.forEach(x=>{const [label]=paymentStatusMeta(x.status);rows.push([label,localISODate(x.ticket._date),'','',0,x.ticket.numdoc||x.ticket.cab_id,x.ticket._date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),formaPagoText(x.ticket),x.expected,x.ticket._total,'','No aparece un cobro real que corresponda a la parte de tarjeta'])});
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:24},{wch:12},{wch:12},{wch:20},{wch:14},{wch:14},{wch:12},{wch:24},{wch:16},{wch:14},{wch:16},{wch:50}];XLSX.utils.book_append_sheet(wb,ws,'Conciliación');const summary=XLSX.utils.aoa_to_sheet([['COLIBRÍ · CONCILIACIÓN DE COBROS'],['Archivo',result.fileName],['Desde',result.startLabel],['Hasta',result.endLabel||'Fin del listado'],['Cobros reales',result.payments.length,result.realTotal],['Tarjeta según TPV','',result.tpvCard],['Diferencia','',result.difference],[],['Estado','Operaciones'],...Object.entries(result.counts).map(([k,v])=>[paymentStatusMeta(k)[0],v])]);XLSX.utils.book_append_sheet(wb,summary,'Resumen');XLSX.writeFile(wb,`COLIBRI_CONCILIACION_${result.from}_${result.to}.xlsx`);
 }
 const allRows=result?[...result.matches,...result.ticketWithoutPayment]:[];const visible=filter==='todos'?allRows:filter==='correctos'?allRows.filter(x=>x.status==='correct'):allRows.filter(x=>x.status!=='correct');
 return <div className="paymentReconciliation"><section className="card paymentImport"><div><span className="sectionEyebrow">COLIBRÍ ERP 5.1.4 · CONCILIACIÓN DE COBROS</span><h2>Compara Numier con los cobros reales de tarjeta</h2><p>Selecciona desde qué fecha y hora debe comenzar el cuadre. El mismo corte se aplica a SumUp y a los tickets Numier para que el resultado corresponda exactamente a tu cierre real.</p></div><label className="paymentFileButton">{loading?'Procesando…':'Subir listado de tarjeta'}<input type="file" accept=".xlsx,.xls,.csv" disabled={loading} onChange={e=>importFile(e.target.files?.[0])}/></label></section>
 <section className="card paymentTimeWindow"><div><span className="sectionEyebrow">PERIODO DE CONCILIACIÓN</span><h2>Cuadrar desde una fecha y hora concreta</h2><p>Ejemplo: si el último cierre fue el 21/08 a las 18:35, indica ese momento y solo se tendrán en cuenta cobros y tickets posteriores.</p></div><div className="paymentTimeFields"><label>Desde · fecha<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>Desde · hora<input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label className="paymentEndToggle"><input type="checkbox" checked={endEnabled} onChange={e=>setEndEnabled(e.target.checked)}/> Limitar también hasta una hora</label>{endEnabled&&<><label>Hasta · fecha<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label><label>Hasta · hora<input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label></>}<button disabled={loading||!rawImport} onClick={applyWindow}>{loading?'Calculando…':'Aplicar periodo al listado'}</button></div></section>{error&&<div className="alertBad">{error}</div>}
 {result&&<><div className="alertOk paymentAccountFilter"><b>Cuenta analizada: Bar Colibri.</b> Periodo: <b>{result.startLabel}</b>{result.endLabel?<> hasta <b>{result.endLabel}</b></>:' en adelante'}. Se han usado {result.payments.length} cobros.{result.excludedByWindow>0&&<> Se han excluido {result.excludedByWindow} cobros de Bar Colibri por quedar fuera del periodo.</>}{result.excludedPayments?.length>0&&<> Además, se han excluido {result.excludedPayments.length} operaciones de otras cuentas: {Object.entries(result.excludedAccounts||{}).map(([name,count])=>`${name} (${count})`).join(', ')}.</>}</div><section className="paymentReconcileKpis"><article className="card"><span>Cobros reales</span><b>{money(result.realTotal)}</b><small>{result.payments.length} operaciones</small></article><article className="card"><span>Tarjeta en TPV</span><b>{money(result.tpvCard)}</b><small>{result.tickets.filter(t=>t._card>0).length} tickets</small></article><article className={`card ${Math.abs(result.difference)>.02?'dangerKpi':''}`}><span>Diferencia</span><b>{money(result.difference)}</b><small>Real menos TPV</small></article><article className="card"><span>Incidencias</span><b>{allRows.filter(x=>x.status!=='correct').length}</b><small>{result.counts.wrong_method||0} formas erróneas</small></article></section>
 <section className="card paymentResult"><div className="row between paymentResultHead"><div><h2>Resultado de la conciliación</h2><p>{result.fileName} · desde {result.startLabel}{result.endLabel?` hasta ${result.endLabel}`:' en adelante'}</p></div><div className="row"><button className={filter==='incidencias'?'active':''} onClick={()=>setFilter('incidencias')}>Incidencias</button><button className={filter==='correctos'?'active':''} onClick={()=>setFilter('correctos')}>Correctos</button><button className={filter==='todos'?'active':''} onClick={()=>setFilter('todos')}>Todos</button><button onClick={exportReport}>Exportar Excel</button></div></div>
 <div className="paymentRows">{visible.map((x,i)=>{const [label,tone]=paymentStatusMeta(x.status),ticket=x.ticket,pays=x.payments||[x.payment].filter(Boolean),sumupTotal=pays.reduce((a,p)=>a+Number(p.amount||0),0),numierMarked=ticket?formaPagoText(ticket):'Sin ticket Numier',expected=ticket?Number(ticket._card||0):0;const explanation=x.status==='correct'?'Numier marcó tarjeta y existe un cobro SumUp del mismo importe.':x.status==='wrong_method'?`SumUp cobró ${money(sumupTotal)}, pero Numier marcó ${numierMarked}.`:x.status==='split_payment'?`${pays.length} cobros SumUp suman ${money(sumupTotal)} y completan la tarjeta esperada del ticket.`:x.status==='split_wrong_method'?`${pays.length} cobros SumUp suman ${money(sumupTotal)} y coinciden con la cuenta, aunque Numier marcó ${numierMarked}.`:x.status==='ticket_without_payment'?`Numier marcó ${money(expected)} en tarjeta, pero no aparece una suma equivalente en SumUp.`:x.status==='payment_without_ticket'?`Existe este cobro en SumUp, pero no se ha localizado un ticket compatible en Numier.`:x.status==='amount_mismatch'?`Hay un cobro cercano, pero el importe SumUp no coincide con la tarjeta registrada en Numier.`:'La hora o el orden hacen probable la relación, pero conviene revisarla.';return <article className={`paymentMatch paymentMatchClear ${tone}`} key={`${x.payment?.id||ticket?.cab_id}-${i}`}><div className="paymentMatchStatus"><strong>{label}</strong><small>{explanation}</small></div><div className="paymentSource numierSource"><span>NUMIER MARCÓ</span><b>{ticket?numierMarked:'Sin ticket relacionado'}</b><strong>{ticket?money(ticket._total):'—'}</strong><small>{ticket?`Ticket ${ticket.numdoc||ticket.cab_id} · tarjeta registrada ${money(expected)}`:'No hay correspondencia en Numier'}</small></div><div className="paymentArrow">{ticket&&pays.length?'↔':'!'}</div><div className="paymentSource sumupSource"><span>SUMUP ENCONTRÓ</span><b>{pays.length===0?'Ningún cobro':pays.length===1?'1 cobro':`${pays.length} cobros sumados`}</b><strong>{pays.length?money(sumupTotal):'—'}</strong><small>{pays.length?pays.map(p=>`${p.date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})} · ${money(p.amount)}`).join(' + '):'Sin operación compatible'}</small></div><div className="paymentConclusion"><span>CONCLUSIÓN</span><b>{x.status==='correct'||x.status==='split_payment'?'Correspondencia correcta':x.status==='split_wrong_method'||x.status==='wrong_method'?'Revisar forma de pago en Numier':x.status==='ticket_without_payment'?'Falta cobro en SumUp':x.status==='payment_without_ticket'?'Falta ticket en Numier':'Revisión manual'}</b>{x.diffMin!=null&&<small>Separación media: {Math.round(x.diffMin)} min</small>}</div>{ticket&&<button onClick={()=>setSelectedTicket(ticket.cab_id)}>Ver ticket Numier</button>}</article>})}{!visible.length&&<div className="alertOk">No hay operaciones en este filtro.</div>}</div></section>
 {result.duplicates.length>0&&<div className="alertBad">El archivo contiene {result.duplicates.length} identificadores de transacción duplicados. Se han excluido del cruce principal.</div>}</>}
 {!result&&<section className="card paymentHelp"><h2>Qué detectará automáticamente</h2><div className="paymentHelpGrid"><p><b>Forma de pago errónea</b><span>Cobro real de tarjeta asociado a un ticket marcado como efectivo.</span></p><p><b>Ticket sin cobro</b><span>El TPV indica tarjeta, pero no aparece la operación real.</span></p><p><b>Cobro sin ticket</b><span>Existe una operación del datáfono que no se puede relacionar.</span></p><p><b>Pagos mixtos</b><span>Compara únicamente la parte de tarjeta registrada en el ticket.</span></p></div></section>}<TicketModal cabId={selectedTicket} onClose={()=>setSelectedTicket(null)}/></div>;
}
function TPV({initialTab='resumen',hideTabs=false}){const[date,setDate]=useState(today());const[tab,setTab]=useState(initialTab);const[data,setData]=useState({daily:null,tickets:[],lines:[],sync:null,error:null});const[comparison,setComparison]=useState([]);const[selected,setSelected]=useState(null);const[loading,setLoading]=useState(false);const[closure,setClosure]=useState(null);const[closures,setClosures]=useState([]);const[pulse,setPulse]=useState({recent:[],previous:[]});useEffect(()=>{load();const t=setInterval(()=>{if(date===today())load(false)},30000);return()=>clearInterval(t)},[date]);useEffect(()=>{loadPulseData().then(setPulse);reloadClosures()},[]);async function load(show=true){if(show)setLoading(true);const[d,cmp]=await Promise.all([loadSalesForDate(date),loadSalesForDate(addDays(date,-7))]);if(supabase&&d.tickets?.length){const ids=d.tickets.map(t=>t.cab_id).filter(Boolean);let lines=[];for(let i=0;i<ids.length;i+=200){const {data:part}=await supabase.from('numier_ticket_lines').select('cab_id,descripcion,articulo,cantidad,importe,line_key').in('cab_id',ids.slice(i,i+200)).limit(10000);lines=lines.concat(part||[])}d.lines=lines}setData(d);setComparison(cmp.tickets||[]);setClosure(await loadCashClosure(date));if(show)setLoading(false)}async function reloadClosures(){setClosures(await listCashClosures())}const tabs=[['resumen','Resumen'],['control','Control'],['tickets','Tickets'],['conciliacion','Conciliación'],['caja','Caja'],['cierres','Cierres'],['pulso','Pulso IA']];return <div className="tpvControl"><div className="card hero tpvHero"><div><span className="sectionEyebrow">TPV 5.0 · CONTROL DE VENTAS</span><h2>Ventas, tickets, incidencias y cierres</h2><p>Control operativo diario con comparación y detección automática.</p></div><div className="row controls"><button onClick={()=>setDate(today())}>Hoy</button><button onClick={()=>setDate(addDays(today(),-1))}>Ayer</button><button onClick={()=>setDate(addDays(date,-1))}>◀ Día</button><button onClick={()=>setDate(addDays(date,1))}>Día ▶</button><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button onClick={()=>load()}>{loading?'Cargando...':'Actualizar'}</button></div></div>{!hideTabs&&<nav className="tpvTabs">{tabs.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</nav>}{data.error&&<div className="alertBad">{data.error}</div>}{tab==='resumen'&&<TPVSummary date={date} daily={data.daily} tickets={data.tickets||[]} onTicket={setSelected} pulse={pulse} comparison={comparison} closure={closure} onOpenControl={()=>setTab('control')}/>} {tab==='control'&&<TPVControlDay tickets={data.tickets||[]} lines={data.lines||[]} onTicket={setSelected} closure={closure}/>} {tab==='tickets'&&<TPVTickets tickets={data.tickets||[]} lines={data.lines||[]} onTicket={setSelected}/>} {tab==='conciliacion'&&<PaymentReconciliation initialDate={date}/>} {tab==='caja'&&<TPVCash date={date} daily={data.daily||summarizeTickets(data.tickets||[])} closure={closure} onSaved={r=>{setClosure(r);reloadClosures();alert('Cierre guardado correctamente')}}/>} {tab==='cierres'&&<TPVClosures rows={closures} onReload={reloadClosures}/>} {tab==='pulso'&&<TPVPulse pulse={pulse} closures={closures}/>}<TicketModal cabId={selected} onClose={()=>setSelected(null)}/></div>}

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
function Gestoria({initialTab='revision',hideTabs=false}){
 const yNow=new Date().getFullYear();
 const[year,setYear]=useState(yNow);const[type,setType]=useState('mes');const[period,setPeriod]=useState(new Date().getMonth()+1);
 const[data,setData]=useState({tickets:[],lines:[],sync:null,articles:new Map()});const[extras,setExtras]=useState({closures:[],fixed:[],variable:[],invoices:[],payments:[]});const[realResult,setRealResult]=useState(null);const[gestoriaCostMap,setGestoriaCostMap]=useState(new Map());
 const[loading,setLoading]=useState(false);const[progress,setProgress]=useState('');const[tab,setTab]=useState(initialTab);
 const range=type==='trimestre'?quarterRange(Number(year),Number(period)):monthRange(Number(year),Number(period));
 const lockKey=`colibri_gestoria_lock_${range.from}_${range.to}`;const[locked,setLocked]=useState(()=>localStorage.getItem(lockKey)==='1');
 useEffect(()=>{setLocked(localStorage.getItem(lockKey)==='1');load()},[year,type,period]);
 async function load(){try{setLoading(true);setProgress('Preparando cierre contable...');const[d,x,costMap,real]=await Promise.all([loadSalesRangeGestoria(range.from,range.to,setProgress),loadGestoriaExtras(range.from,range.to),loadProfitabilityCostMap(),loadRealProfitability(supabase,range.from,range.to,[])]);setData(d);setExtras(x);setGestoriaCostMap(costMap);setRealResult(real)}catch(e){alert('Error cargando gestoría: '+(e.message||String(e)))}finally{setLoading(false)}}
 const allTickets=data.tickets||[];const realTickets=allTickets.filter(isRealSaleTicket);const cancelled=allTickets.filter(t=>String(t.estado||'').toUpperCase()==='X');const expensesNumier=allTickets.filter(t=>String(t.estado||'').toUpperCase()==='G');
 const fiscalRows=ticketFiscalRows(realTickets,data.lines);const sum=summarizeTickets(realTickets);const iva=ivaSummary(data.lines);const daily=gestoriaDailyRows(fiscalRows);
 const gestoriaProducts=periodFinancials(normalizePeriodLines(realTickets,data.lines),gestoriaCostMap);const gestoriaReal=realResult||{laborAccrued:0,fixed:0,variable:0,hours:0};const numierExpenseTotal=expensesNumier.reduce((a,t)=>a+numierExpenseAmount(t),0);const gestoriaGross=sum.total-gestoriaProducts.cost;const gestoriaOperating=gestoriaGross-gestoriaReal.laborAccrued;const gestoriaProfit=gestoriaOperating-gestoriaReal.fixed-gestoriaReal.variable-numierExpenseTotal;const gestoriaMargin=sum.total?gestoriaProfit/sum.total*100:0;
 const mixed=fiscalRows.filter(r=>r.efectivo>0&&r.tarjeta>0);const unclear=fiscalRows.filter(r=>r.total>0&&r.efectivo===0&&r.tarjeta===0&&r.otros===0);
 const closureDates=new Set((extras.closures||[]).map(x=>String(x.fecha||'').slice(0,10)));const salesDates=[...new Set(realTickets.map(t=>String(t.hora||'').slice(0,10)).filter(Boolean))];const missingClosures=salesDates.filter(d=>!closureDates.has(d));
 const closureDiffs=(extras.closures||[]).filter(x=>Math.abs(Number(x.diferencia||x.diff||0))>.5);
 const incidents=[
  ...(missingClosures.length?[{type:'bad',title:`${missingClosures.length} días sin cierre de caja`,detail:missingClosures.slice(0,8).join(', ')}]:[]),
  ...(closureDiffs.length?[{type:'warn',title:`${closureDiffs.length} cierres con descuadre`,detail:'Diferencias superiores a 0,50 €'}]:[]),
  ...(unclear.length?[{type:'bad',title:`${unclear.length} tickets sin forma de pago clara`,detail:'Revisar antes de enviar a gestoría'}]:[]),
  ...(cancelled.length?[{type:'info',title:`${cancelled.length} tickets anulados`,detail:'Excluidos de ventas'}]:[]),
  ...(expensesNumier.length?[{type:'info',title:`${expensesNumier.length} gastos Numier`,detail:`Restan ${money(numierExpenseTotal)} del resultado real`}]:[]),
  ...((extras.invoices||[]).filter(i=>!['reviewed','approved'].includes(String(i.status||''))).length?[{type:'warn',title:'Facturas pendientes de revisar',detail:`${(extras.invoices||[]).filter(i=>!['reviewed','approved'].includes(String(i.status||''))).length} documentos`}]:[])
 ];
 const canClose=missingClosures.length===0&&unclear.length===0;
 function toggleLock(){if(!locked&&!canClose&&!confirm('Hay incidencias críticas. ¿Cerrar el periodo igualmente?'))return;const next=!locked;localStorage.setItem(lockKey,next?'1':'0');setLocked(next)}
 function buildWorkbook(){
  const wb=XLSX.utils.book_new();
  gestoriaSheet(wb,'Resumen',[[`COLIBRÍ · CIERRE ${range.label}`],['Periodo',range.from,range.to],['Estado',locked?'CERRADO':'ABIERTO'],[],['Concepto','Importe'],['Ventas',sum.total],['Tickets',sum.tickets],['Ticket medio',sum.ticket_medio],['Efectivo',sum.efectivo],['Tarjeta',sum.tarjeta],['Otros',sum.cheque],['Anulados',cancelled.length],['Gastos Numier',numierExpenseTotal],[],['RENDIMIENTO REAL'],['Coste productos',gestoriaProducts.cost],['Personal devengado',gestoriaReal.laborAccrued],['Gastos fijos imputados',gestoriaReal.fixed],['Gastos variables ERP',gestoriaReal.variable],['Gastos Numier (G)',numierExpenseTotal],['Margen bruto',gestoriaGross],['Margen operativo',gestoriaOperating],['Beneficio real',gestoriaProfit],['Margen real (%)',gestoriaMargin]], [28,18,18]);
  gestoriaSheet(wb,'Ventas detalladas',[['Ticket','CAB_ID','Fecha','Hora','Pago','Mesa','Base','IVA','Total','Efectivo','Tarjeta','Otros'],...fiscalRows.map(r=>[r.numdoc,r.cab_id,r.fecha,r.hora,r.forma,r.mesa,r.baseTotal,r.ivaTotal,r.total,r.efectivo,r.tarjeta,r.otros])],[14,12,12,10,24,12,12,12,12,12,12,12]);
  gestoriaSheet(wb,'Totales diarios',[['Fecha','Tickets','Base','IVA','Total','Efectivo','Tarjeta','Otros'],...daily.map(r=>[r.fecha,r.tickets,r.base,r.iva,r.total,r.efectivo,r.tarjeta,r.otros])],[14,12,12,12,12,12,12,12]);
  gestoriaSheet(wb,'Formas de pago',[['Forma','Importe'],['Efectivo',sum.efectivo],['Tarjeta',sum.tarjeta],['Cheque/Otros',sum.cheque],['Total',sum.total]],[22,16]);
  gestoriaSheet(wb,'Pagos mixtos',[['Ticket','Fecha','Total','Efectivo','Tarjeta'],...mixed.map(r=>[r.numdoc,r.fecha,r.total,r.efectivo,r.tarjeta])],[15,14,14,14,14]);
  gestoriaSheet(wb,'Gastos',[['Origen','Fecha','Concepto','Importe'],...expensesNumier.map(x=>['Numier',String(x.hora||'').slice(0,10),x.mesa||x.descripcion||'Gasto',Number(x.total||0)]),...(extras.variable||[]).map(x=>['ERP',x.expense_date||x.date,x.description||x.name||'Gasto variable',Number(x.amount||x.total||0)])],[14,14,32,14]);
  gestoriaSheet(wb,'Anulaciones',[['Ticket','Fecha','Importe','Mesa'],...cancelled.map(x=>[x.numdoc||x.cab_id,String(x.hora||'').slice(0,10),Number(x.total||0),x.mesa||''])],[15,14,14,14]);
  gestoriaSheet(wb,'Cierres de caja',[['Fecha','Esperado','Declarado','Diferencia','Notas'],...(extras.closures||[]).map(x=>[x.fecha,Number(x.efectivo_esperado||x.expected_cash||0),Number(x.efectivo_real||x.declared_cash||0),Number(x.diferencia||x.diff||0),x.notas||x.notes||''])],[14,14,14,14,30]);
  gestoriaSheet(wb,'Facturas y compras',[['Fecha','Proveedor','Factura','Total','Estado'],...(extras.invoices||[]).map(x=>[x.invoice_date,x.purchase_suppliers?.name||'',x.invoice_number||'',Number(x.total||0),x.status||''])],[14,24,18,14,18]);
  gestoriaSheet(wb,'Personal',[['Fecha','Empleado','Concepto','Importe'],...(extras.payments||[]).map(x=>[x.payment_date,x.employee_name||x.employee_id||'',x.payment_type||x.notes||'Pago',Number(x.amount||0)])],[14,22,24,14]);
  gestoriaSheet(wb,'Rendimiento real',[['Concepto','Importe','Porcentaje ventas'],['Ventas',sum.total,100],['Coste productos',gestoriaProducts.cost,sum.total?gestoriaProducts.cost/sum.total*100:0],['Margen bruto',gestoriaGross,sum.total?gestoriaGross/sum.total*100:0],['Personal devengado',gestoriaReal.laborAccrued,sum.total?gestoriaReal.laborAccrued/sum.total*100:0],['Margen operativo',gestoriaOperating,sum.total?gestoriaOperating/sum.total*100:0],['Gastos fijos',gestoriaReal.fixed,sum.total?gestoriaReal.fixed/sum.total*100:0],['Gastos variables ERP',gestoriaReal.variable,sum.total?gestoriaReal.variable/sum.total*100:0],['Gastos Numier (G)',numierExpenseTotal,sum.total?numierExpenseTotal/sum.total*100:0],['Beneficio real',gestoriaProfit,gestoriaMargin]],[28,16,20]);
  gestoriaSheet(wb,'Personal real',[['Empleado','Horas','Coste hora','Coste total','Origen'],...(gestoriaReal.details?.labor||[]).map(x=>[x.employee_name||x.employee_id||'',Number(x.hours||0),Number(x.hourly_cost||0),Number(x.cost||0),gestoriaReal.laborSource||''])],[24,12,14,16,20]);
  gestoriaSheet(wb,'Fijos imputados',[['Concepto','Categoría','Días','Importe mensual','Imputado'],...(gestoriaReal.details?.fixed||[]).map(x=>[x.name||'',x.category||'',Number(x.days||0),Number(x.amount||0),Number(x.imputed||0)])],[26,20,10,16,16]);
  gestoriaSheet(wb,'Incidencias',[['Nivel','Incidencia','Detalle'],...incidents.map(i=>[i.type,i.title,i.detail])],[12,34,50]);
  return wb;
 }
 function exportExcel(){const wb=buildWorkbook();XLSX.writeFile(wb,`COLIBRI_GESTORIA_${range.label.replaceAll(' ','_')}.xlsx`)}
 function buildPdf(){const doc=new jsPDF();doc.setFontSize(18);doc.text('COLIBRÍ · CIERRE CONTABLE',14,18);doc.setFontSize(11);doc.text(`${range.label} · ${range.from} a ${range.to}`,14,27);let y=40;[['Ventas',money(sum.total)],['Tickets',String(sum.tickets)],['Ticket medio',money(sum.ticket_medio)],['Efectivo',money(sum.efectivo)],['Tarjeta',money(sum.tarjeta)],['Otros',money(sum.cheque)],['Estado',locked?'CERRADO':'ABIERTO']].forEach(([a,b])=>{doc.text(a,14,y);doc.text(b,90,y);y+=8});y+=5;doc.setFontSize(14);doc.text('Rendimiento real',14,y);y+=9;doc.setFontSize(10);[['Coste productos',money(gestoriaProducts.cost)],['Personal devengado',money(gestoriaReal.laborAccrued)],['Gastos fijos',money(gestoriaReal.fixed)],['Gastos variables ERP',money(gestoriaReal.variable)],['Gastos Numier (G)',money(numierExpenseTotal)],['Margen bruto',money(gestoriaGross)],['Margen operativo',money(gestoriaOperating)],['Beneficio real',money(gestoriaProfit)],['Margen real',`${gestoriaMargin.toFixed(1)}%`]].forEach(([a,b])=>{doc.text(a,14,y);doc.text(b,90,y);y+=7});y+=5;if(y>245){doc.addPage();y=20}doc.setFontSize(14);doc.text('Incidencias',14,y);y+=8;doc.setFontSize(9);(incidents.length?incidents:[{title:'Sin incidencias críticas',detail:'Periodo listo para revisión'}]).slice(0,12).forEach(i=>{if(y>275){doc.addPage();y=20}doc.text(`• ${i.title}`,16,y);y+=5;doc.text(String(i.detail||'').slice(0,95),20,y);y+=7});return doc}
 async function exportPackage(){setProgress('Generando paquete de gestoría...');const zip=new JSZip();const wb=buildWorkbook();zip.file(`COLIBRI_GESTORIA_${range.label}.xlsx`,XLSX.write(wb,{bookType:'xlsx',type:'array'}));zip.file(`RESUMEN_${range.label}.pdf`,buildPdf().output('arraybuffer'));zip.file('INCIDENCIAS.txt',(incidents.length?incidents.map(i=>`${i.title}\n${i.detail}`).join('\n\n'):'Sin incidencias críticas'));zip.file('LEEME.txt',`Paquete generado por Colibrí ERP\nPeriodo: ${range.from} - ${range.to}\nEstado: ${locked?'CERRADO':'ABIERTO'}\nVentas: ${sum.total.toFixed(2)} EUR\nTickets: ${sum.tickets}`);const blob=await zip.generateAsync({type:'blob'});downloadFile(`COLIBRI_PAQUETE_GESTORIA_${range.label.replaceAll(' ','_')}.zip`,blob,'application/zip');setProgress('Paquete generado correctamente')}
 const tabs=[['revision','Revisión'],['resumen','Resumen'],['ventas','Ventas'],['cierres','Cierres'],['documentos','Documentos']];
 return <div className="gestoria6"><div className="card hero gestoriaHero"><div><span className="sectionEyebrow">GESTORÍA 6.0 · CIERRE AUTOMÁTICO</span><h2>Cierre mensual y trimestral guiado</h2><p>Revisa incidencias, valida cobros y genera el paquete completo para la gestoría.</p></div><div className="row controls"><select value={type} onChange={e=>{setType(e.target.value);setPeriod(1)}}><option value="mes">Mes</option><option value="trimestre">Trimestre</option></select><input type="number" value={year} onChange={e=>setYear(e.target.value)}/>{type==='trimestre'?<select value={period} onChange={e=>setPeriod(e.target.value)}>{[1,2,3,4].map(x=><option key={x} value={x}>{x}T</option>)}</select>:<select value={period} onChange={e=>setPeriod(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{String(i+1).padStart(2,'0')}</option>)}</select>}<button onClick={load}>{loading?'Cargando...':'Actualizar'}</button></div></div>
 {loading&&<div className="card"><h3>Procesando periodo</h3><p>{progress}</p></div>}
 <div className="grid kpis"><div className="card kpi"><span>Ventas</span><b>{money(sum.total)}</b></div><div className="card kpi"><span>Tickets</span><b>{sum.tickets}</b></div><div className="card kpi"><span>Incidencias</span><b className={incidents.length?'bad':'ok'}>{incidents.length}</b></div><div className="card kpi"><span>Estado</span><b className={locked?'ok':'warn'}>{locked?'CERRADO':'ABIERTO'}</b></div></div>
 {!hideTabs&&<nav className="tpvTabs">{tabs.map(([v,l])=><button key={v} className={tab===v?'active':''} onClick={()=>setTab(v)}>{l}</button>)}</nav>}
 {tab==='revision'&&<><div className="grid"><div className="card"><h2>Checklist de cierre</h2>{incidents.length?incidents.map((i,n)=><div className={`gestoriaIncident ${i.type}`} key={n}><b>{i.title}</b><small>{i.detail}</small></div>):<div className="alertOk">Sin incidencias críticas. El periodo está listo para cerrar.</div>}</div><div className="card"><h2>Control del periodo</h2><p>Ventas detectadas: <b>{money(sum.total)}</b></p><p>Días con ventas: <b>{salesDates.length}</b></p><p>Cierres registrados: <b>{extras.closures.length}</b></p><p>Pagos mixtos: <b>{mixed.length}</b></p><button className={locked?'secondary':''} onClick={toggleLock}>{locked?'Reabrir periodo':'Marcar periodo como cerrado'}</button><p className="mutedText">El cierre bloquea visualmente el periodo y deja constancia local. Los datos originales no se eliminan.</p></div></div></>}
 {tab==='resumen'&&<><div className="grid"><div className="card"><h2>Resumen fiscal</h2><table><tbody><tr><td>Ventas</td><td>{money(sum.total)}</td></tr><tr><td>Tickets</td><td>{sum.tickets}</td></tr><tr><td>Ticket medio</td><td>{money(sum.ticket_medio)}</td></tr><tr><td>Efectivo</td><td>{money(sum.efectivo)}</td></tr><tr><td>Tarjeta</td><td>{money(sum.tarjeta)}</td></tr><tr><td>Otros</td><td>{money(sum.cheque)}</td></tr></tbody></table></div><div className="card"><h2>IVA</h2><table><thead><tr><th>Tipo</th><th>Base</th><th>Cuota</th><th>Total</th></tr></thead><tbody>{iva.map(r=><tr key={r.iva}><td>{r.iva}%</td><td>{money(r.base)}</td><td>{money(r.cuota)}</td><td>{money(r.total)}</td></tr>)}</tbody></table></div></div><section className="card gestoriaRealResult"><span className="sectionEyebrow">RENDIMIENTO REAL DEL PERIODO</span><h2>Resultado económico real</h2><div className="grid unifiedProfitKpis"><div className="kpi"><span>Coste productos</span><b>{money(gestoriaProducts.cost)}</b><small>{sum.total?(gestoriaProducts.cost/sum.total*100).toFixed(1):'0.0'}% de ventas</small></div><div className="kpi"><span>Personal</span><b>{money(gestoriaReal.laborAccrued)}</b><small>{Number(gestoriaReal.hours||0).toFixed(1)} h · {sum.total?(gestoriaReal.laborAccrued/sum.total*100).toFixed(1):'0.0'}%</small></div><div className="kpi"><span>Gastos fijos</span><b>{money(gestoriaReal.fixed)}</b><small>{sum.total?(gestoriaReal.fixed/sum.total*100).toFixed(1):'0.0'}% de ventas</small></div><div className="kpi"><span>Gastos variables ERP</span><b>{money(gestoriaReal.variable)}</b><small>{sum.total?(gestoriaReal.variable/sum.total*100).toFixed(1):'0.0'}% de ventas</small></div><div className="kpi"><span>Gastos Numier (G)</span><b>{money(numierExpenseTotal)}</b><small>{expensesNumier.length} movimientos · {sum.total?(numierExpenseTotal/sum.total*100).toFixed(1):'0.0'}% de ventas</small></div><div className="kpi"><span>Margen bruto</span><b>{money(gestoriaGross)}</b><small>{sum.total?(gestoriaGross/sum.total*100).toFixed(1):'0.0'}%</small></div><div className="kpi"><span>Margen operativo</span><b>{money(gestoriaOperating)}</b><small>{sum.total?(gestoriaOperating/sum.total*100).toFixed(1):'0.0'}%</small></div><div className="kpi realProfitKpi"><span>Beneficio real</span><b className={gestoriaProfit>=0?'ok':'bad'}>{money(gestoriaProfit)}</b><small>{gestoriaMargin.toFixed(1)}% sobre ventas</small></div></div><div className="grid gestoriaRealBreakdown"><div><h3>Personal imputado</h3>{(gestoriaReal.details?.labor||[]).map((x,i)=><p key={x.employee_id||i}><span>{x.employee_name||'Empleado'} · {Number(x.hours||0).toFixed(1)} h</span><b>{money(x.cost)}</b></p>)}</div><div><h3>Gastos fijos imputados</h3>{(gestoriaReal.details?.fixed||[]).map((x,i)=><p key={x.id||i}><span>{x.name||'Gasto'} · {x.days||0} días</span><b>{money(x.imputed)}</b></p>)}</div></div></section></>}
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
