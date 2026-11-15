import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateIdentityKeyPair,
  deriveSharedSecretKey,
  deriveRoomKeyFromSeed,
  encryptPayload,
  decryptPayload,
  computeSafetyNumber
} from './crypto';

test('ECDH key exchange derives identical AES-GCM-256 shared key for Alice and Bob', async () => {
  const alice = await generateIdentityKeyPair();
  const bob = await generateIdentityKeyPair();

  const aliceShared = await deriveSharedSecretKey(alice.privateKeyJwk, bob.publicKeyJwk);
  const bobShared = await deriveSharedSecretKey(bob.privateKeyJwk, alice.publicKeyJwk);

  const secretMessage = 'مرحباً! هذه رسالة مشفرة بالكامل بين الطرفين 🔒';
  const encrypted = await encryptPayload(secretMessage, aliceShared);

  assert.equal(encrypted.algorithm, 'AES-GCM-256');
  assert.notEqual(encrypted.ciphertext, secretMessage);
  assert.ok(encrypted.iv.length >= 12);

  const decryptedByBob = await decryptPayload(encrypted.ciphertext, encrypted.iv, bobShared);
  assert.equal(decryptedByBob, secretMessage);
});

test('Decryption fails with wrong key or tampered ciphertext', async () => {
  const keyA = await deriveRoomKeyFromSeed('chat_room_alpha');
  const keyB = await deriveRoomKeyFromSeed('chat_room_beta');

  const envelope = await encryptPayload('Confidential payload', keyA);

  await assert.rejects(
    async () => {
      await decryptPayload(envelope.ciphertext, envelope.iv, keyB);
    },
    'Expected AES-GCM authentication tag failure when decrypting with wrong key'
  );
});

test('Safety number is symmetric and formatted into 12 groups of 5 digits', async () => {
  const alice = await generateIdentityKeyPair();
  const bob = await generateIdentityKeyPair();

  const codeAB = await computeSafetyNumber(alice.publicKeyJwk, bob.publicKeyJwk);
  const codeBA = await computeSafetyNumber(bob.publicKeyJwk, alice.publicKeyJwk);

  assert.equal(codeAB, codeBA);
  const blocks = codeAB.split(' ');
  assert.equal(blocks.length, 12);
  for (const b of blocks) {
    assert.match(b, /^\d{5}$/);
  }
});
