// Persistence, backup format and data helpers. Everything lives in this
// device's localStorage; nothing is ever sent anywhere.
//
// Data shape (also the backup file format):
// { exercises: [{ id, name, days: { 'YYYY-MM-DD': reps }, goals: { '1m' | '6m' | '1y': { target, start } } }] }

import { isKey } from './dates.js';

export const DATA_KEY = 'repit:data';
const PREFS_KEY = 'repit:prefs';
export const PERIODS = { '1m': 1, '6m': 6, '1y': 12 }; // goal length in months
const MAX_REPS = 1e7;
const NAME_MAX = 40;

const PREF_DEFAULTS = { haptics: true, range: '1m', trendsEx: null, selected: null, lastBackup: null, installDismissed: false };

export const emptyData = () => ({ exercises: [] });
const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
const toCount = (v) => { const n = Math.round(Number(v)); return n > 0 ? Math.min(n, MAX_REPS) : 0; };
const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

/** Coerces stored or imported data into a valid shape. Returns null if it isn't repit data. */
export function normalize(raw) {
  if (!raw || !Array.isArray(raw.exercises)) return null;
  const ids = new Set();
  const exercises = [];
  for (const e of raw.exercises) {
    const name = cleanName(e?.name);
    if (!name) continue;
    let id = typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) ? e.id : uid();
    while (ids.has(id)) id = uid();
    ids.add(id);
    const days = {};
    for (const [k, v] of Object.entries(asObj(e.days))) {
      const n = toCount(v);
      if (n && isKey(k)) days[k] = n;
    }
    const goals = {};
    for (const p of Object.keys(PERIODS)) {
      const g = asObj(asObj(e.goals)[p]);
      const target = toCount(g.target);
      if (target && isKey(g.start)) goals[p] = { target, start: g.start };
    }
    exercises.push({ id, name, days, goals });
  }
  if (raw.exercises.length && !exercises.length) return null;
  return { exercises };
}

export function loadData() {
  let raw = null;
  try { raw = localStorage.getItem(DATA_KEY); } catch { return emptyData(); }
  if (raw == null) return emptyData();
  try {
    const data = normalize(JSON.parse(raw));
    if (data) return data;
  } catch { /* fall through */ }
  // Unreadable data: keep a copy rather than silently overwriting it on the next save.
  try { localStorage.setItem(`${DATA_KEY}:unreadable`, raw); } catch { /* ignore */ }
  return emptyData();
}

export function saveData(data) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadPrefs() {
  try { return { ...PREF_DEFAULTS, ...asObj(JSON.parse(localStorage.getItem(PREFS_KEY))) }; } catch { return { ...PREF_DEFAULTS }; }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export const backupJSON = (data) =>
  JSON.stringify({ app: 'repit', version: 1, exportedAt: new Date().toISOString(), exercises: data.exercises }, null, 2);

export function parseBackup(text) {
  try { return normalize(JSON.parse(String(text).replace(/^﻿/, '').trim())); } catch { return null; }
}

export const newExercise = (name) => ({ id: uid(), name: cleanName(name), days: {}, goals: {} });

export function totalOf(ex) {
  let sum = 0;
  for (const k in ex.days) sum += ex.days[k];
  return sum;
}

/** Sum of reps between two day keys, inclusive. */
export function sumRange(days, from, to) {
  let sum = 0;
  for (const k in days) if (k >= from && k <= to) sum += days[k];
  return sum;
}
