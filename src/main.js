/**
 * main.js
 * Orchestrates camera/upload, MediaPipe models, calibration, and rendering.
 */

import { Calibration }       from './utils/calibration.js';
import { computeMeasurements } from './utils/measurements.js';
import { render }            from './utils/renderer.js';

// MediaPipe is loaded from CDN via dynamic <script> tags (avoids Vite bundling WASM)
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe';

// ── App state ─────────────────────────────────────────────────────────
const cal = new Calibration();
let mode          = 'camera';
let faceLandmarks = null;
let poseLandmarks = null;
let uploadedImage = null;
let animFrame     = null;
let enabledMeasures = new Set();
let faceMesh = null;
let pose     = null;
let cameraActive = false;

// ── DOM ───────────────────────────────────────────────────────────────
const video       = document.getElementById('video');
const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d');
const tabs        = document.querySelectorAll('.tab');
const calBanner   = document.getElementById('calibrationBanner');
const refSelect   = document.getElementById('refObject');
const customInput = document.getElementById('customWidth');
const calBtn      = document.getElementById('calibrateBtn');
const calStatus   = document.getElementById('calStatus');
const uploadArea  = document.getElementById('uploadArea');
const fileInput   = document.getElementById('fileInput');
const uploadedImg = document.getElementById('uploadedImg');
const detectBtn   = document.getElementById('detectBtn');
const resultsBody = document.getElementById('resultsBody');
const exportBtn   = document.getElementById('exportBtn');
const checkboxes  = document.querySelectorAll('[data-measure]');

// ── Measurement toggles ───────────────────────────────────────────────
function syncEnabled() {
  enabledMeasures = new Set([...checkboxes].filter(c => c.checked).map(c => c.dataset.measure));
}
syncEnabled();
checkboxes.forEach(c => c.addEventListener('change', syncEnabled));

// ── Tabs ──────────────────────────────────────────────────────────────
tabs.forEach(tab => tab.addEventListener('click', () => {
  tabs.forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  mode = tab.dataset.mode;

  if (mode === 'camera') {
    uploadArea.style.display = 'none';
    detectBtn.style.display  = 'none';
    uploadedImage = null;
    startCamera();
  } else {
    stopCamera();
    uploadArea.style.display = 'flex';
    detectBtn.style.display  = 'block';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}));

// ── Calibration ───────────────────────────────────────────────────────
refSelect.addEventListener('change', () => {
  cal.refObjectKey = refSelect.value;
  customInput.style.display = refSelect.value === 'custom' ? 'inline-block' : 'none';
});

calBtn.addEventListener('click', () => {
  if (refSelect.value === 'custom') {
    const w = parseFloat(customInput.value);
    if (!w || w <= 0) { alert('Enter a valid custom width in mm.'); return; }
    cal.customWidthMm = w;
  }
  const refName = refSelect.options[refSelect.selectedIndex].text;
  const input = prompt(
    `CALIBRATION — ${refName}\n\n` +
    `Hold the object flat and centred in frame.\n` +
    `Enter how many PIXELS wide it appears in the video:\n` +
    `(Tip: take a screenshot, measure it in Paint or Preview, then enter that value.)`
  );
  const px = parseFloat(input);
  if (!px || px <= 0) { calStatus.textContent = 'Cancelled.'; return; }

  try {
    cal.calibrateFromPixelWidth(px);
    calStatus.textContent = `✓ Calibrated`;
    calBanner.classList.add('calibrated');
  } catch (e) {
    alert('Calibration error: ' + e.message);
  }
});

// ── MediaPipe loader ──────────────────────────────────────────────────
async function loadMediaPipe() {
  const FM_VER = '0.4.1633559619';
  const PO_VER = '0.5.1675469404';

  await loadScript(`${MP}/face_mesh@${FM_VER}/face_mesh.js`);
  await loadScript(`${MP}/pose@${PO_VER}/pose.js`);

  faceMesh = new window.FaceMesh({
    locateFile: f => `${MP}/face_mesh@${FM_VER}/${f}`
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  faceMesh.onResults(r => {
    faceLandmarks = r.multiFaceLandmarks?.[0] ?? null;
  });

  pose = new window.Pose({
    locateFile: f => `${MP}/pose@${PO_VER}/${f}`
  });
  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  pose.onResults(r => {
    poseLandmarks = r.poseLandmarks ?? null;
    drawFrame(); // render after both models have responded
  });

  await faceMesh.initialize();
  await pose.initialize();
  console.log('MediaPipe models ready.');
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = Object.assign(document.createElement('script'), { src });
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Camera ────────────────────────────────────────────────────────────
async function startCamera() {
  if (cameraActive) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 1280, height: 720 } });
    video.srcObject = stream;
    await video.play();
    cameraActive = true;
    tick();
  } catch (e) {
    alert('Camera access denied: ' + e.message);
  }
}

