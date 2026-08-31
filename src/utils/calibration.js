/**
 * calibration.js
 * Converts pixel distances to real-world millimetres using a known reference object.
 *
 * Reference widths (mm):
 *   Credit card : 85.6
 *   A4 paper    : 210
 *   Custom      : user-supplied
 */

const REF_WIDTHS_MM = {
  creditcard: 85.6,
  a4: 210,
};

export class Calibration {
  constructor() {
    this.pxPerMm = null;
    this.refObjectKey = 'creditcard';
    this.customWidthMm = null;
  }

  isCalibrated() {
    return this.pxPerMm !== null;
  }

  /** Set calibration from a measured pixel width of the reference object. */
  calibrateFromPixelWidth(pixelWidth) {
    const realMm = this._refWidthMm();
    if (!realMm || pixelWidth <= 0) throw new Error('Invalid calibration input');
    this.pxPerMm = pixelWidth / realMm;
    return this.pxPerMm;
  }

  /** Convert a pixel distance to mm (returns null if not calibrated). */
  pxToMm(px) {
    if (!this.isCalibrated()) return null;
    return px / this.pxPerMm;
  }

  /** Euclidean pixel distance between two normalised {x,y} landmarks. */
  static landmarkDistPx(lmA, lmB, canvasWidth, canvasHeight) {
    const dx = (lmA.x - lmB.x) * canvasWidth;
    const dy = (lmA.y - lmB.y) * canvasHeight;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _refWidthMm() {
    if (this.refObjectKey === 'custom') return this.customWidthMm;
    return REF_WIDTHS_MM[this.refObjectKey] ?? null;
  }
}
