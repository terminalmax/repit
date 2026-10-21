// repit: counting, trends, goals and backup. No frameworks, no network calls.

import { todayKey, dateOf, isKey, addDays, addMonths, daysBetween, monthStart, weekStart, periodAt } from './dates.js';
import {
  DATA_KEY, PERIODS, loadData, saveData, loadPrefs, savePrefs, emptyData,
  parseBackup, backupJSON, newExercise, cleanName, totalOf, sumRange,
} from './store.js';
import { drawBars } from './chart.js';
import { drawShareImage } from './share.js';

const VERSION = '1.4.0';
const STEPS = [1, 5, 10];
const SET_MS = 6000; // taps on one exercise closer together than this form one undoable set
const SUGGESTIONS = ['Push-ups', 'Squats', 'Pull-ups', 'Sit-ups', 'Burpees', 'Lunges', 'Dips', 'Crunches', 'Jumping jacks', 'Kettlebell swings'];
const PERIOD_NAME = { '1m': '1 month', '6m': '6 months', '1y': '1 year' };
const GOAL_TITLE = { '1m': '1-month goal', '6m': '6-month goal', '1y': '1-year goal' };
const PERIOD_EVERY = { '1m': 'month', '6m': '6 months', '1y': 'year' };
const RANGE_NAME = { '1m': 'Last 30 days', '6m': 'Last 26 weeks', '1y': 'Last 12 months' };

// ---------- Helpers ----------

const $ = (sel, root = document) => root.querySelector(sel);
const nf = new Intl.NumberFormat();
const nf1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const fmt = (n) => nf.format(n);
const fmtAvg = (n) => (n < 10 ? nf1.format(n) : fmt(Math.round(n)));
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? '' : 's'}`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const parseReps = (v) => Math.min(1e7, Number.parseInt(String(v).replace(/\D/g, ''), 10) || 0);

const formats = new Map();
function fmtDate(k, opts) {
  const key = JSON.stringify(opts);
  if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat(undefined, opts));
  return formats.get(key).format(dateOf(k));
}
const shortDate = (k) => fmtDate(k, { month: 'short', day: 'numeric' });
const longDate = (k) => fmtDate(k, { month: 'short', day: 'numeric', year: 'numeric' });
const rangeFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtRange = (a, b) => rangeFormat.formatRange?.(dateOf(a), dateOf(b)) ?? `${longDate(a)} – ${longDate(b)}`;

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canVibrate = 'vibrate' in navigator; // Android
// Safari has no Vibration API, but a real tap on a native switch control plays a system haptic (iOS 17.4+).
const switchHaptics = isIOS && 'switch' in HTMLInputElement.prototype;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const weekFirstDay = (() => {
  try {
    const loc = new Intl.Locale(navigator.language);
    return ((loc.getWeekInfo?.() ?? loc.weekInfo)?.firstDay ?? 1) % 7;
  } catch {
    return 1;
  }
})();

const svg = (paths, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const ICON = {
  more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  up: '<path d="M22 7 13.5 15.5l-5-5L2 17"/><path d="M16 7h6v6"/>',
  down: '<path d="M22 17 13.5 8.5l-5 5L2 7"/><path d="M16 17h6v-6"/>',
  check: '<path d="M5 12.5 10 17.5 19.5 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

// ---------- State ----------

let data = loadData();
const prefs = loadPrefs();
if (!(prefs.range in RANGE_NAME)) prefs.range = '1m';
let today = todayKey();
let tab = 'count';
const sets = new Map(); // exercise id → { day, n, timer }: reps of the set in progress, undoable together

const byId = (id) => data.exercises.find((e) => e.id === id);
const rowOf = (id) => document.querySelector(`.row[data-id="${id}"]`);
const selected = () => byId(prefs.selected) || data.exercises[0] || null; // what the pad counts
const trendsEx = () => byId(prefs.trendsEx) || data.exercises[0] || null;

let saveWarned = false;
function persist() {
  if (saveData(data) || saveWarned) return;
  saveWarned = true;
  toast("Couldn't save. Storage on this device is full or blocked.");
}

let persistAsked = false;
function requestPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

function renderAll() {
  renderCount();
  if (tab === 'trends') renderTrends();
}

// ---------- Count ----------

function renderCount() {
  $('#today-date').textContent = fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' });
  const list = data.exercises;
  const sel = selected();
  $('#ex-list').innerHTML = list.map((ex) => rowHTML(ex, ex === sel)).join('');
  $('#ex-list').hidden = list.length === 0;
  $('#empty').hidden = list.length > 0;
  $('#add-ex').hidden = list.length === 0;
  if (!list.length) $('#empty-chips').innerHTML = suggestionChips();
  renderPad();
}

function rowHTML(ex, isSelected) {
  return `<li role="none"><button type="button" class="row" role="radio" aria-checked="${isSelected}" data-id="${ex.id}">
  <span class="row-main"><span class="row-name">${esc(ex.name)}</span><span class="row-total"><b data-total>${fmt(totalOf(ex))}</b> total</span></span>
  <span class="row-today"><b data-today>${fmt(ex.days[today] || 0)}</b><small>today</small></span>
