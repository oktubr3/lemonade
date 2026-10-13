import { ref, computed } from 'vue';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from 'src/boot/firebase';
import { FUNCTIONS_URL } from '../config/functions';

// Estado global compartido
const myTickets = ref([]);
const allTickets = ref([]);
const loading = ref(false);
const error = ref(null);
// true once the first snapshot of each list arrived
const myTicketsReady = ref(false);
const allTicketsReady = ref(false);

// A ticket waits for support when it is open and the user spoke last. Derived
// from the messages so it also works for tickets created before this existed.
export const ticketNeedsReply = (ticket) => {
  if (!ticket || ticket.status !== 'open') return false;
  const last = ticket.messages?.[ticket.messages.length - 1];
  return !last || !last.isAdmin;
};

// Millis of a Firestore Timestamp, a serialized one, or an ISO string.
export const ticketTimeMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const seconds = value._seconds ?? value.seconds;
  if (typeof seconds === 'number') return seconds * 1000;
  const millis = new Date(value).getTime();
  return Number.isNaN(millis) ? 0 : millis;
};

// Tickets are read live from Firestore (the rules allow a user its own tickets
// and an admin all of them). Before, every list was a Cloud Function call:
// the admin had to press refresh to see a new ticket, and a user never saw the
// reply arrive. Writes still go through the functions.
let stopMyTickets = null;
let stopAllTickets = null;
let listeningUid = null;
// A screen asked for the user's own list and is still showing it.
let wantsMyTickets = false;

function stopListening() {
  stopMyTickets?.();
  stopAllTickets?.();
  stopMyTickets = null;
  stopAllTickets = null;
  listeningUid = null;
}

function clearTicketsState() {
  stopListening();
  myTickets.value = [];
  allTickets.value = [];
  myTicketsReady.value = false;
  allTicketsReady.value = false;
  error.value = null;
}

// Wipe everything when the signed-in user changes. This module keeps its state
// for the life of the page, and nothing cleared it on sign-out: the next person
// to sign in on the same tab saw the previous user's tickets. It also cached
// the ID token by hand for 50 minutes, so their ticket actions were sent with
// the previous user's token. Firebase already caches and refreshes the token;
// getIdToken() is asked every time now.
let authListenerReady = false;
let lastUid = null;

function setupAuthListener() {
  if (authListenerReady) return;
  try {
    onAuthStateChanged(getAuth(), (user) => {
      const uid = user ? user.uid : null;
      if (uid !== lastUid) {
        clearTicketsState();
        lastUid = uid;
        // Another account signed in on the same tab with the support screen
        // open: start again with ITS tickets instead of leaving a spinner.
        if (uid && wantsMyTickets) startMyTickets(uid);
      }
    });
    authListenerReady = true;
  } catch (err) {
    // getAuth() may throw before Firebase init; retry on next useTickets() call.
    console.warn('useTickets: deferred auth listener init', err);
  }
}

const toTicket = (doc) => ({ id: doc.id, ...doc.data() });

function startMyTickets(uid) {
  stopMyTickets?.();
  listeningUid = uid;
  stopMyTickets = onSnapshot(
    query(collection(db, 'tickets'), where('userId', '==', uid), orderBy('updatedAt', 'desc'), limit(50)),
    (snapshot) => {
      myTickets.value = snapshot.docs.map(toTicket);
      myTicketsReady.value = true;
    },
    (err) => {
      myTicketsReady.value = true;
      if (signedOutSince(uid)) return;
      console.error('Error watching tickets:', err);
      error.value = err.message;
    }
  );
}

// On sign-out Firestore cancels the listeners with permission-denied, sometimes
// before the auth listener above has stopped them. That is not an error.
const signedOutSince = (uid) => getAuth().currentUser?.uid !== uid;

async function callTicketFunction(name, body, fallbackMessage) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('User not authenticated');

  const token = await user.getIdToken();
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

