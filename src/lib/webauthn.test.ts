import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arrayBufferToBase64Url,
  base64UrlToUint8Array,
  buildBiometricAuthenticationOptions,
  buildBiometricRegistrationOptions,
  mapWebAuthnErrorToArabic,
  resolveSafeRpId
} from './webauthn';

test('base64url encode and decode preserve arbitrary bytes accurately', () => {
  const sample = new Uint8Array([0, 15, 62, 63, 250, 251, 255, 128, 42]);
  const encoded = arrayBufferToBase64Url(sample);
  assert.ok(!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));

  const decoded = base64UrlToUint8Array(encoded);
  assert.deepEqual(Array.from(decoded), Array.from(sample));
});

test('resolveSafeRpId returns valid domains and rejects IP literals', () => {
  assert.equal(resolveSafeRpId('localhost'), 'localhost');
  assert.equal(resolveSafeRpId('wasil.example.com'), 'wasil.example.com');
  assert.equal(resolveSafeRpId('127.0.0.1'), undefined);
  assert.equal(resolveSafeRpId('::1'), undefined);
  assert.equal(resolveSafeRpId(''), undefined);
});

test('buildBiometricRegistrationOptions & buildBiometricAuthenticationOptions configure platform userVerification', () => {
  const challenge = new Uint8Array(32).fill(7);
  const reg = buildBiometricRegistrationOptions({
    userId: 'uid_ahmed_123',
    userName: 'ahmed@wasil.app',
    displayName: 'أحمد العتيبي',
    rpId: 'localhost',
    challenge
  });

  assert.equal(reg.rp.id, 'localhost');
  assert.equal(reg.authenticatorSelection?.authenticatorAttachment, 'platform');
  assert.equal(reg.authenticatorSelection?.userVerification, 'required');
  assert.ok(reg.pubKeyCredParams.some((p) => p.alg === -7));

  const credId = arrayBufferToBase64Url(new Uint8Array([10, 20, 30, 40]));
  const auth = buildBiometricAuthenticationOptions({
    credentialIdBase64Url: credId,
    rpId: 'localhost',
    challenge
  });

  assert.equal(auth.rpId, 'localhost');
  assert.equal(auth.userVerification, 'required');
  assert.equal(auth.allowCredentials?.length, 1);
  assert.deepEqual(
    Array.from(new Uint8Array(auth.allowCredentials![0].id as ArrayBuffer)),
    [10, 20, 30, 40]
  );
});

test('mapWebAuthnErrorToArabic maps standard WebAuthn DOMException names clearly', () => {
  const errNotAllowed = Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
  const errNotSupported = Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
  const errSecurity = Object.assign(new Error('insecure'), { name: 'SecurityError' });

  assert.match(mapWebAuthnErrorToArabic(errNotAllowed), /إلغاء|المهلة/);
  assert.match(mapWebAuthnErrorToArabic(errNotSupported), /لا يدعم/);
  assert.match(mapWebAuthnErrorToArabic(errSecurity), /HTTPS|آمن/);
});
