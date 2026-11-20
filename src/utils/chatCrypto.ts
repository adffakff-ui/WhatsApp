const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const DIFFERENT_KEY_LABEL = '🔒 رسالة مشفرة بمفتاح مختلف';

export interface EncryptedPayload {
  algorithm: 'AES-GCM-256';
  iv: string;
  ciphertext: string;
  encrypted: true;
  keyId?: string;
}

// 1. توليد مفتاح جلسة AES-GCM 256-bit
export async function generateChatKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

// 2. توليد زوج مفاتيح ECDH P-256 لتبادل المفاتيح بين الطرفين
export async function generateECDHKeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicJwk, privateJwk };
}

// 3. اشتقاق مفتاح AES-GCM 256-bit مشترك من مفتاحك الخاص ومفتاح الطرف الآخر العام
export async function deriveSharedAesKey(
  privateJwk: JsonWebKey,
  peerPublicJwk: JsonWebKey
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey']
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    peerPublicJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = await crypto.subtle.exportKey('raw', aesKey);
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

async function importChatKey(base64Key: string): Promise<CryptoKey> {
  const binary = atob(base64Key);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    'raw',
    bytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 4. تشفير الرسالة (IV بطول 96-bit = 12 بايت)
export async function encryptMessage(
  plainText: string,
  base64Key: string,
  keyId?: string
): Promise<EncryptedPayload> {
  const key = await importChatKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainText)
  );

  return {
    algorithm: 'AES-GCM-256',
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(cipherBuffer))),
    iv: btoa(String.fromCharCode(...iv)),
    encrypted: true,
    keyId,
  };
}

// 5. فك التشفير - وإذا فشل (مفتاح مختلف/قديم) يرجع رسالة "رسالة مشفرة بمفتاح مختلف"
export async function decryptMessage(
  ciphertext: string,
  ivBase64: string,
  base64Key?: string | null
): Promise<string> {
  if (!base64Key) {
    return DIFFERENT_KEY_LABEL;
  }
  try {
    const key = await importChatKey(base64Key);
    const iv = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));
    const data = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return decoder.decode(plainBuffer);
  } catch {
    return DIFFERENT_KEY_LABEL;
  }
}

// 6. توليد رقم أمان من 60 خانة للتحقق بين الطرفين
export async function generateSafetyNumber60(seedInput: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(seedInput));
  const bytes = new Uint8Array(digest);
  let digits = '';

  // نولّد 60 رقماً عشرياً من التجزئة
  for (let i = 0; digits.length < 60; i++) {
    const val = bytes[i % bytes.length] ^ ((i * 31) & 0xff);
    digits += String(val % 10);
  }

  // تقسيمها إلى 12 مجموعة من 5 أرقام (60 خانة إجمالاً)
  const groups: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    groups.push(digits.slice(i, i + 5));
  }
  return groups.join(' ');
}
