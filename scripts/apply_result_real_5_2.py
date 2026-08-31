from pathlib import Path
import json

app_path=Path('src/App.jsx')
css_path=Path('src/styles.css')
app=app_path.read_text()
css=css_path.read_text()

# 1) Rango personalizado dentro de Resultado real.
old="""function UnifiedProfitability(){
 const[mode,setMode]=useState('hoy'),[date,setDate]=useState(today()),[state,setState]=useState({tickets:[],lines:[],costMap:new Map(),real:null}),[loading,setLoading]=useState(false),[fixed,setFixed]=useState([]),[variable,setVariable]=useState([]),[detail,setDetail]=useState(null),[selectedTicket,setSelectedTicket]=useState(null),[fixedForm,setFixedForm]=useState({name:'',category:'Alquiler',monthly_amount:'',start_date:today(),end_date:'',notes:'',active:true}),[variableForm,setVariableForm]=useState({name:'',category:'Otros',expense_date:today(),amount:'',payment_method:'Efectivo',notes:''});
 const r=rangeDates(mode,date);const buttons=[['hoy','Hoy'],['ayer','Ayer'],['semana','7 días'],['treinta','30 días'],['mes','Mes'],['anio','Año']];
 const chooseMode=id=>{setMode(id);if(id==='hoy')setDate(today());else if(id==='ayer')setDate(addDays(today(),-1));else if(id==='mes')setDate(today().slice(0,7)+'-01');else if(id==='anio')setDate(today().slice(0,4)+'-01-01')};
 useEffect(()=>{load()},[mode,date]);
 async function load(){if(!supabase)return;setLoading(true);try{const salesLoader=(mode==='anio'||mode==='treinta'||mode==='mes')?loadSalesRangeGestoria:loadSalesRange;"""
new="""function UnifiedProfitability(){
 const[mode,setMode]=useState('hoy'),[date,setDate]=useState(today()),[customFrom,setCustomFrom]=useState(monthStartISO(today())),[customTo,setCustomTo]=useState(today()),[state,setState]=useState({tickets:[],lines:[],costMap:new Map(),real:null}),[loading,setLoading]=useState(false),[fixed,setFixed]=useState([]),[variable,setVariable]=useState([]),[detail,setDetail]=useState(null),[selectedTicket,setSelectedTicket]=useState(null),[fixedForm,setFixedForm]=useState({name:'',category:'Alquiler',monthly_amount:'',start_date:today(),end_date:'',notes:'',active:true}),[variableForm,setVariableForm]=useState({name:'',category:'Otros',expense_date:today(),amount:'',payment_method:'Efectivo',notes:''});
 const r=rangeDates(mode,date,customFrom,customTo);const buttons=[['hoy','Hoy'],['ayer','Ayer'],['semana','7 días'],['treinta','30 días'],['mes','Mes'],['anio','Año'],['rango','Rango']];
 const chooseMode=id=>{setMode(id);if(id==='hoy')setDate(today());else if(id==='ayer')setDate(addDays(today(),-1));else if(id==='mes')setDate(today().slice(0,7)+'-01');else if(id==='anio')setDate(today().slice(0,4)+'-01-01');else if(id==='rango'){setCustomFrom(v=>v||monthStartISO(today()));setCustomTo(v=>v||today())}};
 useEffect(()=>{load()},[mode,date,customFrom,customTo]);
 async function load(){if(!supabase)return;setLoading(true);try{const salesLoader=(mode==='anio'||mode==='treinta'||mode==='mes'||mode==='rango')?loadSalesRangeGestoria:loadSalesRange;"""
if old not in app:
    raise SystemExit('UnifiedProfitability header not found')
app=app.replace(old,new,1)

old_controls="""return <div className=\"unifiedProfit\"><div className=\"card hero\"><div><span className=\"sectionEyebrow\">CORE DE RENTABILIDAD · FUENTE ÚNICA</span><h2>Resultado real del negocio</h2><p>{r.label} · {fmtDate(r.from)}{addDays(r.to,-1)!==r.from?` a ${fmtDate(addDays(r.to,-1))}`:''}. El mismo cálculo alimenta Inteligencia, Dashboard y contabilidad.</p></div><div className=\"row controls\">{buttons.map(([id,l])=><button key={id} className={mode===id?'active':''} onClick={()=>chooseMode(id)}>{l}</button>)}<input type=\"date\" value={mode==='ayer'?addDays(today(),-1):mode==='hoy'?today():date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/><button onClick={load}>{loading?'Calculando…':'Actualizar'}</button></div></div>
 <div className=\"grid unifiedProfitKpis\">"""
