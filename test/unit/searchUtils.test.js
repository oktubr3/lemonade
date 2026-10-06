import { describe, it, expect } from 'vitest'
import {
    normalizeText,
    matchesSearch,
    matchesNormalized,
    splitSearchWords,
    calculateSearchScore,
    sortByRelevance,
} from 'src/utils/searchUtils'

describe('normalizeText', () => {
    it('lowercases and strips accents', () => {
        expect(normalizeText('Contraseña ÁÉÍÓÚ')).toBe('contrasena aeiou')
    })

    it('returns an empty string for empty input', () => {
        expect(normalizeText('')).toBe('')
        expect(normalizeText(null)).toBe('')
        expect(normalizeText(undefined)).toBe('')
    })
})

describe('matchesSearch', () => {
    it('matches every word regardless of order', () => {
        expect(matchesSearch('mauro gmail', ['Gmail', 'mauro@gmail.com'])).toBe(true)
        expect(matchesSearch('gmail mauro', ['Gmail', 'mauro@gmail.com'])).toBe(true)
    })

    it('ignores accents on both sides', () => {
        expect(matchesSearch('sesion', ['Iniciar Sesión'])).toBe(true)
    })

    it('requires ALL words to match', () => {
        expect(matchesSearch('gmail banco', ['Gmail', 'mauro@gmail.com'])).toBe(false)
    })

    it('is false for empty search', () => {
        expect(matchesSearch('', ['Gmail'])).toBe(false)
        expect(matchesSearch('   ', ['Gmail'])).toBe(false)
    })

    it('skips null and undefined fields', () => {
        expect(matchesSearch('gmail', [null, 'Gmail', undefined])).toBe(true)
    })
})

describe('splitSearchWords / matchesNormalized', () => {
    it('splits on whitespace and drops empties', () => {
        expect(splitSearchWords('  mauro   gmail ')).toEqual(['mauro', 'gmail'])
    })

    it('matchesNormalized agrees with matchesSearch', () => {
        const words = splitSearchWords('mauro gmail')
        expect(matchesNormalized(words, normalizeText('Gmail mauro@gmail.com'))).toBe(true)
        expect(matchesNormalized([], 'cualquier cosa')).toBe(false)
    })
})

describe('calculateSearchScore', () => {
    it('returns 0 when a word is absent', () => {
        expect(calculateSearchScore('Gmail', 'banco')).toBe(0)
    })

    it('returns 0 for an empty search', () => {
        expect(calculateSearchScore('Gmail', '')).toBe(0)
    })

    it('scores a prefix match above a mid-string match', () => {
        const prefix = calculateSearchScore('Gmail personal', 'gmail')
        const middle = calculateSearchScore('Cuenta de Gmail', 'gmail')
        expect(prefix).toBeGreaterThan(middle)
    })

    // A search term is user input and was being interpolated straight into a
    // RegExp for the whole-word bonus. Any regex metacharacter that also
    // appeared in the item made the expression invalid, so the score threw
    // instead of returning a number -- and because this runs inside the
    // computed that renders the list, the whole list broke.
    describe('does not break on regex metacharacters in the search', () => {
        const metacharacters = ['c++', 'a(b', '*', '?', '[x', 'a|b', '^foo', 'a{2']

        it.each(metacharacters)('scores %j without throwing', (term) => {
            expect(() => calculateSearchScore(`Something ${term} here`, term)).not.toThrow()
            expect(typeof calculateSearchScore(`Something ${term} here`, term)).toBe('number')
        })

        it('still finds the entry when the term has metacharacters', () => {
            expect(calculateSearchScore('C++ Course', 'c++')).toBeGreaterThan(0)
        })
    })
})

describe('sortByRelevance', () => {
    const entries = [
        { title: 'Cuenta de Gmail' },
        { title: 'Gmail personal' },
        { title: 'Banco' },
    ]

    it('puts the prefix match first', () => {
        const sorted = sortByRelevance(entries, 'gmail', 'title')
        expect(sorted[0].title).toBe('Gmail personal')
    })

    it('does not mutate the input array', () => {
        const copy = [...entries]
        sortByRelevance(entries, 'gmail', 'title')
        expect(entries).toEqual(copy)
    })

    it('survives a search with regex metacharacters', () => {
        const withPlus = [{ title: 'C++ Course' }, { title: 'Banco' }]
        expect(() => sortByRelevance(withPlus, 'c++', 'title')).not.toThrow()
    })
})