// Runs one write, tracking `loading` and `error` like the callers expect.
async function runAction(label, action) {
  try {
    loading.value = true;
    error.value = null;
    return await action();
  } catch (err) {
    console.error(label, err);
    error.value = err.message;
    throw err;
  } finally {
    loading.value = false;
  }
}

export function useTickets() {
  setupAuthListener();

  // Helper: update ticket in local lists (the snapshot does the same a moment
  // later; this keeps the screen in step when the listener is not running)
  function updateTicketInList(ticketId, updatedTicket) {
    for (const list of [myTickets, allTickets]) {
      const index = list.value.findIndex(t => t.id === ticketId);
      if (index !== -1) list.value[index] = updatedTicket;
    }
  }

  // Create new ticket
  function createTicket(subject, message) {
    return runAction('Error creating ticket:', async () => {
      const data = await callTicketFunction('createTicketHttp', { subject, message }, 'Error creating ticket');
      if (!myTickets.value.some(t => t.id === data.ticket.id)) myTickets.value.unshift(data.ticket);
      return data.ticket;
    });
  }

  // Add message to ticket
  function addMessage(ticketId, content) {
    return runAction('Error adding message:', async () => {
      const data = await callTicketFunction('addTicketMessageHttp', { ticketId, content }, 'Error sending message');
      updateTicketInList(ticketId, data.ticket);
      return data.ticket;
    });
  }

  // Close ticket
  function closeTicket(ticketId) {
    return runAction('Error closing ticket:', async () => {
      const data = await callTicketFunction('closeTicketHttp', { ticketId }, 'Error closing ticket');
      updateTicketInList(ticketId, data.ticket);
      return data.ticket;
    });
  }

  // Reopen a closed ticket
  function reopenTicket(ticketId) {
    return runAction('Error reopening ticket:', async () => {
      const data = await callTicketFunction('reopenTicketHttp', { ticketId }, 'Error reopening ticket');
      updateTicketInList(ticketId, data.ticket);
      return data.ticket;
    });
  }

  // Keep my own tickets in sync. Safe to call more than once.
  function watchMyTickets() {
    wantsMyTickets = true;
    const uid = getAuth().currentUser?.uid;
    if (!uid || (stopMyTickets && listeningUid === uid)) return;
    startMyTickets(uid);
  }

  // [ADMIN] Keep every ticket in sync. Safe to call more than once.
  function watchAllTickets() {
    const uid = getAuth().currentUser?.uid;
    if (!uid || stopAllTickets) return;
    listeningUid = uid;
    stopAllTickets = onSnapshot(
      query(collection(db, 'tickets'), orderBy('updatedAt', 'desc'), limit(200)),
      (snapshot) => {
        allTickets.value = snapshot.docs.map(toTicket);
        allTicketsReady.value = true;
      },
      (err) => {
        allTicketsReady.value = true;
        if (signedOutSince(uid)) return;
        console.error('Error watching all tickets:', err);
        error.value = err.message;
      }
    );
  }

  // Computed: user's open tickets
  const myOpenTickets = computed(() =>
    myTickets.value.filter(t => t.status === 'open')
  );

  // Computed: user's closed tickets
  const myClosedTickets = computed(() =>
    myTickets.value.filter(t => t.status === 'closed')
  );

  // [ADMIN] Open tickets where the user is still waiting for an answer
  const ticketsAwaitingReply = computed(() =>
    allTickets.value.filter(ticketNeedsReply).length
  );

  return {
    // State
    myTickets,
    allTickets,
    myTicketsReady,
    allTicketsReady,
    loading,
    error,

    // Computed
    myOpenTickets,
    myClosedTickets,
    ticketsAwaitingReply,

    // User methods
    createTicket,
    addMessage,
    closeTicket,
    reopenTicket,
    watchMyTickets,

    // Admin methods
    watchAllTickets,

    // Utils
    clearTicketsState
  };
}