new_controls="""return <div className=\"unifiedProfit\"><div className=\"card hero\"><div><span className=\"sectionEyebrow\">CORE DE RENTABILIDAD · FUENTE ÚNICA</span><h2>Resultado real del negocio</h2><p>{r.label} · {fmtDate(r.from)}{addDays(r.to,-1)!==r.from?` a ${fmtDate(addDays(r.to,-1))}`:''}. El mismo cálculo alimenta Inteligencia, Dashboard y contabilidad.</p></div><div className=\"row controls resultRealControls\">{buttons.map(([id,l])=><button key={id} className={mode===id?'active':''} onClick={()=>chooseMode(id)}>{l}</button>)}{mode==='rango'?<div className=\"resultRangeFields\"><label>Desde<input type=\"date\" value={customFrom} max={customTo||undefined} onChange={e=>setCustomFrom(e.target.value)}/></label><label>Hasta<input type=\"date\" value={customTo} min={customFrom||undefined} onChange={e=>setCustomTo(e.target.value)}/></label></div>:<input type=\"date\" value={mode==='ayer'?addDays(today(),-1):mode==='hoy'?today():date} onChange={e=>{setDate(e.target.value);setMode('fecha')}}/>}<button onClick={load}>{loading?'Calculando…':'Actualizar'}</button></div></div>
 <div className=\"grid unifiedProfitKpis\">"""
if old_controls not in app:
    raise SystemExit('UnifiedProfitability controls not found')
app=app.replace(old_controls,new_controls,1)

