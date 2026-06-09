<script setup>
import { defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'TrashSection'
})

defineProps({
    trashEntries: {
        type: Array,
        required: true
    },
    isLoadingTrash: {
        type: Boolean,
        default: false
    },
    isRestoringEntry: {
        type: Object,
        default: () => ({})
    },
    isPermanentDeleting: {
        type: Object,
        default: () => ({})
    }
})

const emit = defineEmits(['restore', 'permanent-delete', 'close'])

const { t } = useI18n()

const formatDeletedDate = (deletedAt) => {
    if (!deletedAt) return ''
    const date = deletedAt.toDate ? deletedAt.toDate() : new Date(deletedAt)
    return date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    })
}
</script>

<template>
    <div>
        <!-- Trash header -->
        <div class="q-pa-sm q-mb-sm">
            <div class="row items-center q-mb-md">
                <q-icon name="delete_outline" size="sm" color="orange-7" class="q-mr-sm" />
                <span class="text-h6 text-weight-medium">{{ t('passwords.trash.title') }}</span>
                <q-btn flat round dense icon="close" size="sm" class="q-ml-auto" @click="emit('close')" />
            </div>

            <q-banner class="trash-banner q-mb-md" rounded>
                <template v-slot:avatar>
                    <q-icon name="info" color="orange" />
                </template>
                {{ t('passwords.trash.banner') }}
            </q-banner>
        </div>

        <!-- Trash loading -->
        <div v-if="isLoadingTrash" class="text-center q-pa-xl">
            <q-spinner-dots color="orange-7" size="40px" />
        </div>

        <!-- Trash empty state -->
        <div v-else-if="trashEntries.length === 0" class="text-center q-my-xl">
            <q-icon name="delete_outline" size="4rem" color="grey-5" class="q-mb-md" />
            <div class="text-h6 text-grey-7 q-mb-sm">{{ t('passwords.trash.empty') }}</div>
            <div class="text-body2 text-grey-6">{{ t('passwords.trash.emptyHint') }}</div>
        </div>

        <!-- Trash entries list -->
        <div v-else class="q-pa-sm q-gutter-sm">
            <q-card v-for="entry in trashEntries" :key="entry.id"
                class="trash-entry-card" flat bordered>
                <q-card-section class="q-pa-sm">
                    <div class="row items-center no-wrap">
                        <div class="col" style="min-width: 0;">
                            <div class="text-body1 text-weight-medium ellipsis">{{ entry.title || entry.name }}</div>
                            <div class="text-caption text-grey-6 ellipsis">{{ entry.username }}</div>
                            <div v-if="entry.deletedAt" class="text-caption text-grey-7">
                                {{ formatDeletedDate(entry.deletedAt) }}
                            </div>
                        </div>
                        <div class="row no-wrap q-gutter-xs q-ml-sm">
                            <q-btn round flat dense size="sm" icon="restore" color="positive"
                                :loading="isRestoringEntry[entry.id]"
                                @click="emit('restore', entry)">
                                <q-tooltip>{{ t('passwords.trash.restore') }}</q-tooltip>
                            </q-btn>
                            <q-btn round flat dense size="sm" icon="delete_forever" color="negative"
                                @click="emit('permanent-delete', entry)">
                                <q-tooltip>{{ t('passwords.trash.deleteForever') }}</q-tooltip>
                            </q-btn>
                        </div>
                    </div>
                </q-card-section>
            </q-card>
        </div>
    </div>
</template>

<style scoped>
.trash-banner {
    background: rgba(255, 152, 0, 0.1);
    border: 1px solid rgba(255, 152, 0, 0.3);
    color: #9a6700;
    font-size: 0.85rem;
}

.trash-entry-card {
    border-radius: 12px !important;
    transition: all 0.2s ease;
}

.trash-entry-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>

<style>
.lemonade-dark .trash-banner {
    background: rgba(255, 152, 0, 0.1);
    border-color: rgba(255, 152, 0, 0.25);
    color: #ffb74d;
}

.lemonade-dark .trash-entry-card {
    background: #161b22;
    border-color: #30363d;
}

.lemonade-dark .trash-entry-card:hover {
    background: #21262d;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
</style>
