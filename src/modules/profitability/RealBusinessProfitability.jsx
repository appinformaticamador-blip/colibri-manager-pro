import React,{useEffect,useState} from 'react';
import {DEFAULT_HOURLY_COST,hourlyCost,laborFromClockRecords} from '../coreBusiness';
const DAYS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

function num(value){const n=Number(value);return Number.isFinite(n)?n:0}
function isoDate(value){return String(value||'').slice(0,10)}
function dateUTC(value){const [y,m,d]=isoDate(value).split('-').map(Number);return new Date(Date.UTC(y,m-1,d))}
function addDays(value,days){const d=dateUTC(value);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function daysInMonth(value){const d=dateUTC(value);return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()}
function slotHours(slot){const [a,b]=String(slot||'').split('-');if(!a||!b)return 0;const toN=v=>{const [h,m=0]=v.split(':').map(Number);return h+(m||0)/60};return Math.max(0,toN(b)-toN(a))}
function isoWeekId(value){const d=dateUTC(value);const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear();const jan4=new Date(Date.UTC(year,0,4));const janDay=jan4.getUTCDay()||7;jan4.setUTCDate(jan4.getUTCDate()+4-janDay);const week=1+Math.round((d-jan4)/604800000);return `${year}-W${String(week).padStart(2,'0')}`}
function mondayIndex(value){return (dateUTC(value).getUTCDay()+6)%7}
function entryIdentity(entry){if(entry&&typeof entry==='object')return String(entry.id||entry.employee_id||entry.name||entry.employee_name||entry.nombre||'').trim();return String(entry||'').trim()}
function entryName(entry){if(entry&&typeof entry==='object')return String(entry.name||entry.employee_name||entry.nombre||entry.id||'Empleado');return String(entry||'Empleado')}
function normalized(value){return String(value||'').trim().toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function isClosedEntry(entry){
 const value=normalized(entryIdentity(entry)).replace(/\s+/g,'_');
 return !value||['__cerrado__','_cerrado_','cerrado','__closed__','_closed_','closed'].includes(value);
}
function activeEntries(entries){return (Array.isArray(entries)?entries:[]).filter(entry=>!isClosedEntry(entry))}
function buildEmployeeResolver(employees){
 const byId=new Map(),byName=new Map();
 for(const employee of employees||[]){
  const id=String(employee?.id||'').trim();
  const name=normalized(employee?.name||employee?.employee_name);
  if(id)byId.set(id,employee);
  if(name)byName.set(name,employee);
 }
 return entry=>{
  const id=entryIdentity(entry);
  const name=entryName(entry);
  return byId.get(id)||byName.get(normalized(name))||byName.get(normalized(id))||null;
 };
}
function entriesFor(data,weekId,day,slot){
 const source=data&&typeof data==='object'?data:{};
 const flat=source[`${weekId}|${day}|${slot}`];
 if(Array.isArray(flat))return flat;
 const nested=source?.[day]?.[slot];
 if(Array.isArray(nested))return nested;
 const weekNested=source?.[weekId]?.[day]?.[slot];
 return Array.isArray(weekNested)?weekNested:[];
}
async function safeQuery(query){try{const {data,error}=await query;if(error)return[];return data||[]}catch{return[]}}

export async function loadRealProfitability(supabase,from,to,clocks=[]){
 const start=isoDate(from),end=isoDate(to);
 const result={purchases:0,payroll:0,fixed:0,variable:0,total:0,clockHours:0,hours:0,laborAccrued:0,scheduleRows:[],details:{fixed:[],variable:[],labor:[],invalidScheduleEntries:[]}};
 result.clockHours=(clocks||[]).reduce((s,r)=>s+num(r.hours||r.total_hours),0);
 if(!supabase||!start||!end||start>=end)return result;

 const weekIds=[...new Set(Array.from({length:Math.max(1,Math.ceil((dateUTC(end)-dateUTC(start))/86400000))},(_,i)=>isoWeekId(addDays(start,i))))];
 const [fixedRows,variableRows,scheduleWeeks,costProfiles,employees,legacyRows]=await Promise.all([
  safeQuery(supabase.from('business_fixed_expenses').select('*').lte('start_date',addDays(end,-1)).or(`end_date.is.null,end_date.gte.${start}`).limit(5000)),
  safeQuery(supabase.from('business_variable_expenses').select('*').gte('expense_date',start).lt('expense_date',end).order('expense_date',{ascending:true}).limit(5000)),
  safeQuery(supabase.from('work_schedule_weeks').select('*').in('week_id',weekIds).limit(200)),
  safeQuery(supabase.from('employee_cost_profiles').select('*').eq('active',true).limit(1000)),
  safeQuery(supabase.from('employees').select('*').limit(1000)),
  safeQuery(supabase.from('profitability_costs').select('*').gte('date',start).lt('date',end).limit(5000))
 ]);

 // Gastos fijos: prorrateo exacto por día natural, respetando altas/bajas.
 for(const row of fixedRows){
  if(row.active===false)continue;
  const rowStart=isoDate(row.start_date)||start,rowEnd=isoDate(row.end_date);
  let imputed=0,days=0;
  for(let day=start;day<end;day=addDays(day,1)){
   if(day<rowStart||(rowEnd&&day>rowEnd))continue;
   imputed+=num(row.monthly_amount||row.amount)/daysInMonth(day);days++;
  }
  if(imputed>0){result.fixed+=imputed;result.details.fixed.push({...row,amount:num(row.monthly_amount||row.amount),imputed,days})}
 }

 // Gastos variables registrados dentro del periodo.
 result.details.variable=variableRows.map(row=>({...row,amount:num(row.amount||row.total)}));
 result.variable=result.details.variable.reduce((s,row)=>s+row.amount,0);

 // Perfil horario único: employees es la fuente principal; se mantiene compatibilidad con perfiles antiguos.
 const profileById=new Map(),profileByName=new Map();
 for(const e of employees){const cost=hourlyCost(e);const id=String(e.id||'').trim();const name=normalized(e.name);if(id)profileById.set(id,cost);if(name)profileByName.set(name,cost)}
 for(const p of costProfiles){const cost=num(p.hourly_cost)||DEFAULT_HOURLY_COST;const id=String(p.employee_id||'').trim();const name=normalized(p.employee_name);if(id&&!profileById.has(id))profileById.set(id,cost);if(name&&!profileByName.has(name))profileByName.set(name,cost)}
 const weekById=new Map(scheduleWeeks.map(w=>[String(w.week_id),w]));
 const resolveEmployee=buildEmployeeResolver(employees);
 const laborMap=new Map();
 for(let day=start;day<end;day=addDays(day,1)){
  const weekId=isoWeekId(day),weekRow=weekById.get(weekId);if(!weekRow)continue;
  const dayName=DAYS[mondayIndex(day)],data=weekRow.data||{};
  const slots=new Set();
  Object.keys(data||{}).forEach(key=>{const parts=key.split('|');if(parts.length===3&&parts[0]===weekId&&parts[1]===dayName)slots.add(parts[2])});
  Object.keys(data?.[dayName]||{}).forEach(slot=>slots.add(slot));
  Object.keys(data?.[weekId]?.[dayName]||{}).forEach(slot=>slots.add(slot));
  // Franja estándar como respaldo para estructuras con claves no enumerables/incompletas.
  ['08:00-10:00','10:00-12:00','12:00-14:00','14:00-16:00','16:00-18:00','18:00-20:00','20:00-22:00','22:00-23:30'].forEach(slot=>slots.add(slot));
  for(const slot of slots){
   const hours=slotHours(slot);if(!hours)continue;
   for(const entry of activeEntries(entriesFor(data,weekId,dayName,slot))){
    const employee=resolveEmployee(entry);
    // Un cuadrante solo puede generar horas y coste para un empleado real de la tabla employees.
    // UUID huérfanos, nombres antiguos sin correspondencia y marcadores CERRADO se excluyen a coste 0.
    if(!employee){
     result.details.invalidScheduleEntries.push({date:day,week_id:weekId,day:dayName,slot,value:entryIdentity(entry)});
     continue;
    }
    const id=String(employee.id||'').trim(),name=String(employee.name||employee.employee_name||'Empleado').trim();
    const costHour=profileById.get(id)||profileByName.get(normalized(name))||hourlyCost(employee)||DEFAULT_HOURLY_COST;
    const key=id||normalized(name);const current=laborMap.get(key)||{employee_id:id,employee_name:name,hours:0,cost:0,hourly_cost:costHour};
    current.hours+=hours;current.cost+=hours*costHour;laborMap.set(key,current);
    result.scheduleRows.push({date:day,week_id:weekId,day:dayName,slot,employees:1,employee_id:id,employee_name:name,hourly_cost:costHour});
   }
  }
 }
 result.details.plannedLabor=[...laborMap.values()];
 result.plannedHours=result.details.plannedLabor.reduce((s,r)=>s+r.hours,0);
 result.plannedLaborCost=result.details.plannedLabor.reduce((s,r)=>s+r.cost,0);
 const activeEmployees=employees.filter(e=>e.active!==false);
 const actualLabor=laborFromClockRecords(clocks,activeEmployees,start,end,new Date());
 result.details.labor=actualLabor.details;
 result.hours=actualLabor.hours;
 result.clockHours=actualLabor.hours;
 result.laborAccrued=actualLabor.cost;
 result.payroll=result.laborAccrued;
 // Si todavía no existen fichajes en el periodo, se conserva el coste previsto como respaldo explícito.
 result.laborSource=result.hours>0?'clock_records':'work_schedule_weeks';
 if(result.hours===0&&result.plannedHours>0){result.hours=result.plannedHours;result.laborAccrued=result.plannedLaborCost;result.payroll=result.laborAccrued;result.details.labor=result.details.plannedLabor}

 // Compatibilidad: solo usa registros antiguos en categorías que aún no tienen datos nuevos.
 for(const row of legacyRows){
  const value=num(row.amount||row.cost),type=String(row.type||row.category||'').toLowerCase();
  if((type.includes('purchase')||type.includes('compra')))result.purchases+=value;
  else if((type.includes('payroll')||type.includes('personal'))&&result.laborAccrued===0){result.payroll+=value;result.laborAccrued+=value}
  else if((type.includes('variable')||type.includes('imprev'))&&result.variable===0)result.variable+=value;
  else if(result.fixed===0)result.fixed+=value;
 }
 result.total=result.purchases+result.laborAccrued+result.fixed+result.variable;
 return result;
}

export default function RealBusinessProfitability({supabase}){
 const[d,setD]=useState(null);
 useEffect(()=>{const to=addDays(new Date().toISOString().slice(0,10),1);const from=addDays(to,-30);loadRealProfitability(supabase,from,to,[]).then(setD)},[supabase]);
 return <section className="panel"><h2>Rentabilidad real</h2>{!d?<p>Cargando…</p>:<p>Personal, gastos fijos y variables del periodo: <b>{Number(d.total||0).toFixed(2)} €</b></p>}</section>
}