# 2) Componente de analítica. Usa el mismo Core y loadRealProfitability, por tanto personal = cuadrante.
marker='function UnifiedProfitability(){'
component=r'''function pctDelta(current,previous){if(!previous)return current?100:0;return (current-previous)/Math.abs(previous)*100}
function ResultRealAnalytics({range,state,products,real,totalProfit,totalMargin}){
 const[chart,setChart]=useState({loading:true,error:'',points:[],previous:null,step:1});
 const[selected,setSelected]=useState(null);
 useEffect(()=>{load()},[range.from,range.to,state.tickets,state.lines,state.costMap]);
 function expenseDate(row){const raw=row?.hora||row?.created_at||row?.expense_date||row?.fecha||row?.date;return raw?String(raw).slice(0,10):''}
 async function load(){
  if(!supabase){setChart({loading:false,error:'Supabase no configurado',points:[],previous:null,step:1});return}
  const days=Math.max(1,Math.round((new Date(range.to+'T12:00:00')-new Date(range.from+'T12:00:00'))/86400000));
  const step=days<=31?1:days<=180?7:30;
  setChart(c=>({...c,loading:true,error:''}));
  try{
   const ticketDate=new Map((state.tickets||[]).map(t=>[String(t.cab_id),String(t.hora||t.created_at||'').slice(0,10)]));
   const buckets=[];
   for(let from=range.from;from<range.to;from=addDays(from,step)){
    const to=addDays(from,step)<range.to?addDays(from,step):range.to;
    const tickets=(state.tickets||[]).filter(t=>{const d=String(t.hora||t.created_at||'').slice(0,10);return d>=from&&d<to});
    const ids=new Set(tickets.map(t=>String(t.cab_id)));
    const lines=(state.lines||[]).filter(l=>ids.has(String(l.cab_id)));
    const summary=summarizeTickets(tickets),prod=periodFinancials(lines,state.costMap);
    const rr=await loadRealProfitability(supabase,from,to,[]);
    const gRows=(real.details?.numierExpenses||[]).filter(x=>{const d=expenseDate(x);return d>=from&&d<to});
    const numierG=gRows.reduce((a,x)=>a+numierExpenseAmount(x),0);
    const variableERP=Number(rr.variable||0),labor=Number(rr.laborAccrued||0),fixed=Number(rr.fixed||0);
    const profit=summary.total-prod.cost-labor-fixed-variableERP-numierG;
    buckets.push({from,to:addDays(to,-1),label:step===1?new Date(from+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}):`${new Date(from+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}–${new Date(addDays(to,-1)+'T12:00:00').toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'})}`,sales:summary.total,product:prod.cost,labor,fixed,variable:variableERP,numierG,profit,margin:summary.total?profit/summary.total*100:0,tickets:summary.tickets});
   }
   const prevFrom=addDays(range.from,-days),prevTo=range.from;
   const loader=days>7?loadSalesRangeGestoria:loadSalesRange;
   const [prevSales,prevReal]=await Promise.all([loader(prevFrom,prevTo),loadRealProfitability(supabase,prevFrom,prevTo,[])]);
   const prevTickets=(prevSales.tickets||[]).filter(isRealSaleTicket),prevLines=normalizePeriodLines(prevTickets,prevSales.lines||[]),prevSummary=summarizeTickets(prevTickets),prevProducts=periodFinancials(prevLines,state.costMap),prevG=Number(prevSales.numierExpenses?.total||0),prevProfit=prevSummary.total-prevProducts.cost-Number(prevReal.laborAccrued||0)-Number(prevReal.fixed||0)-Number(prevReal.variable||0)-prevG;
   setChart({loading:false,error:'',points:buckets,step,previous:{from:prevFrom,to:addDays(prevTo,-1),sales:prevSummary.total,product:prevProducts.cost,labor:Number(prevReal.laborAccrued||0),fixed:Number(prevReal.fixed||0),variable:Number(prevReal.variable||0)+prevG,profit:prevProfit,margin:prevSummary.total?prevProfit/prevSummary.total*100:0,tickets:prevSummary.tickets}});
  }catch(e){setChart(c=>({...c,loading:false,error:e.message||String(e)}))}
 }
 const prev=chart.previous||{sales:0,profit:0,margin:0,labor:0};
 const salesChange=pctDelta(state.tickets?.length?summarizeTickets(state.tickets).total:0,prev.sales),profitChange=pctDelta(totalProfit,prev.profit),marginChange=totalMargin-prev.margin,laborChange=pctDelta(Number(real.laborAccrued||0),prev.labor);
 const maxProfit=Math.max(1,...chart.points.map(x=>Math.abs(x.profit))),w=Math.max(720,chart.points.length*70),h=260,pad=35,mid=h/2;
 const coords=chart.points.map((p,i)=>({x:pad+(chart.points.length===1?0:(i*(w-pad*2)/(chart.points.length-1))),y:mid-(p.profit/maxProfit)*(mid-45),p}));
 const poly=coords.map(c=>`${c.x},${c.y}`).join(' ');
 const diagnosis=[];
 if(profitChange<-5)diagnosis.push({tone:'bad',title:'Beneficio en retroceso',body:`El beneficio real cae ${Math.abs(profitChange).toFixed(1)}% frente al periodo equivalente anterior.`});
 else diagnosis.push({tone:'ok',title:'Beneficio estable o al alza',body:`El beneficio real varía ${profitChange>=0?'+':''}${profitChange.toFixed(1)}% frente al periodo anterior.`});
 if(salesChange>0&&profitChange<salesChange-5)diagnosis.push({tone:'warn',title:'Las ventas crecen más que el beneficio',body:'Hay presión de costes: revisa producto, personal de cuadrante y gastos del periodo.'});
 if(Number(real.laborAccrued||0)>0){const laborPct=summarizeTickets(state.tickets).total?Number(real.laborAccrued||0)/summarizeTickets(state.tickets).total*100:0;diagnosis.push({tone:laborPct>25?'warn':'info',title:'Peso del personal',body:`El cuadrante representa ${laborPct.toFixed(1)}% de las ventas. Los fichajes no intervienen en este coste.`})}
 if(marginChange<-3)diagnosis.push({tone:'warn',title:'Margen real deteriorado',body:`El margen baja ${Math.abs(marginChange).toFixed(1)} puntos frente al periodo equivalente.`});
 const comparison=[['Ventas',summarizeTickets(state.tickets).total,prev.sales,salesChange,'money'],['Beneficio real',totalProfit,prev.profit,profitChange,'money'],['Margen real',totalMargin,prev.margin,marginChange,'pct'],['Personal cuadrante',Number(real.laborAccrued||0),prev.labor,laborChange,'money']];
 return <section className="resultAnalytics">
  <div className="card resultAnalyticsHead"><div><span className="sectionEyebrow">RESULTADO REAL 2.0 · LECTURA DEL PERIODO</span><h2>Evolución, costes y comparación</h2><p>{chart.step===1?'Detalle diario':chart.step===7?'Agrupado semanalmente':'Agrupado por bloques mensuales'} para mantener una lectura clara del rango.</p></div><button onClick={load} disabled={chart.loading}>{chart.loading?'Calculando…':'Recalcular gráficas'}</button></div>
  {chart.error&&<div className="alertBad">{chart.error}</div>}
  <div className="resultChartGrid">
   <article className="card resultChartCard"><div className="row between"><div><h3>Evolución del beneficio real</h3><p className="mutedText">Pulsa un punto para ver el desglose del día o bloque.</p></div><b className={totalProfit>=0?'ok':'bad'}>{money(totalProfit)}</b></div><div className="resultSvgScroll"><svg className="resultLineChart" viewBox={`0 0 ${w} ${h}`} style={{minWidth:w}}><line x1={pad} y1={mid} x2={w-pad} y2={mid} className="chartZero"/><polyline points={poly} className="chartProfitLine" fill="none"/>{coords.map((c,i)=><g key={i} className="chartPoint" onClick={()=>setSelected(c.p)}><circle cx={c.x} cy={c.y} r="8"/><text x={c.x} y={h-12} textAnchor="middle">{c.p.label}</text></g>)}</svg></div></article>
   <article className="card resultChartCard"><h3>Composición del resultado</h3><p className="mutedText">Costes reales por bloque. Personal procede del cuadrante.</p><div className="compositionList">{chart.points.map((p,i)=>{const total=Math.max(1,p.product+p.labor+p.fixed+p.variable+p.numierG);return <button key={i} className="compositionRow" onClick={()=>setSelected(p)}><span className="compositionLabel"><b>{p.label}</b><small>{money(p.sales)} ventas · {money(p.profit)} beneficio</small></span><span className="compositionBar"><i className="compProduct" style={{width:`${p.product/total*100}%`}}/><i className="compLabor" style={{width:`${p.labor/total*100}%`}}/><i className="compFixed" style={{width:`${p.fixed/total*100}%`}}/><i className="compVariable" style={{width:`${(p.variable+p.numierG)/total*100}%`}}/></span></button>})}</div><div className="compositionLegend"><span>Producto</span><span>Personal</span><span>Fijos</span><span>Variables/G</span></div></article>
  </div>
  <div className="card resultComparison"><div className="row between"><div><h3>Comparación con periodo equivalente anterior</h3><p className="mutedText">{prev.from&&`${fmtDate(prev.from)} a ${fmtDate(prev.to)}`}</p></div></div><div className="comparisonKpis">{comparison.map(([name,current,previous,delta,type])=><button key={name} onClick={()=>setSelected({label:name,sales:name==='Ventas'?current:summarizeTickets(state.tickets).total,product:products.cost,labor:Number(real.laborAccrued||0),fixed:Number(real.fixed||0),variable:Number(real.variable||0),numierG:Number(real.numierExpenses||0),profit:totalProfit,margin:totalMargin,tickets:summarizeTickets(state.tickets).tickets,comparison:{previous,delta,type}})}><span>{name}</span><b>{type==='pct'?`${Number(current).toFixed(1)}%`:money(current)}</b><small className={delta>=0?'ok':'bad'}>{delta>=0?'+':''}{Number(delta).toFixed(1)}{type==='pct'?' pt':'%'} vs anterior</small></button>)}</div></div>
  <div className="card resultDiagnosis"><div><span className="sectionEyebrow">INTERPRETACIÓN AUTOMÁTICA</span><h3>Qué está ocurriendo en este periodo</h3></div><div className="diagnosisGrid">{diagnosis.slice(0,4).map((d,i)=><button key={i} className={d.tone} onClick={()=>setSelected({label:d.title,diagnosis:d.body,sales:summarizeTickets(state.tickets).total,product:products.cost,labor:Number(real.laborAccrued||0),fixed:Number(real.fixed||0),variable:Number(real.variable||0),numierG:Number(real.numierExpenses||0),profit:totalProfit,margin:totalMargin,tickets:summarizeTickets(state.tickets).tickets})}><b>{d.title}</b><span>{d.body}</span><small>Ver cifras ›</small></button>)}</div></div>
  {selected&&<div className="modal resultChartOverlay" onClick={()=>setSelected(null)}><div className="card resultChartModal" onClick={e=>e.stopPropagation()}><div className="row between"><div><span className="sectionEyebrow">DETALLE DEL RESULTADO</span><h2>{selected.label}</h2>{selected.from&&<p>{fmtDate(selected.from)}{selected.to!==selected.from?` a ${fmtDate(selected.to)}`:''}</p>}</div><button className="red" onClick={()=>setSelected(null)}>Cerrar</button></div>{selected.diagnosis&&<div className="resultDiagnosisText">{selected.diagnosis}</div>}<div className="weeklyPerfDetail"><p><span>Ventas</span><b>{money(selected.sales)}</b></p><p><span>Coste productos</span><b>{money(selected.product)}</b></p><p><span>Personal · cuadrante</span><b>{money(selected.labor)}</b></p><p><span>Gastos fijos</span><b>{money(selected.fixed)}</b></p><p><span>Variables + G</span><b>{money(Number(selected.variable||0)+Number(selected.numierG||0))}</b></p><p><span>Beneficio real</span><b className={selected.profit>=0?'ok':'bad'}>{money(selected.profit)}</b></p><p><span>Margen real</span><b>{Number(selected.margin||0).toFixed(1)}%</b></p>{selected.comparison&&<p><span>Periodo anterior</span><b>{selected.comparison.type==='pct'?`${Number(selected.comparison.previous).toFixed(1)}%`:money(selected.comparison.previous)}</b></p>}</div></div></div>}
 </section>
}

'''
if marker not in app:
    raise SystemExit('UnifiedProfitability marker not found')
