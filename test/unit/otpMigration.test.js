import { describe, it, expect } from 'vitest'
import { base32Decode, base32Encode } from '../../src/utils/base32'
import { decodeMigrationUri, encodeMigrationUris, parseOtpauthUri, ACCOUNTS_PER_QR } from '../../src/utils/otpMigration'

// Public sample of a Google Authenticator export: secret "Hello!\xde\xad\xbe\xef"
// (base32 JBSWY3DPEHPK3PXP), name "Example:alice@google.com", issuer "Example".
// Checked byte by byte with an independent decoder before using it here.
const SAMPLE = 'otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZSABKAEwAhABGAEgACjr4JP9Bg%3D%3D'

const account = (n, extra = {}) => ({
  secret: base32Encode(Uint8Array.from({ length: 20 }, (_, i) => (i * 7 + n) % 256)),
  name: `user${n}@example.com`,
  issuer: `Service ${n}`,
  algorithm: 'SHA1',
  digits: 6,
  ...extra
})

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from({ length: 33 }, (_, i) => (i * 37) % 256)
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes))
  })

  it('accepts the way sites print secrets', () => {
    expect(base32Encode(base32Decode('jbsw y3dp-ehpk 3pxp===='))).toBe('JBSWY3DPEHPK3PXP')
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('JBSWY3DP1')).toThrow(/Invalid base32/)
  })
})

describe('decodeMigrationUri', () => {
  it('decodes the public Google Authenticator sample', () => {
    const payload = decodeMigrationUri(SAMPLE)
    expect(payload.version).toBe(1)
    expect(payload.batchSize).toBe(1)
    expect(payload.accounts).toEqual([{
      secret: 'JBSWY3DPEHPK3PXP',
      name: 'alice@google.com',
      issuer: 'Example',
      algorithm: 'SHA1',
      digits: 6,
      type: 'totp',
      counter: 0,
      supported: true
    }])
  })

  it('keeps "+" in the base64 (URLSearchParams would turn it into a space)', () => {
    // Search for a secret whose payload base64 carries a "+", then pass it unescaped.
    let uri
    for (let n = 0; n < 500 && !uri; n++) {
      const [candidate] = encodeMigrationUris([account(n)], { batchId: 7 })
      const raw = decodeURIComponent(candidate.split('data=')[1])
      if (raw.includes('+')) uri = `otpauth-migration://offline?data=${raw}`
    }
    expect(uri, 'no se encontró un payload con "+"').toBeTruthy()
    expect(decodeMigrationUri(uri).accounts).toHaveLength(1)
  })

  it('marks HOTP and MD5 accounts as unsupported instead of dropping them', () => {
    // Built by hand: OtpParameters { secret, name "h", algorithm MD5 (4), type HOTP (1), counter 5 }
    const secret = [0x48, 0x65, 0x6c, 0x6c, 0x6f]
    const otp = [0x0a, secret.length, ...secret, 0x12, 1, 0x68, 0x20, 4, 0x30, 1, 0x38, 5]
    const payload = [0x0a, otp.length, ...otp, 0x10, 1]
    const uri = `otpauth-migration://offline?data=${encodeURIComponent(btoa(String.fromCharCode(...payload)))}`
    const [decoded] = decodeMigrationUri(uri).accounts
    expect(decoded).toMatchObject({ type: 'hotp', algorithm: 'MD5', counter: 5, name: 'h', supported: false })
  })

  it('marks secrets the server would reject as unsupported', () => {
    const short = (bytes) => decodeMigrationUri(encodeMigrationUris([account(1, { secret: base32Encode(new Uint8Array(bytes)) })])[0]).accounts[0]
    expect(short(4).supported).toBe(false) // 7 characters
    expect(short(5).supported).toBe(true) // 8 characters
    expect(short(8).supported).toBe(true) // 13 characters
    expect(short(81).supported).toBe(false) // 130 characters
  })

  it('rejects things that are not an export', () => {
    expect(() => decodeMigrationUri('otpauth://totp/x?secret=JBSWY3DP')).toThrow()
    expect(() => decodeMigrationUri('otpauth-migration://offline?foo=1')).toThrow(/data/)
    expect(() => decodeMigrationUri('otpauth-migration://offline?data=CjEK')).toThrow()
  })
})

describe('encodeMigrationUris', () => {
  it('round-trips accounts, including 8 digits, SHA256 and non-ASCII names', () => {
    const accounts = [
      account(1),
      account(2, { digits: 8, algorithm: 'SHA256' }),
      account(3, { algorithm: 'SHA512', name: 'josé@ejemplo.com', issuer: 'Año Nuevo' })
    ]
    const [uri] = encodeMigrationUris(accounts, { batchId: 42 })
    const payload = decodeMigrationUri(uri)
    expect(payload).toMatchObject({ version: 1, batchSize: 1, batchIndex: 0, batchId: 42 })
    expect(payload.accounts.map(({ secret, name, issuer, algorithm, digits, type }) =>
      ({ secret, name, issuer, algorithm, digits, type }))).toEqual(accounts.map((a) => ({ ...a, type: 'totp' })))
  })

  it('splits into QRs of ten and numbers them', () => {
    const accounts = Array.from({ length: 23 }, (_, i) => account(i))
    const uris = encodeMigrationUris(accounts, { batchId: 9 })
    expect(uris).toHaveLength(3)
    const payloads = uris.map(decodeMigrationUri)
    expect(payloads.map((p) => p.accounts.length)).toEqual([ACCOUNTS_PER_QR, ACCOUNTS_PER_QR, 3])
    expect(payloads.map((p) => [p.batchIndex, p.batchSize, p.batchId])).toEqual([[0, 3, 9], [1, 3, 9], [2, 3, 9]])
    expect(payloads.flatMap((p) => p.accounts.map((a) => a.secret))).toEqual(accounts.map((a) => a.secret))
  })

  it('writes lengths over 127 as multi-byte varints', () => {
    const long = account(5, { name: 'x'.repeat(300) })
    expect(decodeMigrationUri(encodeMigrationUris([long])[0]).accounts[0].name).toBe(long.name)
  })
})

describe('parseOtpauthUri', () => {
  it('reads label, issuer and parameters', () => {
    expect(parseOtpauthUri('otpauth://totp/GitHub:me%40example.com?secret=jbswy3dpehpk3pxp&issuer=GitHub&digits=8&algorithm=SHA256&period=60'))
      .toEqual({ secret: 'JBSWY3DPEHPK3PXP', name: 'me@example.com', issuer: 'GitHub', algorithm: 'SHA256', digits: 8, period: 60, type: 'totp', supported: true })
  })

  it('defaults to SHA1, 6 digits, 30 seconds', () => {
    expect(parseOtpauthUri('otpauth://totp/plain?secret=JBSWY3DPEHPK3PXP')).toMatchObject({ algorithm: 'SHA1', digits: 6, period: 30, issuer: '', name: 'plain', supported: true })
  })

  it('flags HOTP as unsupported', () => {
    expect(parseOtpauthUri('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1').supported).toBe(false)
  })
})
