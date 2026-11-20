// Ren lønnsberegning – ingen avhengigheter, lett å teste.
//
// Et skift:  { date: 'YYYY-MM-DD', start_time: 'HH:MM', end_time: 'HH:MM', bonuses: [rule] }
// En tilleggsregel (rule):
//   { label: 'Kveld', amount: 30, from: '18:00', to: '', days: 'all' | 'weekend' | 'weekday' }
//   - amount: kr per time
//   - from/to: tidsvindu. Tom 'from' = fra midnatt, tom 'to' = til midnatt.
//     Hvis to < from (f.eks. 21:00–06:00) går vinduet over midnatt.
//   - days: hvilke dager regelen gjelder

const DAY = 24 * 60;

export function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function isWeekend(iso) {
  const day = parseDate(iso).getDay();
  return day === 0 || day === 6;
}

// Del skiftet opp per kalenderdag (nattevakter krysser midnatt).
export function shiftSegments(date, start, end) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e > s) return [{ date, from: s, to: e }];
  // slutt <= start → skiftet slutter neste dag
  const segs = [{ date, from: s, to: DAY }];
  if (e > 0) segs.push({ date: addDays(date, 1), from: 0, to: e });
  return segs;
}

export function shiftMinutes(start, end) {
  return shiftSegments('2000-01-03', start, end).reduce((sum, seg) => sum + (seg.to - seg.from), 0);
}

function ruleWindows(rule) {
  const from = toMinutes(rule.from) ?? 0;
  const to = toMinutes(rule.to) ?? DAY;
  if (to > from) return [[from, to]];
  if (to === from) return [[0, DAY]];
  return [[from, DAY], [0, to]]; // over midnatt
}

function dayMatches(rule, iso) {
  const days = rule.days || 'all';
  if (days === 'all') return true;
  return days === 'weekend' ? isWeekend(iso) : !isWeekend(iso);
}

export function ruleMinutes(rule, segments) {
  let total = 0;
  for (const seg of segments) {
    if (!dayMatches(rule, seg.date)) continue;
    for (const [wf, wt] of ruleWindows(rule)) {
      total += Math.max(0, Math.min(seg.to, wt) - Math.max(seg.from, wf));
    }
  }
  return total;
}

export function calcShift(shift, hourlyWage) {
  const segments = shiftSegments(shift.date, shift.start_time, shift.end_time);
  const minutes = segments.reduce((s, seg) => s + (seg.to - seg.from), 0);
  const hours = minutes / 60;
  const base = hours * hourlyWage;
  const bonuses = (shift.bonuses || [])
    .map((rule) => {
      const h = ruleMinutes(rule, segments) / 60;
      return { label: rule.label || 'Tillegg', hours: h, amount: h * Number(rule.amount || 0) };
    })
    .filter((b) => b.hours > 0);
  const gross = base + bonuses.reduce((s, b) => s + b.amount, 0);
  return { hours, base, bonuses, gross };
}

// Skatteprosent som gjelder for en måned ('YYYY-MM').
// rates: [{ valid_from: 'YYYY-MM-DD', percent }]
export function taxRateFor(rates, yearMonth) {
  if (!rates || rates.length === 0) return 0;
  const sorted = [...rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const monthStart = `${yearMonth}-01`;
  let current = sorted[0];
  for (const r of sorted) if (r.valid_from <= monthStart) current = r;
  return Number(current.percent);
}

export function calcMonth(shifts, hourlyWage, taxPercent) {
  let hours = 0;
  let base = 0;
  const bonusMap = new Map();
  for (const shift of shifts) {
    const r = calcShift(shift, hourlyWage);
    hours += r.hours;
    base += r.base;
    for (const b of r.bonuses) {
      const prev = bonusMap.get(b.label) || { label: b.label, hours: 0, amount: 0 };
      prev.hours += b.hours;
      prev.amount += b.amount;
      bonusMap.set(b.label, prev);
    }
  }
  const bonuses = [...bonusMap.values()];
  const gross = base + bonuses.reduce((s, b) => s + b.amount, 0);
  const tax = gross * (taxPercent / 100);
  return { shiftCount: shifts.length, hours, base, bonuses, gross, taxPercent, tax, net: gross - tax };
}

// Regn ut skatteprosent fra lønnsslippen: skattetrekk / brutto.
export function taxPercentFromPayslip(gross, withheld) {
  if (!gross || gross <= 0) return null;
  return Math.round((withheld / gross) * 1000) / 10; // én desimal
}

const kr = new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 });
export const formatKr = (n) => kr.format(Math.round(n));
export const formatHours = (h) => `${Number(h.toFixed(2)).toLocaleString('nb-NO')} t`;
