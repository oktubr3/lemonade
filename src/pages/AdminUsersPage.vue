<script setup>
import { ref, onMounted, computed, defineOptions } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAdmin } from 'src/composables/useAdmin';
import { useTickets } from 'src/composables/useTickets';
import { useI18n } from 'vue-i18n';
import LemonadeLoader from 'src/components/LemonadeLoader.vue';

defineOptions({
  name: 'AdminUsersPage'
});

const $q = useQuasar();
const router = useRouter();
const { t } = useI18n();

const {
  isAdmin,
  users,
  stats,
  loading,
  error,
  fetchUserRole,
  fetchUsers,
  updateUser,
  fetchStats
} = useAdmin();

// Tickets composable
const {
  allTickets,
  loading: ticketsLoading,
  adminFetchTickets,
  addMessage,
  closeTicket
} = useTickets();

// Local state - Tabs
const activeTab = ref('users');

// Local state - Users
const search = ref('');
const roleFilter = ref('all');

// Local state - Tickets
const ticketSearch = ref('');
const ticketFilter = ref('all');
const selectedTicket = ref(null);
const showTicketChatDialog = ref(false);
const ticketReplyMessage = ref('');
const selectedUser = ref(null);
const showEditDialog = ref(false);
const editForm = ref({
  role: 'user',
  isDisabled: false,
  accountLocked: false,
  notes: ''
});

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

// Computed
const filteredUsers = computed(() => {
  let result = users.value || [];

  // Hide disabled users by default (only show with explicit filter)
  if (roleFilter.value !== 'disabled') {
    result = result.filter(user => !user.isDisabled);
  }

  // Search filter
  if (search.value) {
    const searchLower = search.value.toLowerCase();
    result = result.filter(user =>
      user.email?.toLowerCase().includes(searchLower) ||
      user.displayName?.toLowerCase().includes(searchLower)
    );
  }

  // Role filter
  if (roleFilter.value !== 'all') {
    if (roleFilter.value === 'disabled') {
      result = result.filter(user => user.isDisabled);
    } else if (roleFilter.value === 'locked') {
      result = result.filter(user => user.accountLocked);
    } else {
      result = result.filter(user => user.role === roleFilter.value);
    }
  }

  return result;
});

const lockedUsersCount = computed(() => {
  return users.value.filter(user => user.accountLocked).length;
});

const totalPasswords = computed(() => {
  return users.value.reduce((sum, user) => sum + (user.passwordCount || 0), 0);
});

const activeUsersCount = computed(() => {
  return users.value.filter(user => !user.isDisabled).length;
});

const disabledUsersCount = computed(() => {
  return users.value.filter(user => user.isDisabled).length;
});

// Tickets computed
const openTicketsCount = computed(() => {
  return allTickets.value.filter(t => t.status === 'open').length;
});

const filteredTickets = computed(() => {
  let result = allTickets.value || [];

  // Filter by status
  if (ticketFilter.value === 'open') {
    result = result.filter(t => t.status === 'open');
  } else if (ticketFilter.value === 'closed') {
    result = result.filter(t => t.status === 'closed');
  }

  // Filter by search
  if (ticketSearch.value) {
    const searchLower = ticketSearch.value.toLowerCase();
    result = result.filter(t =>
      t.userEmail?.toLowerCase().includes(searchLower) ||
      t.subject?.toLowerCase().includes(searchLower)
    );
  }

  return result;
});

// Methods
async function initAdmin() {
  try {
    await fetchUserRole();

    if (!isAdmin.value) {
      $q.notify({
        color: 'negative',
        message: t('admin.users.notifications.accessDenied'),
        icon: 'block'
      });
      router.push('/');
      return;
    }

    await Promise.all([
      fetchUsers(),
      fetchStats(),
      adminFetchTickets()
    ]);
  } catch (err) {
    console.error('Error initializing admin:', err);
    $q.notify({
      color: 'negative',
      message: t('admin.users.notifications.loadPanelError'),
      icon: 'error'
    });
  }
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
  if (!timestamp) return '-';
  let date;
  if (timestamp.toDate) {
    // Firestore Timestamp object
    date = timestamp.toDate();
  } else if (timestamp._seconds) {
    // Serialized Firestore timestamp from Cloud Function
    date = new Date(timestamp._seconds * 1000);
  } else if (timestamp.seconds) {
    // Alternative serialization format
    date = new Date(timestamp.seconds * 1000);
  } else {
    // ISO string or milliseconds
    date = new Date(timestamp);
  }
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
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

async function saveUserChanges() {
  if (!selectedUser.value) return;

  try {
    const payload = {
      role: editForm.value.role,
      isDisabled: editForm.value.isDisabled,
      notes: editForm.value.notes
    };

    // Only include accountLocked if it changed (avoids unnecessary user_settings writes)
    const currentLocked = !!selectedUser.value.accountLocked;
    if (editForm.value.accountLocked !== currentLocked) {
      payload.accountLocked = editForm.value.accountLocked;
    }

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

    // Refresh list
    await fetchUsers();
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: err.message || t('admin.users.notifications.updateError'),
      icon: 'error'
    });
  }
}

