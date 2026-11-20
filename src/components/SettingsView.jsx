import { useState } from 'react';
import { api } from '../lib/api.js';
import { taxRateFor, taxPercentFromPayslip, toISODate } from '../lib/pay.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const monthLabel = (iso) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

export default function SettingsView({ profile, taxRates, reload }) {
  return (
    <div className="page">
      <h1>Innstillinger</h1>
      <ProfileCard profile={profile} reload={reload} />
      <TaxCard taxRates={taxRates} reload={reload} />
      <CalendarFeedCard profile={profile} />
      <button className="btn ghost" onClick={() => api.signOut()}>Logg ut</button>
    </div>
  );
}

function ProfileCard({ profile, reload }) {
  const [name, setName] = useState(profile.display_name || '');
  const [wage, setWage] = useState(profile.hourly_wage || '');
  const [saved, setSaved] = useState(false);
  const dirty = name !== (profile.display_name || '') || Number(wage) !== Number(profile.hourly_wage || 0);

  async function save() {
    await api.updateProfile({ display_name: name.trim(), hourly_wage: Number(String(wage).replace(',', '.')) || 0 });
    await reload();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className="card stack">
      <h2>Deg</h2>
      <label>Navn
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>Timelønn (kr)
        <input type="text" inputMode="decimal" value={wage} onChange={(e) => setWage(e.target.value)} placeholder="f.eks. 215" />
      </label>
      <button className="btn primary" disabled={!dirty} onClick={save}>{saved ? 'Lagret ✓' : 'Lagre'}</button>
    </section>
  );
}

function TaxCard({ taxRates, reload }) {
  const thisMonth = toISODate(new Date()).slice(0, 7);
  const current = taxRates.length ? taxRateFor(taxRates, thisMonth) : null;
  const [percent, setPercent] = useState('');
  const [from, setFrom] = useState(thisMonth);
  const [showCalc, setShowCalc] = useState(false);
  const [gross, setGross] = useState('');
  const [withheld, setWithheld] = useState('');
  const num = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));
  const calculated = taxPercentFromPayslip(num(gross), num(withheld));

  async function save() {
    const p = num(percent);
    if (!(p >= 0 && p < 100)) return;
    await api.saveTaxRate({ valid_from: `${from}-01`, percent: p });
    setPercent('');
    reload();
  }

  return (
    <section className="card stack">
      <h2>Skatt</h2>
      <div className="big-number">
        {current === null ? <span className="muted">Ikke satt</span> : <>{current.toLocaleString('nb-NO')} %</>}
        <span className="muted small"> gjelder nå</span>
      </div>

      <div className="row">
        <label className="grow">Ny prosent
          <input type="text" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} placeholder="f.eks. 28,5" />
        </label>
        <label className="grow">Gjelder fra
          <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
      </div>
      <button className="btn primary" onClick={save} disabled={percent === ''}>Lagre skatteprosent</button>

      <button className="link" onClick={() => setShowCalc(!showCalc)}>
        {showCalc ? 'Skjul kalkulator' : 'Usikker? Regn ut fra lønnsslippen'}
      </button>
      {showCalc && (
        <div className="calc stack">
          <p className="muted small">Finn «brutto» og «forskuddstrekk/skattetrekk» på siste lønnsslipp.</p>
          <div className="row">
            <label className="grow">Brutto (kr)
              <input type="text" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
            </label>
            <label className="grow">Skattetrekk (kr)
              <input type="text" inputMode="decimal" value={withheld} onChange={(e) => setWithheld(e.target.value)} />
            </label>
          </div>
          {calculated !== null && (
            <button className="btn" onClick={() => { setPercent(String(calculated).replace('.', ',')); setShowCalc(false); }}>
              = {calculated.toLocaleString('nb-NO')} % → bruk denne
            </button>
          )}
        </div>
      )}

      {taxRates.length > 0 && (
        <>
          <h3 className="section-title">Historikk</h3>
          <ul className="history">
            {[...taxRates].reverse().map((r) => (
              <li key={r.id}>
                <span>Fra {monthLabel(r.valid_from)}</span>
                <strong>{Number(r.percent).toLocaleString('nb-NO')} %</strong>
                <button className="icon-btn" aria-label="Slett"
                  onClick={async () => { await api.deleteTaxRate(r.id); reload(); }}>✕</button>
              </li>
            ))}
          </ul>
          <p className="muted tiny">Gamle måneder beholder satsen som gjaldt da, så du kan endre skatten uten å ødelegge historikken.</p>
        </>
      )}
    </section>
  );
}

function CalendarFeedCard({ profile }) {
  const url = api.feedUrl(profile);
  const [copied, setCopied] = useState(false);

  return (
    <section className="card stack">
      <h2>iPhone-kalender</h2>
      <p className="muted small">
        Abonner én gang, så dukker alle vakter du legger inn her opp i Kalender-appen automatisk.
        Det kan ta litt tid før nye vakter vises.
      </p>
      {url ? (
        <>
          <a className="btn primary" href={url.replace(/^https?:/, 'webcal:')}>Abonner i Kalender</a>
          <button className="btn ghost" onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}>{copied ? 'Kopiert ✓' : 'Kopier lenke'}</button>
          <p className="muted tiny">Fungerer ikke knappen? Innstillinger → Kalender → Kontoer → Legg til konto → Annet → Legg til abonnert kalender, og lim inn lenken.</p>
        </>
      ) : (
        <p className="demo-note small">Tilgjengelig når appen er koblet til Supabase (ikke i demo-modus).</p>
      )}
    </section>
  );
}
