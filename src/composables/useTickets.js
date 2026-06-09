import { ref, computed } from 'vue';
import { getAuth } from 'firebase/auth';
import { FUNCTIONS_URL } from '../config/functions';

// Estado global compartido
const myTickets = ref([]);
const allTickets = ref([]);
const openTicketsCount = ref(0);
const loading = ref(false);
const error = ref(null);

// Cache de token
let tokenCache = {
  token: null,
  expires: 0
};

export function useTickets() {
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

  // Create new ticket
  async function createTicket(subject, message) {
    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/createTicketHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subject, message })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error creating ticket');
      }

      const data = await response.json();

      // Add to local list
      myTickets.value.unshift(data.ticket);

      return data.ticket;
    } catch (err) {
      console.error('Error creating ticket:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Get my tickets
  async function fetchMyTickets() {
    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/getMyTicketsHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error getting tickets');
      }

      const data = await response.json();
      myTickets.value = data.tickets;

      return data.tickets;
    } catch (err) {
      console.error('Error fetching tickets:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Add message to ticket
  async function addMessage(ticketId, content) {
    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/addTicketMessageHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ticketId, content })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error sending message');
      }

      const data = await response.json();

      // Update ticket in local list
      updateTicketInList(ticketId, data.ticket);

      return data.ticket;
    } catch (err) {
      console.error('Error adding message:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // Close ticket
  async function closeTicket(ticketId) {
    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/closeTicketHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ticketId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error closing ticket');
      }

      const data = await response.json();

      // Update ticket in local list
      updateTicketInList(ticketId, data.ticket);

      // Decrement counter if it was open
      if (openTicketsCount.value > 0) {
        openTicketsCount.value--;
      }

      return data.ticket;
    } catch (err) {
      console.error('Error closing ticket:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // [ADMIN] Get all tickets
  async function adminFetchTickets() {
    try {
      loading.value = true;
      error.value = null;

      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/adminGetTicketsHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error getting tickets');
      }

      const data = await response.json();
      allTickets.value = data.tickets;

      // Update counter
      openTicketsCount.value = data.tickets.filter(t => t.status === 'open').length;

      return data.tickets;
    } catch (err) {
      console.error('Error fetching all tickets:', err);
      error.value = err.message;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // [ADMIN] Get count of open tickets
  async function fetchOpenTicketsCount() {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${FUNCTIONS_URL}/getOpenTicketsCountHttp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return 0;
      }

      const data = await response.json();
      openTicketsCount.value = data.count;

      return data.count;
    } catch (err) {
      console.error('Error fetching tickets count:', err);
      return 0;
    }
  }

  // Helper: update ticket in local lists
  function updateTicketInList(ticketId, updatedTicket) {
    // Update in myTickets
    const myIndex = myTickets.value.findIndex(t => t.id === ticketId);
    if (myIndex !== -1) {
      myTickets.value[myIndex] = updatedTicket;
    }

    // Update in allTickets (admin)
    const allIndex = allTickets.value.findIndex(t => t.id === ticketId);
    if (allIndex !== -1) {
      allTickets.value[allIndex] = updatedTicket;
    }
  }

  // Computed: user's open tickets
  const myOpenTickets = computed(() =>
    myTickets.value.filter(t => t.status === 'open')
  );

  // Computed: user's closed tickets
  const myClosedTickets = computed(() =>
    myTickets.value.filter(t => t.status === 'closed')
  );

  // Clear state
  function clearTicketsState() {
    myTickets.value = [];
    allTickets.value = [];
    openTicketsCount.value = 0;
    error.value = null;
  }

  return {
    // State
    myTickets,
    allTickets,
    openTicketsCount,
    loading,
    error,

    // Computed
    myOpenTickets,
    myClosedTickets,

    // User methods
    createTicket,
    fetchMyTickets,
    addMessage,
    closeTicket,

    // Admin methods
    adminFetchTickets,
    fetchOpenTicketsCount,

    // Utils
    clearTicketsState
  };
}