</button></li>`;
}

// The pad shows the selected exercise, today's count and the undo for the set in progress.
function renderPad() {
  const ex = selected();
  const show = tab === 'count' && !!ex;
  $('#pad').hidden = !show;
  document.body.classList.toggle('with-pad', show);
  if (!ex) return;
  const n = ex.days[today] || 0;
  $('#pad-count').textContent = fmt(n);
  $('#pad-name').textContent = ex.name;
  $('#pad-ex').setAttribute('aria-label', `${ex.name}: ${fmt(n)} today. Edit exercise`);
  for (const b of document.querySelectorAll('#pad [data-add]')) b.setAttribute('aria-label', `Add ${b.dataset.add} to ${ex.name}`);
  const set = sets.get(ex.id);
  $('#pad-undo').hidden = !set;
  if (set) $('#pad-undo-n').textContent = `+${fmt(set.n)}`;
}

function refreshExercise(id) {
  const ex = byId(id);
  const row = rowOf(id);
  if (ex && row) {
    $('[data-today]', row).textContent = fmt(ex.days[today] || 0);
    $('[data-total]', row).textContent = fmt(totalOf(ex));
  }
  if (selected()?.id === id) renderPad();
}

function selectExercise(id) {
  if (!byId(id) || selected()?.id === id) return;
  prefs.selected = id;
  savePrefs(prefs);
  for (const row of document.querySelectorAll('.row')) row.setAttribute('aria-checked', String(row.dataset.id === id));
  renderPad();
}

function suggestionChips() {
  const have = new Set(data.exercises.map((e) => e.name.toLowerCase()));
  return SUGGESTIONS.filter((s) => !have.has(s.toLowerCase()))
    .slice(0, 8)
    .map((s) => `<button type="button" class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`)
    .join('');
}

function addReps(id, n) {
  checkDay();
  const ex = byId(id);
  if (!ex) return;
  ex.days[today] = (ex.days[today] || 0) + n;
  persist();
  requestPersistence();
  buzz();
  let set = sets.get(id);
  if (set && set.day !== today) {
    clearTimeout(set.timer);
    set = null;
  }
  if (!set) sets.set(id, (set = { day: today, n: 0 }));
  set.n += n;
  clearTimeout(set.timer);
  set.timer = setTimeout(() => clearSet(id), SET_MS);
  refreshExercise(id);
  if (!reducedMotion.matches) {
    $('#pad-count').animate([{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
  announce(`${ex.name}: ${fmt(ex.days[today])} today`);
}

function clearSet(id) {
  const set = sets.get(id);
  if (!set) return;
  clearTimeout(set.timer);
  sets.delete(id);
  refreshExercise(id);
}

function clearAllSets() {
  for (const set of sets.values()) clearTimeout(set.timer);
  sets.clear();
}

function undoSet(id) {
  const set = sets.get(id);
  const ex = byId(id);
  if (!set || !ex) return;
  const left = (ex.days[set.day] || 0) - set.n;
  if (left > 0) ex.days[set.day] = left;
  else delete ex.days[set.day];
  persist();
  clearSet(id);
  buzz();
  announce(`Removed ${fmt(set.n)} from ${ex.name}`);
}

function buzz() {
  if (prefs.haptics && canVibrate) navigator.vibrate(20);
}

// On iPhone, put an invisible switch over each pad button (or take them away) so taps play a haptic.
// The pad is fixed and never scrolls, so a scroll can't land on one.
function syncHaptics() {
  const on = switchHaptics && prefs.haptics;
  for (const wrap of document.querySelectorAll('#pad .add-wrap')) {
    const hap = wrap.querySelector('.hap');
    if (on && !hap) wrap.insertAdjacentHTML('beforeend', '<input type="checkbox" switch class="hap" tabindex="-1" aria-hidden="true">');
    else if (!on && hap) hap.remove();
  }
}

function nameError(name, exceptId) {
  if (!name) return 'Give it a name.';
  const lower = name.toLowerCase();
  const twin = data.exercises.find((e) => e.id !== exceptId && e.name.toLowerCase() === lower);
  return twin ? `You already have “${twin.name}”.` : '';
}

function addExercise(raw) {
  const name = cleanName(raw);
  const err = nameError(name);
  if (err) return err;
  const ex = newExercise(name);
  data.exercises.push(ex);
  prefs.selected = ex.id; // start counting the new exercise right away
  savePrefs(prefs);
  persist();
  requestPersistence();
  renderAll();
  requestAnimationFrame(() => rowOf(ex.id)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' }));
  return '';
}

function openAdd() {
  $('#add-name').value = '';
  $('#add-err').textContent = '';
  $('#add-chips').innerHTML = suggestionChips();
  openDialog('#dlg-add');
}

// ---------- Edit exercise ----------

let edit = null; // { id, day, changes: { [day]: reps } } while the edit dialog is open

const editCount = () => edit.changes[edit.day] ?? (byId(edit.id)?.days[edit.day] || 0);

function openEdit(id) {
  const ex = byId(id);
  if (!ex) return;
  edit = { id, day: today, changes: {} };
  $('#ed-name').value = ex.name;
  $('#ed-err').textContent = '';
  const day = $('#ed-day');
  day.max = today;
  day.value = today;
  $('#ed-count').value = String(editCount());
  syncMoveButtons();
  openDialog('#dlg-edit');
}

function syncMoveButtons() {
  const i = data.exercises.findIndex((e) => e.id === edit?.id);
  $('#ed-up').disabled = i <= 0;
  $('#ed-down').disabled = i < 0 || i >= data.exercises.length - 1;
}

function moveExercise(dir) {
  const list = data.exercises;
  const i = list.findIndex((e) => e.id === edit?.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  persist();
  renderCount();
  syncMoveButtons();
}

async function deleteExercise() {
  const ex = byId(edit?.id);
  if (!ex) return;
  $('#dlg-edit').close();
  const total = totalOf(ex);
  const goals = Object.keys(ex.goals).length;
  if (total || goals) {
    const what = [total && `${plural(total, 'logged rep')}`, goals && (goals === 1 ? 'its goal' : 'its goals')].filter(Boolean).join(' and ');
    if (!(await confirmBox(`Delete ${ex.name}?`, `This removes ${what} from this device.`, 'Delete', true))) return;
  }
  const i = data.exercises.indexOf(ex);
  if (i < 0) return;
  data.exercises.splice(i, 1);
  clearSet(ex.id);
  persist();
  renderAll();
  toast(`Deleted ${ex.name}`, 'Undo', () => {
    data.exercises.splice(Math.min(i, data.exercises.length), 0, ex);
    persist();
    renderAll();
  }, 6000);
}

// ---------- Trends ----------

function renderTrends() {
  const ex = trendsEx();
  $('#tr-main').hidden = !ex;
  $('#tr-empty').hidden = !!ex;
  if (!ex) return;
  const pick = $('#tr-pick');
  const scrolled = pick.scrollLeft;
  pick.innerHTML = data.exercises
    .map((e) => `<button type="button" class="chip" role="radio" aria-checked="${e === ex}" data-id="${e.id}">${esc(e.name)}</button>`)
    .join('');
  pick.scrollLeft = scrolled;
  renderTiles(ex);
  for (const b of $('#tr-range').children) b.setAttribute('aria-checked', String(b.dataset.range === prefs.range));
  renderChart(ex);
  $('#tr-goals').innerHTML = Object.keys(PERIODS).map((p) => goalHTML(ex, p)).join('');
}

function streakOf(days) {
  let k = days[today] ? today : addDays(today, -1);
  let n = 0;
  while (days[k]) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

function renderTiles(ex) {
  const d = ex.days;
  const week = sumRange(d, addDays(today, -6), today);
  let best = 0;
  let bestDay = '';
  let active = 0;
  for (const k in d) {
    active++;
    if (d[k] > best || (d[k] === best && k > bestDay)) {
      best = d[k];
      bestDay = k;
    }
  }
  const streak = streakOf(d);
  const tiles = [
    ['Last 7 days', fmt(week), week ? `avg ${fmtAvg(week / 7)} a day` : 'Nothing this week yet'],
    ['All time', fmt(totalOf(ex)), active ? plural(active, 'active day') : 'Nothing logged yet'],
    ['Best day', best ? fmt(best) : '–', best ? longDate(bestDay) : 'Log reps to set one'],
    ['Streak', plural(streak, 'day'), streak ? (d[today] ? 'Including today' : 'Log today to keep it going') : 'Log reps to start one'],
  ];
  $('#tr-tiles').innerHTML = tiles
    .map(([label, value, note]) => `<div class="card tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div><div class="tile-note">${note}</div></div>`)
    .join('');
}

