import { useState } from 'react';
import { api } from '../lib/api.js';
import { calcShift, formatHours, formatKr, shiftMinutes } from '../lib/pay.js';
import Sheet from './Sheet.jsx';

const COLORS = ['#0f766e', '#d97706', '#4f46e5', '#db2777', '#475569', '#16a34a'];

const PRESETS = [
  { label: 'Kveldstillegg', amount: 30, from: '18:00', to: '', days: 'all' },
  { label: 'Helgetillegg', amount: 50, from: '', to: '', days: 'weekend' },
  { label: 'Nattillegg', amount: 40, from: '21:00', to: '06:00', days: 'all' },
];

const EMPTY = { name: '', start_time: '08:00', end_time: '16:00', color: COLORS[0], bonuses: [] };

export default function TemplatesView({ templates, profile, reload }) {
  const [editing, setEditing] = useState(null);
  const wage = Number(profile.hourly_wage) || 0;

  return (
    <div className="page">
      <h1>Vakter</h1>
      <p className="muted">Maler du trykker på i kalenderen. Tilleggene regnes automatisk ut fra klokkeslett og ukedag.</p>

      <div className="stack">
        {templates.map((t) => (
          <button key={t.id} className="card template-card" style={{ '--c': t.color }} onClick={() => setEditing(t)}>
            <div className="grow">
              <strong>{t.name}</strong>
              <div className="muted small">
                {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)} · {formatHours(shiftMinutes(t.start_time, t.end_time) / 60)}
              </div>
              {t.bonuses?.length > 0 && (
                <div className="chips">
                  {t.bonuses.map((b, i) => <span key={i} className="chip">{describeRule(b)}</span>)}
                </div>
              )}
            </div>
            <span className="chev">›</span>
          </button>
        ))}
      </div>

      <button className="btn primary big" onClick={() => setEditing({ ...EMPTY, name: templates.length === 0 ? 'Dagvakt' : '' })}>
        + Ny vakt
      </button>

      {editing && (
        <TemplateEditor initial={editing} wage={wage} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

export function describeRule(b) {
  const amount = `+${b.amount} kr/t`;
  const days = b.days === 'weekend' ? 'helg' : b.days === 'weekday' ? 'hverdager' : '';
  let time = '';
  if (b.from && b.to) time = `${b.from}–${b.to}`;
  else if (b.from) time = `etter ${b.from}`;
  else if (b.to) time = `før ${b.to}`;
  return [b.label, amount, [time, days].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
}

function TemplateEditor({ initial, wage, onClose, onSaved }) {
  const [t, setT] = useState({ ...initial, bonuses: (initial.bonuses || []).map((b) => ({ ...b })) });
  const [error, setError] = useState('');
  const set = (patch) => setT((prev) => ({ ...prev, ...patch }));
  const setBonus = (i, patch) => set({ bonuses: t.bonuses.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const hours = shiftMinutes(t.start_time, t.end_time) / 60;
  const weekday = calcShift({ ...t, date: '2026-11-11' }, wage).gross; // onsdag
  const saturday = calcShift({ ...t, date: '2026-11-14' }, wage).gross; // lørdag

  async function save() {
    if (!t.name.trim()) return setError('Gi vakten et navn.');
    if (t.start_time === t.end_time) return setError('Start og slutt kan ikke være likt.');
    try {
      await api.saveTemplate({
        id: t.id, name: t.name.trim(), start_time: t.start_time, end_time: t.end_time, color: t.color,
        bonuses: t.bonuses.map((b) => ({ ...b, amount: Number(b.amount) || 0 })),
      });
      onSaved();
    } catch (e) { setError(e.message); }
  }
  async function remove() {
    if (!confirm(`Slette «${t.name}»? Vakter som allerede er lagt inn blir værende.`)) return;
    await api.deleteTemplate(t.id);
    onSaved();
  }

  return (
    <Sheet title={t.id ? 'Rediger vakt' : 'Ny vakt'} onClose={onClose}>
      <div className="stack">
        <label>Navn
          <input value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Dagvakt, Kveldsvakt …" />
        </label>
        <div className="row">
          <label className="grow">Start
            <input type="time" value={t.start_time.slice(0, 5)} onChange={(e) => set({ start_time: e.target.value })} />
          </label>
          <label className="grow">Slutt
            <input type="time" value={t.end_time.slice(0, 5)} onChange={(e) => set({ end_time: e.target.value })} />
          </label>
        </div>
        <p className="muted small">
          {formatHours(hours)} totalt{t.end_time <= t.start_time ? ' (slutter neste dag)' : ''}
        </p>

        <div className="colors">
          {COLORS.map((c) => (
            <button key={c} className={`swatch ${t.color === c ? 'on' : ''}`} style={{ background: c }}
              onClick={() => set({ color: c })} aria-label={`Farge ${c}`} />
          ))}
        </div>

        <h3 className="section-title">Tillegg</h3>
        {t.bonuses.map((b, i) => (
          <div key={i} className="bonus-card">
            <div className="row">
              <input className="grow" value={b.label} onChange={(e) => setBonus(i, { label: e.target.value })} placeholder="Navn" />
              <button className="icon-btn" onClick={() => set({ bonuses: t.bonuses.filter((_, j) => j !== i) })} aria-label="Fjern tillegg">✕</button>
            </div>
            <div className="row">
              <label className="grow">kr per time
                <input type="number" inputMode="decimal" value={b.amount} onChange={(e) => setBonus(i, { amount: e.target.value })} />
              </label>
              <label className="grow">Gjelder
                <select value={b.days} onChange={(e) => setBonus(i, { days: e.target.value })}>
                  <option value="all">Alle dager</option>
                  <option value="weekend">Lørdag og søndag</option>
                  <option value="weekday">Bare hverdager</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label className="grow">Fra kl.
                <input type="time" value={b.from} onChange={(e) => setBonus(i, { from: e.target.value })} />
              </label>
              <label className="grow">Til kl.
                <input type="time" value={b.to} onChange={(e) => setBonus(i, { to: e.target.value })} />
              </label>
            </div>
            <p className="muted tiny">Tomt felt = hele døgnet. Bare timene i vakten som faller innenfor, får tillegg.</p>
          </div>
        ))}
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.label} className="chip add" onClick={() => set({ bonuses: [...t.bonuses, { ...p }] })}>+ {p.label}</button>
          ))}
          <button className="chip add" onClick={() => set({ bonuses: [...t.bonuses, { label: 'Tillegg', amount: 0, from: '', to: '', days: 'all' }] })}>+ Annet</button>
        </div>

        {wage > 0 && (
          <div className="preview">
            Én slik vakt gir ca. <strong>{formatKr(weekday)}</strong> på en hverdag
            {saturday !== weekday && <> og <strong>{formatKr(saturday)}</strong> på en lørdag</>} (brutto).
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn primary big" onClick={save}>Lagre</button>
        {t.id && <button className="btn ghost danger" onClick={remove}>Slett vakt</button>}
      </div>
    </Sheet>
  );
}
