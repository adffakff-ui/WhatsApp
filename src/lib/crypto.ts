import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

const subtle = globalThis.crypto.subtle;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface IdentityKeys {
  publicKeyJwk: string;
  privateKeyJwk: string;
  safetyCode: string;
}

export async function generateIdentityKeyPair(): Promise<IdentityKeys> {
  const keyPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey']
  );

  const pubJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const privJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyJwk = JSON.stringify(pubJwk);
  const privateKeyJwk = JSON.stringify(privJwk);
  const safetyCode = await computeSafetyNumber(publicKeyJwk, publicKeyJwk);

  return { publicKeyJwk, privateKeyJwk, safetyCode };
}

export async function computeSafetyNumber(pubKeyA: string, pubKeyB: string): Promise<string> {
  const sorted = [pubKeyA, pubKeyB].sort().join('::');
  const encoded = new TextEncoder().encode(sorted);
  const hashBuffer = await subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hashBuffer);

  // Produce 60 digits grouped as 12 blocks of 5 digits (WhatsApp-style verification code)
  let digits = '';
  for (let i = 0; i < 30; i++) {
    const val = ((bytes[i % bytes.length] * 256 + bytes[(i + 1) % bytes.length]) % 100)
      .toString()
      .padStart(2, '0');
    digits += val;
  }

  const blocks: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    blocks.push(digits.slice(i, i + 5));
  }
  return blocks.join(' ');
}

export async function deriveSharedSecretKey(
  myPrivateKeyJwk: string,
  peerPublicKeyJwk: string
): Promise<CryptoKey> {
  const privKey = await subtle.importKey(
    'jwk',
    JSON.parse(myPrivateKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey']
  );
  const pubKey = await subtle.importKey(
    'jwk',
    JSON.parse(peerPublicKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  return subtle.deriveKey(
    { name: 'ECDH', public: pubKey },
    privKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derive a chat-specific AES key from both users' ECDH identity keys. */
export async function derivePairwiseChatKey(
  myPrivateKeyJwk: string,
  peerPublicKeyJwk: string,
  chatId: string
): Promise<CryptoKey> {
  const privateKey = await subtle.importKey(
    'jwk',
    JSON.parse(myPrivateKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  const publicKey = await subtle.importKey(
    'jwk',
    JSON.parse(peerPublicKeyJwk),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('wasil-e2ee-v1'),
      info: new TextEncoder().encode(`direct-chat:${chatId}`)
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * For an authenticated Firestore direct chat, derive the key only from the
 * local private key and the other member's public key. Never fall back to the
 * public chat ID when a direct-chat peer/key is missing. The deterministic
 * seed key remains solely for local demo data and legacy group chats.
 */
export async function deriveRoomKeyFromSeed(roomSeed: string): Promise<CryptoKey> {
  const user = auth.currentUser;
  if (user) {
    const chatSnapshot = await getDoc(doc(db, 'chats', roomSeed));
    if (chatSnapshot.exists() && chatSnapshot.data().type === 'direct') {
      const chatData = chatSnapshot.data();
      const memberIds = Array.isArray(chatData.memberIds) ? (chatData.memberIds as string[]) : [];
      const peerUid = memberIds.find((uid) => uid !== user.uid);
      if (!peerUid || memberIds.length !== 2) {
        throw new Error('لا يمكن تشفير الدردشة: عضوية الطرفين غير مكتملة.');
      }

      const storedKeys = localStorage.getItem('wasil_identity_keys_v1');
      const privateKeyJwk = storedKeys
        ? (JSON.parse(storedKeys) as Partial<IdentityKeys>).privateKeyJwk
        : undefined;
      if (!privateKeyJwk) {
        throw new Error('مفتاحك الخاص غير موجود على هذا الجهاز؛ أعد تسجيل الدخول أو استعادة المفتاح.');
      }

      const peerSnapshot = await getDoc(doc(db, 'chats', roomSeed, 'members', peerUid));
      const peerPublicKeyJwk = peerSnapshot.data()?.publicKeyJwk;
      if (typeof peerPublicKeyJwk !== 'string' || peerPublicKeyJwk.length < 20) {
        throw new Error('لا يمكن تشفير الدردشة: لم يُسجّل الطرف الآخر مفتاحه العام بعد.');
      }

      try {
        return await derivePairwiseChatKey(privateKeyJwk, peerPublicKeyJwk, roomSeed);
      } catch {
        throw new Error('مفتاح الطرف الآخر غير صالح؛ أوقفنا الإرسال لحماية الرسالة.');
      }
    }
  }

  // Local preview/demo conversations only; this key is not secure for cloud chats.
  const raw = new TextEncoder().encode(`wasil-e2ee-v1:${roomSeed}`);
  const digest = await subtle.digest('SHA-256', raw);
  return subtle.importKey(
    'raw',
    digest,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  algorithm: 'AES-GCM-256';
}

export async function encryptPayload(plaintext: string, key: CryptoKey): Promise<EncryptedEnvelope> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    algorithm: 'AES-GCM-256'
  };
}

export async function decryptPayload(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const cipherBytes = fromBase64(ciphertext);
  const ivBytes = fromBase64(iv);
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes as BufferSource },
    key,
    cipherBytes as BufferSource
  );
  return new TextDecoder().decode(decrypted);
}
