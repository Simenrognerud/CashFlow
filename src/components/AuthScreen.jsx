import { useState } from 'react';
import { api, USERNAME_RE } from '../lib/api.js';

export default function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!USERNAME_RE.test(username.trim())) {
      setError('Brukernavn: 3–30 tegn, bare bokstaver (a–z), tall, punktum, bindestrek og understrek.');
      return;
    }
    if (!api.demo && mode === 'signup' && password.length < 10) {
      setError('Passordet må være minst 10 tegn.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await api.signUp(username, password);
      else await api.signIn(username, password);
    } catch (err) {
      setError(err.message.includes('already') ? 'Brukernavnet er tatt.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="logo" aria-hidden>💰</div>
        <h1>Skiftlønn</h1>
        <p className="muted">Før vaktene dine – se hva du får utbetalt.</p>

        <form onSubmit={submit} className="stack">
          <label>
            Brukernavn
            <input value={username} onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="f.eks. ida" />
          </label>
          <label>
            Passord
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary big" disabled={busy}>
            {busy ? 'Vent…' : mode === 'signup' ? 'Lag bruker' : 'Logg inn'}
          </button>
        </form>

        <button className="link" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Ny her? Lag bruker' : 'Har du bruker? Logg inn'}
        </button>
        <p className="tiny muted">Bare brukernavn og passord – ingen e-post eller personopplysninger.</p>
        {api.demo && <p className="tiny demo-note">Demo-modus: data lagres bare i denne nettleseren.</p>}
      </div>
    </div>
  );
}
