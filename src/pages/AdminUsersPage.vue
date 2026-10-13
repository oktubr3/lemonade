<script setup>
import { ref, onMounted, computed, watch, defineOptions } from 'vue';
import { useRouter } from 'vue-router';
import { copyToClipboard, useQuasar } from 'quasar';
import { getAuth } from 'firebase/auth';
import { useAdmin } from 'src/composables/useAdmin';
import { ticketNeedsReply, ticketTimeMillis, useTickets } from 'src/composables/useTickets';
import { buildUserUpdate, filterUsers, riskyChanges, sortUsers, toDate } from 'src/utils/adminUsers';
import { useI18n } from 'vue-i18n';
import LemonadeLoader from 'src/components/LemonadeLoader.vue';

defineOptions({
  name: 'AdminUsersPage'
});

const $q = useQuasar();
const router = useRouter();
const { t, locale } = useI18n();

const {
  isAdmin,
  users,
  stats,
  usersLoading,
  saving,
  fetchUserRole,
  fetchUsers,
  updateUser
} = useAdmin();

// Tickets composable
const {
  allTickets,
  allTicketsReady,
  ticketsAwaitingReply,
  loading: ticketBusy,
  watchAllTickets,
  addMessage,
  closeTicket,
  reopenTicket
} = useTickets();

const TICKET_MESSAGE_MAX_LENGTH = 2000;
// Rows drawn at once. The rest appear with "show more": the whole list is in
// memory either way, this only keeps the DOM small.
const USERS_PAGE_SIZE = 50;

// Local state - Tabs
const activeTab = ref('users');

// Local state - Users
const search = ref('');
const roleFilter = ref('all');
const sortBy = ref('email');
const shownUsers = ref(USERS_PAGE_SIZE);
const selectedUser = ref(null);
const showEditDialog = ref(false);
const editForm = ref({
  role: 'user',
  isDisabled: false,
  accountLocked: false,
  notes: ''
});

// Local state - Tickets
const ticketSearch = ref('');
const ticketFilter = ref('all');
const selectedTicketId = ref(null);
const showTicketChatDialog = ref(false);
const ticketReplyMessage = ref('');

const myUid = computed(() => getAuth().currentUser?.uid || null);

// Role options
const roleOptions = computed(() => [
  { label: t('admin.users.roles.user'), value: 'user', color: 'grey-7' },
  { label: t('admin.users.roles.admin'), value: 'admin', color: 'amber' },
  { label: t('admin.users.roles.founder'), value: 'founder', color: 'orange-8' },
  { label: t('admin.users.roles.premium'), value: 'premium', color: 'purple' },
  { label: t('admin.users.roles.trial'), value: 'trial', color: 'blue' },
  { label: t('admin.users.roles.suspended'), value: 'suspended', color: 'red' }
]);

const filterOptions = computed(() => [
  { label: t('admin.users.filters.all'), value: 'all' },
  { label: t('admin.users.filters.admins'), value: 'admin' },
  { label: t('admin.users.filters.founders'), value: 'founder' },
  { label: t('admin.users.filters.users'), value: 'user' },
  { label: t('admin.users.filters.premium'), value: 'premium' },
  { label: t('admin.users.filters.trial'), value: 'trial' },
  { label: t('admin.users.filters.suspended'), value: 'suspended' },
  { label: t('admin.users.filters.disabled'), value: 'disabled' },
  { label: t('admin.users.filters.locked'), value: 'locked' }
]);

const sortOptions = computed(() => [
  { label: t('admin.users.sort.email'), value: 'email' },
  { label: t('admin.users.sort.lastLogin'), value: 'lastLogin' },
  { label: t('admin.users.sort.created'), value: 'created' },
  { label: t('admin.users.sort.passwords'), value: 'passwords' }
]);

// Computed
const filteredUsers = computed(() =>
  sortUsers(filterUsers(users.value, { search: search.value || '', filter: roleFilter.value }), sortBy.value)
);

const visibleUsers = computed(() => filteredUsers.value.slice(0, shownUsers.value));
const hiddenUsersCount = computed(() => Math.max(0, filteredUsers.value.length - shownUsers.value));

// A new search or filter starts again from the first page.
watch([search, roleFilter, sortBy], () => {
  shownUsers.value = USERS_PAGE_SIZE;
});

const lockedUsersCount = computed(() => users.value.filter(user => user.accountLocked).length);
const activeUsersCount = computed(() => users.value.filter(user => !user.isDisabled).length);
const disabledUsersCount = computed(() => users.value.filter(user => user.isDisabled).length);

