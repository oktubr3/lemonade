<script setup>
import { ref, defineOptions } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useTickets } from '../../composables/useTickets'

defineOptions({
  name: 'SettingsSupport'
})

const $q = useQuasar()
const { t } = useI18n()

const {
  myTickets,
  loading: ticketsLoading,
  createTicket,
  fetchMyTickets,
  addMessage,
  closeTicket
} = useTickets()

const showNewTicketDialog = ref(false)
const showTicketChatDialog = ref(false)
const newTicketSubject = ref('')
const newTicketMessage = ref('')
const selectedTicket = ref(null)
const ticketReplyMessage = ref('')

const formatTicketTime = (timestamp) => {
  if (!timestamp) return ''

  let date
  if (timestamp.toDate) {
    date = timestamp.toDate()
  } else if (timestamp._seconds) {
    date = new Date(timestamp._seconds * 1000)
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000)
  } else {
    date = new Date(timestamp)
  }

  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  const diffWeeks = Math.floor(diffDays / 7)

  if (diffMins < 1) return t('tickets.time.justNow')
  if (diffMins < 60) return t('tickets.time.minutesAgo', { n: diffMins })
  if (diffHours < 24) return t('tickets.time.hoursAgo', { n: diffHours })
  if (diffDays < 7) return t('tickets.time.daysAgo', { n: diffDays })
  return t('tickets.time.weeksAgo', { n: diffWeeks })
}

const openTicketChat = (ticket) => {
  selectedTicket.value = ticket
  ticketReplyMessage.value = ''
  showTicketChatDialog.value = true
}

const submitNewTicket = async () => {
  if (!newTicketSubject.value.trim() || !newTicketMessage.value.trim()) return

  try {
    await createTicket(newTicketSubject.value.trim(), newTicketMessage.value.trim())

    $q.notify({
      color: 'positive',
      message: t('tickets.messages.created'),
      icon: 'check_circle'
    })

    newTicketSubject.value = ''
    newTicketMessage.value = ''
    showNewTicketDialog.value = false
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: t('tickets.messages.errorCreating'),
      icon: 'error'
    })
  }
}

const sendTicketReply = async () => {
  if (!ticketReplyMessage.value.trim() || !selectedTicket.value) return

  try {
    const updatedTicket = await addMessage(selectedTicket.value.id, ticketReplyMessage.value.trim())
    selectedTicket.value = updatedTicket
    ticketReplyMessage.value = ''

    $q.notify({
      color: 'positive',
      message: t('tickets.messages.messageSent'),
      icon: 'check_circle',
      timeout: 1500
    })
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: t('tickets.messages.errorSending'),
      icon: 'error'
    })
  }
}

const handleCloseTicket = async () => {
  if (!selectedTicket.value) return

  try {
    const updatedTicket = await closeTicket(selectedTicket.value.id)
    selectedTicket.value = updatedTicket

    $q.notify({
      color: 'positive',
      message: t('tickets.messages.closed'),
      icon: 'check_circle'
    })
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: t('tickets.messages.errorClosing'),
      icon: 'error'
    })
  }
}

// Load tickets on mount
fetchMyTickets().catch(err => {
  console.error('Error loading tickets:', err)
})
</script>

