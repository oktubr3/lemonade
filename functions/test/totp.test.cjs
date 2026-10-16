// RFC 6238 Appendix B. The seeds are the ASCII strings "1234567890" repeated to
// 20, 32 and 64 bytes, in base32.
const assert = require('assert');
const { generateTOTP, normalizeTotpParams, normalizeTotpSecret, secondsRemaining } = require('../totp');

const toBase32 = (buf) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) out += chars[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
};
const seed = (len) => toBase32(Buffer.from('1234567890'.repeat(7).slice(0, len)));
const SEEDS = { SHA1: seed(20), SHA256: seed(32), SHA512: seed(64) };

const VECTORS = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

let failures = 0;
const check = (label, fn) => {
  try { fn(); console.log(`  ok   ${label}`); } catch (e) { failures++; console.log(`  FAIL ${label}: ${e.message}`); }
};

for (const [t, sha1, sha256, sha512] of VECTORS) {
  check(`RFC 6238 T=${t}`, () => {
    assert.strictEqual(generateTOTP(SEEDS.SHA1, { algorithm: 'SHA1', digits: 8 }, t * 1000), sha1);
    assert.strictEqual(generateTOTP(SEEDS.SHA256, { algorithm: 'SHA256', digits: 8 }, t * 1000), sha256);
    assert.strictEqual(generateTOTP(SEEDS.SHA512, { algorithm: 'SHA512', digits: 8 }, t * 1000), sha512);
  });
}

check('default params are SHA1 / 6 digits / 30 s (the 8-digit code truncated)', () => {
  assert.strictEqual(generateTOTP(SEEDS.SHA1, {}, 59000), '287082');
  assert.strictEqual(generateTOTP(SEEDS.SHA1, undefined, 59000), '287082');
});

check('period changes the time step', () => {
  // T=59 with a 60 s period is step 0, the same as T=0 with 30 s.
  assert.strictEqual(generateTOTP(SEEDS.SHA1, { period: 60 }, 59000), generateTOTP(SEEDS.SHA1, {}, 0));
});

check('secondsRemaining follows the period', () => {
  assert.strictEqual(secondsRemaining(30, 59000), 1);
  assert.strictEqual(secondsRemaining(60, 59000), 1);
  assert.strictEqual(secondsRemaining(60, 0), 60);
});

check('normalizeTotpParams accepts only what we can generate', () => {
  assert.deepStrictEqual(normalizeTotpParams({}), { algorithm: 'SHA1', digits: 6, period: 30 });
  assert.deepStrictEqual(normalizeTotpParams({ algorithm: 'sha256', digits: '8', period: 60 }), { algorithm: 'SHA256', digits: 8, period: 60 });
  assert.strictEqual(normalizeTotpParams({ algorithm: 'MD5' }), null);
  assert.strictEqual(normalizeTotpParams({ digits: 7 }), null);
  assert.strictEqual(normalizeTotpParams({ period: 5 }), null);
  assert.strictEqual(normalizeTotpParams({ period: 30.5 }), null);
});

check('normalizeTotpSecret cleans and validates', () => {
  assert.strictEqual(normalizeTotpSecret('jbsw y3dp-ehpk 3pxp=='), 'JBSWY3DPEHPK3PXP');
  assert.strictEqual(normalizeTotpSecret('JBSWY3DPEHPK3'), 'JBSWY3DPEHPK3'); // 8-byte secret, 13 chars
  assert.strictEqual(normalizeTotpSecret('JBSWY3D'), null); // under 8 chars
  assert.strictEqual(normalizeTotpSecret('A'.repeat(129)), null);
  assert.strictEqual(normalizeTotpSecret('JBSWY3DPEHPK3PX1'), null);
  assert.strictEqual(normalizeTotpSecret({}), null);
});

if (failures) {
  console.log(`totp: ${failures} failed`);
  process.exit(1);
}
console.log('totp: all ok');
