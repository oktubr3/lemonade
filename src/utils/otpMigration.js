// Google Authenticator's "Transfer accounts" format:
//   otpauth-migration://offline?data=<base64 of a protobuf MigrationPayload>
//
// message MigrationPayload {
//   repeated OtpParameters otp_parameters = 1;
//   int32 version = 2; int32 batch_size = 3; int32 batch_index = 4; int32 batch_id = 5;
// }
// message OtpParameters {
//   bytes secret = 1; string name = 2; string issuer = 3;
//   Algorithm algorithm = 4;  // 0 unspecified, 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5
//   DigitCount digits = 5;    // 0 unspecified, 1 six, 2 eight
//   OtpType type = 6;         // 0 unspecified, 1 HOTP, 2 TOTP
//   int64 counter = 7;
// }
//
// Hand-rolled because it is two flat messages; a protobuf runtime would be most
// of the bundle for this screen.
import { base32Decode, base32Encode } from './base32'

const SCHEME = 'otpauth-migration://offline'
export const ACCOUNTS_PER_QR = 10

const ALGORITHMS = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512', 4: 'MD5' }
const ALGORITHM_CODES = { SHA1: 1, SHA256: 2, SHA512: 3 }
const DIGITS = { 0: 6, 1: 6, 2: 8 }
// Same bounds as normalizeTotpSecret in functions/totp.js: one account the
// server would reject must show as not importable, not fail the whole batch.
const SECRET_LENGTH = /^[A-Z2-7]{8,128}$/
const TYPES = { 0: 'totp', 1: 'hotp', 2: 'totp' }

// ---------- protobuf wire format ----------

function readVarint (bytes, state) {
  let result = 0
  let shift = 0
  while (state.pos < bytes.length) {
    const byte = bytes[state.pos++]
    // Multiply instead of shifting: shifts are 32-bit and counters can be bigger.
    result += (byte & 0x7f) * 2 ** shift
    if (!(byte & 0x80)) return result
    shift += 7
    if (shift > 63) break
  }
  throw new Error('Malformed varint')
}

function readFields (bytes) {
  const state = { pos: 0 }
  const fields = []
  while (state.pos < bytes.length) {
    const key = readVarint(bytes, state)
    const field = Math.floor(key / 8)
    const wireType = key & 7
    if (wireType === 0) {
      fields.push({ field, value: readVarint(bytes, state) })
    } else if (wireType === 2) {
      const length = readVarint(bytes, state)
      if (state.pos + length > bytes.length) throw new Error('Truncated field')
      fields.push({ field, bytes: bytes.subarray(state.pos, state.pos + length) })
      state.pos += length
    } else if (wireType === 1) {
      state.pos += 8
    } else if (wireType === 5) {
      state.pos += 4
    } else {
      throw new Error(`Unsupported wire type ${wireType}`)
    }
  }
  if (state.pos > bytes.length) throw new Error('Truncated field')
  return fields
}

function writeVarint (out, value) {
  let rest = value
  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80)
    rest = Math.floor(rest / 0x80)
  }
  out.push(rest)
}

function writeVarintField (out, field, value) {
  writeVarint(out, field * 8)
  writeVarint(out, value)
}

function writeBytesField (out, field, bytes) {
  writeVarint(out, field * 8 + 2)
  writeVarint(out, bytes.length)
  for (const byte of bytes) out.push(byte)
}

const utf8 = (text) => new TextEncoder().encode(text)
const fromUtf8 = (bytes) => new TextDecoder().decode(bytes)

