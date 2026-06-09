<script setup>
import { defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'
import vFocus from '../../directives/vFocus'

defineOptions({
    name: 'PasswordEntryForm'
})

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    form: {
        type: Object,
        required: true
    },
    editingEntry: {
        type: [Object, null],
        default: null
    },
    isPwd: {
        type: Boolean,
        default: true
    },
    isSaving: {
        type: Boolean,
        default: false
    },
    hasFormChanges: {
        type: Boolean,
        default: false
    },
    dialogTitle: {
        type: String,
        default: ''
    },
    dialogCardStyle: {
        type: Object,
        default: () => ({})
    },
    customFieldTypeOptions: {
        type: Array,
        default: () => []
    },
    editEntryHasTotp: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits([
    'update:modelValue', 'submit', 'reset',
    'toggle-password', 'add-custom-field',
    'generate-password', 'setup-totp', 'remove-totp',
    'focus-first-input', 'update-form'
])

const { t } = useI18n()

const closeDialog = () => {
    emit('update:modelValue', false)
}

const updateFormField = (field, value) => {
    emit('update-form', { [field]: value })
}

const updateCustomField = (index, field, value) => {
    const customFields = props.form.customFields.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
    ))
    emit('update-form', { customFields })
}

const removeCustomField = (index) => {
    emit('update-form', { customFields: props.form.customFields.filter((_, itemIndex) => itemIndex !== index) })
}
</script>

