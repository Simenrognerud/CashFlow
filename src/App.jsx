import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import AuthScreen from './components/AuthScreen.jsx';
import CalendarView from './components/CalendarView.jsx';
import TemplatesView from './components/TemplatesView.jsx';
import SettingsView from './components/SettingsView.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = laster
  const [tab, setTab] = useState('calendar');
  const [profile, setProfile] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [taxRates, setTaxRates] = useState([]);

  useEffect(() => {
    api.getUser().then(setUser);
    return api.onAuthChange(setUser);
  }, []);

  async function reload() {
    const [p, t, r] = await Promise.all([api.getProfile(), api.listTemplates(), api.listTaxRates()]);
    setProfile(p);
    setTemplates(t);
    setTaxRates(r);
  }

  useEffect(() => {
    if (user) reload();
    else { setProfile(null); setTemplates([]); setTaxRates([]); setTab('calendar'); }
  }, [user]);

  if (user === undefined) return <div className="splash">Laster…</div>;
  if (!user) return <AuthScreen />;
  if (!profile) return <div className="splash">Laster…</div>;

  const ctx = { profile, templates, taxRates, reload, goTo: setTab };

  return (
    <div className="app">
      <main className="content">
        {tab === 'calendar' && <CalendarView {...ctx} />}
        {tab === 'templates' && <TemplatesView {...ctx} />}
        {tab === 'settings' && <SettingsView {...ctx} />}
      </main>
      <nav className="tabbar">
        <TabButton id="calendar" tab={tab} setTab={setTab} icon="📅" label="Kalender" />
        <TabButton id="templates" tab={tab} setTab={setTab} icon="🕒" label="Vakter" />
        <TabButton id="settings" tab={tab} setTab={setTab} icon="⚙️" label="Innstillinger" />
      </nav>
    </div>
  );
}

function TabButton({ id, tab, setTab, icon, label }) {
  return (
    <button className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
      <span className="tab-icon" aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
