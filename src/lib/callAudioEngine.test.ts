import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LISTENING_BOOST_PRESETS,
  VOICE_CLARITY_DSP_CONFIG,
  getBoostGainValue,
  computeNormalizedBandLevels,
  isSpeechActiveFromLevels
} from './callAudioEngine';

test('LISTENING_BOOST_PRESETS and getBoostGainValue scale gain safely with clarity DSP', () => {
  assert.equal(LISTENING_BOOST_PRESETS.normal.gain, 1.0);
  assert.equal(LISTENING_BOOST_PRESETS.clear.gain, 1.35);
  assert.equal(LISTENING_BOOST_PRESETS.loud.gain, 1.75);

  assert.equal(getBoostGainValue('normal', true), 1.0);
  assert.equal(getBoostGainValue('clear', true), 1.35);
  assert.equal(getBoostGainValue('loud', true), 1.75);

  // Without vocal clarity compression, loud boost caps at 1.5x to prevent distortion
  assert.equal(getBoostGainValue('loud', false), 1.5);
  assert.equal(getBoostGainValue('clear', false), 1.35);
});

test('VOICE_CLARITY_DSP_CONFIG sets studio vocal EQ and dynamics compressor bounds', () => {
  assert.ok(VOICE_CLARITY_DSP_CONFIG.highPassHz >= 75 && VOICE_CLARITY_DSP_CONFIG.highPassHz <= 100);
  assert.ok(VOICE_CLARITY_DSP_CONFIG.presenceHz >= 2000 && VOICE_CLARITY_DSP_CONFIG.presenceHz <= 3500);
  assert.ok(VOICE_CLARITY_DSP_CONFIG.presenceGainDb > 0);
  assert.ok(VOICE_CLARITY_DSP_CONFIG.compressorRatio >= 2);
});

test('computeNormalizedBandLevels and isSpeechActiveFromLevels map FFT energy to bar heights', () => {
  const silent = new Uint8Array(32).fill(0);
  const silentLevels = computeNormalizedBandLevels(silent, 5, 16);
  assert.deepEqual(silentLevels, [16, 16, 16, 16, 16]);
  assert.equal(isSpeechActiveFromLevels(silentLevels, 24), false);

  const active = new Uint8Array(32);
  active[0] = 200;
  active[1] = 190;
  active[2] = 180;
  active[3] = 170;
  active[5] = 128;
  const activeLevels = computeNormalizedBandLevels(active, 5, 16);
  assert.equal(activeLevels.length, 5);
  assert.ok(activeLevels[0] > 60);
  assert.equal(isSpeechActiveFromLevels(activeLevels, 24), true);

  const emptyLevels = computeNormalizedBandLevels(new Uint8Array(0), 4, 14);
  assert.deepEqual(emptyLevels, [14, 14, 14, 14]);
});