// The server's total when it is in; until then, the sum of the rows.
const totalPasswords = computed(() =>
  stats.value?.passwords?.total ?? users.value.reduce((sum, user) => sum + (user.passwordCount || 0), 0)
);

const editingSelf = computed(() => !!selectedUser.value && selectedUser.value.uid === myUid.value);

// Tickets computed
const filteredTickets = computed(() => {
  let result = allTickets.value || [];

  if (ticketFilter.value === 'needsReply') {
    result = result.filter(ticketNeedsReply);
  } else if (ticketFilter.value === 'open') {
    result = result.filter(ticket => ticket.status === 'open');
  } else if (ticketFilter.value === 'closed') {
    result = result.filter(ticket => ticket.status === 'closed');
  }

  if (ticketSearch.value) {
    const searchLower = ticketSearch.value.toLowerCase();
    result = result.filter(ticket =>
      ticket.userEmail?.toLowerCase().includes(searchLower) ||
      ticket.subject?.toLowerCase().includes(searchLower)
    );
  }

  // Whoever is waiting for an answer goes first, oldest wait on top; then the rest by last activity.
  return [...result].sort((a, b) => {
    const waitingA = ticketNeedsReply(a);
    const waitingB = ticketNeedsReply(b);
    if (waitingA !== waitingB) return waitingA ? -1 : 1;
    const byTime = ticketTimeMillis(b.updatedAt) - ticketTimeMillis(a.updatedAt);
    return waitingA ? -byTime : byTime;
  });
});

// Looked up by id in the live list, so a new message shows up in the open
// conversation without closing it.
const selectedTicket = computed(() =>
  allTickets.value.find(ticket => ticket.id === selectedTicketId.value) || null
);

// Methods
function notifyError(message) {
  $q.notify({ color: 'negative', message, icon: 'error' });
}

// One request brings the list and the stats. MainLayout already asked for it
// when this admin's session started, so the panel usually opens with the data
// in memory and this only refreshes it.
function loadPanelData() {
  fetchUsers().catch(() => notifyError(t('admin.users.notifications.loadPanelError')));
}

async function initAdmin() {
  try {
    await fetchUserRole();
  } catch (err) {
    console.error('Error initializing admin:', err);
    notifyError(t('admin.users.notifications.loadPanelError'));
    return;
  }

  if (!isAdmin.value) {
    $q.notify({
      color: 'negative',
      message: t('admin.users.notifications.accessDenied'),
      icon: 'block'
    });
    router.push('/');
    return;
  }

  loadPanelData();
  watchAllTickets();
}

function getRoleColor(role) {
  const option = roleOptions.value.find(o => o.value === role);
  return option?.color || 'grey';
}

function getRoleLabel(role) {
  const option = roleOptions.value.find(o => o.value === role);
  return option?.label || role;
}

function getAvatarColor(role) {
  const colors = {
    admin: 'amber',
    founder: 'orange-8',
    premium: 'purple-4',
    trial: 'blue-4',
    suspended: 'red-4'
  };
  return colors[role] || 'grey-4';
}

function formatDate(timestamp) {
  const date = toDate(timestamp);
  if (!date) return '-';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

// "3 days ago", in the language of the interface.
function formatRelative(timestamp) {
  const date = toDate(timestamp);
  if (!date) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, 'minute');
}

function lastLoginLabel(user) {
  return t('admin.users.lastLogin', {
    when: user.lastLoginAt ? formatRelative(user.lastLoginAt) : t('admin.users.never')
  });
}

function getInitials(user) {
  if (user.displayName) {
    return user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  return user.email?.[0]?.toUpperCase() || '?';
}

function openEditDialog(user) {
  selectedUser.value = user;
  editForm.value = {
    role: user.role || 'user',
    isDisabled: user.isDisabled || false,
    accountLocked: user.accountLocked || false,
    notes: user.adminNotes || ''
  };
  showEditDialog.value = true;
}

async function copyUid() {
  try {
    await copyToClipboard(selectedUser.value.uid);
    $q.notify({ color: 'positive', message: t('admin.users.notifications.uidCopied'), icon: 'check', timeout: 1200 });
  } catch {
    // Clipboard blocked by the browser: the uid stays on screen to copy by hand.
  }
}

// Asks before anything that takes access away or hands out admin rights.
function confirmRisks(risks) {
  if (risks.length === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    $q.dialog({
      title: t('admin.users.confirm.title'),
      message: [
        t('admin.users.confirm.intro', { user: selectedUser.value.email || selectedUser.value.displayName }),
        ...risks.map(risk => `• ${t(`admin.users.confirm.${risk}`)}`)
      ].join('\n'),
      style: 'white-space: pre-line',
      cancel: { flat: true, color: 'grey', label: t('common.cancel') },
      ok: { color: 'negative', unelevated: true, label: t('admin.users.confirm.proceed') },
      persistent: true
    }).onOk(() => resolve(true)).onCancel(() => resolve(false));
  });
}

