import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClientDeviceInfo,
  formatDeviceLastActive,
  getOrCreateLocalDeviceId,
  isDeviceSessionActive
} from './deviceSession';

test('detectClientDeviceInfo identifies mobile and desktop platforms cleanly', () => {
  const android = detectClientDeviceInfo(
    'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'
  );
  assert.equal(android.platform, 'Android');
  assert.equal(android.deviceName, 'Chrome · Android');

  const iphone = detectClientDeviceInfo(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1'
  );
  assert.equal(iphone.platform, 'iPhone');
  assert.equal(iphone.deviceName, 'Safari · iPhone');

  const winEdge = detectClientDeviceInfo(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Edg/131.0'
  );
  assert.equal(winEdge.platform, 'Windows');
  assert.equal(winEdge.deviceName, 'Edge · Windows');
});

test('getOrCreateLocalDeviceId returns Firestore-safe device ID', () => {
  const id = getOrCreateLocalDeviceId();
  assert.match(id, /^dev_[a-zA-Z0-9_-]{8,}$/);
});

test('isDeviceSessionActive & formatDeviceLastActive reflect online window accurately', () => {
  const now = 1_700_000_000_000;
  assert.equal(isDeviceSessionActive(now - 2 * 60_000, now), true);
  assert.equal(isDeviceSessionActive(now - 15 * 60_000, now), false);
  assert.equal(formatDeviceLastActive(now - 60_000, true, now), 'متصل ونشط الآن');
  assert.equal(formatDeviceLastActive(now - 5 * 60_000, false, now), 'آخر نشاط منذ 5 دقيقة');
});
