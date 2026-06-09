import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { usePasswordEntriesStore } from '../stores/passwordEntries';
import packageJson from '../../package.json';

export function useExportImport() {
  const $q = useQuasar();
  const { t } = useI18n();
  const passwordEntriesStore = usePasswordEntriesStore();

  const isExporting = ref(false);
  const isImporting = ref(false);
  const importFileInput = ref(null);

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  async function exportToCSV() {
    isExporting.value = true;
    try {
      const entries = passwordEntriesStore.entries;
      if (!entries.length) {
        $q.notify({ type: 'warning', message: t('settings.exportImport.noPasswordsExport'), position: 'top' });
        return;
      }

      const headers = ['name', 'username', 'url', 'notes', 'folder'];
      const csvRows = [headers.join(',')];

      entries.forEach(entry => {
        const row = [
          `"${(entry.title || entry.name || '').replace(/"/g, '""')}"`,
          `"${(entry.username || '').replace(/"/g, '""')}"`,
          `"${(entry.url || '').replace(/"/g, '""')}"`,
          `"${(entry.notes || '').replace(/"/g, '""')}"`,
          `"${(entry.folder || '').replace(/"/g, '""')}"`
        ];
        csvRows.push(row.join(','));
      });

      const csvContent = csvRows.join('\n');
      downloadFile(csvContent, `lemonade-export-${formatDate(new Date())}.csv`, 'text/csv');

      $q.notify({ type: 'positive', message: t('settings.exportImport.exportedMetadata', { count: entries.length }), position: 'top' });
    } catch (error) {
      console.error('Export error:', error);
      $q.notify({ type: 'negative', message: t('settings.exportImport.errorExport'), position: 'top' });
    } finally {
      isExporting.value = false;
    }
  }

  async function exportToJSON() {
    isExporting.value = true;
    try {
      const entries = passwordEntriesStore.entries;
      if (!entries.length) {
        $q.notify({ type: 'warning', message: t('settings.exportImport.noPasswordsExport'), position: 'top' });
        return;
      }

      const exportData = {
        version: packageJson.version,
        exportDate: new Date().toISOString(),
        format: 'lemonade-v1',
        count: entries.length,
        entries: entries.map(e => ({
          title: e.title || e.name,
          username: e.username,
          url: e.url,
          notes: e.notes,
          folder: e.folder,
          highlighted: e.highlighted || false,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt
        }))
      };

      const jsonContent = JSON.stringify(exportData, null, 2);
      downloadFile(jsonContent, `lemonade-export-${formatDate(new Date())}.json`, 'application/json');

      $q.notify({ type: 'positive', message: t('settings.exportImport.exportedCount', { count: entries.length }), position: 'top' });
    } catch (error) {
      console.error('Export error:', error);
      $q.notify({ type: 'negative', message: t('settings.exportImport.errorExport'), position: 'top' });
    } finally {
      isExporting.value = false;
    }
  }

  function triggerImport() {
    importFileInput.value?.click();
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());

    return result;
  }

  function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
    const entries = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = values[index] || '';
      });
      if (entry.name || entry.title || entry.login_username) {
        entries.push(entry);
      }
    }

    return entries;
  }

  function parseJSON(content) {
    const data = JSON.parse(content);

    // Lemonade format
    if (data.format === 'lemonade-v1' && data.entries) {
      return data.entries;
    }

    // Bitwarden format
    if (data.items) {
      return data.items.map(item => ({
        name: item.name,
        username: item.login?.username,
        password: item.login?.password,
        url: item.login?.uris?.[0]?.uri,
        notes: item.notes,
        folder: ''
      }));
    }

    // 1Password format
    if (data.accounts || Array.isArray(data)) {
      const items = data.accounts ? data.accounts[0]?.vaults?.[0]?.items : data;
      return (items || []).map(item => ({
        name: item.overview?.title || item.title,
        username: item.details?.loginFields?.find(f => f.designation === 'username')?.value,
        password: item.details?.loginFields?.find(f => f.designation === 'password')?.value,
        url: item.overview?.url,
        notes: item.details?.notesPlain
      }));
    }

    return [];
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    isImporting.value = true;
    try {
      const content = await file.text();
      let entries = [];

      if (file.name.endsWith('.csv')) {
        entries = parseCSV(content);
      } else if (file.name.endsWith('.json')) {
        entries = parseJSON(content);
      } else {
        throw new Error(t('settings.exportImport.formatError'));
      }

      if (!entries.length) {
        $q.notify({ type: 'warning', message: t('settings.exportImport.noValidEntries'), position: 'top' });
        return;
      }

      $q.dialog({
        title: t('settings.exportImport.importTitle'),
        message: t('settings.exportImport.importFound', { count: entries.length }),
        cancel: true,
        persistent: true
      }).onOk(async () => {
        let imported = 0;
        for (const entry of entries) {
          try {
            await passwordEntriesStore.addEntry({
              title: entry.name || entry.title,
              username: entry.username || entry.login_username || '',
              password: entry.password || entry.login_password || 'IMPORTED_NO_PASSWORD',
              url: entry.url || entry.login_uri || '',
              notes: entry.notes || '',
              folder: entry.folder || ''
            });
            imported++;
          } catch (err) {
            console.warn('Error importing entry:', err);
          }
        }
        $q.notify({ type: 'positive', message: t('settings.exportImport.importedCount', { count: imported }), position: 'top' });
        await passwordEntriesStore.fetchEntries();
      });
    } catch (error) {
      console.error('Import error:', error);
      $q.notify({ type: 'negative', message: error.message || t('settings.exportImport.errorImport'), position: 'top' });
    } finally {
      isImporting.value = false;
      event.target.value = '';
    }
  }

  return {
    isExporting,
    isImporting,
    importFileInput,
    exportToCSV,
    exportToJSON,
    triggerImport,
    handleImportFile
  };
}
