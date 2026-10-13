/**
 * Pure logic of the admin panel: filtering, sorting and working out what an
 * edit actually changes. Kept out of the page so it can be unit tested.
 */

/** Date from a Firestore Timestamp, one serialized by a Cloud Function, an ISO string or millis. */
export function toDate(value) {
    if (!value) return null;
    let date;
    if (typeof value.toDate === 'function') {
        date = value.toDate();
    } else {
        const seconds = value._seconds ?? value.seconds;
        date = typeof seconds === 'number' ? new Date(seconds * 1000) : new Date(value);
    }
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * `filter` is a role, or one of 'all', 'disabled', 'locked'. Disabled accounts
 * stay hidden unless asked for, as before.
 */
export function filterUsers(users, { search = '', filter = 'all' } = {}) {
    const needle = search.trim().toLowerCase();
    return (users || []).filter((user) => {
        if (filter === 'disabled') {
            if (!user.isDisabled) return false;
        } else {
            if (user.isDisabled) return false;
            if (filter === 'locked' && !user.accountLocked) return false;
            if (filter !== 'all' && filter !== 'locked' && (user.role || 'user') !== filter) return false;
        }
        if (!needle) return true;
        return (user.email || '').toLowerCase().includes(needle)
            || (user.displayName || '').toLowerCase().includes(needle);
    });
}

const millis = (value) => toDate(value)?.getTime() ?? 0;

const SORTERS = {
    email: (a, b) => (a.email || '').localeCompare(b.email || ''),
    // Most recent first; accounts that never signed in go last.
    lastLogin: (a, b) => millis(b.lastLoginAt) - millis(a.lastLoginAt),
    created: (a, b) => millis(b.createdAt) - millis(a.createdAt),
    passwords: (a, b) => (b.passwordCount || 0) - (a.passwordCount || 0),
};

/** Returns a new array; ties fall back to email so the order is stable. */
export function sortUsers(users, sortBy = 'email') {
    const sorter = SORTERS[sortBy] || SORTERS.email;
    return [...(users || [])].sort((a, b) => sorter(a, b) || SORTERS.email(a, b));
}

/**
 * What the edit form changes with respect to the stored user, as the payload
 * for adminUpdateUserHttp. Only changed fields are sent: the dialog used to
 * send every field on every save, so saving a role also rewrote the notes with
 * whatever the dialog had loaded (nothing) and wiped them.
 */
export function buildUserUpdate(user, form) {
    const update = {};
    if (form.role !== (user.role || 'user')) update.role = form.role;
    if (!!form.isDisabled !== !!user.isDisabled) update.isDisabled = !!form.isDisabled;
    if (!!form.accountLocked !== !!user.accountLocked) update.accountLocked = !!form.accountLocked;
    const notes = (form.notes || '').trim();
    if (notes !== (user.adminNotes || '').trim()) update.notes = notes;
    return update;
}

/**
 * Changes in an update that deserve an explicit confirmation, as keys of
 * `admin.users.confirm.*`. An empty list means the change is harmless.
 */
export function riskyChanges(user, update) {
    const risks = [];
    const currentRole = user.role || 'user';
    if (update.role === 'admin' && currentRole !== 'admin') risks.push('grantAdmin');
    if (update.role !== undefined && update.role !== 'admin' && currentRole === 'admin') risks.push('revokeAdmin');
    if (update.role === 'suspended') risks.push('suspend');
    if (update.isDisabled === true) risks.push('disable');
    if (update.accountLocked === true) risks.push('lock');
    return risks;
}