// ============ Ticket Functions ============

function formatTicketTime(timestamp) {
  if (!timestamp) return '';

  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (timestamp._seconds) {
    date = new Date(timestamp._seconds * 1000);
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else {
    date = new Date(timestamp);
  }

  const now = new Date();
  const diffMs = now - date;
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
  const preview = lastMsg.content.substring(0, 60);
  return preview + (lastMsg.content.length > 60 ? '...' : '');
}

function openTicketChat(ticket) {
  selectedTicket.value = ticket;
  ticketReplyMessage.value = '';
  showTicketChatDialog.value = true;
}

async function sendTicketReply() {
  if (!ticketReplyMessage.value.trim() || !selectedTicket.value) return;

  try {
    const updatedTicket = await addMessage(selectedTicket.value.id, ticketReplyMessage.value.trim());
    selectedTicket.value = updatedTicket;
    ticketReplyMessage.value = '';

    $q.notify({
      color: 'positive',
      message: t('tickets.messages.messageSent'),
      icon: 'check_circle',
      timeout: 1500
    });

  } catch (err) {
    $q.notify({
      color: 'negative',
      message: t('tickets.messages.errorSending'),
      icon: 'error'
    });
  }
}

async function handleCloseTicket() {
  if (!selectedTicket.value) return;

  try {
    const updatedTicket = await closeTicket(selectedTicket.value.id);
    selectedTicket.value = updatedTicket;

    $q.notify({
      color: 'positive',
      message: t('tickets.messages.closed'),
      icon: 'check_circle'
    });

  } catch (err) {
    $q.notify({
      color: 'negative',
      message: t('tickets.messages.errorClosing'),
      icon: 'error'
    });
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
                  :loading="loading"
                  @click="initAdmin"
                />
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Stats cards -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="stat-card">
          <q-card-section class="text-center">
            <div class="text-h4 text-weight-bold text-amber">
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
            <div class="text-h4 text-weight-bold text-purple">
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
            <div class="text-h4 text-weight-bold text-green">
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
              v-if="openTicketsCount > 0"
              color="red"
              floating
              :label="openTicketsCount"
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
          <div class="col-12 col-sm-6">
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
        </div>
      </q-card-section>
    </q-card>

    <!-- User list -->
    <q-card flat bordered>
      <q-list separator>
        <q-item v-if="loading" class="text-center q-pa-lg">
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
          v-for="user in filteredUsers"
          :key="user.uid"
          clickable
          @click="openEditDialog(user)"
          :class="{ 'bg-red-1': user.isDisabled, 'bg-orange-1': user.accountLocked && !user.isDisabled }"
        >
          <q-item-section avatar>
            <q-avatar :color="getAvatarColor(user.role)" text-color="dark" size="42px">
              <img v-if="user.photoURL" :src="user.photoURL" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
              <span v-else>{{ getInitials(user) }}</span>
            </q-avatar>
          </q-item-section>

          <q-item-section>
            <q-item-label class="text-weight-medium">
              {{ user.displayName || user.email }}
              <q-badge
                v-if="user.isDisabled"
                color="red"
                :label="t('admin.users.badge.disabled')"
                class="q-ml-sm"
              />
              <q-badge
                v-if="user.accountLocked"
                color="orange-9"
                icon="lock"
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
      </q-list>
    </q-card>

    <!-- Edit user dialog -->
    <q-dialog v-model="showEditDialog" persistent>
      <q-card style="min-width: 350px">
        <q-card-section class="row items-center">
          <div class="text-h6">{{ t('admin.users.editDialog.title') }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section v-if="selectedUser">
          <div class="row items-center q-mb-md">
            <q-avatar :color="getAvatarColor(selectedUser.role)" text-color="dark" size="48px" class="q-mr-md">
              <img v-if="selectedUser.photoURL" :src="selectedUser.photoURL" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
              <span v-else>{{ getInitials(selectedUser) }}</span>
            </q-avatar>
            <div>
              <div class="text-weight-medium">{{ selectedUser.displayName || t('admin.users.editDialog.noName') }}</div>
              <div class="text-caption text-grey-6">{{ selectedUser.email }}</div>
            </div>
          </div>

          <q-separator class="q-my-md" />

          <q-select
            v-model="editForm.role"
            :options="roleOptions"
            :label="t('admin.users.editDialog.roleLabel')"
            emit-value
            map-options
            outlined
            dense
            class="q-mb-md"
          />

          <q-toggle
            v-model="editForm.isDisabled"
            :label="t('admin.users.editDialog.userDisabledLabel')"
            color="red"
            class="q-mb-md"
          />

          <q-toggle
            v-model="editForm.accountLocked"
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

          <q-banner v-if="selectedUser.accountLocked && !editForm.accountLocked" class="bg-green-1 text-green-9 q-mb-md" rounded dense>
            <template v-slot:avatar>
              <q-icon name="lock_open" color="green" />
            </template>
            {{ t('admin.users.editDialog.willUnlockBanner') }}
          </q-banner>

          <q-banner v-if="selectedUser.accountLocked && editForm.accountLocked" class="bg-orange-1 text-orange-9 q-mb-md" rounded dense>
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
          />

          <div class="text-caption text-grey-6 q-mt-md">
            <div>{{ t('admin.users.editDialog.registered', { date: formatDate(selectedUser.createdAt) }) }}</div>
            <div>{{ t('admin.users.editDialog.passwords', { count: selectedUser.passwordCount || 0 }) }}</div>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat :label="t('common.cancel')" color="grey" v-close-popup />
          <q-btn
            flat
            :label="t('common.save')"
            color="primary"
            :loading="loading"
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
              <div class="col-12 col-sm-6">
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
              <div class="col-12 col-sm-6">
                <q-btn-toggle
                  v-model="ticketFilter"
                  spread
                  no-caps
                  dense
                  unelevated
                  toggle-color="amber"
                  text-color="grey-7"
                  class="ticket-filter-toggle"
                  :options="[
                    { label: t('tickets.admin.allTickets'), value: 'all' },
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
            <q-item v-if="ticketsLoading" class="text-center q-pa-lg">
              <q-item-section>
                <q-spinner-dots color="amber" size="40px" />
              </q-item-section>
            </q-item>

            <q-item v-else-if="filteredTickets.length === 0" class="q-pa-lg">
              <q-item-section class="items-center">
                <q-icon name="inbox" size="48px" color="grey-5" />
                <div class="text-grey-6 q-mt-sm">{{ t('tickets.admin.noOpenTickets') }}</div>
              </q-item-section>
            </q-item>

            <q-item
              v-for="ticket in filteredTickets"
              :key="ticket.id"
              clickable
              @click="openTicketChat(ticket)"
              :class="{
                'bg-amber-1': ticket.status === 'open' && ticket.messages?.length > 0 && !ticket.messages[ticket.messages.length - 1]?.isAdmin
              }"
            >
              <q-item-section avatar>
                <q-avatar
                  :color="ticket.status === 'open' ? 'amber' : 'grey-5'"
                  text-color="dark"
                  size="42px"
                >
                  <q-icon :name="ticket.status === 'open' ? 'mark_email_unread' : 'mark_email_read'" />
                </q-avatar>
              </q-item-section>

              <q-item-section>
                <q-item-label class="text-weight-medium">
                  {{ ticket.subject }}
                  <q-badge
                    v-if="ticket.status === 'open'"
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
      <q-card class="column no-wrap ticket-chat-dialog">
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
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-separator />

        <!-- Messages -->
        <q-card-section class="col q-pa-md overflow-auto chat-messages">
          <div
            v-for="(msg, idx) in selectedTicket?.messages"
            :key="idx"
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
              :placeholder="t('tickets.chat.placeholder')"
              @keyup.enter.ctrl="sendTicketReply"
            />
            <q-btn
              round
              color="amber"
              icon="send"
              :disable="!ticketReplyMessage.trim()"
              @click="sendTicketReply"
            />
            <q-btn
              round
              flat
              color="grey"
              icon="check_circle"
              @click="handleCloseTicket"
            >
              <q-tooltip>{{ t('tickets.chat.closeTicket') }}</q-tooltip>
            </q-btn>
          </div>
          <div v-else class="text-center text-grey-5 q-pa-sm">
            {{ t('tickets.chat.ticketClosed') }}
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

<!-- Dark mode styles - unscoped to access body class -->
<style>
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

.body--dark .admin-page .ticket-filter-toggle .q-btn--active {
  color: #1d1d1d !important;
}
</style>