<template>
    <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
        @hide="emit('reset')" @show="emit('focus-first-input')" position="standard">
        <q-card class="edit-dialog-card" :style="{ ...dialogCardStyle, width: '100%', maxWidth: '500px' }">
            <!-- Header del dialogo -->
            <q-card-section class="dialog-header">
                <div class="row items-center no-wrap">
                    <div class="col">
                        <div class="dialog-title">{{ dialogTitle }}</div>
                        <div class="dialog-subtitle">{{ editingEntry ? t('passwords.dialog.editSubtitle') :
                            t('passwords.dialog.newSubtitle') }}</div>
                    </div>
                    <div class="col-auto">
                        <q-btn flat round icon="close" @click="closeDialog" class="dialog-close-btn" :aria-label="t('common.close')" />
                    </div>
                </div>
            </q-card-section>

            <q-separator class="dialog-separator" />

            <!-- Contenido del formulario -->
            <q-card-section class="dialog-content">
                <q-form @submit="emit('submit')" class="dialog-form">
                    <!-- Campo Nombre -->
                    <div class="form-field">
                        <q-input :model-value="form.title" @update:model-value="updateFormField('title', $event)" :label="t('passwords.form.titleRequired')" outlined v-focus class="custom-input"
                            :dense="false" :rules="[val => !!val || t('passwords.form.titleValidation')]">
                            <template v-slot:prepend>
                                <q-icon name="bookmark" class="input-icon" />
                            </template>
                        </q-input>
                    </div>

                    <!-- Campo Usuario/Email -->
                    <div class="form-field">
                        <q-input :model-value="form.username" @update:model-value="updateFormField('username', $event)" :label="t('passwords.form.username')" outlined class="custom-input"
                            :dense="false">
                            <template v-slot:prepend>
                                <q-icon name="person" class="input-icon" />
                            </template>
                        </q-input>
                    </div>

                    <!-- Campo Password -->
                    <div class="form-field">
                        <q-input :model-value="form.password" @update:model-value="updateFormField('password', $event)" :label="t('passwords.form.passwordRequired')" :type="isPwd ? 'password' : 'text'"
                            outlined class="custom-input password-input" :dense="false"
                            :rules="[val => !!val || t('passwords.form.passwordValidation')]">
                            <template v-slot:prepend>
                                <q-icon name="lock" class="input-icon" />
                            </template>
                            <template v-slot:append>
                                <q-btn flat round dense :icon="isPwd ? 'visibility_off' : 'visibility'"
                                    @click="emit('toggle-password')" class="password-toggle-btn" size="sm"
                                    :aria-label="isPwd ? t('passwords.form.showPassword') : t('passwords.form.hidePassword')" />
                                <q-btn flat round dense icon="casino" @click="emit('generate-password')"
                                    class="password-generate-btn" size="sm"
                                    :aria-label="t('passwords.form.generatePassword')">
                                    <q-tooltip class="bg-dark text-white">{{ t('passwords.form.generatePassword') }}</q-tooltip>
                                </q-btn>
                            </template>
                        </q-input>
                    </div>

                    <!-- Campo URL -->
                    <div class="form-field">
                        <q-input :model-value="form.url" @update:model-value="updateFormField('url', $event)" :label="t('passwords.form.url')" outlined class="custom-input" :dense="false"
                            :placeholder="t('passwords.form.urlPlaceholder')">
                            <template v-slot:prepend>
                                <q-icon name="language" class="input-icon" />
                            </template>
                        </q-input>
                    </div>

                    <!-- Advanced Options (accordion) -->
                    <q-expansion-item
                        icon="tune"
                        :label="t('passwords.form.advancedOptions')"
                        header-class="text-subtitle2 q-px-none"
                        dense
                        class="q-mt-sm"
                    >
                        <!-- Campo Notas -->
                        <div class="form-field q-mt-sm">
                            <q-input :model-value="form.notes" @update:model-value="updateFormField('notes', $event)" :label="t('passwords.form.notes')" type="textarea" outlined
                                class="custom-input custom-textarea" :dense="false" rows="2"
                                :placeholder="t('passwords.form.notesPlaceholder')">
                                <template v-slot:prepend>
                                    <q-icon name="description" class="input-icon textarea-icon" />
                                </template>
                            </q-input>
                        </div>

                        <!-- Custom Fields -->
                        <div class="q-mt-md">
                            <div class="row items-center justify-between q-mb-sm">
                                <div class="text-subtitle2">{{ t('passwords.customFields.title') }}</div>
                                <q-btn v-if="form.customFields.length < 10" flat dense size="sm"
                                    icon="add" :label="t('passwords.customFields.add')"
                                    @click="emit('add-custom-field')" />
                            </div>

                            <div v-for="(field, index) in form.customFields" :key="index"
                                class="row items-center q-gutter-sm q-mb-sm">
                                <q-input :model-value="field.label" @update:model-value="updateCustomField(index, 'label', $event)" dense outlined
                                    :label="t('passwords.customFields.label')" class="col-4"
                                    maxlength="100" />
                                <q-input :model-value="field.value" @update:model-value="updateCustomField(index, 'value', $event)" dense outlined
                                    :label="t('passwords.customFields.value')" class="col"
                                    :type="field.type === 'text' ? 'text' : 'password'" />
                                <q-select :model-value="field.type" @update:model-value="updateCustomField(index, 'type', $event)" dense outlined
                                    :options="customFieldTypeOptions" emit-value map-options
                                    style="width: 100px" />
                                <q-btn flat dense round icon="close" size="sm" color="negative"
                                    @click="removeCustomField(index)" />
                            </div>
                        </div>

                        <!-- Two-Factor Authentication (TOTP) -->
                        <div class="q-mt-md" v-if="editingEntry">
                            <div class="text-subtitle2 q-mb-sm">{{ t('passwords.totp.title') }}</div>

                            <div v-if="editEntryHasTotp">
                                <q-chip color="positive" text-color="white" icon="verified">
                                    {{ t('passwords.totp.badge') }}
                                </q-chip>
                                <q-btn flat dense color="negative" :label="t('passwords.totp.remove')"
                                    @click="emit('remove-totp')" class="q-ml-sm" />
                            </div>

                            <div v-else>
                                <q-btn flat dense icon="add" :label="t('passwords.totp.setup')"
                                    @click="emit('setup-totp')" />
                            </div>
                        </div>
                    </q-expansion-item>

                    <!-- Botones de accion -->
                    <div class="dialog-actions">
                        <q-btn :label="t('common.cancel')" flat class="cancel-btn" @click="closeDialog"
                            :disable="isSaving" />
                        <q-btn :label="t('common.save')" type="submit" unelevated class="save-btn" :loading="isSaving"
                            :disable="isSaving || !hasFormChanges" icon="save" />
                    </div>
                </q-form>
            </q-card-section>
        </q-card>
    </q-dialog>
