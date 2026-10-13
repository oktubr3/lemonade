import { describe, expect, it } from 'vitest'
import { buildUserUpdate, filterUsers, riskyChanges, sortUsers, toDate } from 'src/utils/adminUsers'

const users = [
    { uid: 'a', email: 'ana@example.com', displayName: 'Ana', role: 'admin', passwordCount: 3, lastLoginAt: { _seconds: 300 }, createdAt: { _seconds: 10 } },
    { uid: 'b', email: 'bruno@example.com', displayName: 'Bruno', passwordCount: 40, lastLoginAt: null, createdAt: { _seconds: 30 } },
    { uid: 'c', email: 'carla@example.com', displayName: 'Carla', role: 'premium', isDisabled: true, passwordCount: 9, lastLoginAt: { _seconds: 900 }, createdAt: { _seconds: 20 } },
    { uid: 'd', email: 'dario@example.com', displayName: 'Darío', role: 'user', accountLocked: true, passwordCount: 0, lastLoginAt: { _seconds: 100 }, createdAt: { _seconds: 40 } },
]
const emails = (list) => list.map((user) => user.email.split('@')[0])

describe('toDate', () => {
    it('reads every shape a timestamp arrives in', () => {
        expect(toDate({ toDate: () => new Date(5000) }).getTime()).toBe(5000)
        expect(toDate({ _seconds: 5 }).getTime()).toBe(5000)
        expect(toDate({ seconds: 5 }).getTime()).toBe(5000)
        expect(toDate('1970-01-01T00:00:05.000Z').getTime()).toBe(5000)
    })

    it('returns null for nothing or garbage', () => {
        expect(toDate(null)).toBeNull()
        expect(toDate('not a date')).toBeNull()
    })
})

describe('filterUsers', () => {
    it('hides disabled accounts unless they are asked for', () => {
        expect(emails(filterUsers(users))).toEqual(['ana', 'bruno', 'dario'])
        expect(emails(filterUsers(users, { filter: 'disabled' }))).toEqual(['carla'])
    })

    it('treats a missing role as a plain user', () => {
        expect(emails(filterUsers(users, { filter: 'user' }))).toEqual(['bruno', 'dario'])
    })

    it('filters by role and by lock', () => {
        expect(emails(filterUsers(users, { filter: 'admin' }))).toEqual(['ana'])
        expect(emails(filterUsers(users, { filter: 'locked' }))).toEqual(['dario'])
    })

    it('searches name and email, ignoring case and surrounding spaces', () => {
        expect(emails(filterUsers(users, { search: '  BRUNO ' }))).toEqual(['bruno'])
        expect(emails(filterUsers(users, { search: 'darío' }))).toEqual(['dario'])
        expect(filterUsers(users, { search: 'nobody' })).toEqual([])
    })
})

describe('sortUsers', () => {
    it('does not mutate the list it is given', () => {
        const before = emails(users)
        sortUsers(users, 'passwords')
        expect(emails(users)).toEqual(before)
    })

    it('puts the most recent sign-in first and never-signed-in last', () => {
        expect(emails(sortUsers(users, 'lastLogin'))).toEqual(['carla', 'ana', 'dario', 'bruno'])
    })

    it('sorts by newest account and by number of passwords', () => {
        expect(emails(sortUsers(users, 'created'))).toEqual(['dario', 'bruno', 'carla', 'ana'])
        expect(emails(sortUsers(users, 'passwords'))).toEqual(['bruno', 'carla', 'ana', 'dario'])
    })

    it('falls back to email for an unknown key', () => {
        expect(emails(sortUsers([...users].reverse(), 'whatever'))).toEqual(['ana', 'bruno', 'carla', 'dario'])
    })
})

describe('buildUserUpdate', () => {
    const user = { role: 'premium', isDisabled: false, accountLocked: true, adminNotes: 'paid by transfer' }
    const untouched = { role: 'premium', isDisabled: false, accountLocked: true, notes: 'paid by transfer' }

    it('sends nothing when nothing changed', () => {
        expect(buildUserUpdate(user, untouched)).toEqual({})
    })

    it('does not touch the notes when only the role changes', () => {
        // The regression this guards: saving any change used to wipe the notes.
        expect(buildUserUpdate(user, { ...untouched, role: 'user' })).toEqual({ role: 'user' })
    })

    it('sends only the fields that changed', () => {
        expect(buildUserUpdate(user, { ...untouched, accountLocked: false })).toEqual({ accountLocked: false })
        expect(buildUserUpdate(user, { ...untouched, isDisabled: true, notes: 'refunded' }))
            .toEqual({ isDisabled: true, notes: 'refunded' })
    })

    it('lets the notes be cleared on purpose', () => {
        expect(buildUserUpdate(user, { ...untouched, notes: '  ' })).toEqual({ notes: '' })
    })

    it('treats a user without a role as a plain user', () => {
        expect(buildUserUpdate({}, { role: 'user', isDisabled: false, accountLocked: false, notes: '' })).toEqual({})
    })
})

describe('riskyChanges', () => {
    it('finds nothing risky in notes or an unlock', () => {
        expect(riskyChanges({ role: 'user' }, { notes: 'x', accountLocked: false, isDisabled: false })).toEqual([])
        expect(riskyChanges({ role: 'user' }, { role: 'premium' })).toEqual([])
    })

    it('flags granting and revoking admin', () => {
        expect(riskyChanges({ role: 'user' }, { role: 'admin' })).toEqual(['grantAdmin'])
        expect(riskyChanges({ role: 'admin' }, { role: 'user' })).toEqual(['revokeAdmin'])
    })

    it('flags everything that takes access away', () => {
        expect(riskyChanges({ role: 'admin' }, { role: 'suspended', isDisabled: true, accountLocked: true }))
            .toEqual(['revokeAdmin', 'suspend', 'disable', 'lock'])
    })
})
