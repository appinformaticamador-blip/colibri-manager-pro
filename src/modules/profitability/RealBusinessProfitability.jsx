import React,{useEffect,useState} from 'react';
export async function loadRealProfitability(supabase,from,to,clocks=[]){
 const result={purchases:0,payroll:0,fixed:0,total:0,clockHours:0};
 result.clockHours=(clocks||[]).reduce((s,r)=>s+Number(r.hours||r.total_hours||0),0);
 if(!supabase)return result;
 try{const {data}=await supabase.from('profitability_costs').select('*').gte('date',from).lt('date',to);for(const r of data||[]){const v=Number(r.amount||r.cost||0);const t=String(r.type||r.category||'').toLowerCase();if(t.includes('purchase')||t.includes('compra'))result.purchases+=v;else if(t.includes('payroll')||t.includes('personal'))result.payroll+=v;else result.fixed+=v}result.total=result.purchases+result.payroll+result.fixed}catch{}
 return result;
}
export default function RealBusinessProfitability({supabase}){const [d,setD]=useState(null);useEffect(()=>{const to=new Date().toISOString().slice(0,10);const from=new Date(Date.now()-30*864e5).toISOString().slice(0,10);loadRealProfitability(supabase,from,to,[]).then(setD)},[supabase]);return <section className="panel"><h2>Rentabilidad real</h2>{!d?<p>Cargando…</p>:<p>Costes registrados del periodo: <b>{Number(d.total||0).toFixed(2)} €</b></p>}</section>}