function seriesFor(ex, range) {
  const d = ex.days;
  const bars = [];
  if (range === '1m') {
    for (let j = 0; j < 30; j++) {
      const k = addDays(today, j - 29);
      bars.push({ from: k, value: d[k] || 0, label: fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' }), tick: (29 - j) % 7 === 0 ? shortDate(k) : '' });
    }
  } else if (range === '6m') {
    const thisWeek = weekStart(today, weekFirstDay);
    let lastTick = -9;
    for (let j = 0; j < 26; j++) {
      const from = addDays(thisWeek, 7 * (j - 25));
      const newMonth = from.slice(0, 7) !== addDays(from, -7).slice(0, 7);
      const tick = newMonth && j - lastTick >= 3 ? fmtDate(from, { month: 'short' }) : '';
      if (tick) lastTick = j;
      bars.push({ from, value: sumRange(d, from, addDays(from, 6)), label: `Week of ${shortDate(from)}`, tick });
    }
  } else {
    const thisMonth = monthStart(today);
    for (let j = 0; j < 12; j++) {
      const from = addMonths(thisMonth, j - 11);
      bars.push({
        from,
        value: sumRange(d, from, addDays(addMonths(from, 1), -1)),
        label: fmtDate(from, { month: 'long', year: 'numeric' }),
        tick: fmtDate(from, { month: 'short' }),
        tickShort: fmtDate(from, { month: 'narrow' }),
      });
    }
  }
  return bars;
}

let chartWidth = 0;
function renderChart(ex) {
  const host = $('#tr-chart');
  const range = prefs.range;
  const bars = seriesFor(ex, range);
  const total = bars.reduce((sum, b) => sum + b.value, 0);
  const days = daysBetween(bars[0].from, today) + 1;
  const summary = () => setReadout(RANGE_NAME[range], total, total ? `avg ${fmtAvg(total / days)} a day` : 'No reps in this period yet');
  chartWidth = host.clientWidth;
  drawBars(host, bars, (i) => (i == null ? summary() : setReadout(bars[i].label, bars[i].value, '')));
  summary();
  const unit = { '1m': 'day', '6m': 'week', '1y': 'month' }[range];
  host.setAttribute('aria-label', `${ex.name}: reps per ${unit}, ${RANGE_NAME[range].toLowerCase()}. Use the arrow keys to step through the bars.`);
  $('#tr-table').innerHTML = `<tr><th scope="col">${cap(unit)}</th><th scope="col">Reps</th></tr>${bars
    .slice()
    .reverse()
    .map((b) => `<tr><th>${esc(b.label)}</th><td>${fmt(b.value)}</td></tr>`)
    .join('')}`;
}

function setReadout(label, value, sub) {
  $('#ro-label').textContent = label;
  $('#ro-value').textContent = fmt(value);
  $('#ro-unit').textContent = value === 1 ? 'rep' : 'reps';
  $('#ro-sub').textContent = sub;
}

// ---------- Goals ----------

function goalProgress(ex, p) {
  const goal = ex.goals[p];
  if (!goal) return null;
  const { index, start, end } = periodAt(goal.start, PERIODS[p], today);
  const len = daysBetween(start, end) + 1;
  const started = today >= start;
  const elapsed = started ? daysBetween(start, today) + 1 : 0; // days so far, today included
  const daysLeft = started ? len - elapsed + 1 : len; // today included
  const done = started ? sumRange(ex.days, start, today) : 0;
  const remaining = Math.max(0, goal.target - done);
  const prevStart = index > 0 ? addMonths(goal.start, (index - 1) * PERIODS[p]) : null;
  return {
    ...goal, start, end, len, started, elapsed, daysLeft, done, remaining,
    perDay: Math.ceil(remaining / daysLeft),
    // Where an even pace would put you by the end of today, and by the end of yesterday.
    paceToday: (goal.target * elapsed) / len,
    paceYesterday: (goal.target * Math.max(0, elapsed - 1)) / len,
    prev: prevStart ? sumRange(ex.days, prevStart, addDays(start, -1)) : null,
  };
}

function goalHTML(ex, p) {
  const g = goalProgress(ex, p);
  const name = cap(PERIOD_NAME[p]);
  if (!g) {
    return `<div class="card goal unset"><div><h3>${name}</h3><p>No goal set</p></div><button type="button" class="btn small" data-goal="${p}">Set goal</button></div>`;
  }
  let cls;
  let icon;
  let status;
  if (!g.started) {
    [cls, icon, status] = ['later', ICON.clock, `Starts ${longDate(g.start)}`];
  } else if (!g.remaining) {
    [cls, icon, status] = ['good', ICON.check, g.done > g.target ? `Goal reached, ${fmt(g.done - g.target)} extra` : 'Goal reached'];
  } else if (g.done >= g.paceToday) {
    const ahead = Math.floor(g.done - g.paceToday);
    [cls, icon, status] = ['good', ICON.up, `${ahead ? `${fmt(ahead)} ahead of pace` : 'On pace'} · ${fmt(g.perDay)}/day to finish`];
  } else if (g.done >= g.paceYesterday) {
    [cls, icon, status] = ['later', ICON.clock, `${fmt(Math.ceil(g.paceToday - g.done))} more today to stay on pace`];
  } else {
    [cls, icon, status] = ['behind', ICON.down, `${fmt(Math.ceil(g.paceYesterday - g.done))} behind pace · ${fmt(g.perDay)}/day to finish`];
  }
  const pct = Math.min(1, g.done / g.target);
  const marker = g.started && g.remaining ? `<s style="left:${((g.elapsed / g.len) * 100).toFixed(2)}%"></s>` : '';
  const prev = g.prev == null ? '' : `<div class="goal-prev">Previous ${PERIOD_EVERY[p]}: ${fmt(g.prev)} of ${fmt(g.target)}${g.prev >= g.target ? ', reached' : ''}</div>`;
  return `<div class="card goal">
  <div class="goal-head"><h3>${name}</h3><button type="button" class="link" data-goal="${p}">Edit</button></div>
  <div class="goal-nums"><b>${fmt(g.done)}</b><span>of ${fmt(g.target)} · ${Math.floor((g.done / g.target) * 100)}%</span></div>
  <div class="meter" role="progressbar" aria-label="${GOAL_TITLE[p]}" aria-valuemin="0" aria-valuemax="${g.target}" aria-valuenow="${Math.min(g.done, g.target)}" aria-valuetext="${fmt(g.done)} of ${fmt(g.target)} reps"><i style="width:${(pct * 100).toFixed(2)}%"></i>${marker}</div>
  <div class="goal-meta">${fmtRange(g.start, g.end)} · ${g.started ? `${plural(g.daysLeft, 'day')} left` : plural(g.len, 'day')}</div>
  <div class="goal-status ${cls}">${svg(icon)}<span>${status}</span></div>
  ${prev}
</div>`;
}

let goalCtx = null; // { id, p } while the goal dialog is open

function openGoal(p) {
  const ex = trendsEx();
  if (!ex || !(p in PERIODS)) return;
  const goal = ex.goals[p];
  goalCtx = { id: ex.id, p };
  $('#goal-title').textContent = GOAL_TITLE[p];
  $('#goal-ex').textContent = ex.name;
  $('#goal-target').value = goal ? String(goal.target) : '';
  $('#goal-start').value = goal ? goal.start : today;
  // Suggest a target from the recent daily average (over the last 30 days, or since the first log if newer).
  let first = today;
  for (const k in ex.days) if (k < first) first = k;
  const span = Math.min(30, daysBetween(first, today) + 1);
  const pace = sumRange(ex.days, addDays(today, 1 - span), today) / span;
  const estimate = Math.round(pace * daysBetween(today, addMonths(today, PERIODS[p])));
  $('#goal-target').placeholder = estimate ? fmt(estimate) : 'e.g. 1,000';
  $('#goal-hint').textContent = estimate
    ? `At your pace ${span === 30 ? 'over the last 30 days' : 'so far'}, you'd do about ${fmt(estimate)}.`
    : '';
  $('#goal-err').textContent = '';
  $('#goal-remove').hidden = !goal;
  syncGoalRange();
  openDialog('#dlg-goal');
}

function syncGoalRange() {
  const start = $('#goal-start').value;
  if (!goalCtx || !isKey(start)) return void ($('#goal-range').textContent = '');
  const end = addDays(addMonths(start, PERIODS[goalCtx.p]), -1);
  $('#goal-range').textContent = `${fmtRange(start, end)}, then repeats every ${PERIOD_EVERY[goalCtx.p]}.`;
}

// ---------- Backup ----------

function setMsg(text) {
  $('#set-msg').textContent = text;
}

function openSettings() {
  $('#pref-haptics').checked = prefs.haptics;
  $('#backup-status').textContent = prefs.lastBackup ? `Last backup: ${longDate(prefs.lastBackup)}.` : 'You haven’t exported a backup from this device yet.';
  $('#backup-text').value = '';
  $('#app-version').textContent = VERSION;
  if (!updating) $('#update-msg').textContent = '';
  setMsg('');
  renderInstall();
  openDialog('#dlg-settings');
}

function markBackedUp(msg) {
  prefs.lastBackup = today;
  savePrefs(prefs);
  $('#backup-status').textContent = `Last backup: ${longDate(today)}.`;
  setMsg(msg);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportBackup() {
  const json = backupJSON(data);
  const name = `repit-backup-${today}.json`;
  if (isIOS && navigator.canShare) {
    // On iPhone the share sheet ("Save to Files", AirDrop, Mail…) is the dependable way to keep a file.
    for (const type of ['application/json', 'text/plain']) {
      const file = new File([json], name, { type });
      if (!navigator.canShare({ files: [file] })) continue;
      try {
        await navigator.share({ files: [file] });
        markBackedUp('Backup exported. Keep the file somewhere safe.');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        break; // fall back to a plain download
      }
    }
  }
  download(new Blob([json], { type: 'application/json' }), name);
  markBackedUp(`Downloaded ${name}.`);
}

async function copyBackup() {
  const json = backupJSON(data);
  const box = $('#backup-text');
  box.value = json;
  try {
    await navigator.clipboard.writeText(json);
    markBackedUp('Copied. Paste it somewhere safe, like a note or an email to yourself.');
  } catch {
    box.focus();
    box.select();
    setMsg('Select all of the text in the box and copy it.');
  }
}

async function importText(text) {
  const incoming = parseBackup(text);
  if (!incoming) return setMsg('That doesn’t look like a repit backup.');
  const reps = incoming.exercises.reduce((sum, e) => sum + totalOf(e), 0);
  const summary = `${plural(incoming.exercises.length, 'exercise')} and ${plural(reps, 'rep')}`;
  if (data.exercises.length && !(await confirmBox('Replace your data?', `The backup has ${summary}. It replaces everything currently on this device.`, 'Replace'))) return;
  const previous = data;
  data = incoming;
  clearAllSets();
  persist();
  renderAll();
  $('#dlg-settings').close();
  toast(`Imported ${summary}`, 'Undo', () => {
    data = previous;
    clearAllSets();
    persist();
    renderAll();
    toast('Import undone');
  }, 8000);
}

async function wipeAll() {
  if (!data.exercises.length) return setMsg('There’s nothing to delete.');
  const reps = data.exercises.reduce((sum, e) => sum + totalOf(e), 0);
  const ok = await confirmBox('Delete all data?', `This removes ${plural(data.exercises.length, 'exercise')}, ${plural(reps, 'rep')} and all goals from this device. Export a backup first if you might want them back.`, 'Delete all', true);
  if (!ok) return;
  const previous = data;
  data = emptyData();
  clearAllSets();
  persist();
  renderAll();
  $('#dlg-settings').close();
  toast('All data deleted', 'Undo', () => {
    data = previous;
    persist();
    renderAll();
  }, 8000);
}

// ---------- Share ----------

const SHARE_MAX = 6; // exercises shown in the image

function dataURLToBlob(url) {
  const [head, body] = url.split(',');
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: head.slice(5, head.indexOf(';')) });
}

function shareToday() {
  checkDay();
  const logged = data.exercises.filter((ex) => ex.days[today] > 0);
  if (!logged.length) return toast('Log some reps first, then share your day.');
  const items = logged.slice(0, SHARE_MAX).map((ex) => {
    let goal = null;
    for (const p of Object.keys(PERIODS)) {
      const g = goalProgress(ex, p);
      if (!g?.started) continue;
      const ratio = g.done / g.target;
      goal = { ratio, pct: `${Math.floor(ratio * 100)}%`, caption: `${fmt(g.done)} of ${fmt(g.target)} · ${GOAL_TITLE[p]}` };
      break;
    }
    return { name: ex.name, value: fmt(ex.days[today]), goal };
  });
  const total = logged.reduce((sum, ex) => sum + ex.days[today], 0);
  const canvas = drawShareImage({
    date: fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' }),
    total: fmt(total),
    unit: total === 1 ? 'rep' : 'reps',
    items,
    more: logged.length > SHARE_MAX ? `+${logged.length - SHARE_MAX} more` : '',
    footer: (location.host + location.pathname).replace(/\/(index\.html)?$/, ''),
  });
  // Encode synchronously so navigator.share still runs inside the tap's user gesture.
  const blob = dataURLToBlob(canvas.toDataURL('image/png'));
  const file = new File([blob], `repit-${today}.png`, { type: 'image/png' });
  const saveInstead = () => {
    download(blob, file.name);
    toast(`Saved ${file.name}`);
  };
  if (!navigator.canShare?.({ files: [file] })) return saveInstead();
  navigator.share({ files: [file] }).catch((err) => {
    if (err.name !== 'AbortError') saveInstead();
  });
}

// ---------- Install ----------

let installPrompt = null;

function renderInstall() {
  const offer = !isStandalone() && (isIOS || !!installPrompt);
  $('#install-sec').hidden = !offer;
  $('#install-row').hidden = !installPrompt;
  $('#install-help').textContent = isIOS
    ? 'In Safari, tap Share, then “Add to Home Screen”. The Home Screen app keeps its own data, separate from Safari, so if you’ve already logged reps here, export a backup and import it in the app.'
    : 'Install repit to open it from your home screen, full screen and offline.';
  $('#install-banner').hidden = !offer || prefs.installDismissed;
  $('#install-banner-btn').hidden = !installPrompt;
  $('#install-banner-text').innerHTML = installPrompt
    ? '<b>Install repit</b> for one-tap access, even offline.'
    : '<b>Install repit:</b> tap Share, then “Add to Home Screen”.';
}

async function promptInstall() {
  if (!installPrompt) return;
  const evt = installPrompt;
  installPrompt = null;
  evt.prompt();
  const { outcome } = await evt.userChoice;
  if (outcome === 'accepted') {
    prefs.installDismissed = true;
    savePrefs(prefs);
  }
  renderInstall();
}

// ---------- Shell: dialogs, toast, tabs, day changes, updates ----------

function openDialog(sel) {
  const d = $(sel);
  if (!d.open) d.showModal();
}

function confirmBox(title, text, okLabel, danger = false) {
  const d = $('#dlg-confirm');
  $('#cf-title').textContent = title;
  $('#cf-text').textContent = text;
  const ok = $('#cf-ok');
  ok.textContent = okLabel;
  ok.className = `btn ${danger ? 'danger' : 'primary'}`;
  d.returnValue = '';
  openDialog('#dlg-confirm');
  // Resolve on the button press itself; 'close' (Esc, backdrop) covers the rest.
  return new Promise((resolve) => {
    const form = $('form', d);
    const onSubmit = (e) => resolve(e.submitter?.value === 'ok');
    form.addEventListener('submit', onSubmit, { once: true });
    d.addEventListener('close', () => {
      form.removeEventListener('submit', onSubmit);
      resolve(d.returnValue === 'ok');
    }, { once: true });
  });
}

let toastTimer = 0;
let toastAction = null;
function toast(msg, actionLabel, action, ms = 4000) {
  $('#toast-msg').textContent = msg;
  const btn = $('#toast-btn');
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel || '';
  toastAction = action || null;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  $('#toast').classList.remove('show');
  toastAction = null;
}

function announce(msg) {
  $('#announce').textContent = msg;
}

function showTab(name) {
  tab = name;
  $('#view-count').hidden = name !== 'count';
  $('#view-trends').hidden = name !== 'trends';
  for (const b of document.querySelectorAll('.tab')) {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  if (name === 'trends') renderTrends();
  renderPad();
  window.scrollTo(0, 0);
}

const tabFromURL = () => (location.hash === '#trends' ? 'trends' : 'count');

function go(name) {
  if (name === tab) return window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  if (name === 'trends') {
    history.pushState({ tab: 'trends' }, '', '#trends');
    showTab('trends');
  } else if (history.state?.tab === 'trends') {
    history.back(); // return to the Count entry instead of stacking history; popstate re-renders
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    showTab('count');
  }
}

function checkDay() {
  const k = todayKey();
  if (k === today) return;
  today = k;
  clearAllSets();
  renderAll();
}

function scheduleMidnight() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  setTimeout(() => {
    checkDay();
    scheduleMidnight();
  }, next - now);
}

let swReg = null;
let lastUpdateCheck = Date.now();
let updating = false; // the person asked to update: reload as soon as the new version takes over
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').then((reg) => { swReg = reg; }, () => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
    else if (hadController) toast('repit was updated', 'Reload', () => location.reload(), 10000);
  });
}