async function saveUserChanges() {
  if (!selectedUser.value) return;

  const payload = buildUserUpdate(selectedUser.value, editForm.value);
  if (Object.keys(payload).length === 0) {
    showEditDialog.value = false;
    return;
  }

  if (!await confirmRisks(riskyChanges(selectedUser.value, payload))) return;

  try {
    await updateUser(selectedUser.value.uid, payload);

    $q.notify({
      color: 'positive',
      message: payload.accountLocked === false
        ? t('admin.users.notifications.accountUnlocked')
        : t('admin.users.notifications.userUpdated'),
      icon: 'check'
    });

    showEditDialog.value = false;
    selectedUser.value = null;
  } catch (err) {
    notifyError(err.message || t('admin.users.notifications.updateError'));
  }
}

// ============ Ticket Functions ============

function formatTicketTime(timestamp) {
  const millis = ticketTimeMillis(timestamp);
  if (!millis) return '';

  const diffMs = Date.now() - millis;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('tickets.time.justNow');
  if (diffMins < 60) return t('tickets.time.minutesAgo', { n: diffMins });
  if (diffHours < 24) return t('tickets.time.hoursAgo', { n: diffHours });
  return t('tickets.time.daysAgo', { n: diffDays });
}

function getLastMessagePreview(ticket) {
  if (!ticket.messages || ticket.messages.length === 0) return '';
  const lastMsg = ticket.messages[ticket.messages.length - 1];
  const content = String(lastMsg.content ?? '');
  return content.substring(0, 60) + (content.length > 60 ? '...' : '');
}

function openTicketChat(ticket) {
  selectedTicketId.value = ticket.id;
  ticketReplyMessage.value = '';
  showTicketChatDialog.value = true;
}

async function sendTicketReply() {
  const content = ticketReplyMessage.value.trim();
  if (!content || !selectedTicket.value || ticketBusy.value) return;

  try {
    await addMessage(selectedTicket.value.id, content);
    ticketReplyMessage.value = '';
  } catch (err) {
    notifyError(err.message || t('tickets.messages.errorSending'));
  }
}

async function handleCloseTicket() {
  if (!selectedTicket.value) return;

  try {
    await closeTicket(selectedTicket.value.id);
    $q.notify({
      color: 'positive',
      message: t('tickets.messages.closed'),
      icon: 'check_circle'
    });
  } catch (err) {
    notifyError(err.message || t('tickets.messages.errorClosing'));
  }
}

async function handleReopenTicket() {
  if (!selectedTicket.value) return;

  try {
    await reopenTicket(selectedTicket.value.id);
    $q.notify({
      color: 'positive',
      message: t('tickets.messages.reopened'),
      icon: 'check_circle'
    });
  } catch (err) {
    notifyError(err.message || t('tickets.messages.errorReopening'));
  }
}

// Lifecycle
onMounted(() => {
  initAdmin();
});
</script>

