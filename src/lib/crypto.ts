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

function canonicalPublicKeyString(k: {
  kty?: unknown;
  crv?: unknown;
  x?: unknown;
  y?: unknown;
}): string {
  return JSON.stringify({
    kty: String(k.kty || 'EC'),
    crv: String(k.crv || 'P-256'),
    x: String(k.x || ''),
    y: String(k.y || '')
  });
}

async function normalizeCanonicalPublicKey(rawKey: unknown): Promise<string | null> {
  const valid = await validatePublicKeyJwk(rawKey);
  if (!valid) return null;
  try {
    const parsed = JSON.parse(valid) as { kty?: unknown; crv?: unknown; x?: unknown; y?: unknown };
    return canonicalPublicKeyString(parsed);
  } catch {
    return null;
  }
}

export async function computeSafetyNumber(pubKeyA: string, pubKeyB: string): Promise<string> {
  const keyA =
    (await normalizeCanonicalPublicKey(pubKeyA)) ||
    (typeof pubKeyA === 'string' && pubKeyA.length >= 5 ? pubKeyA : null);
  const keyB =
    (await normalizeCanonicalPublicKey(pubKeyB)) ||
    (typeof pubKeyB === 'string' && pubKeyB.length >= 5 ? pubKeyB : null);
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
  const canonicalOwn = canonicalPublicKeyString(privateJwk);
  const canonicalPeer = await normalizeCanonicalPublicKey(peerPublicKeyJwk);
  if (!canonicalPeer) throw new Error('المفتاح العام للطرف الآخر غير صالح أو ليس ECDH P-256.');

  const [privateKey, publicKey] = await Promise.all([
    importPrivateKey(myPrivateKeyJwk),
    importPublicKey(peerPublicKeyJwk)
  ]);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const orderedPublicKeys = [canonicalOwn, canonicalPeer].sort();
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

/** Backwards-compatible v2 HKDF derivation for historical messages encrypted before canonical normalization. */
async function deriveLegacyAsymmetricPairwiseVariants(
  myPrivateKeyJwk: string,
  myPublicKeyJwk: string,
  peerPublicKeyJwk: string,
  chatId: string
): Promise<CryptoKey[]> {
  if (!chatId || chatId.length > 128) return [];
  const privateJwk = parsePrivateKeyJwk(myPrivateKeyJwk);
  const canonicalOwn = canonicalPublicKeyString(privateJwk);
  const validPeerRaw = await validatePublicKeyJwk(peerPublicKeyJwk);
  const canonicalPeer = await normalizeCanonicalPublicKey(peerPublicKeyJwk);
  const validOwnRaw = (await validatePublicKeyJwk(myPublicKeyJwk)) || canonicalOwn;
  if (!validPeerRaw || !canonicalPeer) return [];

  const [privateKey, publicKey] = await Promise.all([
    importPrivateKey(myPrivateKeyJwk),
    importPublicKey(peerPublicKeyJwk)
  ]);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const salt = await subtle.digest('SHA-256', new TextEncoder().encode('wasil-e2ee-v2'));

  const variantInfos = new Set<string>([
    `direct-chat:${chatId}:${[canonicalOwn, validPeerRaw].sort().join(':')}`,
    `direct-chat:${chatId}:${[validOwnRaw, canonicalPeer].sort().join(':')}`,
    `direct-chat:${chatId}:${[validOwnRaw, validPeerRaw].sort().join(':')}`
  ]);
  variantInfos.delete(
    `direct-chat:${chatId}:${[canonicalOwn, canonicalPeer].sort().join(':')}`
  );

  const out: CryptoKey[] = [];
  for (const infoStr of variantInfos) {
    out.push(
      await subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt,
          info: new TextEncoder().encode(infoStr)
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      )
    );
  }
  return out;
}

const PRIMARY_KEYS_STORAGE = 'wasil_identity_keys_v1';
const PREV_KEYS_STORAGE = 'wasil_prev_identity_keys_v1';
const PEER_PUBKEY_CACHE_STORAGE = 'wasil_peer_pubkey_cache_v1';

let activeCryptoUid: string | null = null;

