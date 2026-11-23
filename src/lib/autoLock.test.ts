import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTO_LOCK_OPTIONS,
  formatAutoLockStatus,
  normalizeAutoLockMinutes,
  shouldTriggerAutoLock
} from './autoLock.ts';

test('normalizeAutoLockMinutes maps invalid, zero, negative and valid presets cleanly', () => {
  assert.equal(normalizeAutoLockMinutes(undefined), 0);
  assert.equal(normalizeAutoLockMinutes(-5), 0);
  assert.equal(normalizeAutoLockMinutes(NaN), 0);
  assert.equal(normalizeAutoLockMinutes(0), 0);
  assert.equal(normalizeAutoLockMinutes(1), 1);
  assert.equal(normalizeAutoLockMinutes(5), 5);
  assert.equal(normalizeAutoLockMinutes(15), 15);
  assert.equal(normalizeAutoLockMinutes(30), 30);
  // Nearest valid preset
  assert.equal(normalizeAutoLockMinutes(4), 5);
  assert.equal(normalizeAutoLockMinutes(20), 15);
  assert.ok(AUTO_LOCK_OPTIONS.length >= 5);
});

test('formatAutoLockStatus returns clear Arabic status labels', () => {
  assert.equal(formatAutoLockStatus(0), 'معطّل (يدوي فقط)');
  assert.equal(formatAutoLockStatus(1), 'بعد دقيقة واحدة');
  assert.equal(formatAutoLockStatus(5), 'بعد 5 دقائق');
});

test('shouldTriggerAutoLock triggers only after inactivity duration and skips active calls or locked state', () => {
  const baseTime = 1_700_000_000_000;

  // Disabled
  assert.equal(
    shouldTriggerAutoLock({
      timeoutMinutes: 0,
      lastActivityMs: baseTime,
      nowMs: baseTime + 60 * 60_000,
      isEntered: true,
      isAlreadyLocked: false
    }),
    false
  );

  // Before 5 minutes elapsed
  assert.equal(
    shouldTriggerAutoLock({
      timeoutMinutes: 5,
      lastActivityMs: baseTime,
      nowMs: baseTime + 4 * 60_000 + 59_000,
      isEntered: true,
      isAlreadyLocked: false
    }),
    false
  );

  // Exactly 5 minutes elapsed -> locks
  assert.equal(
    shouldTriggerAutoLock({
      timeoutMinutes: 5,
      lastActivityMs: baseTime,
      nowMs: baseTime + 5 * 60_000,
      isEntered: true,
      isAlreadyLocked: false
    }),
    true
  );

  // Active voice/video call prevents interruption
  assert.equal(
    shouldTriggerAutoLock({
      timeoutMinutes: 1,
      lastActivityMs: baseTime,
      nowMs: baseTime + 10 * 60_000,
      isEntered: true,
      isAlreadyLocked: false,
      hasActiveCall: true
    }),
    false
  );

  // Already locked or not entered
  assert.equal(
    shouldTriggerAutoLock({
      timeoutMinutes: 1,
      lastActivityMs: baseTime,
      nowMs: baseTime + 10 * 60_000,
      isEntered: true,
      isAlreadyLocked: true
    }),
    false
  );
  assert.equal(
    shouldTriggerAutoLock({
      timeoutMinutes: 1,
      lastActivityMs: baseTime,
      nowMs: baseTime + 10 * 60_000,
      isEntered: false,
      isAlreadyLocked: false
    }),
    false
  );
});
