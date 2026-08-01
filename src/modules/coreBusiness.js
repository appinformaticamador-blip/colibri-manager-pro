export const DEFAULT_HOURLY_COST = 7;

export function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function employeeKey(employee) {
  return String(employee?.id || employee?.employee_id || '').trim();
}

export function normalizedName(value) {
  return String(value || '').trim().toLocaleLowerCase('es-ES').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function recordBelongsToEmployee(record, employee) {
  const id = employeeKey(employee);
  const recordId = String(record?.employee_id || '').trim();
  if (id && recordId && id === recordId) return true;
  return normalizedName(record?.employee_name) === normalizedName(employee?.name || employee?.employee_name);
}

export function hourlyCost(employee) {
  return Math.max(0, asNumber(employee?.hourly_rate ?? employee?.hourly_cost, DEFAULT_HOURLY_COST)) || DEFAULT_HOURLY_COST;
}

export function buildClockSessions(records, employee = null, now = new Date()) {
  const rows = (records || [])
    .filter((row) => !employee || recordBelongsToEmployee(row, employee))
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const sessions = [];
  const anomalies = [];
  let open = null;

  for (const row of rows) {
    const type = String(row?.type || '').toLowerCase();
    if (type === 'entrada') {
      if (open) {
        anomalies.push({ type: 'duplicate_entry', record: row, openRecord: open });
        continue;
      }
      open = row;
      continue;
    }
    if (type === 'salida') {
      if (!open) {
        anomalies.push({ type: 'orphan_exit', record: row });
        continue;
      }
      const start = new Date(open.created_at);
      const end = new Date(row.created_at);
      if (end < start) {
        anomalies.push({ type: 'exit_before_entry', record: row, openRecord: open });
        continue;
      }
      sessions.push({ start: open, end: row, open: false, minutes: Math.max(0, Math.round((end - start) / 60000)) });
      open = null;
    }
  }
  if (open) {
    const end = now instanceof Date ? now : new Date(now);
    sessions.push({ start: open, end: null, open: true, minutes: Math.max(0, Math.round((end - new Date(open.created_at)) / 60000)) });
  }
  return { sessions, openSession: sessions.find((session) => session.open) || null, anomalies };
}

export function laborFromClockRecords(records, employees, from, to, now = new Date()) {
  const start = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const finish = new Date(`${String(to).slice(0, 10)}T00:00:00`);
  const details = [];
  let hours = 0;
  let cost = 0;

  for (const employee of employees || []) {
    const { sessions, anomalies, openSession } = buildClockSessions(records, employee, now);
    let minutes = 0;
    for (const session of sessions) {
      if (!session.start) continue;
      const sessionStart = new Date(session.start.created_at);
      const sessionEnd = session.end ? new Date(session.end.created_at) : now;
      const clippedStart = sessionStart < start ? start : sessionStart;
      const clippedEnd = sessionEnd > finish ? finish : sessionEnd;
      if (clippedEnd > clippedStart) minutes += Math.round((clippedEnd - clippedStart) / 60000);
    }
    const employeeHours = minutes / 60;
    const rate = hourlyCost(employee);
    const employeeCost = employeeHours * rate;
    hours += employeeHours;
    cost += employeeCost;
    if (minutes || anomalies.length || openSession) details.push({
      employee_id: employee.id,
      employee_name: employee.name,
      minutes,
      hours: employeeHours,
      hourly_cost: rate,
      cost: employeeCost,
      open: Boolean(openSession),
      anomalies
    });
  }
  return { hours, cost, details };
}

export function calculateProfitability({ revenue = 0, productCost = 0, laborCost = 0, fixedExpenses = 0, variableExpenses = 0 } = {}) {
  const sales = asNumber(revenue);
  const products = asNumber(productCost);
  const labor = asNumber(laborCost);
  const fixed = asNumber(fixedExpenses);
  const variable = asNumber(variableExpenses);
  const grossMargin = sales - products;
  const operatingMargin = grossMargin - labor;
  const realProfit = operatingMargin - fixed - variable;
  return {
    revenue: sales,
    productCost: products,
    laborCost: labor,
    fixedExpenses: fixed,
    variableExpenses: variable,
    grossMargin,
    operatingMargin,
    realProfit,
    grossMarginPct: sales ? (grossMargin / sales) * 100 : 0,
    operatingMarginPct: sales ? (operatingMargin / sales) * 100 : 0,
    realMarginPct: sales ? (realProfit / sales) * 100 : 0
  };
}
