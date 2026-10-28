import { create } from 'zustand';
import { registerSW } from 'virtual:pwa-register';
export const useOffline = create<{
  status: 'development' | 'preparing' | 'ready' | 'unavailable';
  updateAvailable: boolean;
}>(() => ({ status: import.meta.env.DEV ? 'development' : 'preparing', updateAvailable: false }));
let activate: ((reloadPage?: boolean) => Promise<void>) | undefined;
export function registerOffline() {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) {
    useOffline.setState({ status: 'unavailable' });
    return;
  }
  activate = registerSW({
    immediate: true,
    onOfflineReady() {
      useOffline.setState({ status: 'ready' });
    },
    onNeedRefresh() {
      useOffline.setState({ updateAvailable: true });
    },
    onRegisterError() {
      useOffline.setState({ status: 'unavailable' });
    },
    onRegisteredSW(_url, registration) {
      // An existing controlling worker has already completed its precache installation.
      if (navigator.serviceWorker.controller) useOffline.setState({ status: 'ready' });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
      });
    },
  });
}
export async function activateUpdate() {
  await activate?.(true);
}