async function checkForUpdateNow() {
  const say = (text) => { $('#update-msg').textContent = text; };
  if (!swReg) return say('Updates aren’t available in this browser.');
  if (!navigator.onLine) return say('You’re offline. Connect to the internet to check for updates.');
  const btn = $('#check-update');
  btn.disabled = true;
  say('Checking…');
  try {
    await swReg.update();
    lastUpdateCheck = Date.now();
    const next = swReg.installing || swReg.waiting;
    if (!next) return say(`You’re on the latest version (${VERSION}).`);
    updating = true;
    say('Downloading the update. repit will reload when it’s ready.');
    next.addEventListener('statechange', () => {
      if (next.state !== 'redundant') return;
      updating = false;
      say('The update didn’t finish downloading. Try again later.');
    });
  } catch {
    say('Couldn’t reach the server. Try again when you’re online.');
  } finally {
    btn.disabled = false;
  }
}

function checkForUpdate() {
  if (!swReg || Date.now() - lastUpdateCheck < 36e5) return;
  lastUpdateCheck = Date.now();
  swReg.update().catch(() => {});
}

// ---------- Events ----------

// Only deliberate presses count. In the scrolling list, a touch that lands while the
// page is still moving (to stop a fling) or that turns into a scroll is ignored, so
// flicking through the list can't change the selection. The pad never scrolls; there
// only a press that slides away is ignored.
let press = null; // the press that will produce the next click in the list or the pad
let lastScrollAt = -1e9;

