import { ref, computed } from 'vue';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { FUNCTIONS_URL } from '../config/functions';

// Estado global compartido
const userRole = ref(null);
const roleLoaded = ref(false);
const isAdmin = ref(false);
const users = ref([]);
const stats = ref(null);
const loading = ref(false);
// One flag per request. They all shared `loading`, so the list blinked back to
// a spinner whenever the role, the stats or a save were in flight.
const usersLoading = ref(false);
const statsLoading = ref(false);
const saving = ref(false);
const error = ref(null);

// Auth state listener — wipes admin state whenever the signed-in user
// changes (logout, login, or switch). Without this the module-level refs
// above survive sign-out and the previous user's isAdmin value leaks into
// the next session (admin button stays visible to a non-admin until a
// full page reload). Initialized lazily on first useAdmin() call.
let _authListenerInitialized = false;
let _lastUid = null;

// getUserRoleHttp had two independent callers on every app load: MainLayout's
// fetchUserRole() and the auth-state listener below, which fires as soon as
// the session resolves. Both hit the network. These two share the in-flight
// request and the already-loaded result for the current uid instead.
let _roleRequest = null;
let _roleUid = null;

function wipeAdminState() {
  _roleRequest = null;
  _roleUid = null;
  userRole.value = null;
  roleLoaded.value = false;
  isAdmin.value = false;
  users.value = [];
  stats.value = null;
  error.value = null;
}

// Firebase caches the ID token and refreshes it on its own. This module used to
// keep a second copy for 50 minutes; getIdToken() is simply asked every time.
async function getAuthToken() {
  const user = getAuth().currentUser;
  if (!user) {
    throw new Error('User not authenticated');
  }
  return user.getIdToken();
}

// Get current user's role
async function requestUserRole() {
  try {
    loading.value = true;
    error.value = null;

    const token = await getAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/getUserRoleHttp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error('Error getting user role');
    }

    const data = await response.json();
    userRole.value = data.role;
    isAdmin.value = data.isAdmin;
    roleLoaded.value = true;

    return data;
  } catch (err) {
    console.error('Error fetching user role:', err);
    error.value = err.message;
    userRole.value = 'user';
    isAdmin.value = false;
    throw err;
  } finally {
    loading.value = false;
  }
}
// Shared entry point: joins the in-flight request and skips the call when
// the role for this uid is already loaded.
async function fetchUserRole({ force = false } = {}) {
  const uid = getAuth().currentUser?.uid || null;

  // No session: there is nothing to ask for. Returning the default instead of
  // throwing keeps the console clean on the login screen, where MainLayout
  // still mounts and asks.
  if (!uid) {
    userRole.value = 'user';
    isAdmin.value = false;
    return { role: 'user', isAdmin: false };
  }

  if (!force && roleLoaded.value && _roleUid === uid) {
    return { role: userRole.value, isAdmin: isAdmin.value };
  }
  if (_roleRequest) return _roleRequest;

  _roleRequest = requestUserRole()
    .then((data) => { _roleUid = uid; return data; })
    .finally(() => { _roleRequest = null; });

  return _roleRequest;
}

function setupAuthListener() {
  if (_authListenerInitialized) return;
  try {
    const auth = getAuth();
    onAuthStateChanged(auth, (user) => {
      const newUid = user ? user.uid : null;
      if (newUid !== _lastUid) {
        wipeAdminState();
        _lastUid = newUid;
        if (user) {
          // Fetch the new user's role so admin UI updates without waiting
          // for a component re-mount. Shares the request with any component
          // that is asking for it at the same time.
          fetchUserRole().catch(() => {});
        }
      }
    });
    _authListenerInitialized = true;
  } catch (err) {
    // getAuth() may throw before Firebase init; retry on next useAdmin() call.
    console.warn('useAdmin: deferred auth listener init', err);
  }
}

export function useAdmin() {
  setupAuthListener();
  async function callAdminFunction(name, body, fallbackMessage) {
    const token = await getAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body || {})
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || fallbackMessage);
    }
    return response.json();
  }

  // Get list of users (admin only)
  async function fetchUsers() {
    if (!isAdmin.value) {
      throw new Error('Access denied');
    }

    try {
      usersLoading.value = true;
      error.value = null;
      const data = await callAdminFunction('adminGetUsersHttp', null, 'Error getting users');
      users.value = data.users;
      // The stats come with the list: one function to wait for instead of two.
      // A backend from before that change does not send them; ask the old way.
      if (data.stats) {
        stats.value = data.stats;
      } else {
        fetchStats().catch(() => {});
      }
      return data.users;
    } catch (err) {
      console.error('Error fetching users:', err);
      error.value = err.message;
      throw err;
    } finally {
      usersLoading.value = false;
    }
  }

  // Update user (admin only). `updates` carries only what changed.
  async function updateUser(targetUserId, updates) {
    if (!isAdmin.value) {
      throw new Error('Access denied');
    }

    try {
      saving.value = true;
      error.value = null;
      const data = await callAdminFunction('adminUpdateUserHttp', { targetUserId, updates }, 'Error updating user');

      // Apply the change to the row in place instead of downloading the whole
      // list again. The API calls the notes field `notes`; the list calls it
      // `adminNotes`.
      const index = users.value.findIndex(u => u.uid === targetUserId);
      if (index !== -1) {
        const { notes, ...rest } = updates;
        const change = { ...rest };
        if (notes !== undefined) change.adminNotes = notes;
        if (updates.accountLocked !== undefined) {
          change.accountUnlocked = !updates.accountLocked;
          if (updates.accountLocked) change.accountLockedAt = new Date().toISOString();
        }
        users.value[index] = { ...users.value[index], ...change };
      }

      return data;
    } catch (err) {
      console.error('Error updating user:', err);
      error.value = err.message;
      throw err;
    } finally {
      saving.value = false;
    }
  }

  // Get statistics (admin only)
  async function fetchStats() {
    if (!isAdmin.value) {
      throw new Error('Access denied');
    }

    try {
      statsLoading.value = true;
      error.value = null;
      const data = await callAdminFunction('adminGetStatsHttp', null, 'Error getting statistics');
      stats.value = data.stats;
      return data.stats;
    } catch (err) {
      console.error('Error fetching stats:', err);
      error.value = err.message;
      throw err;
    } finally {
      statsLoading.value = false;
    }
  }

  // Run roles migration (admin only)
  async function migrateUserRoles() {
    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/migrateUserRolesHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error running migration');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error migrating roles:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Computed to count users by role
  const usersByRole = computed(() => {
    const counts = { admin: 0, user: 0, founder: 0, premium: 0, trial: 0, suspended: 0 };
    users.value.forEach(user => {
      const role = user.role || 'user';
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  });

  // OSS migration: all features are available to every signed-in user.
  // Kept as a computed for backwards compatibility with existing call sites
  // until the cruft cleanup pass renames this concept (see useEntitlements).
  const isPremiumUser = computed(() => true);

  // Computed: Is founder? (beta tester with lifetime premium)
  const isFounder = computed(() => userRole.value === 'founder');

  // Clear state
  function clearAdminState() {
    userRole.value = null;
    roleLoaded.value = false;
    isAdmin.value = false;
    users.value = [];
    stats.value = null;
    error.value = null;
  }

  return {
    // State
    userRole,
    roleLoaded,
    isAdmin,
    isPremiumUser,
    isFounder,
    users,
    stats,
    loading,
    usersLoading,
    statsLoading,
    saving,
    error,
    usersByRole,

    // Methods
    fetchUserRole,
    fetchUsers,
    updateUser,
    fetchStats,
    migrateUserRoles,
    clearAdminState
  };
}
