import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acquireCameraVideoTrack,
  buildCameraSwitchConstraints,
  CALL_QUALITY_PRESETS,
  WEBRTC_RTC_CONFIG,
  buildMediaConstraints,
  enhanceSdpMediaQuality,
  inferFacingModeFromLabel,
  pickNextVideoInputDevice,
  resolveTrackFacingMode
} from './webrtcConfig';

test('CALL_QUALITY_PRESETS and WEBRTC_RTC_CONFIG define HD specs and STUN/TURN pool', () => {
  assert.equal(CALL_QUALITY_PRESETS.ultra.height, 1080);
  assert.equal(CALL_QUALITY_PRESETS.ultra.videoMaxBitrateKbps, 2500);
  assert.equal(CALL_QUALITY_PRESETS.balanced.height, 720);
  assert.equal(CALL_QUALITY_PRESETS.saver.height, 480);
  const servers = WEBRTC_RTC_CONFIG.iceServers || [];
  assert.ok(servers.length >= 4);
  assert.ok(
    servers.some((srv) => {
      const urls = Array.isArray(srv.urls) ? srv.urls : [srv.urls];
      return urls.some((u) => u.startsWith('turn:') || u.startsWith('turns:'));
    }),
    'Expected at least one TURN relay server for symmetric NAT traversal'
  );
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

  const specificMic = buildMediaConstraints('audio', 'ultra', 'user', 'mic_usb_1');
  assert.deepEqual((specificMic.audio as MediaTrackConstraints).deviceId, { exact: 'mic_usb_1' });
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
  assert.ok(enhanced.includes('a=fmtp:111 minptime=10;maxaveragebitrate=128000;stereo=1;sprop-stereo=1;useinbandfec=1;usedtx=0;maxplaybackrate=48000'));
  assert.ok(enhanced.includes('c=IN IP4 0.0.0.0\r\nb=AS:2500'));
});

test('buildCameraSwitchConstraints always disables audio and builds exact or deviceId video constraints', () => {
  const exactRear = buildCameraSwitchConstraints('balanced', {
    facingMode: 'environment',
    exactFacing: true
  });
  assert.equal(exactRear.audio, false);
  assert.deepEqual(exactRear.video, {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 30, max: 60 },
    facingMode: { exact: 'environment' }
  });

  const relaxedById = buildCameraSwitchConstraints('ultra', {
    deviceId: 'cam_rear_main',
    relaxedResolution: true
  });
  assert.equal(relaxedById.audio, false);
  assert.deepEqual(relaxedById.video, {
    deviceId: { exact: 'cam_rear_main' }
  });
});

test('inferFacingModeFromLabel and pickNextVideoInputDevice prioritize primary rear/front lenses', () => {
  assert.equal(inferFacingModeFromLabel('Front Ultra Wide Camera'), 'user');
  assert.equal(inferFacingModeFromLabel('الكاميرا الأمامية'), 'user');
  assert.equal(inferFacingModeFromLabel('camera2 0, facing back'), 'environment');
  assert.equal(inferFacingModeFromLabel('الكاميرا الخلفية'), 'environment');
  assert.equal(inferFacingModeFromLabel('USB HD Webcam'), null);

  const phoneCameras = [
    { deviceId: 'cam_front', label: 'camera2 1, facing front', kind: 'videoinput' },
    { deviceId: 'cam_rear_ultra', label: 'camera2 2, facing back ultra-wide', kind: 'videoinput' },
    { deviceId: 'cam_rear_main', label: 'camera2 0, facing back', kind: 'videoinput' }
  ];

  const pickedRear = pickNextVideoInputDevice(phoneCameras, 'cam_front', 'environment');
  assert.equal(pickedRear?.deviceId, 'cam_rear_main');

  const pickedFront = pickNextVideoInputDevice(phoneCameras, 'cam_rear_main', 'user');
  assert.equal(pickedFront?.deviceId, 'cam_front');

  const desktopCameras = [
    { deviceId: 'usb_1', label: 'Logitech StreamCam', kind: 'videoinput' },
    { deviceId: 'usb_2', label: 'Integrated Webcam', kind: 'videoinput' }
  ];
  assert.equal(
    pickNextVideoInputDevice(desktopCameras, 'usb_1', 'environment')?.deviceId,
    'usb_2'
  );
});

