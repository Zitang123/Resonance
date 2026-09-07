import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const DEFAULT_CONTEXT = 'karina:credential';
const MAX_CREDENTIAL_BYTES = 64 * 1024;

function parseKey(keyHex: string): Buffer {
  if (typeof keyHex !== 'string' || !/^[a-fA-F0-9]{64}$/.test(keyHex)) {
    throw new Error(
      'Credential encryption requires a 32-byte hexadecimal server key.',
    );
  }
  return Buffer.from(keyHex, 'hex');
}

function aad(context: string): Buffer {
  if (typeof context !== 'string' || !context || context.length > 1024) {
    throw new Error('Invalid credential context.');
  }
  return Buffer.from(`v1:${context}`, 'utf8');
}

export function randomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 128) {
    throw new Error('Token size must be between 16 and 128 bytes.');
  }
  return Buffer.from(randomBytes(bytes)).toString('base64url');
}

export function hashState(value: string): string {
  if (typeof value !== 'string' || !value || value.length > 4096) {
    throw new Error('Invalid state token.');
  }
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function verifyState(value: string, expectedHash: string): boolean {
  if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash))
    return false;
  try {
    return timingSafeEqual(
      Buffer.from(hashState(value), 'hex'),
      Buffer.from(expectedHash, 'hex'),
    );
  } catch {
    return false;
  }
}

export function pkceChallenge(verifier: string): string {
  if (
    typeof verifier !== 'string' ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
  ) {
    throw new Error('Invalid PKCE verifier.');
  }
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** Bind context to a stable user/provider key to prevent ciphertext swapping between accounts. */
export function encryptCredential(
  value: string,
  keyHex: string,
  context = DEFAULT_CONTEXT,
): string {
  const key = parseKey(keyHex);
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') > MAX_CREDENTIAL_BYTES
  ) {
    throw new Error('Invalid credential value.');
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    Buffer.from(nonce).toString('base64url'),
    ciphertext.toString('base64url'),
    Buffer.from(cipher.getAuthTag()).toString('base64url'),
  ].join('.');
}

export function decryptCredential(
  envelope: string,
  keyHex: string,
  context = DEFAULT_CONTEXT,
): string {
  const key = parseKey(keyHex);
  const associatedData = aad(context);
  try {
    if (
      typeof envelope !== 'string' ||
      envelope.length > MAX_CREDENTIAL_BYTES * 2
    )
      throw new Error();
    const parts = envelope.split('.');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error();
    const decode = (part: string) => {
      if (!/^[A-Za-z0-9_-]*$/.test(part)) throw new Error();
      const result = Buffer.from(part, 'base64url');
      if (result.toString('base64url') !== part) throw new Error();
      return result;
    };
    const nonce = decode(parts[1]);
    const ciphertext = decode(parts[2]);
    const tag = decode(parts[3]);
    if (
      nonce.length !== 12 ||
      tag.length !== 16 ||
      ciphertext.length > MAX_CREDENTIAL_BYTES
    )
      throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(associatedData);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Never include ciphertext, key material, or provider credentials in errors.
    throw new Error('Credential could not be decrypted.');
  }
}
