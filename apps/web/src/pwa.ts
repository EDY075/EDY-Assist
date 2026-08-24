let refreshing = false;

export function registerPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' }).then((registration) => {
      const announceUpdate = () => window.dispatchEvent(new CustomEvent('edy-pwa-update', { detail: registration }));
      if (registration.waiting && navigator.serviceWorker.controller) announceUpdate();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) announceUpdate();
        });
      });
      window.setInterval(() => void registration.update(), 60 * 60 * 1000);
    }).catch(() => {
      window.dispatchEvent(new CustomEvent('edy-pwa-registration-error'));
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

export function activatePwaUpdate(registration: ServiceWorkerRegistration) {
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
