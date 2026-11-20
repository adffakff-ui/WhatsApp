import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAutoExposureFromLuminance,
  computeMeanLuminance,
  DEFAULT_AUTO_EXPOSURE,
  formatAutoExposureCssFilter,
  smoothAutoExposure
} from './videoAutoExposure';

test('computeMeanLuminance calculates accurate BT.709 luminance across RGBA pixels', () => {
  const blackPixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
  assert.equal(computeMeanLuminance(blackPixels), 0);

  const whitePixels = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
  assert.ok(Math.abs(computeMeanLuminance(whitePixels) - 255) < 0.01);

  const empty = new Uint8ClampedArray(0);
  assert.equal(computeMeanLuminance(empty), 128);
});

test('calculateAutoExposureFromLuminance boosts low-light frames and stabilizes normal/bright frames', () => {
  const dark = calculateAutoExposureFromLuminance(20);
  assert.equal(dark.condition, 'very_dark');
  assert.ok(dark.brightness > 1.45 && dark.brightness <= 1.65);
  assert.ok(dark.contrast >= 1.12);

  const dim = calculateAutoExposureFromLuminance(72);
  assert.equal(dim.condition, 'dim');
  assert.ok(dim.brightness > 1.05 && dim.brightness < 1.38);

  const optimal = calculateAutoExposureFromLuminance(135);
  assert.equal(optimal.condition, 'optimal');
  assert.equal(optimal.brightness, 1);
  assert.equal(optimal.contrast, 1);

  const bright = calculateAutoExposureFromLuminance(235);
  assert.equal(bright.condition, 'bright');
  assert.ok(bright.brightness < 1 && bright.brightness >= 0.85);
});

test('smoothAutoExposure interpolates gradually without abrupt exposure jumps', () => {
  const target = calculateAutoExposureFromLuminance(18);
  const step1 = smoothAutoExposure(DEFAULT_AUTO_EXPOSURE, target, 0.25);
  assert.ok(step1.brightness > 1.0 && step1.brightness < target.brightness);

  const step2 = smoothAutoExposure(step1, target, 0.25);
  assert.ok(step2.brightness > step1.brightness && step2.brightness < target.brightness);

  const css = formatAutoExposureCssFilter(step2);
  assert.match(css, /^brightness\(\d+(\.\d+)?\) contrast\(\d+(\.\d+)?\) saturate\(\d+(\.\d+)?\)$/);
});
