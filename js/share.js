// Draws the "today" share image: total reps, each exercise logged today and its
// goal progress. Drawn on a canvas on the device; all text arrives preformatted.

const W = 1080;
const PAD = 72;
const INNER = 44; // padding inside an exercise card
const ROW_GAP = 24;
const TOP = 510; // where the first exercise card starts
const C = {
  bg: '#0b0b0d',
  card: '#17171b',
  ink: '#f4f4f6',
  ink2: '#a9a9b4',
  ink3: '#7f7f8a',
  accent: '#f55a22',
  track: '#45271c',
};
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const NUM = `ui-rounded, "SF Pro Rounded", ${SANS}`;
const font = (weight, size, family = SANS) => `${weight} ${size}px ${family}`;
const rowHeight = (item) => (item.goal ? 246 : 150);

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shortens text with an ellipsis until it fits in max pixels (using the current font).
function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// The tally mark from the app icon, drawn in a size × size box.
function drawLogo(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const lx of [7, 10.33, 13.67, 17]) {
    ctx.moveTo(lx, 5.5);
    ctx.lineTo(lx, 18.5);
  }
  ctx.moveTo(4.5, 15.5);
  ctx.lineTo(19.5, 8.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * model: { date, total, unit, items: [{ name, value, goal?: { ratio, caption, pct } }], more, footer }
 * Returns a canvas 1080px wide, at least 1080px tall.
 */
export function drawShareImage(model) {
  const rowsEnd = TOP + model.items.reduce((h, item) => h + rowHeight(item) + ROW_GAP, 0) + (model.more ? 56 : 0);
  const H = Math.max(W, rowsEnd + 40 + PAD);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const maxW = W - 2 * PAD;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 900);
  glow.addColorStop(0, 'rgba(245, 90, 34, 0.32)');
  glow.addColorStop(1, 'rgba(245, 90, 34, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Brand and date
  drawLogo(ctx, PAD - 8, PAD, 64);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink;
  ctx.font = font(800, 50);
  ctx.fillText('repit', PAD + 64, PAD + 32);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.ink2;
  ctx.font = font(500, 36);
  ctx.fillText(model.date, W - PAD, PAD + 32);

  // Today's total, shrunk if a huge number would not fit
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink2;
  ctx.font = font(600, 40);
  ctx.fillText('Today', PAD, 256);
  ctx.font = font(600, 56);
  const unitW = ctx.measureText(model.unit).width;
  let size = 200;
  ctx.font = font(800, size, NUM);
  let totalW = ctx.measureText(model.total).width;
  if (totalW + 24 + unitW > maxW) {
    size = Math.floor((size * (maxW - 24 - unitW)) / totalW);
    ctx.font = font(800, size, NUM);
    totalW = ctx.measureText(model.total).width;
  }
  ctx.fillStyle = C.ink;
  ctx.fillText(model.total, PAD - 4, 446);
  ctx.fillStyle = C.ink2;
  ctx.font = font(600, 56);
  ctx.fillText(model.unit, PAD + totalW + 20, 446);

  // One card per exercise
  let y = TOP;
  for (const item of model.items) {
    const h = rowHeight(item);
    const left = PAD + INNER;
    const right = W - PAD - INNER;
    ctx.fillStyle = C.card;
    roundedRect(ctx, PAD, y, maxW, h, 36);
    ctx.fill();

    ctx.fillStyle = C.ink;
    ctx.textAlign = 'right';
    ctx.font = font(800, 76, NUM);
    ctx.fillText(item.value, right, y + 106);
    const valueW = ctx.measureText(item.value).width;
    ctx.textAlign = 'left';
    ctx.font = font(600, 46);
    ctx.fillText(fit(ctx, item.name, right - left - valueW - 32), left, y + 106);

    if (item.goal) {
      const barW = right - left;
      ctx.fillStyle = C.track;
      roundedRect(ctx, left, y + 140, barW, 18, 9);
      ctx.fill();
      if (item.goal.ratio > 0) {
        ctx.fillStyle = C.accent;
        roundedRect(ctx, left, y + 140, Math.max(18, barW * Math.min(1, item.goal.ratio)), 18, 9);
        ctx.fill();
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = C.ink;
      ctx.font = font(700, 34);
      ctx.fillText(item.goal.pct, right, y + 206);
      const pctW = ctx.measureText(item.goal.pct).width;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.ink2;
      ctx.font = font(500, 34);
      ctx.fillText(fit(ctx, item.goal.caption, barW - pctW - 24), left, y + 206);
    }
    y += h + ROW_GAP;
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = C.ink3;
  if (model.more) {
    ctx.font = font(600, 36);
    ctx.fillText(model.more, PAD, y + 30);
  }
  ctx.font = font(500, 34);
  ctx.fillText(model.footer, PAD, H - PAD);
  return canvas;
}