addEventListener('scroll', () => {
  lastScrollAt = performance.now();
  if (press?.inList) press.moved = true;
}, { passive: true });

function trackPresses(el, inList) {
  el.addEventListener('pointerdown', (e) => {
    const now = performance.now();
    press = { x: e.clientX, y: e.clientY, top: scrollY, at: now, inList, moved: inList && now - lastScrollAt < 100 };
  }, true);
  el.addEventListener('pointermove', (e) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) press.moved = true;
  }, true);
  el.addEventListener('pointercancel', () => {
    if (press) press.moved = true;
  }, true);
}

trackPresses($('#ex-list'), true);
trackPresses($('#pad'), false);

function deliberate(e) {
  const p = press;
  press = null;
  // Keyboard and screen-reader activations have no press (or a long-gone one).
  if (!p || e.detail === 0 || performance.now() - p.at > 5000) return true;
  return !p.moved && (!p.inList || Math.abs(scrollY - p.top) < 3);
}

$('#ex-list').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (row && deliberate(e)) selectExercise(row.dataset.id);
});

$('#pad').addEventListener('click', (e) => {
  // On iPhone the tap lands on the invisible haptic switch that covers its button.
  const btn = e.target.classList?.contains('hap') ? e.target.previousElementSibling : e.target.closest('button');
  const ex = selected();
  if (!btn || !ex || !deliberate(e)) return;
  if (btn.dataset.add) addReps(ex.id, Number(btn.dataset.add));
  else if (btn.id === 'pad-undo') undoSet(ex.id);
  else if (btn.id === 'pad-ex') openEdit(ex.id);
});

