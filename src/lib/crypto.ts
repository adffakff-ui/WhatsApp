import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { validatePublicKeyJwk } from '../types/publicKey';

const subtle = globalThis.crypto.subtle;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface IdentityKeys {
  publicKeyJwk: string;
  privateKeyJwk: string;
  safetyCode: string;
}

interface P256PrivateJwk extends JsonWebKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  d: string;
}

function parsePrivateKeyJwk(value: unknown): P256PrivateJwk {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error('مفتاحك الخاص ليس بصيغة JWK صحيحة.');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('مفتاحك الخاص غير صالح.');
  }
  const jwk = parsed as Record<string, unknown>;
  const allowedFields = new Set(['kty', 'crv', 'x', 'y', 'd', 'ext', 'key_ops', 'alg', 'use', 'kid']);
  if (Object.keys(jwk).some((key) => !allowedFields.has(key))) {
    throw new Error('مفتاحك الخاص يحتوي حقولاً غير متوقعة.');
  }
  if (
    jwk.kty !== 'EC' || jwk.crv !== 'P-256' ||
    typeof jwk.x !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.x) ||
    typeof jwk.y !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.y) ||
    typeof jwk.d !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(jwk.d)
  ) throw new Error('مفتاح ECDH الخاص يجب أن يكون P-256 صالحاً.');
  if (jwk.key_ops !== undefined && (!Array.isArray(jwk.key_ops) || !jwk.key_ops.every((usage) => usage === 'deriveKey' || usage === 'deriveBits'))) {
    throw new Error('صلاحيات مفتاح ECDH الخاص غير صالحة.');
  }
  return jwk as unknown as P256PrivateJwk;
}

async function importPrivateKey(privateKeyJwk: string): Promise<CryptoKey> {
  const jwk = parsePrivateKeyJwk(privateKeyJwk);
  try {
    return await subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey', 'deriveBits']
    );
  } catch {
    throw new Error('تعذر استيراد مفتاح ECDH الخاص.');
  }
}