<template>
  <q-page class="admin-page q-pa-md">
    <!-- Header con stats -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12">
        <q-card flat bordered class="header-card">
          <q-card-section>
            <div class="row items-center justify-between">
              <div class="col">
                <div class="text-h5 text-weight-bold flex items-center">
                  <q-icon name="admin_panel_settings" color="amber" size="md" class="q-mr-sm" />
                  {{ t('admin.users.pageTitle') }}
                </div>
                <div class="text-caption text-grey-6">
                  {{ t('admin.users.pageSubtitle') }}
                </div>
              </div>
              <div class="col-auto">
                <q-btn
                  flat
                  dense
                  icon="refresh"
                  color="grey"
                  :loading="usersLoading"
                  :aria-label="t('admin.users.refresh')"
                  data-testid="admin-refresh"
                  @click="loadPanelData"
                />
              </div>
            </div>
          </q-card-section>
          <!-- Refreshing with data already on screen: a thin bar, not a blank list -->
          <q-linear-progress v-if="usersLoading && users.length > 0" indeterminate color="amber" size="2px" />
        </q-card>
      </div>

      <!-- Stats cards -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-amber" data-testid="stat-users">
              {{ activeUsersCount }}
            </div>
            <div class="text-caption text-grey-6">
              {{ t('admin.users.statUsers') }}
              <q-badge
                v-if="disabledUsersCount > 0"
                color="red-9"
                :label="`+${disabledUsersCount}`"
                class="q-ml-xs"
                style="font-size: 0.65rem"
              >
                <q-tooltip>{{ t('admin.users.disabledTooltip', { count: disabledUsersCount }) }}</q-tooltip>
              </q-badge>
              <q-badge
                v-if="lockedUsersCount > 0"
                color="orange-9"
                :label="`🔒${lockedUsersCount}`"
                class="q-ml-xs"
                style="font-size: 0.65rem"
              >
                <q-tooltip>{{ t('admin.users.lockedTooltip', { count: lockedUsersCount }) }}</q-tooltip>
              </q-badge>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-6 col-sm-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-purple" data-testid="stat-passwords">
              {{ totalPasswords }}
            </div>
            <div class="text-caption text-grey-6">{{ t('admin.users.statPasswords') }}</div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-6 col-sm-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-blue">
              {{ stats?.shares?.total || 0 }}
            </div>
            <div class="text-caption text-grey-6">{{ t('admin.users.statShared') }}</div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-6 col-sm-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-green" data-testid="stat-activity">
              {{ stats?.activity?.recentActions || 0 }}
            </div>
            <div class="text-caption text-grey-6">{{ t('admin.users.statActivity7d') }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Tabs -->
    <q-card flat bordered class="q-mb-md">
      <q-tabs
        v-model="activeTab"
        dense
        class="text-grey"
        active-color="amber"
        indicator-color="amber"
        align="left"
      >
        <q-tab name="users" :label="t('admin.users.tabUsers')" icon="people" />
        <q-tab name="tickets" icon="support_agent">
          <template v-slot:default>
            {{ t('admin.users.tabTickets') }}
            <q-badge
              v-if="ticketsAwaitingReply > 0"
              color="red"
              floating
              :label="ticketsAwaitingReply"
              data-testid="tickets-awaiting"
            />
          </template>
        </q-tab>
      </q-tabs>
    </q-card>

    <q-tab-panels v-model="activeTab" animated>
      <!-- Panel: Users -->
      <q-tab-panel name="users" class="q-pa-none">
        <!-- Filters and search -->
        <q-card flat bordered class="q-mb-md">
          <q-card-section class="q-pa-sm">
            <div class="row q-col-gutter-sm items-center">
              <div class="col-12 col-sm-6">
                <q-input
                  v-model="search"
                  dense
                  outlined
                  :placeholder="t('admin.users.searchPlaceholder')"
                  clearable
                >
                  <template v-slot:prepend>
                    <q-icon name="search" />
                  </template>
                </q-input>
              </div>
              <div class="col-6 col-sm-3">
                <q-select
                  v-model="roleFilter"
                  :options="filterOptions"
                  dense
                  outlined
                  emit-value
                  map-options
                  :label="t('admin.users.filterByRole')"
                />
              </div>
              <div class="col-6 col-sm-3">
                <q-select
                  v-model="sortBy"
                  :options="sortOptions"
                  dense
                  outlined
                  emit-value
                  map-options
                  :label="t('admin.users.sortBy')"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- User list -->
        <q-card flat bordered>
          <q-list separator>
            <!-- The big loader only when there is nothing to show yet -->
            <q-item v-if="usersLoading && users.length === 0" class="text-center q-pa-lg">
              <q-item-section>
                <LemonadeLoader :fullscreen="false" />
              </q-item-section>
            </q-item>

            <q-item v-else-if="filteredUsers.length === 0" class="text-center q-pa-lg">
              <q-item-section>
                <q-icon name="person_off" size="48px" color="grey-5" />
                <div class="text-grey-6 q-mt-sm">{{ t('admin.users.noUsers') }}</div>
              </q-item-section>
            </q-item>

            <q-item
              v-for="user in visibleUsers"
              :key="user.uid"
              clickable
              data-testid="admin-user-row"
              @click="openEditDialog(user)"
              :class="{ 'admin-row--disabled': user.isDisabled, 'admin-row--locked': user.accountLocked && !user.isDisabled }"
            >
              <q-item-section avatar>
                <q-avatar :color="getAvatarColor(user.role)" text-color="dark" size="42px">
                  <img v-if="user.photoURL" :src="user.photoURL" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" />
                  <span v-else>{{ getInitials(user) }}</span>
                </q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label class="text-weight-medium">
                  {{ user.displayName || user.email }}
                  <q-badge
                    v-if="user.uid === myUid"
                    outline
                    color="amber-9"
                    :label="t('admin.users.badge.you')"
                    class="q-ml-sm"
                  />
                  <q-badge
                    v-if="user.isDisabled"
                    color="red"
                    :label="t('admin.users.badge.disabled')"
                    class="q-ml-sm"
                  />
                  <q-badge
                    v-if="user.accountLocked"
                    color="orange-9"
                    class="q-ml-sm"
                  >
                    <q-icon name="lock" size="xs" class="q-mr-xs" />
                    {{ t('admin.users.badge.locked') }}
                    <q-tooltip>{{ t('admin.users.badge.lockedTooltip', { date: formatDate(user.accountLockedAt) }) }}</q-tooltip>
                  </q-badge>
                </q-item-label>
                <q-item-label caption>
                  {{ user.email }}
                </q-item-label>
                <q-item-label caption class="text-grey-5">
                  {{ lastLoginLabel(user) }}
                </q-item-label>
              </q-item-section>

              <q-item-section side>
                <div class="row items-center q-gutter-sm">
                  <q-badge
                    :color="getRoleColor(user.role)"
                    :label="getRoleLabel(user.role)"
                    class="text-capitalize"
                  />
                  <div class="text-caption text-grey-6">
                    {{ t('admin.users.pwdCount', { count: user.passwordCount || 0 }) }}
                  </div>
                </div>
              </q-item-section>

              <q-item-section side>
                <q-icon name="chevron_right" color="grey-5" />
              </q-item-section>
            </q-item>

            <q-item v-if="hiddenUsersCount > 0" class="q-pa-sm">
              <q-item-section>
                <q-btn
                  flat
                  no-caps
                  color="amber-9"
                  :label="t('admin.users.showMore', { count: Math.min(hiddenUsersCount, USERS_PAGE_SIZE), total: hiddenUsersCount })"
                  @click="shownUsers += USERS_PAGE_SIZE"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>

        <!-- Edit user dialog -->
        <q-dialog v-model="showEditDialog" persistent>
          <q-card style="min-width: 350px; max-width: 460px" data-testid="admin-edit-dialog">
            <q-card-section class="row items-center">
              <div class="text-h6">{{ t('admin.users.editDialog.title') }}</div>
              <q-space />
              <q-btn icon="close" flat round dense v-close-popup :aria-label="t('common.close')" />
            </q-card-section>

            <q-card-section v-if="selectedUser">
              <div class="row items-center q-mb-md">
                <q-avatar :color="getAvatarColor(selectedUser.role)" text-color="dark" size="48px" class="q-mr-md">
                  <img v-if="selectedUser.photoURL" :src="selectedUser.photoURL" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="" />
                  <span v-else>{{ getInitials(selectedUser) }}</span>
                </q-avatar>
                <div>
                  <div class="text-weight-medium">{{ selectedUser.displayName || t('admin.users.editDialog.noName') }}</div>
                  <div class="text-caption text-grey-6">{{ selectedUser.email }}</div>
                </div>
              </div>

              <q-banner v-if="editingSelf" class="admin-banner admin-banner--self q-mb-md" rounded dense>
                <template v-slot:avatar>
                  <q-icon name="shield" color="amber-9" />
                </template>
                {{ t('admin.users.editDialog.selfBanner') }}
              </q-banner>

              <q-separator class="q-my-md" />

              <!-- Your own access cannot be taken away from here: the server refuses too -->
              <q-select
                v-model="editForm.role"
                :options="roleOptions"
                :label="t('admin.users.editDialog.roleLabel')"
                :disable="editingSelf"
                emit-value
                map-options
                outlined
                dense
                class="q-mb-md"
              />

              <q-toggle
                v-model="editForm.isDisabled"
                :label="t('admin.users.editDialog.userDisabledLabel')"
                :disable="editingSelf"
                color="red"
                class="q-mb-md"
              />

              <q-toggle
                v-model="editForm.accountLocked"
                :disable="editingSelf"
                color="orange"
                class="q-mb-md"
              >
                <template v-slot:default>
                  <div class="row items-center q-gutter-xs">
                    <q-icon name="lock" size="sm" :color="editForm.accountLocked ? 'orange' : 'grey-6'" />
                    <span>{{ t('admin.users.editDialog.accountLockedLabel') }}</span>
                  </div>
                </template>
              </q-toggle>

              <q-banner v-if="selectedUser.accountLocked && !editForm.accountLocked" class="admin-banner admin-banner--ok q-mb-md" rounded dense>
                <template v-slot:avatar>
                  <q-icon name="lock_open" color="green" />
                </template>
                {{ t('admin.users.editDialog.willUnlockBanner') }}
              </q-banner>

              <q-banner v-if="selectedUser.accountLocked && editForm.accountLocked" class="admin-banner admin-banner--warn q-mb-md" rounded dense>
                <template v-slot:avatar>
                  <q-icon name="lock" color="orange" />
                </template>
                {{ t('admin.users.editDialog.lockedSinceBanner', { date: formatDate(selectedUser.accountLockedAt) }) }}
              </q-banner>

              <q-input
                v-model="editForm.notes"
                :label="t('admin.users.editDialog.notesLabel')"
                type="textarea"
                outlined
                dense
                rows="3"
                maxlength="2000"
                counter
              />

              <div class="text-caption text-grey-6 q-mt-md">
                <div>{{ t('admin.users.editDialog.registered', { date: formatDate(selectedUser.createdAt) }) }}</div>
                <div>{{ lastLoginLabel(selectedUser) }}</div>
                <div>{{ t('admin.users.editDialog.passwords', { count: selectedUser.passwordCount || 0 }) }}</div>
                <div v-if="selectedUser.subscription?.status">
                  {{ t('admin.users.editDialog.subscription', { status: selectedUser.subscription.status }) }}
                  <span v-if="selectedUser.subscription.currentPeriodEnd">· {{ formatDate(selectedUser.subscription.currentPeriodEnd) }}</span>
                </div>
                <div class="row items-center no-wrap">
                  <span class="ellipsis">UID: {{ selectedUser.uid }}</span>
                  <q-btn flat dense round size="sm" icon="content_copy" :aria-label="t('admin.users.editDialog.copyUid')" @click="copyUid" />
                </div>
              </div>
            </q-card-section>

            <q-card-actions align="right">
              <q-btn flat :label="t('common.cancel')" color="grey" v-close-popup />
              <q-btn
                flat
                :label="t('common.save')"
                color="primary"
                :loading="saving"
                @click="saveUserChanges"
              />
            </q-card-actions>
          </q-card>
        </q-dialog>
      </q-tab-panel>

      <!-- Panel: Tickets -->
      <q-tab-panel name="tickets" class="q-pa-none">
        <!-- Ticket filters -->
        <q-card flat bordered class="q-mb-md">
          <q-card-section class="q-pa-sm">
            <div class="row q-col-gutter-sm items-center">
              <div class="col-12 col-sm-5">
                <q-input
                  v-model="ticketSearch"
                  dense
                  outlined
                  :placeholder="t('tickets.admin.searchPlaceholder')"
                  clearable
                >
                  <template v-slot:prepend>
                    <q-icon name="search" />
                  </template>
                </q-input>
              </div>
              <div class="col-12 col-sm-7">
                <q-btn-toggle
                  v-model="ticketFilter"
                  spread
                  no-caps
                  dense
                  unelevated
                  toggle-color="amber"
                  toggle-text-color="dark"
                  text-color="grey-7"
                  class="ticket-filter-toggle"
                  :options="[
                    { label: t('tickets.admin.allTickets'), value: 'all' },
                    { label: t('tickets.admin.needsReply'), value: 'needsReply' },
                    { label: t('tickets.admin.openTickets'), value: 'open' },
                    { label: t('tickets.admin.closedTickets'), value: 'closed' }
                  ]"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>

        <!-- Ticket list -->
        <q-card flat bordered>
          <q-list separator>
            <q-item v-if="!allTicketsReady" class="text-center q-pa-lg">
              <q-item-section>
                <q-spinner-dots color="amber" size="40px" />
              </q-item-section>
            </q-item>

            <q-item v-else-if="filteredTickets.length === 0" class="q-pa-lg">
              <q-item-section class="items-center">
                <q-icon name="inbox" size="48px" color="grey-5" />
                <div class="text-grey-6 q-mt-sm">{{ t('tickets.admin.noTickets') }}</div>
              </q-item-section>
            </q-item>

            <q-item
              v-for="ticket in filteredTickets"
              :key="ticket.id"
              clickable
              data-testid="admin-ticket-row"
              @click="openTicketChat(ticket)"
              :class="{ 'admin-row--waiting': ticketNeedsReply(ticket) }"
            >
              <q-item-section avatar>
                <q-avatar
                  :color="ticket.status === 'open' ? 'amber' : 'grey-5'"
                  text-color="dark"
                  size="42px"
                >
                  <q-icon :name="ticketNeedsReply(ticket) ? 'mark_email_unread' : 'mark_email_read'" />
                </q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label class="text-weight-medium">
                  {{ ticket.subject }}
                  <q-badge
                    v-if="ticketNeedsReply(ticket)"
                    color="red"
                    :label="t('tickets.admin.needsReply')"
                    class="q-ml-sm"
                  />
                  <q-badge
                    v-else-if="ticket.status === 'open'"
                    color="amber"
                    :label="t('tickets.admin.open')"
                    class="q-ml-sm"
                  />
                  <q-badge
                    v-else
                    color="grey"
                    :label="t('tickets.admin.closed')"
                    class="q-ml-sm"
                  />
                </q-item-label>
                <q-item-label caption>
                  {{ ticket.userEmail }}
                </q-item-label>
                <q-item-label caption class="text-grey-5">
                  {{ getLastMessagePreview(ticket) }}
                </q-item-label>
              </q-item-section>

              <q-item-section side top>
                <q-item-label caption>{{ formatTicketTime(ticket.updatedAt || ticket.createdAt) }}</q-item-label>
                <q-badge
                  v-if="ticket.messages?.length"
                  color="grey-6"
                  :label="ticket.messages.length"
                  class="q-mt-xs"
                />
              </q-item-section>

              <q-item-section side>
                <q-icon name="chevron_right" color="grey-5" />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Ticket chat dialog (Admin) -->
    <q-dialog v-model="showTicketChatDialog" maximized>
      <q-card class="column no-wrap ticket-chat-dialog" data-testid="admin-ticket-chat">
        <!-- Header -->
        <q-card-section class="row items-center q-pb-none bg-dark">
          <div class="col">
            <div class="text-h6">{{ selectedTicket?.subject }}</div>
            <div class="text-caption text-grey-5">{{ selectedTicket?.userEmail }}</div>
          </div>
          <q-badge
            :color="selectedTicket?.status === 'open' ? 'amber' : 'grey'"
            :label="selectedTicket?.status === 'open' ? t('tickets.admin.open') : t('tickets.admin.closed')"
            class="q-mr-md"
          />
          <q-btn icon="close" flat round dense v-close-popup :aria-label="t('common.close')" />
        </q-card-section>

        <q-separator />

        <!-- Messages -->
        <q-card-section class="col q-pa-md overflow-auto chat-messages">
          <div
            v-for="(msg, idx) in selectedTicket?.messages"
            :key="msg.id || idx"
            :class="['chat-bubble', msg.isAdmin ? 'admin-msg' : 'user-msg']"
          >
            <div class="msg-content">{{ msg.content }}</div>
            <div class="msg-time">
              {{ msg.isAdmin ? `🛡️ ${t('admin.users.roles.admin')}` : `👤 ${t('admin.users.roles.user')}` }} · {{ formatTicketTime(msg.createdAt) }}
            </div>
          </div>

          <div v-if="!selectedTicket?.messages?.length" class="text-center text-grey-5 q-pa-lg">
            {{ t('tickets.chat.noMessages') }}
          </div>
        </q-card-section>

        <q-separator />

        <!-- Input area -->
        <q-card-section class="q-pa-sm bg-dark">
          <div v-if="selectedTicket?.status === 'open'" class="row q-gutter-sm items-end">
            <q-input
              v-model="ticketReplyMessage"
              class="col"
              dense
              outlined
              autogrow
              :maxlength="TICKET_MESSAGE_MAX_LENGTH"
              :placeholder="t('tickets.chat.placeholder')"
              @keyup.enter.ctrl="sendTicketReply"
            />
            <q-btn
              round
              color="amber"
              icon="send"
              :loading="ticketBusy"
              :disable="!ticketReplyMessage.trim()"
              :aria-label="t('tickets.chat.send')"
              @click="sendTicketReply"
            />
            <q-btn
              round
              flat
              color="grey"
              icon="check_circle"
              :disable="ticketBusy"
              :aria-label="t('tickets.chat.closeTicket')"
              @click="handleCloseTicket"
            >
              <q-tooltip>{{ t('tickets.chat.closeTicket') }}</q-tooltip>
            </q-btn>
          </div>
          <div v-else class="row items-center justify-center q-gutter-sm q-pa-sm">
            <span class="text-grey-5">{{ t('tickets.chat.ticketClosed') }}</span>
            <q-btn
              flat
              dense
              no-caps
              color="amber"
              icon="replay"
              :loading="ticketBusy"
              :label="t('tickets.admin.reopen')"
              @click="handleReopenTicket"
            />
          </div>
        </q-card-section>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<style scoped>