function stopCamera() {
  cameraActive = false;
  cancelAnimationFrame(animFrame);
  video.srcObject?.getTracks().forEach(t => t.stop());
  video.srcObject = null;
}

async function tick() {
  if (!cameraActive) return;
  resizeCanvas(video);
  if (faceMesh && pose) {
    await faceMesh.send({ image: video });
    await pose.send({ image: video });
  } else {
    // Models not ready yet – just draw raw video
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  }
  animFrame = requestAnimationFrame(tick);
}

// ── Upload ────────────────────────────────────────────────────────────
fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  uploadedImg.src = URL.createObjectURL(file);
  uploadedImg.style.display = 'block';
  document.querySelector('.upload-label').style.display = 'none';
  uploadedImg.onload = () => {
    uploadedImage = uploadedImg;
    resizeCanvas(uploadedImage);
    ctx.drawImage(uploadedImage, 0, 0, canvas.width, canvas.height);
  };
});

detectBtn.addEventListener('click', async () => {
  if (!uploadedImage)      { alert('Upload an image first.'); return; }
  if (!faceMesh || !pose)  { alert('Models loading — please wait a moment.'); return; }
  await faceMesh.send({ image: uploadedImage });
  await pose.send({ image: uploadedImage });
});

// ── Render ────────────────────────────────────────────────────────────
function drawFrame() {
  const source = mode === 'camera' ? video : uploadedImage;
  if (!source) return;
  const W = canvas.width, H = canvas.height;
  const measures = computeMeasurements(faceLandmarks, poseLandmarks, cal, enabledMeasures, W, H);
  render(ctx, source, faceLandmarks, poseLandmarks, measures, W, H);
  updateTable(measures);
}

function resizeCanvas(source) {
  const w = source.videoWidth  ?? source.naturalWidth  ?? 640;
  const h = source.videoHeight ?? source.naturalHeight ?? 480;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

// ── Results table ─────────────────────────────────────────────────────
function updateTable(measures) {
  if (!measures.length) {
    resultsBody.innerHTML = `<tr><td colspan="3" class="placeholder">${
      cal.isCalibrated()
        ? 'Stand in front of the camera — make sure your face and/or body are visible.'
        : 'Complete calibration first.'
    }</td></tr>`;
    return;
  }
  resultsBody.innerHTML = measures
    .map(m => `<tr><td>${m.label}</td><td>${m.display}</td><td>${m.range}</td></tr>`)
    .join('');
}

// ── Export CSV ────────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  const rows = [...document.querySelectorAll('#resultsTable tbody tr')]
    .map(tr => [...tr.querySelectorAll('td')].map(td => `"${td.textContent}"`).join(','))
    .join('\n');
  const csv  = `"Measurement","Value (mm)","Typical Range"\n${rows}`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `measurements-${new Date().toISOString().slice(0,10)}.csv`,
  });
  a.click();
});

// ── Boot ──────────────────────────────────────────────────────────────
(async () => {
  await loadMediaPipe();
  startCamera();
})().catch(console.error);