// The pad covers the bottom of the page; keep its height in a CSS variable for spacing.
new ResizeObserver(() => {
  if ($('#pad').offsetHeight) document.documentElement.style.setProperty('--pad-h', `${$('#pad').offsetHeight}px`);
}).observe($('#pad'));

document.addEventListener('click', (e) => {
  const el = e.target.closest?.('[data-close], [data-suggest], [data-open-add], [data-go]');
  if (!el) return;
  if (el.dataset.close != null) el.closest('dialog')?.close();
  else if (el.dataset.openAdd != null) openAdd();
  else if (el.dataset.go) go(el.dataset.go);
  else {
    const err = addExercise(el.dataset.suggest);
    const dlg = el.closest('dialog');
    if (err && dlg) $('#add-err').textContent = err;
    else dlg?.close();
  }
});

// Tapping the backdrop closes a dialog.
for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('click', (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
}

$('#add-ex').addEventListener('click', openAdd);

$('#form-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const err = addExercise($('#add-name').value);
  if (err) $('#add-err').textContent = err;
  else $('#dlg-add').close();
});

$('#form-edit').addEventListener('submit', (e) => {
  e.preventDefault();
  const ex = byId(edit?.id);
  if (!ex) return $('#dlg-edit').close();
  const name = cleanName($('#ed-name').value);
  const err = nameError(name, ex.id);
  if (err) {
    $('#ed-err').textContent = err;
    return $('#ed-name').focus();
  }
  ex.name = name;
  const changed = Object.entries(edit.changes);
  for (const [k, n] of changed) {
    if (n > 0) ex.days[k] = n;
    else delete ex.days[k];
  }
  if (changed.length) clearSet(ex.id);
  persist();
  renderAll();
  $('#dlg-edit').close();
});