test('resolveTrackFacingMode reads track settings first and falls back to label or fallback facing', () => {
  assert.equal(
    resolveTrackFacingMode(
      { label: 'Generic camera', getSettings: () => ({ facingMode: 'environment' }) },
      'user'
    ),
    'environment'
  );
  assert.equal(
    resolveTrackFacingMode(
      { label: 'camera2 1, facing front', getSettings: () => ({}) },
      'environment'
    ),
    'user'
  );
  assert.equal(
    resolveTrackFacingMode(
      { label: 'Virtual Camera', getSettings: () => ({}) },
      'environment'
    ),
    'environment'
  );
});

test('acquireCameraVideoTrack releases active camera on mobile hardware lock and retries cleanly', async () => {
  let trackReleased = false;
  let calls = 0;

  const mockTrack = (id: string, facing: 'user' | 'environment', label: string) =>
    ({
      kind: 'video',
      label,
      stop: () => {},
      getSettings: () => ({ deviceId: id, facingMode: facing })
    }) as unknown as MediaStreamTrack;

  const mockStream = (track: MediaStreamTrack) =>
    ({
      getVideoTracks: () => [track],
      getAudioTracks: () => []
    }) as unknown as MediaStream;

  const res = await acquireCameraVideoTrack({
    presetId: 'balanced',
    targetFacing: 'environment',
    previousFacing: 'user',
    currentDeviceId: 'cam_front',
    videoInputs: [
      { deviceId: 'cam_front', label: 'Front Camera', kind: 'videoinput' },
      { deviceId: 'cam_back', label: 'Back Camera', kind: 'videoinput' }
    ],
    releaseDelayMs: 0,
    onReleaseCurrentTrack: () => {
      trackReleased = true;
    },
    mediaDevices: {
      getUserMedia: async () => {
        calls += 1;
        if (!trackReleased) {
          const err = new Error('Could not start video source');
          err.name = 'NotReadableError';
          throw err;
        }
        return mockStream(mockTrack('cam_back', 'environment', 'Back Camera'));
      }
    }
  });

  assert.equal(res.errorCode, 'none');
  assert.equal(trackReleased, true);
  assert.equal(res.releasedPreviousTrack, true);
  assert.equal(res.resolvedFacing, 'environment');
  assert.equal(res.resolvedDeviceId, 'cam_back');
  assert.ok(res.track);
  assert.ok(calls >= 2);
});

test('acquireCameraVideoTrack returns single-camera without stopping track when only 1 camera exists', async () => {
  let released = false;
  const res = await acquireCameraVideoTrack({
    targetFacing: 'environment',
    previousFacing: 'user',
    currentDeviceId: 'only_cam',
    videoInputs: [{ deviceId: 'only_cam', label: 'Front Camera', kind: 'videoinput' }],
    releaseDelayMs: 0,
    onReleaseCurrentTrack: () => {
      released = true;
    },
    mediaDevices: {
      getUserMedia: async () => {
        const err = new Error('Requested device not found');
        err.name = 'OverconstrainedError';
        throw err;
      }
    }
  });

  assert.equal(res.errorCode, 'single-camera');
  assert.equal(res.track, null);
  assert.equal(released, false);
});

test('acquireCameraVideoTrack recovers previous camera if target camera fails after release', async () => {
  const mockTrack = (id: string, facing: 'user' | 'environment') =>
    ({
      kind: 'video',
      label: 'Front Camera',
      stop: () => {},
      getSettings: () => ({ deviceId: id, facingMode: facing })
    }) as unknown as MediaStreamTrack;

  const mockStream = (track: MediaStreamTrack) =>
    ({
      getVideoTracks: () => [track],
      getAudioTracks: () => []
    }) as unknown as MediaStream;

  const res = await acquireCameraVideoTrack({
    targetFacing: 'environment',
    previousFacing: 'user',
    currentDeviceId: 'cam_front',
    videoInputs: [
      { deviceId: 'cam_front', label: 'Front Camera', kind: 'videoinput' },
      { deviceId: 'cam_back', label: 'Broken Back Camera', kind: 'videoinput' }
    ],
    releaseDelayMs: 0,
    onReleaseCurrentTrack: () => {},
    mediaDevices: {
      getUserMedia: async (constraints) => {
        const vid = (constraints?.video ?? {}) as MediaTrackConstraints;
        if (vid.deviceId && (vid.deviceId as ConstrainDOMStringParameters).exact === 'cam_front') {
          return mockStream(mockTrack('cam_front', 'user'));
        }
        const err = new Error('Camera hardware busy');
        err.name = 'NotReadableError';
        throw err;
      }
    }
  });

  assert.equal(res.track, null);
  assert.equal(res.releasedPreviousTrack, true);
  assert.equal(res.resolvedFacing, 'user');
  assert.ok(res.recoveryTrack);
});

