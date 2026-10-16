// TOTP (RFC 6238) with native crypto. Parameters beyond the secret are stored
// in plain text on the entry (they are not secret) and default to what every
// app assumes when a QR does not say: SHA1, 6 digits, 30 seconds.
const crypto = require('crypto');

const ALGORITHMS = ['SHA1', 'SHA256', 'SHA512'];
const DEFAULTS = { algorithm: 'SHA1', digits: 6, period: 30 };

function base32Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of str.toUpperCase()) {
    const val = chars.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Returns clean params, or null if they are not ones we can generate codes for.
function normalizeTotpParams(input = {}) {
  const algorithm = String(input.algorithm || DEFAULTS.algorithm).toUpperCase();
  const digits = Number(input.digits || DEFAULTS.digits);
  const period = Number(input.period || DEFAULTS.period);
  if (!ALGORITHMS.includes(algorithm)) return null;
  if (digits !== 6 && digits !== 8) return null;
  if (!Number.isInteger(period) || period < 10 || period > 120) return null;
  return { algorithm, digits, period };
}

// Normalized base32 secret, or null. The floor is a sanity check, not a
// policy: these are other services' secrets, and some still issue short ones
// (an 8-byte secret is 13 characters). saveTotpSecretHttp used to take any length.
function normalizeTotpSecret(secret) {
  if (typeof secret !== 'string') return null;
  const clean = secret.replace(/[\s-]/g, '').replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]{8,128}$/.test(clean)) return null;
  return clean;
}

function generateTOTP(secret, params = {}, now = Date.now()) {
  const { algorithm, digits, period } = { ...DEFAULTS, ...params };
  const key = base32Decode(secret);
  const time = Math.floor(now / 1000 / period);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(time));
  const hmac = crypto.createHmac(algorithm.toLowerCase(), key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

function secondsRemaining(period = DEFAULTS.period, now = Date.now()) {
  return period - (Math.floor(now / 1000) % period);
}

module.exports = { generateTOTP, normalizeTotpParams, normalizeTotpSecret, secondsRemaining, TOTP_DEFAULTS: DEFAULTS };