$('#ed-day').addEventListener('change', (e) => {
  const k = e.target.value;
  if (!isKey(k) || k > today) {
    e.target.value = edit.day;
    return;
  }
  edit.day = k;
  $('#ed-count').value = String(editCount());
});

$('#ed-count').addEventListener('input', (e) => {
  edit.changes[edit.day] = parseReps(e.target.value);
});

$('#ed-count').addEventListener('blur', (e) => {
  e.target.value = String(editCount());
});

$('#dlg-edit').addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (!step) return;
  const n = Math.max(0, editCount() + Number(step.dataset.step));
  edit.changes[edit.day] = n;
  $('#ed-count').value = String(n);
});

$('#ed-up').addEventListener('click', () => moveExercise(-1));
$('#ed-down').addEventListener('click', () => moveExercise(1));
$('#ed-delete').addEventListener('click', deleteExercise);

$('#tr-pick').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-id]');
  if (!chip) return;
  prefs.trendsEx = chip.dataset.id;
  savePrefs(prefs);
  renderTrends();
});

$('#tr-range').addEventListener('click', (e) => {
  const b = e.target.closest('[data-range]');
  if (!b || b.dataset.range === prefs.range) return;
  prefs.range = b.dataset.range;
  savePrefs(prefs);
  renderTrends();
});

