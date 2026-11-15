/**
 * A validated, serialized public ECDH P-256 JWK.
 *
 * The app keeps the JSON representation in Firestore/local storage for
 * backwards-compatible persistence, but only values accepted by
 * parsePublicKeyJwk should be treated as this type.
 */
export type PublicKeyJwk = string & { readonly __publicKeyJwk: unique symbol };

export interface EcdhP256PublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
  alg?: string;
  use?: string;
  kid?: string;
}

const ALLOWED_FIELDS = new Set(['kty', 'crv', 'x', 'y', 'ext', 'key_ops', 'alg', 'use', 'kid']);
const BASE64URL_32_BYTE_COORDINATE = /^[A-Za-z0-9_-]{43}$/;

function isEcdhP256PublicJwk(value: unknown): value is EcdhP256PublicJwk {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const jwk = value as Record<string, unknown>;

  if (Object.keys(jwk).some((key) => !ALLOWED_FIELDS.has(key))) return false;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return false;
  if (typeof jwk.x !== 'string' || !BASE64URL_32_BYTE_COORDINATE.test(jwk.x)) return false;
  if (typeof jwk.y !== 'string' || !BASE64URL_32_BYTE_COORDINATE.test(jwk.y)) return false;
  if ('ext' in jwk && typeof jwk.ext !== 'boolean') return false;
  if (
    'key_ops' in jwk &&
    (!Array.isArray(jwk.key_ops) || !jwk.key_ops.every((usage) => usage === 'deriveKey' || usage === 'deriveBits'))
  ) return false;
  if ('alg' in jwk && typeof jwk.alg !== 'string') return false;
  if ('use' in jwk && jwk.use !== 'enc') return false;
  if ('kid' in jwk && typeof jwk.kid !== 'string') return false;

  return true;
}

/** Parse and structurally validate a public P-256 ECDH JWK from JSON/string data. */
export function parsePublicKeyJwk(value: unknown): PublicKeyJwk | null {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!isEcdhP256PublicJwk(parsed)) return null;
  return JSON.stringify(parsed) as PublicKeyJwk;
}

/** Structural and WebCrypto validation; use before trusting a remote key. */
export async function validatePublicKeyJwk(value: unknown): Promise<PublicKeyJwk | null> {
  const parsed = parsePublicKeyJwk(value);
  if (!parsed) return null;

  try {
    await globalThis.crypto.subtle.importKey(
      'jwk',
      JSON.parse(parsed) as JsonWebKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveKey']
    );
    return parsed;
  } catch {
    return null;
  }
}

/** Type guard for already serialized, structurally valid public JWKs. */
export function isPublicKeyJwk(value: unknown): value is PublicKeyJwk {
  return parsePublicKeyJwk(value) !== null;
}
