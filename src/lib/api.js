// Datalag. Bruker Supabase hvis VITE_SUPABASE_URL er satt,
// ellers en lokal demo-modus (lagres i nettleseren) så du kan teste uten oppsett.
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase krever en e-postadresse, men vi vil ikke ha personopplysninger.
// Derfor lages en "falsk" adresse av brukernavnet. Ingen e-post sendes
// (slå av "Confirm email" i Supabase → Authentication → Providers → Email).
const EMAIL_DOMAIN = 'skiftlonn.app';
const toEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/i;

function supabaseApi() {
  const sb = createClient(URL, KEY);
  const uid = async () => (await sb.auth.getUser()).data.user?.id;
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    demo: false,
    async getUser() {
      const { data } = await sb.auth.getSession();
      return data.session?.user ?? null;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session?.user ?? null));
      return () => data.subscription.unsubscribe();
    },
    async signUp(username, password) {
      check(await sb.auth.signUp({
        email: toEmail(username),
        password,
        options: { data: { display_name: username.trim() } },
      }));
    },
    async signIn(username, password) {
      const res = await sb.auth.signInWithPassword({ email: toEmail(username), password });
      if (res.error) throw new Error('Feil brukernavn eller passord');
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async getProfile() {
      return check(await sb.from('profiles').select('*').eq('id', await uid()).single());
    },
    async updateProfile(patch) {
      return check(await sb.from('profiles').update(patch).eq('id', await uid()).select().single());
    },
    async listTaxRates() {
      return check(await sb.from('tax_rates').select('*').order('valid_from'));
    },
    async saveTaxRate({ valid_from, percent }) {
      // Én sats per startmåned – erstatt hvis den finnes.
      return check(await sb.from('tax_rates')
        .upsert({ user_id: await uid(), valid_from, percent }, { onConflict: 'user_id,valid_from' })
        .select().single());
    },
    async deleteTaxRate(id) {
      check(await sb.from('tax_rates').delete().eq('id', id));
    },
    async listTemplates() {
      return check(await sb.from('templates').select('*').order('start_time'));
    },
    async saveTemplate(t) {
      const row = { ...t, user_id: await uid() };
      if (!row.id) delete row.id;
      return check(await sb.from('templates').upsert(row).select().single());
    },
    async deleteTemplate(id) {
      check(await sb.from('templates').delete().eq('id', id));
    },
    async listShifts(from, to) {
      return check(await sb.from('shifts').select('*').gte('date', from).lte('date', to).order('start_time'));
    },
    async addShift(shift) {
      return check(await sb.from('shifts').insert({ ...shift, user_id: await uid() }).select().single());
    },
    async deleteShift(id) {
      check(await sb.from('shifts').delete().eq('id', id));
    },
    feedUrl(profile) {
      return `${URL}/functions/v1/calendar-feed?token=${profile.feed_token}`;
    },
  };
}

function localApi() {
  const KEY_DB = 'skiftlonn-demo';
  const load = () => JSON.parse(localStorage.getItem(KEY_DB) || 'null');
  const save = (db) => localStorage.setItem(KEY_DB, JSON.stringify(db));
  const id = () => Math.random().toString(36).slice(2, 10);
  let listeners = [];
  const emit = (u) => listeners.forEach((l) => l(u));
  const db = () => load() || { user: null, profile: null, tax_rates: [], templates: [], shifts: [] };
  const mutate = (fn) => { const d = db(); const r = fn(d); save(d); return r; };

  return {
    demo: true,
    async getUser() { return db().user; },
    onAuthChange(cb) { listeners.push(cb); return () => { listeners = listeners.filter((l) => l !== cb); }; },
    async signUp(username) {
      const user = mutate((d) => {
        d.user = { id: 'demo' };
        d.profile = { id: 'demo', display_name: username.trim(), hourly_wage: 0, feed_token: 'demo' };
        return d.user;
      });
      emit(user);
    },
    async signIn(username, password) {
      if (!db().user) return this.signUp(username, password);
      emit(db().user);
    },
    async signOut() { mutate((d) => { d.user = null; }); emit(null); },
    async getProfile() { return db().profile; },
    async updateProfile(patch) { return mutate((d) => Object.assign(d.profile, patch)); },
    async listTaxRates() { return [...db().tax_rates].sort((a, b) => a.valid_from.localeCompare(b.valid_from)); },
    async saveTaxRate(r) {
      return mutate((d) => {
        d.tax_rates = d.tax_rates.filter((x) => x.valid_from !== r.valid_from);
        const row = { id: id(), ...r };
        d.tax_rates.push(row);
        return row;
      });
    },
    async deleteTaxRate(rid) { mutate((d) => { d.tax_rates = d.tax_rates.filter((x) => x.id !== rid); }); },
    async listTemplates() { return [...db().templates].sort((a, b) => a.start_time.localeCompare(b.start_time)); },
    async saveTemplate(t) {
      return mutate((d) => {
        if (t.id) { d.templates = d.templates.map((x) => (x.id === t.id ? t : x)); return t; }
        const row = { ...t, id: id() };
        d.templates.push(row);
        return row;
      });
    },
    async deleteTemplate(tid) { mutate((d) => { d.templates = d.templates.filter((x) => x.id !== tid); }); },
    async listShifts(from, to) { return db().shifts.filter((s) => s.date >= from && s.date <= to); },
    async addShift(s) { return mutate((d) => { const row = { ...s, id: id() }; d.shifts.push(row); return row; }); },
    async deleteShift(sid) { mutate((d) => { d.shifts = d.shifts.filter((x) => x.id !== sid); }); },
    feedUrl() { return null; },
  };
}

export const api = URL && KEY ? supabaseApi() : localApi();