</template>

<style scoped>
/* Estilos para el dialogo de edicion mejorado */
.edit-dialog-card {
    border-radius: 16px !important;
    background: var(--bg-surface) !important;
    border: 1px solid var(--border-color) !important;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2) !important;
    overflow: hidden;
}

.dialog-header {
    padding: 16px 20px 12px 20px !important;
    background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);
    border-bottom: none;
}

.dialog-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.2;
}

.dialog-subtitle {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin-top: 2px;
    line-height: 1.3;
}

.dialog-close-btn {
    color: var(--text-secondary) !important;
    transition: all 0.2s ease;
}

.dialog-close-btn:hover {
    color: var(--text-primary) !important;
    background: rgba(255, 255, 255, 0.1) !important;
}

.dialog-separator {
    background: var(--border-color) !important;
    opacity: 0.5;
}

.dialog-content {
    padding: 16px 20px !important;
    background: var(--bg-surface);
}

.dialog-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.form-field {
    margin: 0;
}

.custom-input .q-field__control {
    background: var(--bg-elevated) !important;
    border: 1.5px solid var(--border-color) !important;
    border-radius: 10px !important;
    min-height: 46px !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.custom-input .q-field__control:hover {
    border-color: var(--accent-color) !important;
    background: var(--bg-surface) !important;
}

.custom-input.q-field--focused .q-field__control {
    border-color: var(--accent-color) !important;
    background: var(--bg-surface) !important;
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.15) !important;
}

.custom-input .q-field__label {
    color: var(--text-secondary) !important;
    font-weight: 500;
    font-size: 0.875rem;
}

.custom-input .q-field__native,
.custom-input input,
.custom-input textarea {
    color: var(--text-primary) !important;
    font-size: 1rem;
}

.custom-input.q-field--focused .q-field__label {
    color: var(--accent-color) !important;
}

.input-icon {
    color: var(--text-secondary) !important;
    font-size: 1.25rem !important;
    margin-right: 4px;
    transition: color 0.3s ease;
}

.custom-input:focus-within .input-icon {
    color: var(--accent-color) !important;
}

.textarea-icon {
    align-self: flex-start !important;
    margin-top: 12px !important;
}

.custom-textarea {
    .q-field__control {
        min-height: 70px !important;
        align-items: flex-start !important;
        padding-top: 10px !important;
        padding-bottom: 10px !important;
    }

    .q-field__native {
        resize: none;
        min-height: 40px;
    }

    .q-field__label {
        top: 18px !important;
    }

    .q-field--float .q-field__label {
        transform: translateY(-26px) scale(0.75) !important;
    }
}

.password-input {
    .q-field__append {
        gap: 4px;
    }
}

.password-toggle-btn,
.password-generate-btn {
    color: var(--text-secondary) !important;
    transition: all 0.2s ease;
    border-radius: 8px !important;
}

.password-toggle-btn:hover {
    color: var(--accent-color) !important;
    background: rgba(255, 215, 0, 0.1) !important;
}

.password-generate-btn:hover {
    color: var(--accent-color) !important;
    background: rgba(255, 215, 0, 0.1) !important;
    transform: rotate(180deg);
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
}

.cancel-btn {
    color: var(--text-secondary) !important;
    padding: 10px 20px !important;
    border-radius: 8px !important;
    font-weight: 500;
    transition: all 0.2s ease;
}

.cancel-btn:hover {
    color: var(--text-primary) !important;
    background: var(--bg-elevated) !important;
}

.save-btn {
    background: linear-gradient(135deg, var(--accent-color) 0%, #f1c40f 100%) !important;
    color: #000 !important;
    padding: 10px 24px !important;
    border-radius: 8px !important;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3) !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.save-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4) !important;
}

.save-btn:active {
    transform: translateY(0);
}