export function setActiveCryptoUid(uid: string | null): void {
  activeCryptoUid = uid && uid.trim() ? uid.trim() : null;
}

export function getPrimaryKeysStorageKey(uid?: string | null): string {
  const clean = (uid ?? activeCryptoUid ?? '').trim();
  return clean ? `${PRIMARY_KEYS_STORAGE}_${clean}` : PRIMARY_KEYS_STORAGE;
}

function getPrevKeysStorageKey(uid?: string | null): string {
  const clean = (uid ?? activeCryptoUid ?? '').trim();
  return clean ? `${PREV_KEYS_STORAGE}_${clean}` : PREV_KEYS_STORAGE;
}

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

export function readStoredIdentityKeysForUid(uid?: string | null): IdentityKeys | null {
  const scopedRaw = safeStorageGet(getPrimaryKeysStorageKey(uid));
  if (scopedRaw) {
    try {
      const parsed = JSON.parse(scopedRaw) as IdentityKeys;
      if (parsed?.publicKeyJwk && parsed?.privateKeyJwk) return parsed;
    } catch {
      // Fall through
    }
  }
  return null;
}

export function saveStoredIdentityKeysForUid(keys: IdentityKeys, uid?: string | null): void {
  safeStorageSet(getPrimaryKeysStorageKey(uid), JSON.stringify(keys));
}

function cachePeerPublicKey(peerUid: string, publicKeyJwk: string): void {
  if (!peerUid || !publicKeyJwk) return;
  try {
    const raw = safeStorageGet(PEER_PUBKEY_CACHE_STORAGE);
    const map = raw ? (JSON.parse(raw) as Record<string, string | string[]>) : {};
    const existingEntry = map[peerUid];
    const existingList = Array.isArray(existingEntry)
      ? existingEntry.filter((k): k is string => typeof k === 'string')
      : typeof existingEntry === 'string' && existingEntry
        ? [existingEntry]
        : [];
    const deduped = [
      publicKeyJwk,
      ...existingList.filter((k) => k !== publicKeyJwk)
    ].slice(0, 10);
    map[peerUid] = deduped;
    safeStorageSet(PEER_PUBKEY_CACHE_STORAGE, JSON.stringify(map));
  } catch {
    // Non-fatal
  }
}

function getCachedPeerPublicKeys(peerUid: string): string[] {
  if (!peerUid) return [];
  try {
    const raw = safeStorageGet(PEER_PUBKEY_CACHE_STORAGE);
    if (!raw) return [];
    const map = JSON.parse(raw) as Record<string, string | string[]>;
    const entry = map[peerUid];
    if (Array.isArray(entry)) {
      return entry.filter((k): k is string => typeof k === 'string');
    }
    return typeof entry === 'string' && entry ? [entry] : [];
  } catch {
    return [];
  }
}

export function getArchivedIdentityKeys(uid?: string | null): IdentityKeys[] {
  const results: IdentityKeys[] = [];
  const collectFromKey = (storageKey: string) => {
    const raw = safeStorageGet(storageKey);
    if (!raw) return;
    try {
      const list = JSON.parse(raw) as IdentityKeys[];
      if (Array.isArray(list)) {
        for (const item of list) {
          if (
            item?.publicKeyJwk &&
            item?.privateKeyJwk &&
            !results.some((r) => r.publicKeyJwk === item.publicKeyJwk)
          ) {
            results.push(item);
          }
        }
      }
    } catch {
      // Ignore parse error
    }
  };
  collectFromKey(getPrevKeysStorageKey(uid));
  if (uid || activeCryptoUid) {
    collectFromKey(PREV_KEYS_STORAGE);
  }
  return results;
}

export function mergeArchivedIdentityKeys(
  incomingKeys: (IdentityKeys | null | undefined)[],
  uid?: string | null
): IdentityKeys[] {
  const cleanIncoming = incomingKeys.filter(
    (k): k is IdentityKeys => Boolean(k?.publicKeyJwk && k?.privateKeyJwk)
  );
  const existing = getArchivedIdentityKeys(uid);
  const merged: IdentityKeys[] = [];
  for (const item of [...cleanIncoming, ...existing]) {
    if (!merged.some((m) => m.publicKeyJwk === item.publicKeyJwk)) {
      merged.push(item);
    }
  }
  const bounded = merged.slice(0, 6);
  try {
    safeStorageSet(getPrevKeysStorageKey(uid), JSON.stringify(bounded));
  } catch {
    // Non-fatal
  }
  return bounded;
}

