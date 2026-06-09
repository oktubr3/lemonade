<script setup>
import { useThemeStore } from 'stores/theme';

const props = defineProps({
    project: {
        type: Object,
        required: true
    }
});

const emit = defineEmits(['click', 'delete']);

const themeStore = useThemeStore();

function formatDate(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short'
    });
}
</script>

<template>
    <q-item
        class="project-item"
        :class="themeStore.themeClass"
        clickable
        @click="emit('click')"
    >
        <!-- Icon -->
        <q-item-section avatar class="icon-section">
            <div class="icon-wrapper">
                <span class="project-icon">{{ project.icon }}</span>
            </div>
        </q-item-section>

        <!-- Main content -->
        <q-item-section class="content-section">
            <q-item-label class="project-name">
                <span class="color-dot" :style="{ backgroundColor: project.color }"></span>
                {{ project.name }}
            </q-item-label>
            <q-item-label caption class="project-meta">
                <span class="stat">
                    <q-icon name="vpn_key" size="12px" />
                    {{ project.variablesCount || 0 }}
                </span>
                <span class="stat">
                    <q-icon name="description" size="12px" />
                    {{ project.envFilesCount || 0 }}
                </span>
                <span v-if="project.hasAiContext" class="stat ai-context-stat">
                    <q-icon name="smart_toy" size="12px" />
                    {{ project.aiContextFilesCount || 0 }}
                    <q-tooltip>{{ $t('envVault.projectDetail.aiContextFiles') }}</q-tooltip>
                </span>
                <span class="date">{{ formatDate(project.createdAt) }}</span>
            </q-item-label>
        </q-item-section>

        <!-- Actions -->
        <q-item-section side class="actions-section">
            <q-btn
                flat
                round
                dense
                icon="more_vert"
                size="sm"
                class="menu-btn"
                @click.stop
            >
                <q-menu>
                    <q-list dense style="min-width: 140px">
                        <q-item clickable v-close-popup @click="emit('delete')">
                            <q-item-section avatar>
                                <q-icon name="delete" color="negative" size="18px" />
                            </q-item-section>
                            <q-item-section>Eliminar</q-item-section>
                        </q-item>
                    </q-list>
                </q-menu>
            </q-btn>
            <q-icon name="chevron_right" size="20px" class="chevron" />
        </q-item-section>
    </q-item>
</template>

<style lang="scss" scoped>
.project-item {
    background: var(--bg-secondary, #fff);
    border-radius: 12px;
    margin-bottom: 8px;
    padding: 12px 16px;
    min-height: 64px;
    transition: all 0.2s ease;
    border: 1px solid var(--border-color, #e0e0e0);

    &:hover {
        background: var(--bg-hover, #f8f8f8);
        transform: translateX(4px);

        .chevron {
            opacity: 1;
            transform: translateX(2px);
        }
    }

    &:last-child {
        margin-bottom: 0;
    }
}

.lemonade-dark .project-item {
    background: #161B22;
    border-color: #30363D;

    &:hover {
        background: #21262D;
    }
}

.icon-section {
    min-width: 48px;
}

.icon-wrapper {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.project-icon {
    font-size: 1.4rem;
}

.content-section {
    padding-right: 8px;
}

.project-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.lemonade-dark .project-name {
    color: #F0F6FC;
}

.project-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.75rem;
}

.stat {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--text-secondary, #666);

    .q-icon {
        opacity: 0.7;
    }
}

.lemonade-dark .stat {
    color: #8B949E;
}

.ai-context-stat {
    color: #9c27b0 !important;

    .q-icon {
        opacity: 1 !important;
    }
}

.date {
    color: var(--text-tertiary, #999);
    margin-left: auto;
}

.lemonade-dark .date {
    color: #6E7681;
}

.actions-section {
    display: flex;
    align-items: center;
    gap: 4px;
}

.menu-btn {
    color: var(--text-secondary, #999);
    opacity: 0.6;
    transition: opacity 0.2s ease;

    &:hover {
        opacity: 1;
    }
}

.chevron {
    color: var(--text-tertiary, #ccc);
    opacity: 0;
    transition: all 0.2s ease;
}

.lemonade-dark .chevron {
    color: #484F58;
}

// Theme variables
.lemonade-dark {
    --text-primary: #F0F6FC;
    --text-secondary: #8B949E;
    --text-tertiary: #6E7681;
    --bg-secondary: #161B22;
    --bg-hover: #21262D;
    --border-color: #30363D;
}

.lemonade-light {
    --text-primary: #2C3E50;
    --text-secondary: #666;
    --text-tertiary: #999;
    --bg-secondary: #FFFFFF;
    --bg-hover: #F8F8F8;
    --border-color: #E0E0E0;
}
</style>