$('#tr-goals').addEventListener('click', (e) => {
  const b = e.target.closest('[data-goal]');
  if (b) openGoal(b.dataset.goal);
});

$('#goal-start').addEventListener('input', syncGoalRange);
$('#goal-start').addEventListener('change', syncGoalRange);

$('#form-goal').addEventListener('submit', (e) => {
  e.preventDefault();
  const ex = byId(goalCtx?.id);
  if (!ex) return $('#dlg-goal').close();
  const target = parseReps($('#goal-target').value);
  const start = $('#goal-start').value;
  if (!target) return void ($('#goal-err').textContent = 'Enter how many reps you want to do.');
  if (!isKey(start)) return void ($('#goal-err').textContent = 'Pick a start date.');
  ex.goals[goalCtx.p] = { target, start };
  persist();
  renderTrends();
  $('#dlg-goal').close();
});

$('#goal-remove').addEventListener('click', () => {
  const ex = byId(goalCtx?.id);
  if (!ex) return;
  const { p } = goalCtx;
  const old = ex.goals[p];
  delete ex.goals[p];
  persist();
  renderTrends();
  $('#dlg-goal').close();
  toast(`${GOAL_TITLE[p]} removed`, 'Undo', () => {
    ex.goals[p] = old;
    persist();
    renderTrends();
  });
});

$('#open-settings').addEventListener('click', openSettings);
$('#share-today').addEventListener('click', shareToday);
$('#check-update').addEventListener('click', checkForUpdateNow);
$('#do-export').addEventListener('click', exportBackup);
$('#do-import').addEventListener('click', () => $('#file-import').click());
$('#do-copy').addEventListener('click', copyBackup);
$('#do-paste').addEventListener('click', () => {
  const text = $('#backup-text').value.trim();
  if (text) importText(text);
  else setMsg('Paste your backup text into the box first.');
});
$('#do-wipe').addEventListener('click', wipeAll);

$('#file-import').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 20e6) return setMsg('That file is too big to be a repit backup.');
  try {
    await importText(await file.text());
  } catch {
    setMsg('That file couldn’t be read.');
  }
});

$('#pref-haptics').addEventListener('change', (e) => {
  prefs.haptics = e.target.checked;
  savePrefs(prefs);
  syncHaptics();
  buzz();
});

$('#toast-btn').addEventListener('click', () => {
  const action = toastAction;
  hideToast();
  action?.();
});

$('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) go(b.dataset.tab);
});

$('#install-banner-btn').addEventListener('click', promptInstall);
$('#install-btn').addEventListener('click', promptInstall);
$('#install-banner-close').addEventListener('click', () => {
  prefs.installDismissed = true;
  savePrefs(prefs);
  renderInstall();
});

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  renderInstall();
});

addEventListener('appinstalled', () => {
  installPrompt = null;
  renderInstall();
});

addEventListener('popstate', () => showTab(tabFromURL()));

// Another tab changed the data.
addEventListener('storage', (e) => {
  if (e.key !== DATA_KEY) return;
  data = loadData();
  clearAllSets();
  renderAll();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  checkDay();
  checkForUpdate();
});

// Redraw the chart when its width changes (rotation, resizing).
new ResizeObserver(() => {
  const w = $('#tr-chart').clientWidth;
  if (tab === 'trends' && w && w !== chartWidth && trendsEx()) renderChart(trendsEx());
}).observe($('#tr-chart'));

// Lets :active styles show on touch in iOS Safari.
document.addEventListener('touchstart', () => {}, { passive: true });

// ---------- Start ----------

$('#brand-version').textContent = `v${VERSION}`;
$('#haptics-sec').hidden = !(canVibrate || switchHaptics);
syncHaptics();
renderCount();
showTab(tabFromURL());
renderInstall();
scheduleMidnight();
registerSW();