function toBase64 (bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64 (text) {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ---------- decode ----------

function decodeAccount (bytes) {
  const account = { secret: '', name: '', issuer: '', algorithm: 'SHA1', digits: 6, type: 'totp', counter: 0 }
  for (const { field, value, bytes: data } of readFields(bytes)) {
    if (field === 1 && data) account.secret = base32Encode(data)
    else if (field === 2 && data) account.name = fromUtf8(data)
    else if (field === 3 && data) account.issuer = fromUtf8(data)
    else if (field === 4) account.algorithm = ALGORITHMS[value] || 'UNKNOWN'
    else if (field === 5) account.digits = DIGITS[value] || 0
    else if (field === 6) account.type = TYPES[value] || 'unknown'
    else if (field === 7) account.counter = value
  }
  // Older exports put "Issuer:name" in the name and leave the issuer empty.
  const colon = account.name.indexOf(':')
  if (colon > 0) {
    const prefix = account.name.slice(0, colon).trim()
    if (!account.issuer) account.issuer = prefix
    if (prefix === account.issuer) account.name = account.name.slice(colon + 1).trim()
  }
  account.supported = account.type === 'totp' &&
    ['SHA1', 'SHA256', 'SHA512'].includes(account.algorithm) &&
    [6, 8].includes(account.digits) &&
    SECRET_LENGTH.test(account.secret)
  return account
}

// Throws on anything that is not a Google Authenticator export.
export function decodeMigrationUri (uri) {
  const text = String(uri || '').trim()
  if (!text.toLowerCase().startsWith(SCHEME)) throw new Error('Not a Google Authenticator export')
  // Not URLSearchParams: it turns "+" into a space and corrupts the base64.
  const match = text.match(/[?&]data=([^&#]+)/)
  if (!match) throw new Error('Missing data parameter')
  const bytes = fromBase64(decodeURIComponent(match[1]))

  const payload = { accounts: [], version: 0, batchSize: 1, batchIndex: 0, batchId: 0 }
  for (const { field, value, bytes: data } of readFields(bytes)) {
    if (field === 1 && data) payload.accounts.push(decodeAccount(data))
    else if (field === 2) payload.version = value
    else if (field === 3) payload.batchSize = value || 1
    else if (field === 4) payload.batchIndex = value
    else if (field === 5) payload.batchId = value
  }
  return payload
}

// ---------- encode ----------

function encodeAccount (account) {
  const out = []
  writeBytesField(out, 1, base32Decode(account.secret))
  writeBytesField(out, 2, utf8(account.name || ''))
  if (account.issuer) writeBytesField(out, 3, utf8(account.issuer))
  writeVarintField(out, 4, ALGORITHM_CODES[account.algorithm] || 1)
  writeVarintField(out, 5, account.digits === 8 ? 2 : 1)
  writeVarintField(out, 6, 2) // TOTP
  return out
}

// One URI per QR. Google Authenticator puts at most ten accounts in each, and a
// denser code is harder to scan from a screen.
export function encodeMigrationUris (accounts, { batchId = Math.floor(Math.random() * 2 ** 31) } = {}) {
  const batches = []
  for (let i = 0; i < accounts.length; i += ACCOUNTS_PER_QR) batches.push(accounts.slice(i, i + ACCOUNTS_PER_QR))
  return batches.map((batch, index) => {
    const out = []
    for (const account of batch) writeBytesField(out, 1, encodeAccount(account))
    writeVarintField(out, 2, 1)
    writeVarintField(out, 3, batches.length)
    writeVarintField(out, 4, index)
    writeVarintField(out, 5, batchId)
    return `${SCHEME}?data=${encodeURIComponent(toBase64(new Uint8Array(out)))}`
  })
}

// ---------- otpauth:// (one account per QR, what sites show at setup) ----------

export function parseOtpauthUri (uri) {
  const url = new URL(String(uri).trim())
  if (url.protocol !== 'otpauth:') throw new Error('Not an otpauth URI')
  const type = url.hostname.toLowerCase()
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const colon = label.indexOf(':')
  const issuer = url.searchParams.get('issuer') || (colon > 0 ? label.slice(0, colon) : '')
  const name = colon > 0 ? label.slice(colon + 1).trim() : label
  const secret = (url.searchParams.get('secret') || '').replace(/[\s-]/g, '').toUpperCase()
  const algorithm = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase()
  const digits = Number(url.searchParams.get('digits') || 6)
  const period = Number(url.searchParams.get('period') || 30)
  return {
    secret, name, issuer, algorithm, digits, period, type,
    supported: type === 'totp' && ['SHA1', 'SHA256', 'SHA512'].includes(algorithm) &&
      [6, 8].includes(digits) && Number.isInteger(period) && period >= 10 && period <= 120 && SECRET_LENGTH.test(secret)
  }
}
