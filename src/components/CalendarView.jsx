import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { calcMonth, calcShift, formatKr, formatHours, taxRateFor, toISODate, isWeekend } from '../lib/pay.js';
import Sheet from './Sheet.jsx';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WEEKDAYS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAY_NAMES = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

export default function CalendarView({ profile, templates, taxRates, goTo }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0–11
  const [shifts, setShifts] = useState([]);
  const [selected, setSelected] = useState(null); // ISO-dato
  const [showPay, setShowPay] = useState(false);

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const from = toISODate(first);
  const to = toISODate(last);
  const yearMonth = from.slice(0, 7);

  async function load() {
    setShifts(await api.listShifts(from, to));
  }
  useEffect(() => { load(); }, [from]);

  function step(delta) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const byDate = useMemo(() => {
    const m = {};
    for (const s of shifts) (m[s.date] ||= []).push(s);
    return m;
  }, [shifts]);

  // Rutenett som starter på mandag
  const cells = [];
  const offset = (first.getDay() + 6) % 7;
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(toISODate(new Date(year, month, d)));

  const todayISO = toISODate(today);
  const wage = Number(profile.hourly_wage) || 0;
  const taxPercent = taxRateFor(taxRates, yearMonth);
  const summary = calcMonth(shifts, wage, taxPercent);
  const needsSetup = !wage || templates.length === 0 || taxRates.length === 0;

  async function addShift(date, t) {
    await api.addShift({
      date,
      template_id: t.id,
      name: t.name,
      color: t.color,
      start_time: t.start_time,
      end_time: t.end_time,
      bonuses: t.bonuses || [],
    });
    load();
  }
  async function removeShift(id) {
    await api.deleteShift(id);
    load();
  }

  return (
    <div className="calendar-view">
      <header className="month-head">
        <button className="icon-btn" onClick={() => step(-1)} aria-label="Forrige måned">‹</button>
        <h1>{MONTHS[month]} <span className="muted">{year}</span></h1>
        <button className="icon-btn" onClick={() => step(1)} aria-label="Neste måned">›</button>
      </header>

      {needsSetup && (
        <div className="setup-card">
          <strong>Kom i gang</strong>
          <ul>
            {!wage && <li><button className="link" onClick={() => goTo('settings')}>Legg inn timelønn</button></li>}
            {taxRates.length === 0 && <li><button className="link" onClick={() => goTo('settings')}>Legg inn skatteprosent</button></li>}
            {templates.length === 0 && <li><button className="link" onClick={() => goTo('templates')}>Lag din første vakt (f.eks. Dagvakt)</button></li>}
          </ul>
        </div>
      )}

      <div className="grid weekdays">
        {WEEKDAYS.map((w, i) => <div key={w} className={i >= 5 ? 'weekend' : ''}>{w}</div>)}
      </div>
      <div className="grid days">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} />;
          const dayShifts = byDate[iso] || [];
          return (
            <button key={iso}
              className={`day ${iso === todayISO ? 'today' : ''} ${isWeekend(iso) ? 'weekend' : ''} ${dayShifts.length ? 'has' : ''}`}
              onClick={() => setSelected(iso)}>
              <span className="num">{Number(iso.slice(8))}</span>
              {dayShifts.map((s) => (
                <span key={s.id} className="pill" style={{ background: s.color }}>{shortName(s.name)}</span>
              ))}
            </button>
          );
        })}
      </div>

      <div className="month-stats">
        <span>{summary.shiftCount} vakter</span>
        <span>·</span>
        <span>{formatHours(summary.hours)}</span>
      </div>

      <button className="btn primary big pay-btn" onClick={() => setShowPay(true)}>
        Sjekk lønn etter skatt
      </button>

      {selected && (
        <DaySheet date={selected} shifts={byDate[selected] || []} templates={templates} wage={wage}
          onAdd={(t) => addShift(selected, t)} onRemove={removeShift}
          onClose={() => setSelected(null)} goTo={goTo} />
      )}

      {showPay && (
        <PaySheet monthName={MONTHS[month]} nextMonthName={MONTHS[(month + 1) % 12]} year={year}
          summary={summary} hasTax={taxRates.length > 0}
          onClose={() => setShowPay(false)} goTo={goTo} />
      )}
    </div>
  );
}

function shortName(name) {
  return name.length <= 5 ? name : name.slice(0, 4) + '.';
}

function DaySheet({ date, shifts, templates, wage, onAdd, onRemove, onClose, goTo }) {
  const d = new Date(date + 'T12:00');
  const title = `${DAY_NAMES[d.getDay()]} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
  return (
    <Sheet title={title[0].toUpperCase() + title.slice(1)} onClose={onClose}>
      {shifts.length > 0 && (
        <div className="stack">
          {shifts.map((s) => {
            const r = calcShift(s, wage);
            return (
              <div key={s.id} className="shift-row" style={{ borderColor: s.color }}>
                <div>
                  <strong>{s.name}</strong>
                  <div className="muted small">{s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} · {formatHours(r.hours)} · {formatKr(r.gross)} brutto</div>
                </div>
                <button className="btn ghost danger" onClick={() => onRemove(s.id)}>Fjern</button>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="section-title">Legg til vakt</h3>
      {templates.length === 0 ? (
        <p className="muted">Du har ingen vakter ennå. <button className="link" onClick={() => goTo('templates')}>Lag en vakt</button></p>
      ) : (
        <div className="stack">
          {templates.map((t) => {
            const r = calcShift({ ...t, date }, wage);
            return (
              <button key={t.id} className="template-btn" style={{ '--c': t.color }} onClick={() => { onAdd(t); onClose(); }}>
                <span className="plus">+</span>
                <span className="grow">
                  <strong>{t.name}</strong>
                  <span className="muted small"> {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)}</span>
                </span>
                <span className="small">{formatKr(r.gross)}</span>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function PaySheet({ monthName, nextMonthName, year, summary, hasTax, onClose, goTo }) {
  return (
    <Sheet title={`Lønn for ${monthName} ${year}`} onClose={onClose}>
      <div className="net-box">
        <span className="muted small">Etter skatt</span>
        <span className="net">{formatKr(summary.net)}</span>
      </div>

      <table className="breakdown">
        <tbody>
          <tr><td>{summary.shiftCount} vakter, {formatHours(summary.hours)}</td><td>{formatKr(summary.base)}</td></tr>
          {summary.bonuses.map((b) => (
            <tr key={b.label}><td>{b.label} ({formatHours(b.hours)})</td><td>+ {formatKr(b.amount)}</td></tr>
          ))}
          <tr className="sum"><td>Brutto</td><td>{formatKr(summary.gross)}</td></tr>
          <tr><td>Skatt ({summary.taxPercent.toLocaleString('nb-NO')} %)</td><td>− {formatKr(summary.tax)}</td></tr>
          <tr className="sum big"><td>Netto</td><td>{formatKr(summary.net)}</td></tr>
        </tbody>
      </table>

      {!hasTax && <p className="error small">Ingen skatteprosent er lagt inn – netto er lik brutto.</p>}
      <p className="muted small">
        Vakter jobbet i {monthName}. Mange arbeidsgivere betaler dette ut i {nextMonthName}.
      </p>
      <button className="btn ghost" onClick={() => { onClose(); goTo('settings'); }}>Endre skatteprosent</button>
    </Sheet>
  );
}
