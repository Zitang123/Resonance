import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptCredential,
  encryptCredential,
  hashState,
  pkceChallenge,
  randomToken,
  verifyState,
} from './crypto.ts';

const key = 'ab'.repeat(32);

void test('credentials round-trip without storing plaintext, with independent nonces', () => {
  const plaintext = JSON.stringify({
    refreshToken: 'test-token',
    user: '사랑',
  });
  const first = encryptCredential(plaintext, key, 'spotify:user-1');
  const second = encryptCredential(plaintext, key, 'spotify:user-1');
  assert.notEqual(first, second);
  assert.equal(first.includes('test-token'), false);
  assert.equal(decryptCredential(first, key, 'spotify:user-1'), plaintext);
  assert.equal(decryptCredential(second, key, 'spotify:user-1'), plaintext);
  assert.equal(decryptCredential(encryptCredential('', key), key), '');
});

void test('authenticated encryption rejects nonce, ciphertext, tag, key and account substitution', () => {
  const encrypted = encryptCredential('test-token', key, 'lastfm:user-1');
  for (const index of [1, 2, 3]) {
    const parts = encrypted.split('.');
    const bytes = Buffer.from(parts[index], 'base64url');
    bytes[0] ^= 1;
    parts[index] = bytes.toString('base64url');
    assert.throws(
      () => decryptCredential(parts.join('.'), key, 'lastfm:user-1'),
      { message: 'Credential could not be decrypted.' },
    );
  }
  assert.throws(
    () => decryptCredential(encrypted, 'cd'.repeat(32), 'lastfm:user-1'),
    { message: 'Credential could not be decrypted.' },
  );
  assert.throws(() => decryptCredential(encrypted, key, 'lastfm:user-2'), {
    message: 'Credential could not be decrypted.',
  });
});

void test('malformed envelopes and weak server keys fail without echoing their inputs', () => {
  for (const invalid of [
    'secret',
    'v2.a.b.c',
    'v1.abc.ab+.abc',
    'v1.a.b.c.extra',
  ]) {
    assert.throws(() => decryptCredential(invalid, key), {
      message: 'Credential could not be decrypted.',
    });
  }
  for (const invalidKey of ['secret', 'ab'.repeat(31), 'g'.repeat(64)]) {
    assert.throws(() => encryptCredential('token', invalidKey), {
      message:
        'Credential encryption requires a 32-byte hexadecimal server key.',
    });
  }
});

void test('PKCE challenge matches the RFC 7636 S256 test vector', () => {
  assert.equal(
    pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
  assert.throws(() => pkceChallenge('short'));
  assert.throws(() => pkceChallenge('x'.repeat(129)));
});

void test('state verification accepts only the matching token; defaults provide valid PKCE entropy', () => {
  const state = randomToken();
  assert.equal(state.length, 43);
  assert.equal(pkceChallenge(state).length, 43);
  assert.equal(verifyState(state, hashState(state)), true);
  assert.equal(verifyState(randomToken(), hashState(state)), false);
  assert.equal(verifyState(state, 'bad'), false);
  assert.equal(verifyState('', hashState(state)), false);
  assert.notEqual(state, randomToken());
  assert.throws(() => randomToken(4));
});
