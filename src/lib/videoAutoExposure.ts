export type LightingCondition = 'very_dark' | 'dim' | 'optimal' | 'bright';

export interface AutoExposureSettings {
  brightness: number;
  contrast: number;
  saturate: number;
  meanLuminance: number;
  condition: LightingCondition;
}

export const DEFAULT_AUTO_EXPOSURE: AutoExposureSettings = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  meanLuminance: 128,
  condition: 'optimal'
};

/**
 * Computes perceived ITU-R BT.709 mean luminance [0..255] from RGBA pixel data.
 * Uses a stride to stay ultra-fast even on larger frames.
 */
export function computeMeanLuminance(rgba: Uint8ClampedArray, pixelStride = 1): number {
  const step = Math.max(1, Math.floor(pixelStride)) * 4;
  let totalLuma = 0;
  let count = 0;

  for (let i = 0; i + 2 < rgba.length; i += step) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    totalLuma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    count += 1;
  }

  if (count === 0) return 128;
  return totalLuma / count;
}

function roundTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes target auto-exposure CSS filter parameters from measured frame luminance.
 * Dark/low-light feeds receive smooth luminance uplift, mild contrast recovery,
 * and subtle saturation compensation to preserve natural facial tones.
 */
export function calculateAutoExposureFromLuminance(meanLuminance: number): AutoExposureSettings {
  const luma = Math.max(0, Math.min(255, meanLuminance));

  if (luma < 45) {
    // Severe low-light: boost brightness up to 1.62 while controlling washed blacks
    const deficit = (45 - luma) / 45;
    return {
      brightness: roundTwoDecimals(1.36 + deficit * 0.26),
      contrast: roundTwoDecimals(1.12 + deficit * 0.06),
      saturate: roundTwoDecimals(1.06 + deficit * 0.04),
      meanLuminance: Math.round(luma),
      condition: 'very_dark'
    };
  }

  if (luma < 96) {
    // Dim indoor lighting: progressive boost from 1.04 up to 1.36
    const ratio = (96 - luma) / (96 - 45);
    return {
      brightness: roundTwoDecimals(1.04 + ratio * 0.32),
      contrast: roundTwoDecimals(1.03 + ratio * 0.09),
      saturate: roundTwoDecimals(1.02 + ratio * 0.04),
      meanLuminance: Math.round(luma),
      condition: 'dim'
    };
  }

  if (luma > 195) {
    // Backlit / overexposed: softly attenuate highlights down to 0.88
    const excess = Math.min(1, (luma - 195) / 60);
    return {
      brightness: roundTwoDecimals(0.96 - excess * 0.08),
      contrast: roundTwoDecimals(1.04 + excess * 0.04),
      saturate: 1,
      meanLuminance: Math.round(luma),
      condition: 'bright'
    };
  }

  return {
    brightness: 1,
    contrast: 1,
    saturate: 1,
    meanLuminance: Math.round(luma),
    condition: 'optimal'
  };
}

/**
 * Exponentially smooths filter transitions to prevent flickering during head movement or lighting shifts.
 */
export function smoothAutoExposure(
  previous: AutoExposureSettings,
  target: AutoExposureSettings,
  alpha = 0.28
): AutoExposureSettings {
  const clampedAlpha = Math.max(0.05, Math.min(1, alpha));
  const lerp = (a: number, b: number) => roundTwoDecimals(a + (b - a) * clampedAlpha);

  return {
    brightness: lerp(previous.brightness, target.brightness),
    contrast: lerp(previous.contrast, target.contrast),
    saturate: lerp(previous.saturate, target.saturate),
    meanLuminance: target.meanLuminance,
    condition: target.condition
  };
}

export function formatAutoExposureCssFilter(settings: AutoExposureSettings): string {
  return `brightness(${settings.brightness}) contrast(${settings.contrast}) saturate(${settings.saturate})`;
}
