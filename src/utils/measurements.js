/**
 * measurements.js
 * Derives real-world measurements from MediaPipe Face Mesh & Pose landmarks.
 *
 * Key Face Mesh indices used:
 *   10  – forehead top-centre    152 – chin bottom
 *   234 – left cheekbone edge    454 – right cheekbone edge
 *   33  – left eye inner         263 – right eye inner
 *   468 – left pupil (refined)   473 – right pupil (refined)
 *   168 – nose bridge            2   – nose tip bottom
 *   58  – left jaw edge          288 – right jaw edge
 *
 * Key Pose indices used:
 *   11/12 – shoulders  13/14 – elbows  15/16 – wrists
 */

import { Calibration } from './calibration.js';

const TYPICAL_RANGES = {
  faceWidth:         '130 – 145 mm',
  headCircumference: '530 – 580 mm',
  pd:                '55 – 70 mm',
  noseHeight:        '40 – 55 mm',
  jawWidth:          '100 – 120 mm',
  shoulderWidth:     '380 – 460 mm',
  neckWidth:         '90 – 120 mm',
  armLength:         '550 – 650 mm',
};

const LABELS = {
  faceWidth:         'Face Width',
  headCircumference: 'Head Circumference (est.)',
  pd:                'Pupillary Distance (PD)',
  noseHeight:        'Nose Height',
  jawWidth:          'Jaw Width',
  shoulderWidth:     'Shoulder Width',
  neckWidth:         'Neck Width (est.)',
  armLength:         'Arm Length',
};

/**
 * @param {Array|null} faceLandmarks
 * @param {Array|null} poseLandmarks
 * @param {Calibration} cal
 * @param {Set<string>} enabled
 * @param {number} W  canvas width
 * @param {number} H  canvas height
 * @returns {Array<{key,label,valueMm,display,range}>}
 */
export function computeMeasurements(faceLandmarks, poseLandmarks, cal, enabled, W, H) {
  if (!cal.isCalibrated()) return [];

  const results = [];

  const D = (a, b) => {
    if (!a || !b) return null;
    const px = Calibration.landmarkDistPx(a, b, W, H);
    return cal.pxToMm(px);
  };

  const fmt = (mm) => mm != null ? `${mm.toFixed(1)} mm` : '—';

  // ── Face ──────────────────────────────────────────────────────────
  if (faceLandmarks?.length) {
    const fl = faceLandmarks;

    if (enabled.has('faceWidth')) {
      const mm = D(fl[234], fl[454]);
      results.push({ key: 'faceWidth', label: LABELS.faceWidth, valueMm: mm, display: fmt(mm), range: TYPICAL_RANGES.faceWidth });
    }

    if (enabled.has('headCircumference')) {
      const faceW = D(fl[234], fl[454]);
      const faceH = D(fl[10],  fl[152]);
      if (faceW && faceH) {
        const a = faceW / 2, b = faceH / 2;
        // Ramanujan approximation × 1.15 to account for head depth
        const headCirc = Math.PI * (3*(a+b) - Math.sqrt((3*a+b)*(a+3*b))) * 1.15;
        results.push({ key: 'headCircumference', label: LABELS.headCircumference, valueMm: headCirc, display: fmt(headCirc), range: TYPICAL_RANGES.headCircumference });
      }
    }

    if (enabled.has('pd')) {
      const leftPupil  = fl[468] ?? fl[33];
      const rightPupil = fl[473] ?? fl[263];
      const mm = D(leftPupil, rightPupil);
      results.push({ key: 'pd', label: LABELS.pd, valueMm: mm, display: fmt(mm), range: TYPICAL_RANGES.pd });
    }

    if (enabled.has('noseHeight')) {
      const mm = D(fl[168], fl[2]);
      results.push({ key: 'noseHeight', label: LABELS.noseHeight, valueMm: mm, display: fmt(mm), range: TYPICAL_RANGES.noseHeight });
    }

    if (enabled.has('jawWidth')) {
      const mm = D(fl[58], fl[288]);
      results.push({ key: 'jawWidth', label: LABELS.jawWidth, valueMm: mm, display: fmt(mm), range: TYPICAL_RANGES.jawWidth });
    }
  }

  // ── Body / Pose ───────────────────────────────────────────────────
  if (poseLandmarks?.length) {
    const pl = poseLandmarks;

    if (enabled.has('shoulderWidth')) {
      const mm = D(pl[11], pl[12]);
      results.push({ key: 'shoulderWidth', label: LABELS.shoulderWidth, valueMm: mm, display: fmt(mm), range: TYPICAL_RANGES.shoulderWidth });
    }

    if (enabled.has('neckWidth')) {
      const sw = D(pl[11], pl[12]);
      if (sw) {
        const neckMm = sw * 0.76; // typical neck-to-shoulder ratio
        results.push({ key: 'neckWidth', label: LABELS.neckWidth, valueMm: neckMm, display: fmt(neckMm), range: TYPICAL_RANGES.neckWidth });
      }
    }

    if (enabled.has('armLength')) {
      const upper = D(pl[11], pl[13]);
      const lower = D(pl[13], pl[15]);
      if (upper && lower) {
        const mm = upper + lower;
        results.push({ key: 'armLength', label: LABELS.armLength, valueMm: mm, display: fmt(mm), range: TYPICAL_RANGES.armLength });
      }
    }
  }

  return results;
}