app=app.replace(marker,component+marker,1)

# 3) Insertar analítica justo después de KPIs, antes de formularios.
needle=""" <div className=\"grid unifiedProfitKpis\">{kpi('ventas','Ventas',money(daily.total),`${daily.tickets} tickets · ${money(daily.ticket_medio)} medio`)}{kpi('productos','Coste productos',money(products.cost),`${money(products.estimatedRevenue)} con coste 1/3 estimado`)}{kpi('personal','Personal devengado',money(real.laborAccrued),`${Number(real.hours||0).toFixed(1)} h · coste individual`)}{kpi('fijos','Gastos fijos',money(real.fixed),'Prorrateados por días naturales')}{kpi('variables','Gastos variables',money(real.variable),'Movimientos del periodo')}{kpi('bruto','Margen bruto',money(gross),'Ventas menos producto')}{kpi('operativo','Margen operativo',money(operating),'Después de personal')}{kpi('beneficio','Beneficio real',money(profit),`${margin.toFixed(1)}% sobre ventas`,'realProfitKpi')}</div>
 <div className=\"grid unifiedProfitForms\">"""
replacement=needle.replace('\n <div className="grid unifiedProfitForms">','\n <ResultRealAnalytics range={r} state={state} products={products} real={real} totalProfit={profit} totalMargin={margin}/>\n <div className="grid unifiedProfitForms">')
if needle not in app:
    raise SystemExit('KPI insertion point not found')