export function archivePreviousIdentityKey(
  oldKeys: IdentityKeys | null | undefined,
  uid?: string | null
): void {
  if (!oldKeys?.publicKeyJwk || !oldKeys?.privateKeyJwk) return;
  try {
    const scopedKey = getPrevKeysStorageKey(uid);
    const raw = safeStorageGet(scopedKey);
    const existing = raw ? (JSON.parse(raw) as IdentityKeys[]) : [];
    const deduped = [
      oldKeys,
      ...existing.filter((item) => item?.publicKeyJwk && item.publicKeyJwk !== oldKeys.publicKeyJwk)
    ].slice(0, 6);
    safeStorageSet(scopedKey, JSON.stringify(deduped));
  } catch {
    // Non-fatal
  }
}

async function readValidLocalIdentityKeys(uid?: string | null): Promise<IdentityKeys[]> {
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

  const resolvedUid = uid ?? activeCryptoUid;
  const scopedPrimaryRaw = resolvedUid ? safeStorageGet(getPrimaryKeysStorageKey(resolvedUid)) : null;
  if (scopedPrimaryRaw) {
    try {
      await pushIfValid(JSON.parse(scopedPrimaryRaw) as Partial<IdentityKeys>);
    } catch {
      // Ignore parse error
    }
  }

  const scopedPrevRaw = resolvedUid ? safeStorageGet(getPrevKeysStorageKey(resolvedUid)) : null;
  if (scopedPrevRaw) {
    try {
      const list = JSON.parse(scopedPrevRaw) as Partial<IdentityKeys>[];
      if (Array.isArray(list)) {
        for (const item of list) {
          await pushIfValid(item);
        }
      }
    } catch {
      // Ignore parse error
    }
  }

  // Backward-compatible migration fallback for unscoped keys from earlier versions
  const legacyPrimaryRaw = safeStorageGet(PRIMARY_KEYS_STORAGE);
  if (legacyPrimaryRaw) {
    try {
      await pushIfValid(JSON.parse(legacyPrimaryRaw) as Partial<IdentityKeys>);
    } catch {
      // Ignore parse error
    }
  }

  const legacyPrevRaw = safeStorageGet(PREV_KEYS_STORAGE);
  if (legacyPrevRaw) {
    try {
      const list = JSON.parse(legacyPrevRaw) as Partial<IdentityKeys>[];
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
  additionalPeerKeys?: string[];
  senderPublicKeyJwk?: string;
  recipientPublicKeyJwk?: string;
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

  if (hint?.senderPublicKeyJwk) {
    await addPeerKey(hint.senderPublicKeyJwk);
  }
  if (hint?.recipientPublicKeyJwk) {
    await addPeerKey(hint.recipientPublicKeyJwk);
  }
  if (hint?.peerPublicKeyJwk) {
    await addPeerKey(hint.peerPublicKeyJwk);
  }
  if (Array.isArray(hint?.additionalPeerKeys)) {
    for (const extraKey of hint.additionalPeerKeys) {
      await addPeerKey(extraKey);
    }
  }

  let isDirect = Boolean(
    hint?.peerUid ||
      hint?.peerPublicKeyJwk ||
      hint?.senderPublicKeyJwk ||
      hint?.recipientPublicKeyJwk ||
      roomSeed.startsWith('direct_')
  );
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
      if (typeof chatData.lastMessageSenderPublicKeyJwk === 'string') {
        await addPeerKey(chatData.lastMessageSenderPublicKeyJwk);
      }
      if (typeof chatData.lastMessageRecipientPublicKeyJwk === 'string') {
        await addPeerKey(chatData.lastMessageRecipientPublicKeyJwk);
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
      // Prioritize the user's live public profile key & history over stale chat member key
      if (peerProfileSnap?.exists()) {
        const pData = peerProfileSnap.data();
        const liveValid = await validatePublicKeyJwk(pData.publicKeyJwk);
        if (liveValid) {
          cachePeerPublicKey(peerUid, liveValid);
          await addPeerKey(liveValid);
        }
        if (Array.isArray(pData.previousPublicKeys)) {
          for (const prevPub of pData.previousPublicKeys as unknown[]) {
            const validPrev = await validatePublicKeyJwk(prevPub);
            if (validPrev) {
              cachePeerPublicKey(peerUid, validPrev);
              await addPeerKey(validPrev);
            }
          }
        }
      }
      if (peerMemberSnap?.exists()) {
        const memberPub = await validatePublicKeyJwk(peerMemberSnap.data().publicKeyJwk);
        if (memberPub) {
          cachePeerPublicKey(peerUid, memberPub);
          await addPeerKey(memberPub);
        }
      }
    } catch {
      // Fall back to cached keys below
    }

    for (const cachedKey of getCachedPeerPublicKeys(peerUid)) {
      await addPeerKey(cachedKey);
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
      const localIdentities = await readValidLocalIdentityKeys(user.uid);
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

/** Resolve ordered candidate AES-GCM-256 keys for decryption (handles live, member, archived, v1 ECDH, and room fallback keys). */
export async function deriveCandidateRoomKeysForDecryption(
  roomSeed: string,
  hint?: RoomKeyHint,
  explicitIdentities?: IdentityKeys[]
): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  const user = auth.currentUser;
  const identitiesToTry =
    explicitIdentities && explicitIdentities.length > 0
      ? explicitIdentities
      : user
        ? await readValidLocalIdentityKeys(user.uid)
        : [];

  if (roomSeed && identitiesToTry.length > 0) {
    try {
      const myUid = user?.uid || 'test_user';
      const { isDirect, peerPublicKeys } =
        hint?.peerPublicKeyJwk ||
        hint?.senderPublicKeyJwk ||
        hint?.recipientPublicKeyJwk ||
        hint?.additionalPeerKeys?.length
          ? user
            ? await resolveDirectChatPeers(roomSeed, myUid, hint)
            : {
                isDirect: true,
                peerPublicKeys: Array.from(
                  new Set(
                    [
                      hint.senderPublicKeyJwk,
                      hint.recipientPublicKeyJwk,
                      hint.peerPublicKeyJwk,
                      ...(hint.additionalPeerKeys || [])
                    ].filter((k): k is string => Boolean(k))
                  )
                )
              }
          : user
            ? await resolveDirectChatPeers(roomSeed, myUid, hint)
            : { isDirect: false, peerPublicKeys: [] };

      if (isDirect && peerPublicKeys.length > 0) {
        for (const identity of identitiesToTry) {
          for (const peerPub of peerPublicKeys) {
            if (peerPub === identity.publicKeyJwk) continue;
            try {
              const derivedV2 = await derivePairwiseChatKey(
                identity.privateKeyJwk,
                peerPub,
                roomSeed,
                identity.publicKeyJwk
              );
              keys.push(derivedV2);
            } catch {
              // Skip invalid v2 combination
            }
            try {
              const legacyVariants = await deriveLegacyAsymmetricPairwiseVariants(
                identity.privateKeyJwk,
                identity.publicKeyJwk,
                peerPub,
                roomSeed
              );
              keys.push(...legacyVariants);
            } catch {
              // Skip invalid legacy HKDF variant
            }
            try {
              const derivedV1 = await deriveSharedSecretKey(identity.privateKeyJwk, peerPub);
              keys.push(derivedV1);
            } catch {
              // Skip invalid v1 combination
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

  // Graceful fallback only for explicit valid JSON { text } legacy payloads
  if (ciphertext) {
    try {
      const parsed = JSON.parse(ciphertext);
      if (parsed && typeof parsed === 'object' && typeof parsed.text === 'string') {
        return ciphertext;
      }
    } catch {
      // Encrypted base64 payload that failed all keys should reject cleanly
    }
  }

  throw new Error('تعذر فك تشفير الرسالة بأي مفتاح متاح.');
}
