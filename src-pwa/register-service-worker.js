import { register } from 'register-service-worker';
import { Dialog, Notify, Loading } from 'quasar';

// No ejecutar en popups de Firebase Auth
if (window.location.pathname.startsWith('/__/')) {
  // noop
} else {

  const SNOOZE_DURATION = 30 * 60 * 1000;
  let registration = null;
  let updateAvailable = false;

  const getSnoozedUntil = () => {
    const snoozed = localStorage.getItem('pwa-update-snoozed');
    return snoozed ? parseInt(snoozed) : 0;
  };

  const snoozeUpdate = () => {
    localStorage.setItem('pwa-update-snoozed', (Date.now() + SNOOZE_DURATION).toString());
  };

  const shouldShowUpdateDialog = () => {
    if (getSnoozedUntil() > Date.now()) {
      console.log('PWA: Snooze activo, no mostrar dialog');
      return false;
    }
    return true;
  };

  const applyUpdate = () => {
    if (!registration || !registration.waiting) {
      console.log('PWA: No hay SW en waiting');
      return;
    }

    const isDark = document.body.classList.contains('body--dark');
    Loading.show({
      message: 'Actualizando...',
      boxClass: isDark ? 'bg-dark text-white' : 'bg-grey-2 text-grey-9',
      spinnerColor: isDark ? 'amber' : 'primary',
      backgroundColor: 'rgba(0, 0, 0, 0.7)'
    });

    localStorage.removeItem('pwa-update-snoozed');
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const showUpdateDialog = () => {
    if (!shouldShowUpdateDialog() || updateAvailable) return;
    updateAvailable = true;

    Dialog.create({
      title: 'Nueva version disponible',
      message: 'Hay una nueva version de Lemonade Pass Manager con mejoras y nuevas funciones. Deseas actualizar ahora?',
      persistent: true,
      ok: { label: 'Actualizar ahora', color: 'primary', unelevated: true },
      cancel: { label: 'Recordar en 30 min', color: 'grey-6', flat: true }
    }).onOk(() => {
      applyUpdate();
    }).onCancel(() => {
      updateAvailable = false;
      snoozeUpdate();
      Notify.create({ type: 'info', message: 'Te recordaremos en 30 minutos', position: 'top', timeout: 3000 });
    });
  };

  register(process.env.SERVICE_WORKER_FILE, {
    ready () {
      console.log('PWA: Service Worker activo');
    },

    registered (reg) {
      console.log('PWA: SW registrado');
      registration = reg;

      // Check inmediato
      setTimeout(() => {
        if (registration) {
          registration.update().catch(() => {});
        }
      }, 3000);

      // Cada 30 segundos
      setInterval(() => {
        if (registration && !updateAvailable) {
          registration.update().catch(() => {});
        }
      }, 30000);

      // Al volver a la app
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && registration && !updateAvailable) {
          registration.update().catch(() => {});
        }
      });
    },

    cached () {
      console.log('PWA: Contenido cacheado para uso offline');
    },

    updatefound () {
      console.log('PWA: Nueva actualizacion descargandose...');
    },

    updated (reg) {
      console.log('PWA: Nueva version lista para instalar');
      registration = reg;
      showUpdateDialog();
    },

    offline () {
      console.log('PWA: Sin conexion a internet');
    },

    error (err) {
      console.error('PWA: Error registrando SW:', err);
    }
  });

  // Escuchar SW_UPDATED del service worker para recargar
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('PWA: Recargando aplicacion...');
      window.location.reload(true);
    }
  });

  // Debugging
  window.checkForUpdates = async () => {
    if (registration) {
      localStorage.removeItem('pwa-update-snoozed');
      updateAvailable = false;
      await registration.update();
      console.log('PWA: Check manual. Waiting:', !!registration.waiting);
    }
  };
}
