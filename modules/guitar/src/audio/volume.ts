/** Perceptual volume curve: slider 0–1 → linear gain (quadratic, so the slider feels even). */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume));
  return v * v;
}
