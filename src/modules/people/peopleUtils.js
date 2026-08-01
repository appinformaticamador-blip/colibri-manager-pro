export const HOURLY_RATE=7;
export const DAYS_ES=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export const RESTAURANT_ID='braseria-el-colibri';

export function mondayOf(date=new Date()){
 const d=new Date(date); d.setHours(12,0,0,0); const day=(d.getDay()+6)%7; d.setDate(d.getDate()-day); return d;
}
export function isoDate(d){return new Date(d).toISOString().slice(0,10)}
export function weekIdFor(date=new Date()){
 const d=new Date(date); d.setHours(12,0,0,0); const th=new Date(d); th.setDate(d.getDate()+3-((d.getDay()+6)%7));
 const first=new Date(th.getFullYear(),0,4); const n=1+Math.round(((th-first)/86400000-3+((first.getDay()+6)%7))/7);
 return `${th.getFullYear()}-W${String(n).padStart(2,'0')}`;
}
export function durationMinutes(a,b){return Math.max(0,Math.round((new Date(b)-new Date(a))/60000))}
export function durationText(min=0){const h=Math.floor(min/60),m=Math.round(min%60);return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m} min`}
export function money(v){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v||0))}
export function asArray(v){return Array.isArray(v)?v:[]}
export function pairClockRecords(rows=[]){
 const sorted=[...rows].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); const byDay={}; let open=null;
 for(const r of sorted){const type=String(r.type||'').toLowerCase(); if(type==='entrada'){if(open){const key=isoDate(open.created_at);(byDay[key]??=[]).push({entry:open,exit:null,minutes:durationMinutes(open.created_at,new Date())});}open=r;}else if(type==='salida'&&open){const key=isoDate(open.created_at);(byDay[key]??=[]).push({entry:open,exit:r,minutes:durationMinutes(open.created_at,r.created_at)});open=null;}}
 if(open){const key=isoDate(open.created_at);(byDay[key]??=[]).push({entry:open,exit:null,minutes:durationMinutes(open.created_at,new Date())});}
 return byDay;
}
export function employeeNames(e){return [e?.name,e?.employee_name,e?.nombre].filter(Boolean).map(String)}
export function scheduleForEmployee(scheduleRow,employee){
 const data=scheduleRow?.data||{}; const result={}; const ids=new Set([String(employee?.id||''),...employeeNames(employee)].filter(Boolean));
 for(const day of DAYS_ES){for(const [slot,val] of Object.entries(data?.[day]||{})){const arr=asArray(val);const found=arr.some(x=>ids.has(String(typeof x==='object'?(x.id||x.name):x)));if(found){(result[day]??=[]).push(slot)}}}
 return result;
}
export function slotBounds(slots=[]){if(!slots.length)return null;const sorted=[...slots].sort();return {start:sorted[0].split('-')[0],end:sorted[sorted.length-1].split('-')[1]}}
export function scheduledMinutes(schedule={}){let total=0;for(const slots of Object.values(schedule)){for(const s of slots){const [a,b]=s.split('-');const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);total+=(bh*60+bm)-(ah*60+am)}}return total}
export function dayName(date){return DAYS_ES[(new Date(date).getDay()+6)%7]}
export function copyText(text){if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(text);const t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();return Promise.resolve()}
export function downloadCsv(name,rows){const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
