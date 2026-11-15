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
  return jwk as P256PrivateJwk;
}

async function importPrivateKey(privateKeyJwk: string): Promise<CryptoKey> {
  const jwk = parsePrivateKeyJwk(privateKeyJwk);
  try {
    return await subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
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
  const keyA = await validatePublicKeyJwk(pubKeyA);
  const keyB = await validatePublicKeyJwk(pubKeyB);
  if (!keyA || !keyB) throw new Error('لا يمكن حساب رقم الأمان بمفاتيح عامة غير صالحة.');
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

/** Resolve a direct-chat key from authenticated Firestore member keys; never fall back to a public room ID. */
export async function deriveRoomKeyFromSeed(roomSeed: string): Promise<CryptoKey> {
  const user = auth.currentUser;
  if (user) {
    const chatSnapshot = await getDoc(doc(db, 'chats', roomSeed));
    if (chatSnapshot.exists()) {
      const chatData = chatSnapshot.data();
      if (chatData.type === 'direct') {
        const memberIds = Array.isArray(chatData.memberIds)
          ? (chatData.memberIds as unknown[]).filter((uid): uid is string => typeof uid === 'string')
          : [];
        if (memberIds.length !== 2 || !memberIds.includes(user.uid)) {
          throw new Error('لا يمكن اشتقاق مفتاح الدردشة: عضوية الطرفين غير صالحة.');
        }
        const peerUid = memberIds.find((uid) => uid !== user.uid);
        if (!peerUid) throw new Error('لم يتم العثور على الطرف الآخر.');

        const storedKeys = localStorage.getItem('wasil_identity_keys_v1');
        if (!storedKeys) throw new Error('مفتاح التشفير الخاص غير موجود على هذا الجهاز.');
        let identity: Partial<IdentityKeys>;
        try {
          identity = JSON.parse(storedKeys) as Partial<IdentityKeys>;
        } catch {
          throw new Error('مفاتيح التشفير المحلية تالفة.');
        }
        if (!identity.privateKeyJwk || !identity.publicKeyJwk) {
          throw new Error('زوج مفاتيح التشفير المحلي غير مكتمل.');
        }
        const ownPublic = await validatePublicKeyJwk(identity.publicKeyJwk);
        if (!ownPublic) throw new Error('مفتاحك العام المحلي غير صالح.');
        assertIdentityKeyPair(identity.privateKeyJwk, ownPublic);

        const [ownMember, peerMember] = await Promise.all([
          getDoc(doc(db, 'chats', roomSeed, 'members', user.uid)),
          getDoc(doc(db, 'chats', roomSeed, 'members', peerUid))
        ]);
        if (!ownMember.exists() || !peerMember.exists()) {
          throw new Error('تعذر التحقق من عضوية طرفي الدردشة.');
        }
        const storedOwnPublic = await validatePublicKeyJwk(ownMember.data().publicKeyJwk);
        if (!storedOwnPublic || storedOwnPublic !== ownPublic) {
          throw new Error('مفتاحك العام في Firebase لا يطابق مفتاح هذا الجهاز.');
        }
        const peerPublicKey = await validatePublicKeyJwk(peerMember.data().publicKeyJwk);
        if (!peerPublicKey) throw new Error('المفتاح العام للطرف الآخر غير صالح.');
        return derivePairwiseChatKey(identity.privateKeyJwk, peerPublicKey, roomSeed, ownPublic);
      }
      throw new Error('اشتقاق مفاتيح المجموعات يتطلب مفتاح مجموعة مخصصًا؛ لا نستخدم معرف الغرفة كمفتاح.');
    }
    throw new Error('الدردشة غير موجودة؛ لن نستخدم مفتاحًا مشتقًا من معرّف عام.');
  }

  // Deterministic room IDs are only acceptable for non-authenticated local demo data.
  const raw = new TextEncoder().encode(`wasil-local-demo-only:${roomSeed}`);
  const digest = await subtle.digest('SHA-256', raw);
  return subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  algorithm: 'AES-GCM-256';
}

export async function encryptPayload(plaintext: string, key: CryptoKey): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
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
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);
  return new TextDecoder().decode(decrypted);
}
