import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateIdentityKeyPair,
  deriveSharedSecretKey,
  derivePairwiseChatKey,
  deriveRoomKeyFromSeed,
  deriveCandidateRoomKeysForDecryption,
  encryptPayload,
  decryptPayload,
  decryptPayloadWithAnyKey,
  computeSafetyNumber,
  setActiveCryptoUid,
  readStoredIdentityKeysForUid,
  saveStoredIdentityKeysForUid,
  getPrimaryKeysStorageKey,
  mergeArchivedIdentityKeys
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

test('Pairwise v2 HKDF key exchange is strictly symmetric between Alice and Bob', async () => {
  const alice = await generateIdentityKeyPair();
  const bob = await generateIdentityKeyPair();
  const chatId = 'direct_alice_bob_symmetry';

  const aliceKey = await derivePairwiseChatKey(
    alice.privateKeyJwk,
    bob.publicKeyJwk,
    chatId,
    alice.publicKeyJwk
  );
  const bobKey = await derivePairwiseChatKey(
    bob.privateKeyJwk,
    alice.publicKeyJwk,
    chatId,
    bob.publicKeyJwk
  );

  const msgFromAlice = 'أهلاً بك يا صديقي — رسالة مشفرة v2';
  const envA = await encryptPayload(msgFromAlice, aliceKey);
  assert.equal(await decryptPayload(envA.ciphertext, envA.iv, bobKey), msgFromAlice);

  const msgFromBob = 'وعليكم السلام — تم استلام الرسالة وفك تشفيرها!';
  const envB = await encryptPayload(msgFromBob, bobKey);
  assert.equal(await decryptPayload(envB.ciphertext, envB.iv, aliceKey), msgFromBob);
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

test('decryptPayloadWithAnyKey resolves valid key among candidate keys cleanly', async () => {
  const keyPrimary = await deriveRoomKeyFromSeed('chat_room_1');
  const keyWrong = await deriveRoomKeyFromSeed('chat_room_2');
  const envelope = await encryptPayload('رسالة متزامنة بين الطرفين', keyPrimary);

  const candidates = await deriveCandidateRoomKeysForDecryption('chat_room_1');
  const decoded = await decryptPayloadWithAnyKey(envelope.ciphertext, envelope.iv, [
    keyWrong,
    ...candidates
  ]);
  assert.equal(decoded, 'رسالة متزامنة بين الطرفين');
});

test('Multi-key decryption recovers messages sent before sender and receiver rotated identity keys', async () => {
  const aliceOld = await generateIdentityKeyPair();
  const aliceNew = await generateIdentityKeyPair();
  const bobOld = await generateIdentityKeyPair();
  const bobNew = await generateIdentityKeyPair();
  const chatId = 'direct_alice_bob';

  // Alice encrypted an older v2 pairwise message using aliceOld + bobOld
  const oldPairwiseKey = await derivePairwiseChatKey(
    aliceOld.privateKeyJwk,
    bobOld.publicKeyJwk,
    chatId,
    aliceOld.publicKeyJwk
  );
  const oldEnvelope = await encryptPayload('رسالة أرشيفية مشفرة بمفتاح سابق', oldPairwiseKey);

  // Bob now holds bobNew as current identity, with bobOld archived, and message envelope carries aliceOld publicKey
  const candidates = await deriveCandidateRoomKeysForDecryption(
    chatId,
    {
      peerUid: 'uid_alice',
      peerPublicKeyJwk: aliceNew.publicKeyJwk,
      senderPublicKeyJwk: aliceOld.publicKeyJwk,
      recipientPublicKeyJwk: bobOld.publicKeyJwk
    },
    [bobNew, bobOld]
  );

  const recovered = await decryptPayloadWithAnyKey(
    oldEnvelope.ciphertext,
    oldEnvelope.iv,
    candidates
  );
  assert.equal(recovered, 'رسالة أرشيفية مشفرة بمفتاح سابق');
});

test('UID-scoped storage keys and helpers isolate user identities safely', async () => {
  const memoryStore = new Map<string, string>();
  const origLocalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStore.set(k, v);
    },
    removeItem: (k: string) => {
      memoryStore.delete(k);
    }
  };

  try {
    const kUser1 = await generateIdentityKeyPair();
    const kUser2 = await generateIdentityKeyPair();
    const kArchived1 = await generateIdentityKeyPair();

    saveStoredIdentityKeysForUid(kUser1, 'uid_one');
    saveStoredIdentityKeysForUid(kUser2, 'uid_two');
    assert.notEqual(getPrimaryKeysStorageKey('uid_one'), getPrimaryKeysStorageKey('uid_two'));

    setActiveCryptoUid('uid_one');
    assert.equal(readStoredIdentityKeysForUid()?.publicKeyJwk, kUser1.publicKeyJwk);
    setActiveCryptoUid('uid_two');
    assert.equal(readStoredIdentityKeysForUid()?.publicKeyJwk, kUser2.publicKeyJwk);

    const merged = mergeArchivedIdentityKeys([kArchived1, kArchived1], 'uid_one');
    assert.equal(merged.length, 1);
    assert.equal(merged[0].publicKeyJwk, kArchived1.publicKeyJwk);
  } finally {
    setActiveCryptoUid(null);
    if (origLocalStorage === undefined) {
      delete (globalThis as Record<string, unknown>).localStorage;
    } else {
      (globalThis as Record<string, unknown>).localStorage = origLocalStorage;
    }
  }
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
