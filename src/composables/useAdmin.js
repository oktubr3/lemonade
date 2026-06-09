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
const error = ref(null);

// Cache de token
let tokenCache = {
  token: null,
  expires: 0
};

// Auth state listener — wipes admin state whenever the signed-in user
// changes (logout, login, or switch). Without this the module-level refs
// above survive sign-out and the previous user's isAdmin value leaks into
// the next session (admin button stays visible to a non-admin until a
// full page reload). Initialized lazily on first useAdmin() call.
let _authListenerInitialized = false;
let _lastUid = null;

function wipeAdminState() {
  userRole.value = null;
  roleLoaded.value = false;
  isAdmin.value = false;
  users.value = [];
  stats.value = null;
  error.value = null;
  tokenCache.token = null;
  tokenCache.expires = 0;
}

// Module-level fetcher so the auth listener can refresh the role after a
// user switch without needing a component to re-mount.
async function refetchRoleForCurrentUser() {
  const auth = getAuth();
  if (!auth.currentUser) return;
  try {
    const token = await auth.currentUser.getIdToken(false);
    const response = await fetch(`${FUNCTIONS_URL}/getUserRoleHttp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) return;
    const data = await response.json();
    userRole.value = data.role;
    isAdmin.value = data.isAdmin;
    roleLoaded.value = true;
  } catch (err) {
    console.warn('useAdmin: post-login role refetch failed', err);
  }
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
          // for a component re-mount.
          refetchRoleForCurrentUser();
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
  // Get token with cache
  async function getAuthToken() {
    const auth = getAuth();
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    const now = Date.now();
    if (tokenCache.token && tokenCache.expires > now + 60000) {
      return tokenCache.token;
    }

    const token = await auth.currentUser.getIdToken(false);
    tokenCache.token = token;
    tokenCache.expires = now + (50 * 60 * 1000);
    return token;
  }

  // Get current user's role
  async function fetchUserRole() {
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

  // Get list of users (admin only)
  async function fetchUsers() {
    if (!isAdmin.value) {
      throw new Error('Access denied');
    }

    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/adminGetUsersHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error getting users');
      }

      const data = await response.json();
      users.value = data.users;

      return data.users;
    } catch (err) {
      console.error('Error fetching users:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Update user (admin only)
  async function updateUser(targetUserId, updates) {
    if (!isAdmin.value) {
      throw new Error('Access denied');
    }

    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/adminUpdateUserHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId, updates })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error updating user');
      }

      const data = await response.json();

      // Update the user in the local list
      const index = users.value.findIndex(u => u.uid === targetUserId);
      if (index !== -1) {
        users.value[index] = {
          ...users.value[index],
          ...updates
        };
      }

      return data;
    } catch (err) {
      console.error('Error updating user:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Get statistics (admin only)
  async function fetchStats() {
    if (!isAdmin.value) {
      throw new Error('Access denied');
    }

    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/adminGetStatsHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error getting statistics');
      }

      const data = await response.json();
      stats.value = data.stats;

      return data.stats;
    } catch (err) {
      console.error('Error fetching stats:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
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
