import { describe, it, expect } from 'vitest';
import { calcShift, calcMonth, taxRateFor, taxPercentFromPayslip, shiftMinutes } from './pay.js';

const evening = { label: 'Kveld', amount: 30, from: '18:00', to: '', days: 'all' };
const weekend = { label: 'Helg', amount: 50, from: '', to: '', days: 'weekend' };
const night = { label: 'Natt', amount: 40, from: '21:00', to: '06:00', days: 'all' };

describe('calcShift', () => {
  it('dagvakt uten tillegg', () => {
    // 2026-11-11 er en onsdag
    const r = calcShift({ date: '2026-11-11', start_time: '08:00', end_time: '16:00', bonuses: [evening] }, 200);
    expect(r.hours).toBe(8);
    expect(r.gross).toBe(1600);
    expect(r.bonuses).toEqual([]);
  });

  it('kveldsvakt får tillegg bare etter 18:00', () => {
    const r = calcShift({ date: '2026-11-11', start_time: '15:00', end_time: '23:00', bonuses: [evening] }, 200);
    expect(r.hours).toBe(8);
    expect(r.bonuses[0].hours).toBe(5); // 18–23
    expect(r.gross).toBe(8 * 200 + 5 * 30);
  });

  it('helgetillegg gjelder bare lørdag/søndag', () => {
    const sat = calcShift({ date: '2026-11-14', start_time: '08:00', end_time: '16:00', bonuses: [weekend] }, 200);
    const fri = calcShift({ date: '2026-11-13', start_time: '08:00', end_time: '16:00', bonuses: [weekend] }, 200);
    expect(sat.gross).toBe(1600 + 8 * 50);
    expect(fri.gross).toBe(1600);
  });

  it('kveld + helg stables', () => {
    const r = calcShift({ date: '2026-11-15', start_time: '15:00', end_time: '23:00', bonuses: [evening, weekend] }, 200);
    expect(r.gross).toBe(1600 + 5 * 30 + 8 * 50);
  });

  it('nattevakt over midnatt, helgetillegg følger kalenderdagen', () => {
    // Fredag 22:00 → lørdag 07:00
    const r = calcShift({ date: '2026-11-13', start_time: '22:00', end_time: '07:00', bonuses: [night, weekend] }, 200);
    expect(r.hours).toBe(9);
    const n = r.bonuses.find((b) => b.label === 'Natt');
    const h = r.bonuses.find((b) => b.label === 'Helg');
    expect(n.hours).toBe(8); // 22–06
    expect(h.hours).toBe(7); // 00–07 lørdag
  });

  it('shiftMinutes håndterer midnatt', () => {
    expect(shiftMinutes('22:00', '00:00')).toBe(120);
    expect(shiftMinutes('22:00', '06:30')).toBe(510);
  });
});

describe('skatt', () => {
  const rates = [
    { valid_from: '2026-01-01', percent: 30 },
    { valid_from: '2027-01-01', percent: 28 },
  ];
  it('velger riktig sats for måneden', () => {
    expect(taxRateFor(rates, '2026-11')).toBe(30);
    expect(taxRateFor(rates, '2027-02')).toBe(28);
    expect(taxRateFor(rates, '2025-05')).toBe(30); // før første → første
  });
  it('månedsoppgjør', () => {
    const shifts = [
      { date: '2026-11-11', start_time: '08:00', end_time: '16:00', bonuses: [] },
      { date: '2026-11-12', start_time: '08:00', end_time: '16:00', bonuses: [] },
    ];
    const m = calcMonth(shifts, 200, 30);
    expect(m.gross).toBe(3200);
    expect(m.tax).toBe(960);
    expect(m.net).toBe(2240);
  });
  it('beregner prosent fra lønnsslipp', () => {
    expect(taxPercentFromPayslip(25000, 6875)).toBe(27.5);
    expect(taxPercentFromPayslip(0, 100)).toBe(null);
  });
});
