import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAudioLevelPercent,
  downsampleWaveform,
  formatVoiceDownloadName,
  formatVoiceSizeLabel,
  getNextVoicePlaybackRate,
  mapMicrophoneErrorToArabic,
  normalizeVoiceWaveform,
  VOICE_WAVEFORM_BAR_COUNT
} from './voiceRecorder';

test('computeAudioLevelPercent computes bounded RMS level from PCM samples', () => {
  const silent = new Uint8Array(64).fill(128);
  assert.equal(computeAudioLevelPercent(silent), 12);

  const loud = new Uint8Array(64);
  for (let i = 0; i < loud.length; i += 1) {
    loud[i] = i % 2 === 0 ? 220 : 36;
  }
  const level = computeAudioLevelPercent(loud);
  assert.ok(level >= 70 && level <= 100);
});

test('downsampleWaveform returns target bar count clamped between 16 and 96', () => {
  const bars = downsampleWaveform([10, 40, 90, 120, 25, 65, 80, 15], 28);
  assert.equal(bars.length, 28);
  assert.ok(bars.every((v) => v >= 16 && v <= 96));

  const fallback = normalizeVoiceWaveform(undefined);
  assert.equal(fallback.length, VOICE_WAVEFORM_BAR_COUNT);
});

test('getNextVoicePlaybackRate cycles cleanly 1 -> 1.5 -> 2 -> 1', () => {
  assert.equal(getNextVoicePlaybackRate(1), 1.5);
  assert.equal(getNextVoicePlaybackRate(1.5), 2);
  assert.equal(getNextVoicePlaybackRate(2), 1);
});

test('mapMicrophoneErrorToArabic translates standard MediaDevices DOMExceptions clearly', () => {
  const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  assert.match(mapMicrophoneErrorToArabic(denied), /إذن الميكروفون/);

  const missing = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
  assert.match(mapMicrophoneErrorToArabic(missing), /لم يتم العثور على ميكروفون/);

  const busy = Object.assign(new Error('Could not start audio source'), { name: 'NotReadableError' });
  assert.match(mapMicrophoneErrorToArabic(busy), /مستخدم حالياً/);
});

test('formatVoiceSizeLabel and formatVoiceDownloadName produce clean metadata', () => {
  assert.equal(formatVoiceSizeLabel(12288), '12 KB');
  assert.equal(
    formatVoiceDownloadName(Date.UTC(2026, 10, 25), 'data:audio/ogg;codecs=opus;base64,AAA'),
    'wasil-voice-20261125.ogg'
  );
  assert.equal(
    formatVoiceDownloadName(Date.UTC(2026, 10, 25), 'data:audio/webm;base64,AAA'),
    'wasil-voice-20261125.webm'
  );
});