.save-btn.disabled,
.save-btn[disabled] {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.4) 0%, rgba(241, 196, 15, 0.4) 100%) !important;
    color: rgba(0, 0, 0, 0.5) !important;
    box-shadow: none !important;
    opacity: 1 !important;
    cursor: not-allowed;
}

.save-btn.disabled:hover,
.save-btn[disabled]:hover {
    transform: none;
    box-shadow: none !important;
}

/* Responsive design */
@media (max-width: 599px) {
    .dialog-header {
        padding: 14px 16px 10px 16px !important;
    }

    .dialog-content {
        padding: 14px 16px !important;
    }

    .dialog-title {
        font-size: 1.1rem;
    }

    .dialog-subtitle {
        font-size: 0.75rem;
    }

    .custom-input .q-field__control {
        min-height: 44px !important;
    }

    .input-icon {
        font-size: 1rem !important;
    }

    .dialog-form {
        gap: 10px;
    }

    .custom-textarea .q-field__control {
        min-height: 60px !important;
    }
}

/* Tema claro especifico */
.lemonade-light {
    .edit-dialog-card {
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1) !important;
    }

    .custom-input .q-field__control:focus-within {
        box-shadow: 0 0 0 3px rgba(247, 220, 111, 0.2) !important;
    }

    .save-btn {
        box-shadow: 0 4px 12px rgba(247, 220, 111, 0.3) !important;
    }

    .save-btn:hover {
        box-shadow: 0 6px 20px rgba(247, 220, 111, 0.4) !important;
    }
}
</style>

<style>
/* Dialog dark mode - dialogs teleport to <body>, outside .lemonade-dark */
body.body--dark .edit-dialog-card {
    background: #161b22 !important;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4) !important;
}

body.body--dark .dialog-header {
    background: linear-gradient(135deg, #21262d 0%, #161b22 100%) !important;
}

body.body--dark .dialog-content {
    background: #161b22 !important;
}

body.body--dark .custom-input .q-field__control {
    background: #21262d !important;
    border-color: #30363d !important;
}

body.body--dark .custom-input .q-field__control:hover {
    background: #161b22 !important;
    border-color: #ffd700 !important;
}

body.body--dark .custom-input.q-field--focused .q-field__control {
    background: #161b22 !important;
    border-color: #ffd700 !important;
    box-shadow: 0 0 0 3px rgba(255, 215, 0, 0.2) !important;
}

body.body--dark .custom-input .q-field__label {
    color: #8b949e !important;
}

body.body--dark .custom-input .q-field__native,
body.body--dark .custom-input input,
body.body--dark .custom-input textarea {
    color: #e6edf3 !important;
}

body.body--dark .custom-input .input-icon {
    color: #8b949e !important;
}

body.body--dark .dialog-title {
    color: #e6edf3 !important;
}

body.body--dark .dialog-subtitle {
    color: #8b949e !important;
}

body.body--dark .dialog-close-btn {
    color: #8b949e !important;
}

/* Save button en dark mode - ENABLED */
body.body--dark .save-btn,
.lemonade-dark .save-btn,
.body--dark .save-btn {
    background: linear-gradient(135deg, #ffd700 0%, #f1c40f 100%) !important;
    color: #000 !important;
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.5) !important;
}

body.body--dark .save-btn:hover,
.lemonade-dark .save-btn:hover,
.body--dark .save-btn:hover {
    box-shadow: 0 6px 25px rgba(255, 215, 0, 0.6) !important;
    transform: translateY(-1px);
}

/* Save button en dark mode - DISABLED */
body.body--dark .save-btn.disabled,
body.body--dark .save-btn[disabled],
.lemonade-dark .save-btn.disabled,
.lemonade-dark .save-btn[disabled],
.body--dark .save-btn.disabled,
.body--dark .save-btn[disabled] {
    background: linear-gradient(135deg, #3d3d00 0%, #2d2d00 100%) !important;
    color: rgba(255, 255, 255, 0.4) !important;
    box-shadow: none !important;
}
</style>