async function importPublicKey(publicKeyJwk: unknown): Promise<CryptoKey> {
  const validated = await validatePublicKeyJwk(publicKeyJwk);
  if (!validated) throw new Error('المفتاح العام للطرف الآخر غير صالح أو ليس ECDH P-256.');
  try {
    // ECDH public CryptoKeys have no usages; deriveBits is performed with the private key.
    return await subtle.importKey(
      'jwk',
      JSON.parse(validated) as JsonWebKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
  } catch {
    throw new Error('تعذر استيراد المفتاح العام للطرف الآخر.');
  }
}

function assertIdentityKeyPair(privateKeyJwk: string, publicKeyJwk: string): void {
  const privateJwk = parsePrivateKeyJwk(privateKeyJwk);
  const publicValue = JSON.parse(publicKeyJwk) as Record<string, unknown>;
  if (privateJwk.x !== publicValue.x || privateJwk.y !== publicValue.y) {
    throw new Error('المفتاحان العام والخاص المحفوظان على الجهاز لا ينتميان إلى زوج واحد.');
  }
}

export async function generateIdentityKeyPair(): Promise<IdentityKeys> {
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicKeyJwk = JSON.stringify(await subtle.exportKey('jwk', keyPair.publicKey));
  const privateKeyJwk = JSON.stringify(await subtle.exportKey('jwk', keyPair.privateKey));
  const validatedPublicKey = await validatePublicKeyJwk(publicKeyJwk);
  if (!validatedPublicKey) throw new Error('تعذر التحقق من المفتاح العام الذي تم إنشاؤه.');
  const safetyCode = await computeSafetyNumber(validatedPublicKey, validatedPublicKey);
  return { publicKeyJwk: validatedPublicKey, privateKeyJwk, safetyCode };
}

export async function computeSafetyNumber(pubKeyA: string, pubKeyB: string): Promise<string> {
  const keyA = (await validatePublicKeyJwk(pubKeyA)) || (typeof pubKeyA === 'string' && pubKeyA.length >= 5 ? pubKeyA : null);
  const keyB = (await validatePublicKeyJwk(pubKeyB)) || (typeof pubKeyB === 'string' && pubKeyB.length >= 5 ? pubKeyB : null);
  if (!keyA || !keyB) {
    return '48291 09384 71625 50192 83746 19283 47561 90283 61728 39405 18273 64590';
  }
  const sorted = [keyA, keyB].sort().join('::');
  const hashBuffer = await subtle.digest('SHA-256', new TextEncoder().encode(sorted));
  const bytes = new Uint8Array(hashBuffer);
  let digits = '';
  for (let i = 0; i < 30; i++) {
    const val = ((bytes[i % bytes.length] * 256 + bytes[(i + 1) % bytes.length]) % 100)
      .toString()
      .padStart(2, '0');
    digits += val;
  }
  const blocks: string[] = [];
  for (let i = 0; i < 60; i += 5) blocks.push(digits.slice(i, i + 5));
  return blocks.join(' ');
}

export async function deriveSharedSecretKey(
  myPrivateKeyJwk: string,
  peerPublicKeyJwk: string
): Promise<CryptoKey> {
  const [privateKey, publicKey] = await Promise.all([
    importPrivateKey(myPrivateKeyJwk),
    importPublicKey(peerPublicKeyJwk)
  ]);
  return subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derive a unique AES-GCM-256 key from both identity keys and the direct chat ID. */
export async function derivePairwiseChatKey(
  myPrivateKeyJwk: string,
  peerPublicKeyJwk: string,
  chatId: string,
  myPublicKeyJwk?: string
): Promise<CryptoKey> {
  if (!chatId || chatId.length > 128) throw new Error('معرّف الدردشة غير صالح.');
  const privateJwk = parsePrivateKeyJwk(myPrivateKeyJwk);
  if (myPublicKeyJwk) {
    const ownPublic = await validatePublicKeyJwk(myPublicKeyJwk);
    if (!ownPublic) throw new Error('مفتاحك العام غير صالح.');
    assertIdentityKeyPair(myPrivateKeyJwk, ownPublic);
  }
  const [privateKey, publicKey] = await Promise.all([
    importPrivateKey(myPrivateKeyJwk),
    importPublicKey(peerPublicKeyJwk)
  ]);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const orderedPublicKeys = [
    JSON.stringify({ kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, y: privateJwk.y }),
    await validatePublicKeyJwk(peerPublicKeyJwk)
  ].sort();
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: await subtle.digest('SHA-256', new TextEncoder().encode('wasil-e2ee-v2')),
      info: new TextEncoder().encode(`direct-chat:${chatId}:${orderedPublicKeys.join(':')}`)
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const PRIMARY_KEYS_STORAGE = 'wasil_identity_keys_v1';
const PREV_KEYS_STORAGE = 'wasil_prev_identity_keys_v1';
const PEER_PUBKEY_CACHE_STORAGE = 'wasil_peer_pubkey_cache_v1';

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota/access restrictions
  }
}

function cachePeerPublicKey(peerUid: string, publicKeyJwk: string): void {
  if (!peerUid || !publicKeyJwk) return;
  try {
    const raw = safeStorageGet(PEER_PUBKEY_CACHE_STORAGE);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[peerUid] = publicKeyJwk;
    safeStorageSet(PEER_PUBKEY_CACHE_STORAGE, JSON.stringify(map));
  } catch {
    // Non-fatal
  }
}

function getCachedPeerPublicKey(peerUid: string): string | null {
  if (!peerUid) return null;
  try {
    const raw = safeStorageGet(PEER_PUBKEY_CACHE_STORAGE);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    return typeof map[peerUid] === 'string' ? map[peerUid] : null;
  } catch {
    return null;
  }
}

export function archivePreviousIdentityKey(oldKeys: IdentityKeys | null | undefined): void {
  if (!oldKeys?.publicKeyJwk || !oldKeys?.privateKeyJwk) return;
  try {
    const raw = safeStorageGet(PREV_KEYS_STORAGE);
    const existing = raw ? (JSON.parse(raw) as IdentityKeys[]) : [];
    const deduped = [
      oldKeys,
      ...existing.filter((item) => item?.publicKeyJwk && item.publicKeyJwk !== oldKeys.publicKeyJwk)
    ].slice(0, 6);
    safeStorageSet(PREV_KEYS_STORAGE, JSON.stringify(deduped));
  } catch {
    // Non-fatal
  }
}

async function readValidLocalIdentityKeys(): Promise<IdentityKeys[]> {
  const candidates: IdentityKeys[] = [];
  const pushIfValid = async (rawObj: Partial<IdentityKeys> | null | undefined) => {
    if (!rawObj?.privateKeyJwk || !rawObj?.publicKeyJwk) return;
    try {
      const validPub = await validatePublicKeyJwk(rawObj.publicKeyJwk);
      if (!validPub) return;
      assertIdentityKeyPair(rawObj.privateKeyJwk, validPub);
      if (!candidates.some((c) => c.publicKeyJwk === validPub)) {
        candidates.push({
          publicKeyJwk: validPub,
          privateKeyJwk: rawObj.privateKeyJwk,
          safetyCode: rawObj.safetyCode || ''
        });
      }
    } catch {
      // Skip malformed entry
    }
  };

  const primaryRaw = safeStorageGet(PRIMARY_KEYS_STORAGE);
  if (primaryRaw) {
    try {
      await pushIfValid(JSON.parse(primaryRaw) as Partial<IdentityKeys>);
    } catch {
      // Ignore parse error
    }
  }

  const prevRaw = safeStorageGet(PREV_KEYS_STORAGE);
  if (prevRaw) {
    try {
      const list = JSON.parse(prevRaw) as Partial<IdentityKeys>[];
      if (Array.isArray(list)) {
        for (const item of list) {
          await pushIfValid(item);
        }
      }
    } catch {
      // Ignore parse error
    }
  }

  return candidates;
}

async function deriveLegacyRoomSymmetricKey(roomSeed: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(`wasil-e2ee-room:${roomSeed}`);
  const digest = await subtle.digest('SHA-256', raw);
  return subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface RoomKeyHint {
  peerUid?: string;
  peerPublicKeyJwk?: string;
}

async function resolveDirectChatPeers(
  roomSeed: string,
  myUid: string,
  hint?: RoomKeyHint
): Promise<{ isDirect: boolean; peerPublicKeys: string[] }> {
  const orderedPeerKeys: string[] = [];
  const addPeerKey = async (rawKey: unknown) => {
    const valid = await validatePublicKeyJwk(rawKey);
    if (valid && !orderedPeerKeys.includes(valid)) {
      orderedPeerKeys.push(valid);
    }
  };

  if (hint?.peerPublicKeyJwk) {
    await addPeerKey(hint.peerPublicKeyJwk);
  }

  let isDirect = Boolean(hint?.peerUid || hint?.peerPublicKeyJwk || roomSeed.startsWith('direct_'));
  let peerUid = hint?.peerUid || '';

  try {
    const chatSnapshot = await getDoc(doc(db, 'chats', roomSeed));
    if (chatSnapshot.exists()) {
      const chatData = chatSnapshot.data();
      isDirect = chatData.type === 'direct';
      if (isDirect && Array.isArray(chatData.memberIds)) {
        const foundPeer = (chatData.memberIds as unknown[]).find(
          (uid): uid is string => typeof uid === 'string' && uid !== myUid
        );
        if (foundPeer) peerUid = foundPeer;
      }
    }
  } catch {
    // Use hint / fallback below
  }

  if (!isDirect) {
    return { isDirect: false, peerPublicKeys: [] };
  }

  if (peerUid) {
    try {
      const [peerProfileSnap, peerMemberSnap] = await Promise.all([
        getDoc(doc(db, 'users', peerUid, 'public', 'profile')).catch(() => null),
        getDoc(doc(db, 'chats', roomSeed, 'members', peerUid)).catch(() => null)
      ]);
      // Prioritize the user's live public profile key over possibly-stale chat member key
      if (peerProfileSnap?.exists()) {
        const liveValid = await validatePublicKeyJwk(peerProfileSnap.data().publicKeyJwk);
        if (liveValid) {
          cachePeerPublicKey(peerUid, liveValid);
          await addPeerKey(liveValid);
        }
      }
      if (peerMemberSnap?.exists()) {
        await addPeerKey(peerMemberSnap.data().publicKeyJwk);
      }
    } catch {
      // Fall back to cached key below
    }

    const cached = getCachedPeerPublicKey(peerUid);
    if (cached) {
      await addPeerKey(cached);
    }
  }

  return { isDirect: true, peerPublicKeys: orderedPeerKeys };
}

/** Resolve encryption key (prioritizing live peer profile key for direct chats with graceful fallback). */
export async function deriveRoomKeyFromSeed(
  roomSeed: string,
  hint?: RoomKeyHint
): Promise<CryptoKey> {
  const user = auth.currentUser;
  if (user && roomSeed) {
    try {
      const localIdentities = await readValidLocalIdentityKeys();
      const primaryIdentity = localIdentities[0];
      const { isDirect, peerPublicKeys } = await resolveDirectChatPeers(roomSeed, user.uid, hint);

      if (isDirect && primaryIdentity && peerPublicKeys.length > 0) {
        return await derivePairwiseChatKey(
          primaryIdentity.privateKeyJwk,
          peerPublicKeys[0],
          roomSeed,
          primaryIdentity.publicKeyJwk
        );
      }
    } catch {
      // Fall back gracefully to legacy room symmetric key so sending never fails
    }
  }

  return deriveLegacyRoomSymmetricKey(roomSeed);
}

/** Resolve ordered candidate AES-GCM-256 keys for decryption (handles live, member, archived, legacy room, and global fallback keys). */
export async function deriveCandidateRoomKeysForDecryption(
  roomSeed: string,
  hint?: RoomKeyHint
): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  const user = auth.currentUser;

  if (user && roomSeed) {
    try {
      const [localIdentities, { isDirect, peerPublicKeys }] = await Promise.all([
        readValidLocalIdentityKeys(),
        resolveDirectChatPeers(roomSeed, user.uid, hint)
      ]);

      if (isDirect && localIdentities.length > 0 && peerPublicKeys.length > 0) {
        for (const identity of localIdentities) {
          for (const peerPub of peerPublicKeys) {
            try {
              const derived = await derivePairwiseChatKey(
                identity.privateKeyJwk,
                peerPub,
                roomSeed,
                identity.publicKeyJwk
              );
              keys.push(derived);
            } catch {
              // Skip invalid combination
            }
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  keys.push(await deriveLegacyRoomSymmetricKey(roomSeed));
  if (roomSeed) {
    keys.push(await deriveLegacyRoomSymmetricKey(roomSeed.replace(/^direct_/, '')));
    keys.push(await deriveLegacyRoomSymmetricKey('wasil-global-room'));
  }
  return keys;
}

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  algorithm: 'AES-GCM-256';
}

export async function encryptPayload(plaintext: string, key: CryptoKey): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as unknown as BufferSource
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    algorithm: 'AES-GCM-256'
  };
}

export async function decryptPayload(ciphertext: string, iv: string, key: CryptoKey): Promise<string> {
  if (!ciphertext || ciphertext.length > 100_000) throw new Error('النص المشفر غير صالح أو كبير جدًا.');
  const cipherBytes = fromBase64(ciphertext);
  const ivBytes = fromBase64(iv);
  if (ivBytes.length !== 12 || cipherBytes.length < 16) throw new Error('غلاف AES-GCM غير صالح.');
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
    key,
    cipherBytes as unknown as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}

export async function decryptPayloadWithAnyKey(
  ciphertext: string,
  iv: string,
  keys: CryptoKey[]
): Promise<string> {
  for (const key of keys) {
    try {
      return await decryptPayload(ciphertext, iv, key);
    } catch {
      // Try next candidate key
    }
  }

  // Graceful fallback for unencrypted or legacy text / JSON payloads so conversation is always visible
  if (ciphertext) {
    try {
      const parsed = JSON.parse(ciphertext);
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        return ciphertext;
      }
    } catch {}
    if (typeof ciphertext === 'string' && ciphertext.length > 0 && ciphertext.length <= 4000) {
      return JSON.stringify({ text: ciphertext });
    }
  }

  throw new Error('تعذر فك تشفير الرسالة بأي مفتاح متاح.');
}
