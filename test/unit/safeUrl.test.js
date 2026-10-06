import { describe, it, expect } from 'vitest'
import { toSafeHttpUrl } from 'src/utils/safeUrl'

// This helper is the gate in front of window.open for stored and shared
// entries, so the cases that matter most are the ones it must REJECT: an
// attacker who controls an entry's url field should not be able to turn a
// click on "open site" into script execution.
describe('toSafeHttpUrl', () => {
    describe('rejects non-http(s) schemes', () => {
        const dangerous = [
            'javascript:alert(1)',
            'JavaScript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'vbscript:msgbox(1)',
            'file:///etc/passwd',
            'blob:https://example.com/abc',
            'about:blank',
        ]

        it.each(dangerous)('rejects %s', (value) => {
            expect(toSafeHttpUrl(value)).toBeNull()
        })

        // Control characters are stripped before parsing, so they cannot be
        // used to smuggle a scheme past the check.
        it('rejects a scheme hidden behind control characters', () => {
            expect(toSafeHttpUrl('java\u0000script:alert(1)')).toBeNull()
            expect(toSafeHttpUrl('  \tjavascript:alert(1)  ')).toBeNull()
        })
    })

    describe('rejects values that are not usable URLs', () => {
        it.each([
            ['empty string', ''],
            ['only whitespace', '   '],
            ['null', null],
            ['undefined', undefined],
            ['a number', 42],
            ['an object', {}],
        ])('rejects %s', (_label, value) => {
            expect(toSafeHttpUrl(value)).toBeNull()
        })
    })

    describe('accepts and normalizes http(s)', () => {
        it('keeps an https URL', () => {
            expect(toSafeHttpUrl('https://example.com/path')).toBe('https://example.com/path')
        })

        it('keeps plain http', () => {
            expect(toSafeHttpUrl('http://example.com/')).toBe('http://example.com/')
        })

        it('assumes https when no scheme is given', () => {
            expect(toSafeHttpUrl('example.com')).toBe('https://example.com/')
        })

        it('treats host:port as a host, not as a scheme', () => {
            expect(toSafeHttpUrl('example.com:8080/admin')).toBe('https://example.com:8080/admin')
        })

        it('trims surrounding whitespace', () => {
            expect(toSafeHttpUrl('  example.com  ')).toBe('https://example.com/')
        })

        it('preserves query and fragment', () => {
            expect(toSafeHttpUrl('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c')
        })
    })
})
