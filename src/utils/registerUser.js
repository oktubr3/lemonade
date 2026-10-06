/**
 * Single entry point for registerUserHttp.
 *
 * The endpoint does two things: it keeps users/{uid} in sync (needed so other
 * people can find you when sharing) and it reports whether the account is
 * locked for inactivity. Both callers used to hit it on their own — the login
 * page on sign-in AND again from its auth-state listener, and the index page on
 * every mount — so a single sign-in produced half a dozen identical POSTs, each
 * one a Firestore write and a round trip on the critical path.
 *
 * This caches the result per uid for the life of the page and collapses
 * concurrent calls into one in-flight request.
 */
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { FUNCTIONS_URL } from "../config/functions";

// uid -> { locked, success } of the last successful call
const cache = new Map();
// uid -> in-flight promise
const inFlight = new Map();

/**
 * @param {import('firebase/auth').User} [user] - defaults to the current user
 * @param {{ force?: boolean }} [options] - force re-checks the account lock
 * @returns {Promise<{ success: boolean, locked: boolean }>}
 */
export const ensureUserRegistered = async (user = null, { force = false } = {}) => {
    const current = user || getAuth().currentUser;
    if (!current) return { success: false, locked: false };

    const uid = current.uid;
    if (!force && cache.has(uid)) return cache.get(uid);
    if (inFlight.has(uid)) return inFlight.get(uid);

    const request = (async () => {
        try {
            const token = await current.getIdToken();
            const response = await fetch(`${FUNCTIONS_URL}/registerUserHttp`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({}),
            });

            if (!response.ok) {
                console.warn("registerUser: unexpected status", response.status);
                return { success: false, locked: false };
            }

            const result = await response.json();
            const value = { success: result.success !== false, locked: result.locked === true };
            cache.set(uid, value);
            return value;
        } catch (error) {
            // Never block sign-in or the vault on this call
            console.warn("registerUser: request failed", error);
            return { success: false, locked: false };
        } finally {
            inFlight.delete(uid);
        }
    })();

    inFlight.set(uid, request);
    return request;
};

/** Called on sign-out so the next user starts clean. */
export const resetUserRegistrationCache = () => {
    cache.clear();
    inFlight.clear();
};

// Sign-out happens in several places (login page, session expiry, lock on
// exit), so clear here instead of at each call site.
onAuthStateChanged(getAuth(), (user) => {
    if (!user) resetUserRegistrationCache();
});
