import { describe, it, expect } from 'vitest'
import { suggestEntry, suggestAll } from '../../src/utils/authenticatorMatch'

const ENTRIES = [
  { id: 'gh-work', title: 'GitHub (trabajo)', username: 'me@work.com', url: 'https://github.com' },
  { id: 'gh-home', title: 'GitHub', username: 'me@home.com', url: 'github.com' },
  { id: 'aws', title: 'Consola de Amazon', username: 'root', url: 'https://console.aws.amazon.com' },
  { id: 'mp', title: 'Mercado Pago', username: 'yo@example.com' },
  { id: 'gmail', title: 'Gmail personal', username: 'yo@gmail.com' }
]

describe('suggestEntry', () => {
  it('prefers issuer and username together', () => {
    expect(suggestEntry({ issuer: 'GitHub', name: 'me@work.com' }, ENTRIES)).toBe('gh-work')
    expect(suggestEntry({ issuer: 'GitHub', name: 'me@home.com' }, ENTRIES)).toBe('gh-home')
  })

  it('does not guess between two entries of the same service', () => {
    expect(suggestEntry({ issuer: 'GitHub', name: 'someone@else.com' }, ENTRIES)).toBeNull()
  })

  it('matches by the domain of the entry url', () => {
    expect(suggestEntry({ issuer: 'Amazon Web Services', name: 'root' }, ENTRIES)).toBe('aws')
  })

  it('ignores case and accents', () => {
    expect(suggestEntry({ issuer: 'MERCADO PAGO', name: '' }, ENTRIES)).toBe('mp')
  })

  it('returns null when nothing fits', () => {
    expect(suggestEntry({ issuer: 'Binance', name: 'yo@example.com' }, ENTRIES)).toBeNull()
  })

  it('falls back to the username only when the account has no issuer', () => {
    expect(suggestEntry({ issuer: '', name: 'yo@gmail.com' }, ENTRIES)).toBe('gmail')
  })
})

describe('suggestAll', () => {
  it('never gives the same entry to two accounts', () => {
    const accounts = [{ issuer: 'Mercado Pago', name: '' }, { issuer: 'Mercado Pago', name: 'otra' }]
    expect(suggestAll(accounts, ENTRIES)).toEqual(['mp', null])
  })

  it('does not suggest an entry for an account that cannot be imported', () => {
    expect(suggestAll([{ issuer: 'Mercado Pago', supported: false }], ENTRIES)).toEqual([null])
  })
})
