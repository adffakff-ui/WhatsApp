import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAuthCountries } from './authCountries';
import {
  formatPhoneDisplay,
  mapFirebaseAuthErrorToArabic,
  normalizePhoneToE164,
  parseWasilBackupJson,
  validateEmailAddress,
  validatePasswordStrength
} from './authHelpers';

test('normalizePhoneToE164 strips trunk zeros and formats E.164 cleanly', () => {
  const sa = normalizePhoneToE164('+966', '050 123-4567', 9, 9);
  assert.equal(sa.valid, true);
  assert.equal(sa.e164, '+966501234567');
  assert.equal(sa.nationalDigits, '501234567');

  const ye = normalizePhoneToE164('+967', '00967770123456', 9, 9);
  assert.equal(ye.valid, true);
  assert.equal(ye.e164, '+967770123456');

  const shortNum = normalizePhoneToE164('+966', '5012', 9, 9);
  assert.equal(shortNum.valid, false);
  assert.ok(shortNum.error?.includes('قصير'));
});

test('formatPhoneDisplay creates spaced human-readable international output', () => {
  assert.equal(formatPhoneDisplay('+966', '501234567'), '+966 501 234 567');
  assert.equal(formatPhoneDisplay('+966', ''), '+966');
});

test('filterAuthCountries searches in Arabic, English, and dial code', () => {
  assert.ok(filterAuthCountries('اليمن').some((c) => c.iso === 'YE'));
  assert.ok(filterAuthCountries('971').some((c) => c.iso === 'AE'));
  assert.ok(filterAuthCountries('jordan').some((c) => c.iso === 'JO'));
});

test('validateEmailAddress & validatePasswordStrength work accurately', () => {
  assert.equal(validateEmailAddress('omar@wasil.app'), true);
  assert.equal(validateEmailAddress('invalid-email'), false);

  const weak = validatePasswordStrength('123');
  assert.equal(weak.score, 1);

  const strong = validatePasswordStrength('Wasil@2026!');
  assert.equal(strong.score, 4);
  assert.equal(strong.label, 'قوية جداً');
});

test('mapFirebaseAuthErrorToArabic translates Firebase auth error codes clearly', () => {
  assert.ok(
    mapFirebaseAuthErrorToArabic({ code: 'auth/wrong-password' }).includes('غير صحيحة')
  );
  assert.ok(
    mapFirebaseAuthErrorToArabic({ code: 'auth/email-already-in-use' }).includes('مسجل مسبقاً')
  );
  assert.ok(
    mapFirebaseAuthErrorToArabic({ code: 'auth/invalid-verification-code' }).includes('رمز التحقق')
  );
});

test('parseWasilBackupJson parses valid JSON backups and rejects invalid structures', () => {
  const valid = parseWasilBackupJson(
    JSON.stringify({
      omarSettings: { omarTheme: 'burgundy', antiDeleteMessages: true },
      profile: { displayName: 'أكرم' },
      chats: []
    })
  );
  assert.equal(valid.omarSettings?.omarTheme, 'burgundy');
  assert.equal(valid.profile?.displayName, 'أكرم');

  assert.throws(() => parseWasilBackupJson('not json'));
  assert.throws(() => parseWasilBackupJson('{"foo":"bar"}'));
});
