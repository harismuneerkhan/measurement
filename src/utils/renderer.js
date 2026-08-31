/**
 * renderer.js
 * Draws landmarks, skeleton, measurement lines and labels onto the canvas.
 */

const C = {
  face:        '#4f8ef7',
  pose:        '#a78bfa',
  measurement: '#34d399',
  label:       '#ffffff',
  shadow:      'rgba(0,0,0,0.75)',
};

const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
];

export function render(ctx, source, faceLandmarks, poseLandmarks, measurements, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(source, 0, 0, W, H);

  if (faceLandmarks?.length)  drawFaceDots(ctx, faceLandmarks, W, H);
  if (poseLandmarks?.length)  drawPoseSkeleton(ctx, poseLandmarks, W, H);

  drawMeasurementOverlay(ctx, faceLandmarks, poseLandmarks, measurements, W, H);
}

function drawFaceDots(ctx, fl, W, H) {
  ctx.fillStyle = C.face;
  for (const lm of fl) {
    ctx.beginPath();
    ctx.arc(lm.x * W, lm.y * H, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPoseSkeleton(ctx, pl, W, H) {
  ctx.strokeStyle = C.pose;
  ctx.lineWidth = 2.5;
  for (const [a, b] of POSE_CONNECTIONS) {
    if (!pl[a] || !pl[b]) continue;
    if ((pl[a].visibility ?? 1) < 0.4 || (pl[b].visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.moveTo(pl[a].x * W, pl[a].y * H);
    ctx.lineTo(pl[b].x * W, pl[b].y * H);
    ctx.stroke();
  }
  ctx.fillStyle = C.pose;
  for (const lm of pl) {
    if (!lm || (lm.visibility ?? 1) < 0.4) continue;
    ctx.beginPath();
    ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMeasurementOverlay(ctx, fl, pl, measurements, W, H) {
  if (!measurements?.length) return;

  // Map each measurement key to the pair (or chain) of landmarks to draw a line through
  const lineFor = {
    faceWidth:    fl ? [fl[234], fl[454]] : null,
    pd:           fl ? [fl[468] ?? fl[33], fl[473] ?? fl[263]] : null,
    jawWidth:     fl ? [fl[58],  fl[288]] : null,
    noseHeight:   fl ? [fl[168], fl[2]]   : null,
    shoulderWidth: pl ? [pl[11],  pl[12]]  : null,
    armLength:    pl ? [pl[11], pl[13], pl[15]] : null,
  };

  ctx.strokeStyle = C.measurement;
  ctx.lineWidth = 2;

  for (const m of measurements) {
    const pts = lineFor[m.key];

    // Head circumference → ellipse
    if (m.key === 'headCircumference' && fl?.length) {
      const cx = ((fl[234].x + fl[454].x) / 2) * W;
      const cy = ((fl[10].y  + fl[152].y) / 2) * H;
      const rx =  Math.abs((fl[454].x - fl[234].x) / 2 * W);
      const ry =  Math.abs((fl[152].y - fl[10].y)  / 2 * H);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, cx, cy - ry - 12, m.display);
      continue;
    }

    if (!pts) continue;

    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x * W, pts[0].y * H);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * W, pts[i].y * H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label at midpoint of first-to-last
    const mx = (pts[0].x + pts[pts.length-1].x) / 2 * W;
    const my = (pts[0].y + pts[pts.length-1].y) / 2 * H - 10;
    label(ctx, mx, my, m.display);
  }
}

function label(ctx, x, y, text) {
  ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
  const w = ctx.measureText(text).width;
  const pad = 5;
  ctx.fillStyle = C.shadow;
  ctx.fillRect(x - w/2 - pad, y - 15, w + pad*2, 20);
  ctx.fillStyle = C.label;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}
