import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALL_QUALITY_PRESETS,
  WEBRTC_RTC_CONFIG,
  buildMediaConstraints,
  enhanceSdpMediaQuality
} from './webrtcConfig';

test('CALL_QUALITY_PRESETS and WEBRTC_RTC_CONFIG define HD specs and STUN pool', () => {
  assert.equal(CALL_QUALITY_PRESETS.ultra.height, 1080);
  assert.equal(CALL_QUALITY_PRESETS.ultra.videoMaxBitrateKbps, 2500);
  assert.equal(CALL_QUALITY_PRESETS.balanced.height, 720);
  assert.equal(CALL_QUALITY_PRESETS.saver.height, 480);
  assert.ok((WEBRTC_RTC_CONFIG.iceServers?.length || 0) >= 3);
  assert.equal(WEBRTC_RTC_CONFIG.bundlePolicy, 'max-bundle');
  assert.equal(WEBRTC_RTC_CONFIG.rtcpMuxPolicy, 'require');
});

test('buildMediaConstraints configures studio 48kHz stereo audio and target video preset', () => {
  const audioOnly = buildMediaConstraints('audio', 'ultra');
  assert.equal(audioOnly.video, false);
  assert.deepEqual(audioOnly.audio, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 2,
    sampleRate: 48000
  });

  const rearVideo = buildMediaConstraints('video', 'balanced', 'environment');
  assert.equal(typeof rearVideo.video, 'object');
  const videoTrack = rearVideo.video as MediaTrackConstraints;
  assert.deepEqual(videoTrack.width, { ideal: 1280, max: 1280 });
  assert.deepEqual(videoTrack.height, { ideal: 720, max: 720 });
  assert.equal(videoTrack.facingMode, 'environment');
});

test('enhanceSdpMediaQuality boosts Opus bitrate/stereo/FEC and video b=AS bandwidth', () => {
  const sampleSdp = [
    'v=0',
    'o=- 123 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:96 VP9/90000'
  ].join('\r\n');

  const enhanced = enhanceSdpMediaQuality(sampleSdp, 'ultra');
  assert.ok(enhanced.includes('a=fmtp:111 minptime=10;maxaveragebitrate=128000;stereo=1;sprop-stereo=1;useinbandfec=1;usedtx=0'));
  assert.ok(enhanced.includes('c=IN IP4 0.0.0.0\r\nb=AS:2500'));
});