.admin-page {
  max-width: 1200px;
  margin: 0 auto;
}

.header-card {
  background: linear-gradient(135deg, rgba(255, 193, 7, 0.1) 0%, transparent 100%);
}

.stat-card {
  transition: transform 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
}

.body--dark .header-card {
  background: linear-gradient(135deg, rgba(255, 193, 7, 0.05) 0%, transparent 100%);
}

/* Ticket Chat Styles */
.ticket-chat-dialog {
  height: 100%;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 16px;
}

.user-msg {
  align-self: flex-start;
  background: rgba(158, 158, 158, 0.15);
  border-bottom-left-radius: 4px;
}

.admin-msg {
  align-self: flex-end;
  background: rgba(255, 193, 7, 0.2);
  border-bottom-right-radius: 4px;
}

.msg-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-time {
  font-size: 0.7rem;
  color: #9e9e9e;
  margin-top: 4px;
  text-align: right;
}

.body--dark .user-msg {
  background: rgba(158, 158, 158, 0.2);
}

.body--dark .admin-msg {
  background: rgba(255, 193, 7, 0.15);
}

/* Ticket Filter Toggle */
.ticket-filter-toggle {
  border-radius: 8px;
  overflow: hidden;
}

.ticket-filter-toggle :deep(.q-btn) {
  border-radius: 0 !important;
}
</style>

