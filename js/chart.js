// Single-series column chart drawn as SVG. Tap or drag across it (hover with a
// mouse, or arrow keys when focused) to inspect a bar; onSelect gets the bar
// index, or null when nothing is selected.

const PLOT_H = 168; // plot height, top padding included
const TOP = 8;
const AXIS_H = 24; // x-axis label band
const Y_W = 38; // y-axis label column on the right
const CHAR_W = 6.4; // approximate width of one 11px label character, for edge clamping
const full = new Intl.NumberFormat();
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const r2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return Math.round(m * p);
  return 10 * p;
}

// A column with a 4px rounded data end, square at the baseline.
function column(x, top, w, base) {
  const r = Math.min(4, w / 2, base - top);
  return `M${x},${base}V${r2(top + r)}A${r},${r} 0 0 1 ${r2(x + r)},${top}H${r2(x + w - r)}A${r},${r} 0 0 1 ${r2(x + w)},${r2(top + r)}V${base}Z`;
}

// X-axis labels from bars[i][field]. Returns null if any would overlap (or if a
// bar lacks the field), unless thin is set, in which case overlapping labels are skipped.
function xLabels(bars, field, slot, plotW, thin = false) {
  let s = '';
  let right = -Infinity;
  for (let i = 0; i < bars.length; i++) {
    if (!(field in bars[i])) return null;
    const text = bars[i][field];
    if (!text) continue;
    const half = (text.length * CHAR_W) / 2;
    const x = Math.min(Math.max((i + 0.5) * slot, half), plotW - half);
    if (x - half < right + 4) {
      if (thin) continue;
      return null;
    }
    right = x + half;
    s += `<text x="${r2(x)}" y="${PLOT_H + 17}" text-anchor="middle">${esc(text)}</text>`;
  }
  return s;
}

/**
 * bars: [{ value, tick?, tickShort? }]. tick is the x-axis label under that bar;
 * tickShort is used for every bar instead when the ticks don't fit side by side.
 */
export function drawBars(host, bars, onSelect) {
  const W = Math.max(240, Math.round(host.clientWidth || 320));
  const plotW = W - Y_W;
  const n = bars.length;
  const slot = plotW / n;
  const bw = Math.min(24, slot - Math.max(2, slot * 0.28));
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const y = (v) => TOP + (PLOT_H - TOP) * (1 - v / max);

  let s = `<svg viewBox="0 0 ${W} ${PLOT_H + AXIS_H}" width="${W}" height="${PLOT_H + AXIS_H}" aria-hidden="true">`;
  s += `<rect class="hl" x="0" y="0" width="${r2(slot)}" height="${PLOT_H}" rx="5" visibility="hidden"/>`;
  for (const t of [max / 2, max].filter(Number.isInteger)) {
    const ty = Math.round(y(t)) + 0.5;
    s += `<line class="grid" x1="0" x2="${plotW}" y1="${ty}" y2="${ty}"/>`;
    s += `<text x="${plotW + 6}" y="${ty + 4}">${t >= 1e4 ? compact.format(t) : full.format(t)}</text>`;
  }
  s += `<text x="${plotW + 6}" y="${PLOT_H + 4.5}">0</text>`;
  bars.forEach((b, i) => {
    if (b.value <= 0) return;
    const top = r2(Math.min(y(b.value), PLOT_H - 2)); // keep tiny non-zero values visible
    s += `<path class="bar" data-i="${i}" d="${column(r2(i * slot + (slot - bw) / 2), top, r2(bw), PLOT_H)}"/>`;
  });
  s += `<line class="base" x1="0" x2="${plotW}" y1="${PLOT_H + 0.5}" y2="${PLOT_H + 0.5}"/>`;
  s += xLabels(bars, 'tick', slot, plotW) ?? xLabels(bars, 'tickShort', slot, plotW) ?? xLabels(bars, 'tick', slot, plotW, true);
  host.innerHTML = `${s}</svg>`;

  const svg = host.firstChild;
  const hl = svg.querySelector('.hl');
  const cols = new Map([...svg.querySelectorAll('.bar')].map((p) => [Number(p.dataset.i), p]));
  let sel = null;

  function select(i) {
    if (i === sel) return;
    cols.get(sel)?.classList.remove('sel');
    sel = i;
    host.classList.toggle('has-sel', i != null);
    hl.setAttribute('visibility', i == null ? 'hidden' : 'visible');
    if (i != null) {
      hl.setAttribute('x', r2(i * slot));
      cols.get(i)?.classList.add('sel');
    }
    onSelect(i);
  }

  const indexAt = (e) => {
    const box = svg.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((((e.clientX - box.left) / box.width) * W) / slot)));
  };

  // Touch: tap a bar to select it (tap again to clear), drag sideways to scrub.
  // Vertical drags still scroll the page (touch-action: pan-y in CSS).
  let touch = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') select(indexAt(e));
    else touch = { id: e.pointerId, i: indexAt(e), moved: false };
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return select(indexAt(e));
    if (!touch || e.pointerId !== touch.id) return;
    const i = indexAt(e);
    if (i !== touch.i) {
      touch.moved = true;
      touch.i = i;
      select(i);
    }
  });
  svg.addEventListener('pointerup', (e) => {
    if (touch && e.pointerId === touch.id && !touch.moved) select(sel === touch.i ? null : touch.i);
    touch = null;
  });
  svg.addEventListener('pointercancel', () => { touch = null; });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') select(null); });

  host.onkeydown = (e) => {
    const last = n - 1;
    const keys = {
      ArrowLeft: sel == null ? last : Math.max(0, sel - 1),
      ArrowRight: sel == null ? last : Math.min(last, sel + 1),
      Home: 0,
      End: last,
      Escape: null,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(keys[e.key]);
  };
}
