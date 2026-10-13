import { ref, computed } from 'vue';
import { getAuth } from 'firebase/auth';
import { FUNCTIONS_URL } from '../config/functions';

export function useEmergencyAccess() {
  const myContacts = ref([]);      // People I've granted access to (I'm grantor)
  const myGrantors = ref([]);      // People who granted me access (I'm trustee)
  const isLoading = ref(false);
  const isLoadingGrantors = ref(false);

  // Firebase caches the ID token and refreshes it by itself. A second, manual
  // copy kept for 50 minutes could outlive the session it belonged to.
  async function getCachedAuthToken() {
    const user = getAuth().currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }

  async function fetchMyContacts() {
    isLoading.value = true;
    try {
      const token = await getCachedAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/getEmergencyContactsHttp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error('Error fetching contacts');
      const data = await response.json();
      myContacts.value = data.contacts || [];
    } catch (error) {
      myContacts.value = [];
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchMyGrantors() {
    isLoadingGrantors.value = true;
    try {
      const token = await getCachedAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/getEmergencyGrantorsHttp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error('Error fetching grantors');
      const data = await response.json();
      myGrantors.value = data.grantors || [];
    } catch (error) {
      myGrantors.value = [];
      throw error;
    } finally {
      isLoadingGrantors.value = false;
    }
  }

  async function addContact(email, waitPeriodDays) {
    const token = await getCachedAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/addEmergencyContactHttp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ trusteeEmail: email, waitPeriodDays })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error adding contact');
    }
    await fetchMyContacts();
  }

  async function revokeContact(accessId) {
    const token = await getCachedAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/revokeEmergencyContactHttp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ accessId })
    });
    if (!response.ok) throw new Error('Error revoking contact');
    myContacts.value = myContacts.value.filter(c => c.id !== accessId);
  }

  async function requestAccess(accessId) {
    const token = await getCachedAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/requestEmergencyAccessHttp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ accessId })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error requesting access');
    }
    await fetchMyGrantors();
  }

  async function approveRequest(accessId) {
    const token = await getCachedAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/approveEmergencyAccessHttp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ accessId })
    });
    if (!response.ok) throw new Error('Error approving request');
    await fetchMyContacts();
  }

  async function denyRequest(accessId) {
    const token = await getCachedAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/denyEmergencyAccessHttp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ accessId })
    });
    if (!response.ok) throw new Error('Error denying request');
    await fetchMyContacts();
  }

  async function getEmergencyPasswords(accessId) {
    const token = await getCachedAuthToken();
    const response = await fetch(`${FUNCTIONS_URL}/getEmergencyPasswordsHttp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ accessId })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Error getting passwords');
    }
    const data = await response.json();
    return data.passwords || [];
  }

  const pendingRequestsCount = computed(() =>
    myContacts.value.filter(c => c.status === 'requesting').length
  );

  return {
    myContacts, myGrantors, isLoading, isLoadingGrantors,
    fetchMyContacts, fetchMyGrantors,
    addContact, revokeContact,
    requestAccess, approveRequest, denyRequest,
    getEmergencyPasswords, pendingRequestsCount
  };
}
