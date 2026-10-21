// Calendar-day helpers. A "day key" is a local calendar date formatted as
// 'YYYY-MM-DD'; keys compare and sort chronologically as plain strings.

const DAY_MS = 864e5;
const pad = (n) => String(n).padStart(2, '0');
const parts = (k) => k.split('-').map(Number);
const toUTC = (k) => { const [y, m, d] = parts(k); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

export const keyOf = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const todayKey = () => keyOf(new Date());
export const dateOf = (k) => { const [y, m, d] = parts(k); return new Date(y, m - 1, d); };
export const isKey = (k) => typeof k === 'string' && /^\d{4}-\d\d-\d\d$/.test(k) && fromUTC(toUTC(k)) === k;
export const addDays = (k, n) => fromUTC(toUTC(k) + n * DAY_MS);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
export const monthStart = (k) => `${k.slice(0, 8)}01`;

/** Adds calendar months, clamping to the end of shorter months (Jan 31 + 1 month = Feb 28). */
export function addMonths(k, n) {
  const [y, m, d] = parts(k);
  const t = y * 12 + m - 1 + n;
  const ny = Math.floor(t / 12), nm = t - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/** First day of the week containing k. firstDay: 0 = Sunday … 6 = Saturday. */
export function weekStart(k, firstDay = 1) {
  const dow = new Date(toUTC(k)).getUTCDay();
  return addDays(k, -((dow - firstDay + 7) % 7));
}

/**
 * Goals repeat every `months` months starting at `anchor`. Returns the period
 * that contains `day` (or the first one, if `day` is before the anchor).
 */
export function periodAt(anchor, months, day) {
  let i = 0;
  if (day > anchor) {
    const [ay, am] = parts(anchor), [dy, dm] = parts(day);
    i = Math.max(0, Math.floor(((dy - ay) * 12 + dm - am) / months));
    while (i > 0 && addMonths(anchor, i * months) > day) i--;
    while (addMonths(anchor, (i + 1) * months) <= day) i++;
  }
  return { index: i, start: addMonths(anchor, i * months), end: addDays(addMonths(anchor, (i + 1) * months), -1) };
}
