import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { auth, db } from 'boot/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { FUNCTIONS_URL } from '../config/functions';

/**
 * Account entitlements composable.
 *
 * Under the OSS model every signed-in user has access to every feature.
 * This composable exposes the user's role and any legacy subscription
 * metadata so the account panel can display the right badge and let
 * legacy subscribers manage their billing portal.
 */
export function useEntitlements() {
  const $q = useQuasar();
  const { t } = useI18n();

  const userRole = ref('user');
  const subscriptionInfo = ref(null);
  const loadingPortal = ref(false);

  const currentUser = computed(() => auth.currentUser);

  // Hosted lifetime account: covers the new one-time SKU plus legacy paid
  // subscribers, founders (beta testers), and admins.
  const hasLifetimeHosted = computed(() =>
    ['lifetime_hosted', 'premium', 'founder', 'admin'].includes(userRole.value)
  );

  const isFounder = computed(() => userRole.value === 'founder');

  const formattedRenewalDate = computed(() => {
    if (!subscriptionInfo.value?.currentPeriodEnd) return null;
    const timestamp = subscriptionInfo.value.currentPeriodEnd;
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      date = new Date(timestamp);
    }
    return isNaN(date.getTime()) ? null : date.toLocaleDateString();
  });

  const roleLabel = computed(() => {
    const labels = {
      'founder': t('settings.subscription.founder'),
      'admin': t('settings.subscription.admin'),
      'lifetime_hosted': t('settings.subscription.premium'),
      'premium': t('settings.subscription.premium'),
      'trial': t('settings.subscription.trial'),
      'user': t('settings.subscription.free')
    };
    return labels[userRole.value] || t('settings.subscription.free');
  });

  const roleColor = computed(() => {
    const colors = {
      'founder': 'orange',
      'admin': 'amber',
      'lifetime_hosted': 'purple',
      'premium': 'purple',
      'trial': 'blue',
      'user': 'grey'
    };
    return colors[userRole.value] || 'grey';
  });

  const loadUserRole = async () => {
    if (!currentUser.value) return;

    try {
      const userDoc = await getDoc(doc(db, 'users', currentUser.value.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        userRole.value = data.role || 'user';
        subscriptionInfo.value = data.subscription || null;
      }
    } catch (error) {
      console.error('Error loading user role:', error);
    }
  };

  // Real-time subscription to the user document. Reacts immediately to the
  // Polar webhook upgrading the role to lifetime_hosted post-checkout,
  // bypassing any timeout race condition. Caller must invoke the returned
  // unsubscribe function on unmount.
  const subscribeToUserDoc = () => {
    if (!currentUser.value) return () => {};
    const userRef = doc(db, 'users', currentUser.value.uid);
    return onSnapshot(
      userRef,
      (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        userRole.value = data.role || 'user';
        subscriptionInfo.value = data.subscription || null;
      },
      (error) => {
        console.error('Error subscribing to user doc:', error);
      }
    );
  };

  // Kept for legacy subscribers so they can access their billing portal,
  // request refunds, or cancel. The new one-time checkout flow lives in
  // its own composable and is not part of this entitlements model.
  const manageSubscription = async () => {
    if (!currentUser.value) return;

    loadingPortal.value = true;
    try {
      const token = await currentUser.value.getIdToken();

      const response = await fetch(`${FUNCTIONS_URL}/getCustomerPortalUrl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.customerPortalUrl) {
        window.open(data.customerPortalUrl, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (error) {
      console.error('Error getting customer portal:', error);
      $q.notify({
        type: 'negative',
        message: error.message || t('settings.subscription.errorPortal'),
        icon: 'error'
      });
    } finally {
      loadingPortal.value = false;
    }
  };

  return {
    userRole,
    subscriptionInfo,
    loadingPortal,
    hasLifetimeHosted,
    isFounder,
    formattedRenewalDate,
    roleLabel,
    roleColor,
    loadUserRole,
    subscribeToUserDoc,
    manageSubscription
  };
}
