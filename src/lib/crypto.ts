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

export async function deriveRoomKeyFromSeed(roomSeed: string): Promise<CryptoKey> {
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
