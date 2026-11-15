import { parsePublicKeyJwk, type PublicKeyJwk } from '../types/publicKey';

/**
 * Sanitize a value read from storage/Firestore for use as a public P-256 ECDH
 * JWK. Returns canonical JSON only when the complete key structure is valid;
 * otherwise returns null so callers can fail closed.
 *
 * This function is structural validation. Use validatePublicKeyJwk when a
 * WebCrypto import check is also required.
 */
export function sanitizePublicKeyJwk(value: unknown): PublicKeyJwk | null {
  return parsePublicKeyJwk(value);
}