<!-- Unscoped: dark mode needs the body class, and the edit dialog is teleported
     out of .admin-page, so its banners cannot be reached from a scoped block. -->
<style>
/* Highlighted rows and banners. These were Quasar's bg-*-1 pastel classes, which
   stay pastel in dark mode: white text on a cream row, unreadable. */
.admin-row--waiting { background: #fff8e1; }
.admin-row--locked { background: #fff3e0; }
.admin-row--disabled { background: #ffebee; }

.admin-banner--self { background: #fff8e1; color: #8a5a00; }
.admin-banner--ok { background: #e8f5e9; color: #1b5e20; }
.admin-banner--warn { background: #fff3e0; color: #a84300; }

.body--dark .admin-page .q-item.admin-row--waiting { background: rgba(255, 193, 7, 0.13); }
.body--dark .admin-page .q-item.admin-row--locked { background: rgba(255, 152, 0, 0.13); }
.body--dark .admin-page .q-item.admin-row--disabled { background: rgba(244, 67, 54, 0.13); }

body.body--dark .admin-banner--self { background: rgba(255, 193, 7, 0.14); color: #ffd866; }
body.body--dark .admin-banner--ok { background: rgba(76, 175, 80, 0.16); color: #9be7a0; }
body.body--dark .admin-banner--warn { background: rgba(255, 152, 0, 0.16); color: #ffc680; }

.body--dark .admin-page .q-card {
  background: #161b22 !important;
}

.body--dark .admin-page .q-card--bordered {
  border: 1px solid #30363d !important;
}

.body--dark .admin-page .q-tab-panels {
  background: transparent !important;
}

.body--dark .admin-page .q-tab-panel {
  background: transparent !important;
}

.body--dark .admin-page .q-card-section {
  background: transparent !important;
}

.body--dark .admin-page .q-list {
  background: transparent !important;
}

.body--dark .admin-page .q-item {
  background: transparent;
}

.body--dark .admin-page .ticket-filter-toggle {
  background: rgba(255, 255, 255, 0.05) !important;
}

.body--dark .admin-page .ticket-filter-toggle .q-btn {
  color: #9e9e9e !important;
}

/* The active option is the one with aria-pressed: QBtnToggle does not add a
   q-btn--active class, so the rule that was here never matched and the active
   label stayed grey on amber. */
.body--dark .admin-page .ticket-filter-toggle .q-btn[aria-pressed="true"] {
  color: #1d1d1d !important;
}
</style>