app=app.replace(needle,replacement,1)

# 4) CSS responsive/alto contraste.
css += r'''

/* COLIBRI ERP 5.2.0 · Resultado real 2.0 */
.resultRealControls{max-width:760px;justify-content:flex-end}.resultRangeFields{display:flex;gap:8px;align-items:end}.resultRangeFields label{display:grid;gap:4px;font-size:.78rem;font-weight:900;color:#41556b}.resultRangeFields input{min-width:145px}.resultAnalytics{margin:18px 0}.resultAnalyticsHead{display:flex;align-items:center;justify-content:space-between;gap:16px}.resultAnalyticsHead h2,.resultChartCard h3,.resultComparison h3,.resultDiagnosis h3{margin:.2rem 0;color:#28246f}.resultAnalyticsHead p,.resultChartCard p{margin:.25rem 0}.resultChartGrid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:16px}.resultChartCard{min-width:0}.resultSvgScroll{overflow-x:auto;-webkit-overflow-scrolling:touch;padding:8px 0}.resultLineChart{width:100%;height:260px;display:block}.chartZero{stroke:#ccd9df;stroke-width:2;stroke-dasharray:5 5}.chartProfitLine{stroke:#0d8b78;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.chartPoint{cursor:pointer}.chartPoint circle{fill:#fff;stroke:#0d8b78;stroke-width:5}.chartPoint text{fill:#526678;font-size:12px;font-weight:800}.compositionList{display:grid;gap:9px;max-height:290px;overflow:auto}.compositionRow{display:grid;grid-template-columns:125px 1fr;gap:10px;align-items:center;background:#f7fbfc;color:#26394d;text-align:left;padding:9px;border:1px solid #dce8ec;border-radius:13px}.compositionLabel b,.compositionLabel small{display:block}.compositionLabel small{font-size:.72rem;color:#667887;margin-top:2px}.compositionBar{height:20px;display:flex;background:#edf3f5;border-radius:999px;overflow:hidden}.compositionBar i{display:block;height:100%}.compProduct{background:#2b9db7}.compLabor{background:#7d63b8}.compFixed{background:#d29a36}.compVariable{background:#c55d61}.compositionLegend{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;color:#536878;font-size:.75rem;font-weight:800}.comparisonKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.comparisonKpis button,.diagnosisGrid button{background:#fff;color:#26394d;border:1px solid #d9e5e8;text-align:left;box-shadow:0 5px 15px rgba(29,67,78,.06)}.comparisonKpis button span,.comparisonKpis button b,.comparisonKpis button small{display:block}.comparisonKpis button b{font-size:1.5rem;color:#087b69;margin:5px 0}.comparisonKpis button small.ok{color:#087b69}.comparisonKpis button small.bad{color:#b33131}.diagnosisGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.diagnosisGrid button{display:grid;gap:6px}.diagnosisGrid button span{font-weight:650;line-height:1.35}.diagnosisGrid button small{font-weight:900;color:#28246f}.diagnosisGrid button.bad{border-left:5px solid #b33131}.diagnosisGrid button.warn{border-left:5px solid #c88718}.diagnosisGrid button.ok{border-left:5px solid #087b69}.diagnosisGrid button.info{border-left:5px solid #2b78b8}.resultChartOverlay{z-index:130}.resultChartModal{width:min(720px,calc(100vw - 28px));max-height:90dvh;overflow:auto;background:#fff!important;color:#17253a!important}.resultDiagnosisText{padding:12px 14px;border-radius:14px;background:#f2f7fa;color:#33485c;font-weight:750;margin:10px 0}.resultChartModal .weeklyPerfDetail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.resultChartModal .weeklyPerfDetail p{background:#f7fafb;border:1px solid #e0e9ec;border-radius:13px;padding:12px;margin:0}.resultChartModal .weeklyPerfDetail span,.resultChartModal .weeklyPerfDetail b{display:block}.resultChartModal .weeklyPerfDetail span{color:#627487;font-size:.8rem;font-weight:850}.resultChartModal .weeklyPerfDetail b{color:#17253a;font-size:1.08rem;margin-top:4px}.resultChartModal .weeklyPerfDetail b.ok{color:#087b69}.resultChartModal .weeklyPerfDetail b.bad{color:#b33131}
@media(max-width:900px){.resultChartGrid{grid-template-columns:1fr}.comparisonKpis{grid-template-columns:1fr 1fr}.resultAnalyticsHead{display:block}.resultAnalyticsHead button{margin-top:10px}.resultRealControls{width:100%;display:grid!important;grid-template-columns:1fr 1fr!important}.resultRealControls>button,.resultRealControls>input{width:100%!important}.resultRangeFields{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;width:100%}.resultRangeFields input{min-width:0;width:100%}}
@media(max-width:560px){.comparisonKpis,.diagnosisGrid,.resultChartModal .weeklyPerfDetail{grid-template-columns:1fr}.compositionRow{grid-template-columns:105px 1fr}.resultRangeFields{grid-template-columns:1fr}.resultRealControls{grid-template-columns:1fr 1fr!important}.resultRealControls>button:last-child{grid-column:1/-1}.resultLineChart{height:230px}}
'''

app_path.write_text(app)
css_path.write_text(css)

for p in ['package.json','package-lock.json']:
    path=Path(p)
    data=json.loads(path.read_text())
    data['version']='5.2.0'
    if p.endswith('lock.json') and isinstance(data.get('packages'),dict) and '' in data['packages']:
        data['packages']['']['version']='5.2.0'
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

print('Applied COLIBRI ERP 5.2.0 Resultado real analytics')