<template>
  <q-card flat bordered class="settings-card animate-entrance" style="animation-delay: 0.5s;">
    <q-card-section>
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h6">
          <q-icon name="support_agent" color="primary" class="q-mr-sm" />
          {{ $t('tickets.title') }}
        </div>
        <q-btn
          color="primary"
          :label="$t('tickets.newTicket')"
          icon="add"
          unelevated
          @click="showNewTicketDialog = true"
          :disable="ticketsLoading"
        />
      </div>

      <!-- Loading state -->
      <div v-if="ticketsLoading" class="text-center q-pa-lg">
        <q-spinner-dots color="primary" size="40px" />
      </div>

      <!-- Empty state -->
      <div v-else-if="myTickets.length === 0" class="flex flex-center column q-pa-xl" style="min-height: 200px;">
        <q-icon name="confirmation_number" size="64px" color="grey-4" />
        <div class="text-h6 text-grey-6 q-mt-md text-center">{{ $t('tickets.noTickets') }}</div>
        <div class="text-caption text-grey-5 text-center">{{ $t('tickets.noTicketsHint') }}</div>
      </div>

      <!-- Tickets list -->
      <q-list v-else separator>
        <q-item
          v-for="ticket in myTickets"
          :key="ticket.id"
          clickable
          @click="openTicketChat(ticket)"
          class="rounded-borders q-mb-xs"
          :class="{ 'bg-green-1': ticket.status === 'open' }"
        >
          <q-item-section avatar>
            <q-icon
              :name="ticket.status === 'open' ? 'radio_button_checked' : 'radio_button_unchecked'"
              :color="ticket.status === 'open' ? 'positive' : 'grey-5'"
            />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ ticket.subject }}</q-item-label>
            <q-item-label caption>
              {{ formatTicketTime(ticket.updatedAt) }}
              <span v-if="ticket.messages?.length > 1">
                · {{ ticket.messages.length - 1 }} {{ ticket.messages.length > 2 ? $t('tickets.admin.responses', { n: ticket.messages.length - 1 }).split('|')[1] : $t('tickets.admin.responses', { n: 1 }).split('|')[0] }}
              </span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge
              :color="ticket.status === 'open' ? 'positive' : 'grey'"
              :label="$t(`tickets.statuses.${ticket.status}`)"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>
  </q-card>

  <!-- Dialog para nuevo ticket -->
  <q-dialog v-model="showNewTicketDialog" persistent>
    <q-card class="ticket-dialog-card" style="min-width: 350px; max-width: 500px;">
      <q-card-section class="row items-center">
        <div class="text-h6">{{ $t('tickets.newTicket') }}</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup :disable="ticketsLoading" :aria-label="$t('common.close')" />
      </q-card-section>

      <q-card-section>
        <q-input
          v-model="newTicketSubject"
          :label="$t('tickets.form.subject')"
          :placeholder="$t('tickets.form.subjectPlaceholder')"
          outlined
          dense
          class="q-mb-md"
          :disable="ticketsLoading"
          maxlength="200"
          counter
        />
        <q-input
          v-model="newTicketMessage"
          :label="$t('tickets.form.message')"
          :placeholder="$t('tickets.form.messagePlaceholder')"
          type="textarea"
          outlined
          rows="4"
          :disable="ticketsLoading"
          maxlength="2000"
          counter
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          flat
          :label="$t('tickets.form.cancel')"
          color="grey"
          v-close-popup
          :disable="ticketsLoading"
        />
        <q-btn
          unelevated
          :label="$t('tickets.form.send')"
          color="primary"
          icon="send"
          :loading="ticketsLoading"
          :disable="!newTicketSubject.trim() || !newTicketMessage.trim()"
          @click="submitNewTicket"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- Dialog para chat de ticket -->
  <q-dialog v-model="showTicketChatDialog" persistent maximized transition-show="slide-up" transition-hide="slide-down">
    <q-card class="column" style="height: 100%;">
      <q-card-section class="row items-center q-pb-none bg-primary text-white">
        <q-btn icon="arrow_back" flat round dense @click="showTicketChatDialog = false" :aria-label="$t('common.back')" />
        <div class="q-ml-md">
          <div class="text-h6">{{ selectedTicket?.subject }}</div>
          <div class="text-caption">
            <q-badge
              :color="selectedTicket?.status === 'open' ? 'positive' : 'grey'"
              :label="$t(`tickets.statuses.${selectedTicket?.status}`)"
            />
          </div>
        </div>
        <q-space />
        <q-btn
          v-if="selectedTicket?.status === 'open'"
          flat
          :label="$t('tickets.chat.close')"
          icon="check_circle"
          @click="handleCloseTicket"
          :loading="ticketsLoading"
        />
      </q-card-section>

      <q-card-section class="col q-pt-md chat-messages" style="overflow-y: auto;">
        <div v-for="msg in selectedTicket?.messages" :key="msg.id" class="q-mb-md">
          <div :class="['chat-bubble', msg.isAdmin ? 'admin-bubble' : 'user-bubble']">
            <div class="text-caption text-weight-bold q-mb-xs">
              {{ msg.isAdmin ? $t('tickets.chat.support') : $t('tickets.chat.you') }}
              <span :class="msg.isAdmin ? 'text-grey-6' : 'text-white-70'" class="q-ml-sm" style="font-weight: normal;">{{ formatTicketTime(msg.createdAt) }}</span>
            </div>
            <div style="white-space: pre-wrap;">{{ msg.content }}</div>
          </div>
        </div>
      </q-card-section>

      <q-card-section v-if="selectedTicket?.status === 'open'" class="q-pt-none">
        <div class="row q-gutter-sm">
          <q-input
            v-model="ticketReplyMessage"
            :placeholder="$t('tickets.chat.placeholder')"
            outlined
            dense
            class="col"
            @keyup.enter="sendTicketReply"
            :disable="ticketsLoading"
          />
          <q-btn
            color="primary"
            icon="send"
            unelevated
            :loading="ticketsLoading"
            :disable="!ticketReplyMessage.trim()"
            @click="sendTicketReply"
          />
        </div>
      </q-card-section>

      <q-card-section v-else class="text-center q-pa-md ticket-closed-footer">
        <q-icon name="lock" size="sm" class="q-mr-sm" />
        {{ $t('tickets.chat.ticketClosed') }}
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.chat-bubble {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 16px;
  position: relative;
}

.user-bubble {
  background: linear-gradient(135deg, #FF6D00 0%, #FF8C00 100%);
  color: white;
  margin-left: auto;
  border-bottom-right-radius: 4px;
}

.admin-bubble {
  background: #f0f0f0;
  color: #333;
  margin-right: auto;
  border-bottom-left-radius: 4px;
}

.chat-messages {
  background: #fafafa;
}

.ticket-closed-footer {
  background: #e8e8e8;
  color: #666;
}
</style>

<style>
.body--dark .admin-bubble,
.lemonade-dark .admin-bubble {
  background: #2d2d2d;
  color: #e0e0e0;
}

.body--dark .chat-messages,
.lemonade-dark .chat-messages {
  background: #1a1a1a;
}

.body--dark .ticket-closed-footer,
.lemonade-dark .ticket-closed-footer {
  background: #2a2a2a;
  color: #999;
}

/* Ticket dialog dark mode */
.body--dark .ticket-dialog-card,
.lemonade-dark .ticket-dialog-card {
  background: #161b22 !important;
  color: #f0f6fc;
}

.body--dark .ticket-dialog-card .q-field__control,
.lemonade-dark .ticket-dialog-card .q-field__control {
  background: #21262d;
}

.body--dark .ticket-dialog-card .q-field--outlined .q-field__control:before,
.lemonade-dark .ticket-dialog-card .q-field--outlined .q-field__control:before {
  border-color: #30363d;
}

.body--dark .ticket-dialog-card .q-field__label,
.lemonade-dark .ticket-dialog-card .q-field__label {
  color: #8b949e;
}

.body--dark .ticket-dialog-card .q-field__native,
.body--dark .ticket-dialog-card .q-field__input,
.lemonade-dark .ticket-dialog-card .q-field__native,
.lemonade-dark .ticket-dialog-card .q-field__input {
  color: #f0f6fc;
}
</style>
