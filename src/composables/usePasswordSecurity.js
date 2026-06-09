import { ref, computed } from 'vue'

export function usePasswordSecurity ({ passwordEntriesStore, $q, t, filteredAndSortedEntries, canUseAIAnalysis, canCheckPasswordAge, router, editEntry }) {
  // Refs
  const isBatchCheckRunning = ref(false)
  const shouldStopBatchCheck = ref(false)

  // Helper functions (used by entrySecurityMap computed)
  const isPasswordOld = (entry) => {
    if (!canCheckPasswordAge.value) return false
    if (!entry.updatedAt) return false

    let lastUpdate
    if (entry.updatedAt.toDate) {
      lastUpdate = entry.updatedAt.toDate()
    } else if (entry.updatedAt.seconds) {
      lastUpdate = new Date(entry.updatedAt.seconds * 1000)
    } else if (typeof entry.updatedAt === 'string') {
      lastUpdate = new Date(entry.updatedAt)
    } else {
      lastUpdate = new Date(entry.updatedAt)
    }

    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    return lastUpdate < sixMonthsAgo
  }

  const getPasswordAge = (entry) => {
    if (!entry.updatedAt) return t('passwords.security.ageUnknown')

    const lastUpdate = entry.updatedAt.toDate ? entry.updatedAt.toDate() : new Date(entry.updatedAt)
    const now = new Date()
    const diffTime = Math.abs(now - lastUpdate)
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const diffMonths = Math.floor(diffDays / 30)
    const diffYears = Math.floor(diffDays / 365)

    if (diffYears > 0) {
      return t('passwords.security.ageYears', diffYears)
    } else if (diffMonths > 0) {
      return t('passwords.security.ageMonths', diffMonths)
    } else if (diffDays > 0) {
      return t('passwords.security.ageDays', diffDays)
    } else {
      return t('passwords.security.ageToday')
    }
  }

  // Computed: pre-computed security map
  const entrySecurityMap = computed(() => {
    const map = new Map()
    for (const entry of filteredAndSortedEntries.value) {
      const status = passwordEntriesStore.getEntrySecurityStatus(entry.id)
      const raw = passwordEntriesStore.securityAnalysis[entry.id]
      const reused = passwordEntriesStore.isReused(entry.id)
      const old = isPasswordOld(entry)
      const isCompromised = status?.isCompromised ?? false
      const securityLevel = status?.securityLevel ?? null
      const isWeak = securityLevel === 'weak' || securityLevel === 'very_weak'
      const isDismissed = raw?.isDismissed ?? false
      const showOldBadge = old && (!canUseAIAnalysis.value || (!isCompromised && !isWeak))

      // Pre-compute card CSS classes
      const cardClasses = []
      if (entry.highlighted) cardClasses.push('highlighted')
      if (canUseAIAnalysis.value) {
        if (isCompromised) cardClasses.push('compromised')
        else if (isWeak) cardClasses.push('weak-security')
        if (isDismissed) cardClasses.push('dismissed-hint')
      }
      if (reused) cardClasses.push('reused-password')

      // Pre-compute table row CSS classes
      const tableClasses = ['password-table-row']
      if (entry.highlighted) tableClasses.push('table-row-highlighted')
      if (canUseAIAnalysis.value) {
        if (isCompromised) tableClasses.push('table-row-compromised')
        else if (isWeak) tableClasses.push('table-row-weak')
      }
      if (reused) tableClasses.push('table-row-reused')

      map.set(entry.id, {
        isCompromised,
        isWeak,
        isDismissed,
        isReused: reused,
        isOld: old,
        showOldBadge,
        securityLevel,
        passwordAge: old ? getPasswordAge(entry) : null,
        cardClassString: cardClasses.join(' '),
        tableRowClassString: tableClasses.join(' '),
        status
      })
    }
    return map
  })

  // Functions
  const stopBatchSecurityCheck = () => {
    shouldStopBatchCheck.value = true

    $q.notify({
      type: 'warning',
      message: t('passwords.security.bulkCheckStopping'),
      caption: 'El proceso se detendr\u00e1 despu\u00e9s del lote actual',
      position: 'top',
      timeout: 3000
    })
  }

  const startBatchSecurityCheck = async () => {
    if (!canUseAIAnalysis.value) {
      $q.notify({
        type: 'warning',
        message: t('passwords.security.aiDisabled'),
        position: 'top',
        timeout: 4000,
        actions: [
          {
            label: t('passwords.security.goToSettings'),
            color: 'white',
            handler: () => router.push('/settings')
          }
        ]
      })
      return
    }
    if (isBatchCheckRunning.value) return

    try {
      isBatchCheckRunning.value = true
      shouldStopBatchCheck.value = false

      const totalEntries = passwordEntriesStore.entries.length

      const confirmed = await new Promise((resolve) => {
        $q.dialog({
          title: '\uD83D\uDEE1\uFE0F ' + t('passwords.security.bulkCheckTitle'),
          message: totalEntries,
          html: false,
          cancel: {
            label: t('common.cancel'),
            color: 'grey'
          },
          ok: {
            label: t('passwords.security.startCheck'),
            color: 'orange'
          }
        }).onOk(() => resolve(true)).onCancel(() => resolve(false))
      })

      if (!confirmed) {
        isBatchCheckRunning.value = false
        return
      }

      $q.notify({
        type: 'ongoing',
        message: t('passwords.security.bulkCheckStart'),
        position: 'top',
        timeout: 3000,
        actions: [
          { label: t('passwords.security.viewConsole'), color: 'white', handler: () => {} }
        ]
      })

      let lastNotificationTime = 0
      await passwordEntriesStore.checkAllPasswordsSecurityQuotaSafe((progress) => {
        const now = Date.now()
        if (now - lastNotificationTime > 30000) {
          const percentage = Math.round((progress.processed / progress.total) * 100)

          if (progress.quotaExceeded) {
            $q.notify({
              type: 'warning',
              message: t('passwords.security.quotaLimit'),
              caption: `Procesadas: ${progress.processed}/${progress.total} (${percentage}%)`,
              position: 'top',
              timeout: 5000
            })
          } else {
            $q.notify({
              type: 'info',
              message: t('passwords.security.bulkCheckProgress', { percentage }),
              caption: `${progress.processed}/${progress.total}`,
              position: 'top',
              timeout: 2000
            })
          }
          lastNotificationTime = now
        }
      }, () => shouldStopBatchCheck.value)

      const finalStats = passwordEntriesStore.securityStats
      $q.notify({
        type: 'positive',
        message: t('passwords.security.bulkCheckComplete'),
        position: 'top',
        timeout: 5000,
        actions: [
          { label: t('passwords.security.viewResults'), color: 'white', handler: () => { } }
        ]
      })

      try {
        const reusedResult = await passwordEntriesStore.checkReusedPasswords()
        if (reusedResult?.reusedEntryIds?.length > 0) {
          $q.notify({
            type: 'warning',
            message: t('passwords.reused.found', { count: reusedResult.reusedEntryIds.length }),
            position: 'top',
            timeout: 5000
          })
        }
      } catch (reusedError) {
        console.warn('Could not check reused passwords:', reusedError.message)
      }

    } catch (error) {
      console.error('Error en verificaci\u00f3n batch:', error)
      $q.notify({
        type: 'negative',
        message: t('passwords.security.errorChecking'),
        caption: error.message,
        position: 'top',
        timeout: 3000
      })
    } finally {
      isBatchCheckRunning.value = false
    }
  }

  const showSecurityDetails = async (entryId) => {
    const entry = passwordEntriesStore.entries.find(e => e.id === entryId)
    if (!entry) return

    await new Promise(resolve => setTimeout(resolve, 100))

    const hasAnalysis = passwordEntriesStore.hasSecurityAnalysis(entryId)
    let securityStatus = passwordEntriesStore.getEntrySecurityStatus(entryId)

    if (!hasAnalysis && canUseAIAnalysis.value) {
      try {
        $q.loading.show({
          message: t('passwords.security.checking')
        })

        securityStatus = await passwordEntriesStore.checkPasswordSecurity(entryId, false)
      } catch (error) {
        $q.loading.hide()
        $q.notify({
          type: 'negative',
          message: t('passwords.security.errorChecking') + ': ' + error.message,
          position: 'top'
        })
        return
      } finally {
        $q.loading.hide()
      }
    }

    const title = securityStatus.isCompromised
      ? '\uD83D\uDEA8 ' + t('passwords.security.compromisedTitle')
      : '\uD83D\uDCA1 ' + t('passwords.security.improvableTitle')
    const levelKey = securityStatus.securityLevel || 'unknown'
    const level = t(`passwords.security.levels.${levelKey}`)
    const recommendations = securityStatus.recommendations || []
    const vulnerabilities = securityStatus.vulnerabilities || []
    const checkedWith = securityStatus.checkedWith || 'unknown'

    let message = `<div class="q-mb-sm"><strong>${entry.title || entry.name}</strong></div>`

    if (securityStatus.isCompromised) {
      message += `<div class="q-mb-md text-negative" style="background: rgba(244, 67, 54, 0.1); padding: 12px; border-radius: 8px; border-left: 4px solid #f44336;">`
      message += `<strong>\u26A0\uFE0F</strong> ${t('passwords.security.criticalRisk')}`
      message += `</div>`
      message += `<div class="q-mb-sm"><span class="text-negative text-weight-bold">${t('passwords.security.compromised')}</span></div>`
    } else {
      message += `<div class="q-mb-md text-orange-8" style="background: rgba(255, 152, 0, 0.1); padding: 12px; border-radius: 8px; border-left: 4px solid #ff9800;">`
      message += `<strong>\uD83D\uDCA1</strong> ${t('passwords.security.improvementOpportunity')}`
      message += `</div>`
      message += `<div class="q-mb-sm"><strong>${t('passwords.security.securityLevel')}:</strong> <span class="text-orange-8 text-weight-medium">${level}</span></div>`
    }

    const translateSecurityKey = (key) => {
      if (key.startsWith('security.')) {
        if (key.startsWith('security.vuln.breached:')) {
          const count = key.split(':')[1]
          return t('passwords.security.vuln.breached', { count: Number(count).toLocaleString() })
        }
        return t(`passwords.${key}`)
      }
      return key
    }

    if (vulnerabilities.length > 0) {
      message += `<div class="q-mb-sm"><strong>${t('passwords.security.issuesFound')}:</strong></div>`
      message += `<ul class="q-pl-md q-mb-sm">`
      vulnerabilities.forEach(vuln => {
        message += `<li>${translateSecurityKey(vuln)}</li>`
      })
      message += `</ul>`
    }

    if (recommendations.length > 0) {
      const recTitle = securityStatus.isCompromised ? t('passwords.security.immediateActions') : t('passwords.security.improvementSuggestions')
      message += `<div class="q-mb-sm"><strong>${recTitle}:</strong></div>`
      message += `<ul class="q-pl-md q-mb-sm">`
      recommendations.forEach(rec => {
        message += `<li>${translateSecurityKey(rec)}</li>`
      })
      message += `</ul>`
    }

    message += `<div class="q-mt-md text-caption text-grey">${t('passwords.security.analyzedWith')}: ${checkedWith}</div>`

    if (securityStatus.isCompromised) {
      $q.dialog({
        title: '\uD83D\uDEA8 ' + t('passwords.security.compromisedTitle'),
        message: message,
        html: true,
        options: {
          type: 'radio',
          model: 'edit',
          items: [
            { label: '\uD83D\uDD10 ' + t('passwords.security.changePassword'), value: 'edit', color: 'negative' },
            { label: '\u26A0\uFE0F ' + t('passwords.security.ignoreRiskWarning'), value: 'dismiss', color: 'grey-6' },
            { label: '\u274C ' + t('passwords.security.justClose'), value: 'close', color: 'grey-5' }
          ]
        },
        cancel: {
          label: t('common.cancel'),
          color: 'grey-5',
          flat: true
        },
        ok: {
          label: t('common.confirm'),
          color: 'primary',
          icon: 'check'
        }
      }).onOk((selection) => {
        if (selection === 'edit') {
          editEntry(entry)
        } else if (selection === 'dismiss') {
          const dismissed = passwordEntriesStore.dismissSecurityWarning(entryId)
          if (dismissed) {
            $q.notify({
              type: 'warning',
              message: t('passwords.security.dismiss'),
              caption: t('passwords.security.ignoreRiskWarning'),
              position: 'top',
              timeout: 4000
            })
          }
        }
      })
    } else {
      $q.dialog({
        title: '\uD83D\uDD27 ' + t('passwords.security.improvableTitle'),
        message: message,
        html: true,
        options: {
          type: 'radio',
          model: 'edit',
          items: [
            { label: '\u270F\uFE0F ' + t('passwords.security.improvePassword'), value: 'edit', color: 'orange-6' },
            { label: '\uD83D\uDEAB ' + t('passwords.security.dontRemind'), value: 'dismiss', color: 'grey-6' },
            { label: '\u274C ' + t('passwords.security.justClose'), value: 'close', color: 'grey-5' }
          ]
        },
        cancel: {
          label: t('common.cancel'),
          color: 'grey-5',
          flat: true
        },
        ok: {
          label: t('common.confirm'),
          color: 'primary',
          icon: 'check'
        }
      }).onOk((selection) => {
        if (selection === 'edit') {
          editEntry(entry)
        } else if (selection === 'dismiss') {
          const dismissed = passwordEntriesStore.dismissSecurityWarning(entryId)
          if (dismissed) {
            $q.notify({
              type: 'info',
              message: t('passwords.security.dismiss'),
              position: 'top',
              timeout: 3000
            })
          }
        }
      })
    }
  }

  const dismissWeakWarning = async (entryId, event) => {
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }

    const dismissed = passwordEntriesStore.dismissSecurityWarning(entryId)
    if (dismissed) {
      $q.notify({
        type: 'info',
        message: '\u2705 Aviso descartado',
        caption: 'No volveremos a mostrar este aviso para esta contrase\u00f1a',
        position: 'top',
        timeout: 3000
      })
    } else {
      $q.notify({
        type: 'warning',
        message: '\u274C No se puede descartar',
        caption: 'Las contrase\u00f1as comprometidas siempre se muestran',
        position: 'top',
        timeout: 3000
      })
    }
  }

  const resetDismissedWarning = async (entryId) => {
    try {
      const success = passwordEntriesStore.resetDismissedWarning(entryId)

      if (success) {
        $q.notify({
          type: 'positive',
          message: '\uD83D\uDD04 An\u00e1lisis reseteado',
          position: 'top',
          timeout: 3000
        })
      } else {
        $q.notify({
          type: 'warning',
          message: t('passwords.security.noAnalysisToReset'),
          position: 'top',
          timeout: 2000
        })
      }
    } catch (error) {
      console.error('Error reseteando aviso:', error)
      $q.notify({
        type: 'negative',
        message: t('passwords.security.errorResettingWarning'),
        position: 'top',
        timeout: 3000
      })
    }
  }

  const getSecurityTooltip = (entryId) => {
    const securityStatus = passwordEntriesStore.getEntrySecurityStatus(entryId)
    if (!securityStatus) return 'Analizando seguridad...'

    const recommendations = securityStatus.recommendations || []
    const vulnerabilities = securityStatus.vulnerabilities || []

    let tooltip = ''

    if (vulnerabilities.length > 0) {
      tooltip += vulnerabilities.slice(0, 2).join('. ')
      if (vulnerabilities.length > 2) {
        tooltip += ` (+${vulnerabilities.length - 2} m\u00e1s)`
      }
    } else if (recommendations.length > 0) {
      tooltip += recommendations.slice(0, 2).join('. ')
      if (recommendations.length > 2) {
        tooltip += ` (+${recommendations.length - 2})`
      }
    } else {
      tooltip = securityStatus.isCompromised
        ? t('passwords.security.insecureDetected')
        : t('passwords.security.weakDetected')
    }

    return tooltip
  }

  return {
    // Computed
    entrySecurityMap,
    // Refs
    isBatchCheckRunning,
    shouldStopBatchCheck,
    // Functions
    startBatchSecurityCheck,
    stopBatchSecurityCheck,
    showSecurityDetails,
    dismissWeakWarning,
    resetDismissedWarning,
    getSecurityTooltip,
    isPasswordOld,
    getPasswordAge
  }
}
