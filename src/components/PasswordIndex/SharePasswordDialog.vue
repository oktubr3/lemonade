<script setup>
import { defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'SharePasswordDialog'
})

defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    entry: {
        type: [Object, null],
        default: null
    },
    users: {
        type: Array,
        default: () => []
    },
    isLoadingUsers: {
        type: Boolean,
        default: false
    },
    isSharing: {
        type: Boolean,
        default: false
    },
    searchResultsMode: {
        type: String,
        default: 'recent'
    },
    userSearchText: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['update:modelValue', 'search', 'share', 'update:userSearchText', 'clear-search'])

const { t } = useI18n()
</script>

<template>
    <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <q-card style="min-width: 350px; max-width: 500px;">
            <q-card-section class="bg-green-7 text-white">
                <div class="text-h6 row items-center">
                    <q-icon name="share" class="q-mr-sm" />
                    {{ t('sharing.shareTitle', { title: entry?.title || entry?.name }) }}
                </div>
            </q-card-section>

            <q-card-section>
                <q-input
                    :model-value="userSearchText"
                    dense
                    outlined
                    :placeholder="t('sharing.searchUsers')"
                    class="q-mb-md"
                    @update:model-value="emit('search', $event)"
                >
                    <template v-slot:prepend>
                        <q-icon name="search" />
                    </template>
                    <template v-slot:append v-if="userSearchText">
                        <q-icon name="close" class="cursor-pointer" @click="emit('clear-search')" />
                    </template>
                </q-input>

                <div v-if="isLoadingUsers" class="text-center q-pa-md">
                    <q-spinner color="primary" size="2em" />
                    <div class="q-mt-sm text-grey-6">{{ t('sharing.loadingUsers') }}</div>
                </div>

                <template v-else-if="userSearchText.trim().length > 0 && userSearchText.trim().length < 3">
                    <div class="text-center q-pa-md text-grey-6">
                        <q-icon name="search" size="3em" class="q-mb-sm" />
                        <div>{{ t('sharing.minSearchChars') }}</div>
                    </div>
                </template>

                <template v-else>
                    <div v-if="searchResultsMode === 'recent' && users.length > 0" class="text-caption text-grey-6 q-mb-xs">
                        {{ t('sharing.recentContacts') }}
                    </div>

                    <q-list v-if="users.length > 0" bordered separator style="max-height: 300px; overflow-y: auto;">
                        <q-item
                            v-for="user in users"
                            :key="user.uid"
                            clickable
                            @click="emit('share', user)"
                            :disable="isSharing"
                        >
                            <q-item-section avatar>
                                <q-avatar>
                                    <img v-if="user.photoURL" :src="user.photoURL" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                                    <q-icon v-else name="person" />
                                </q-avatar>
                            </q-item-section>
                            <q-item-section>
                                <q-item-label>{{ user.displayName || $t('passwords.sortBy.user') }}</q-item-label>
                                <q-item-label caption>{{ user.email }}</q-item-label>
                            </q-item-section>
                            <q-item-section side>
                                <q-icon name="send" color="green-6" />
                            </q-item-section>
                        </q-item>
                    </q-list>

                    <div v-else class="text-center q-pa-md text-grey-6">
                        <q-icon name="people" size="3em" class="q-mb-sm" />
                        <div v-if="userSearchText.trim().length >= 3">{{ $t('common.noResults') }}</div>
                        <div v-else>{{ t('sharing.noRecentContacts') }}</div>
                    </div>
                </template>
            </q-card-section>

            <q-card-actions align="right">
                <q-btn flat :label="$t('common.cancel')" color="grey" v-close-popup :disable="isSharing" />
            </q-card-actions>

            <q-inner-loading :showing="isSharing">
                <q-spinner-gears size="50px" color="green-7" />
            </q-inner-loading>
        </q-card>
    </q-dialog>
</template>
