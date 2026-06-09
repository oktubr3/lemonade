import { ref } from 'vue';
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startRegistration,
  startAuthentication
} from '@simplewebauthn/browser';
import { auth } from 'boot/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import { FUNCTIONS_URL } from '../config/functions';

const PASSKEY_FLAG_KEY = 'lemonade_has_passkey';
const PASSKEY_USER_KEY = 'lemonade_passkey_user';

export function usePasskeys() {
  const isWebAuthnSupported = ref(false);
  const hasPlatformAuth = ref(false);
  const userPasskeys = ref([]);
  const isLoading = ref(false);
  const error = ref(null);

  const checkSupport = async () => {
    isWebAuthnSupported.value = browserSupportsWebAuthn();
    if (isWebAuthnSupported.value) {
      hasPlatformAuth.value = await platformAuthenticatorIsAvailable();
    }
  };

  const getAuthHeaders = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const registerPasskey = async (deviceName) => {
    isLoading.value = true;
    error.value = null;

    try {
      const headers = await getAuthHeaders();

      // Step 1: Get registration options from server
      const optionsRes = await fetch(`${FUNCTIONS_URL}/webauthnGetRegistrationOptionsHttp`, {
        method: 'POST',
        headers
      });

      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(err.error || 'Failed to get registration options');
      }

      const options = await optionsRes.json();

      // Step 2: Start registration (browser prompt)
      const regResponse = await startRegistration({ optionsJSON: options });

      // Step 3: Verify with server
      const verifyRes = await fetch(`${FUNCTIONS_URL}/webauthnVerifyRegistrationHttp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          body: regResponse,
          deviceName: deviceName || getDeviceName()
        })
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Registration verification failed');
      }

      const result = await verifyRes.json();

      if (result.verified) {
        // Set localStorage flags
        localStorage.setItem(PASSKEY_FLAG_KEY, 'true');
        localStorage.setItem(PASSKEY_USER_KEY, auth.currentUser.uid);
        await fetchUserPasskeys();
      }

      return result;
    } catch (err) {
      error.value = err.message || 'Registration failed';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const authenticateWithPasskey = async (userId) => {
    isLoading.value = true;
    error.value = null;

    try {
      // Step 1: Get authentication options from server (no auth needed)
      const optionsRes = await fetch(`${FUNCTIONS_URL}/webauthnGetAuthenticationOptionsHttp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(err.error || 'Failed to get authentication options');
      }

      const options = await optionsRes.json();

      // Step 2: Start authentication (browser prompt)
      const authResponse = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify with server and get custom token
      const verifyRes = await fetch(`${FUNCTIONS_URL}/webauthnVerifyAuthenticationHttp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: authResponse,
          userId
        })
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Authentication verification failed');
      }

      const result = await verifyRes.json();

      if (result.verified && result.token) {
        // Sign in with custom token
        await signInWithCustomToken(auth, result.token);
        // Reset session timer
        localStorage.setItem('lemonade_last_login', Date.now().toString());
      }

      return result;
    } catch (err) {
      error.value = err.message || 'Authentication failed';
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const fetchUserPasskeys = async () => {
    isLoading.value = true;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${FUNCTIONS_URL}/webauthnGetPasskeysHttp`, { headers });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch passkeys');
      }

      const data = await res.json();
      userPasskeys.value = data.passkeys || [];

      // Update localStorage flag
      if (userPasskeys.value.length > 0) {
        localStorage.setItem(PASSKEY_FLAG_KEY, 'true');
        localStorage.setItem(PASSKEY_USER_KEY, auth.currentUser?.uid || '');
      } else {
        localStorage.removeItem(PASSKEY_FLAG_KEY);
        localStorage.removeItem(PASSKEY_USER_KEY);
      }
    } catch (err) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  };

  const removePasskey = async (passkeyDocId) => {
    isLoading.value = true;
    error.value = null;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${FUNCTIONS_URL}/webauthnRemovePasskeyHttp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ passkeyDocId })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove passkey');
      }

      const result = await res.json();

      // Update local state
      await fetchUserPasskeys();

      return result;
    } catch (err) {
      error.value = err.message;
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const hasRegisteredPasskey = () => {
    return localStorage.getItem(PASSKEY_FLAG_KEY) === 'true';
  };

  const getStoredUserId = () => {
    return localStorage.getItem(PASSKEY_USER_KEY);
  };

  const getDeviceName = () => {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown device';
  };

  return {
    isWebAuthnSupported,
    hasPlatformAuth,
    userPasskeys,
    isLoading,
    error,
    checkSupport,
    registerPasskey,
    authenticateWithPasskey,
    fetchUserPasskeys,
    removePasskey,
    hasRegisteredPasskey,
    getStoredUserId
  };
}
