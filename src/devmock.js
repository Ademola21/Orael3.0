/* ========================================================================
   devmock.js — Browser preview shim (DEV_MODE only)
   ------------------------------------------------------------------------
   When VITE_DEV_MODE is on and we are NOT inside a real Telegram WebApp,
   this module installs a mock `window.Telegram.WebApp` so the entire app
   boots in a normal browser (the sandbox preview). The server-side
   `verifyTelegramInitData` middleware accepts the matching `X-Dev-Telegram-Id`
   header in DEV_MODE, so no real HMAC is required.

   This file is a no-op in production (VITE_DEV_MODE unset) and inside real
   Telegram (where initData is already present).
   ======================================================================== */

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';
const DEV_USER_ID = Number(import.meta.env.VITE_DEV_USER_ID) || 999000001;

export const isDevMode = DEV_MODE;

if (DEV_MODE) {
  const existing = window.Telegram?.WebApp;
  const hasRealInitData = typeof existing?.initData === 'string' && existing.initData.length > 0;

  // Don't shadow a real Telegram session
  if (!hasRealInitData) {
    const mockUser = {
      id: DEV_USER_ID,
      first_name: 'Orael',
      last_name: 'Explorer',
      username: 'orael_explorer',
      photo_url: '',
      language_code: 'en',
    };

    const noop = () => {};
    const mockInitData = `dev=1&user=${encodeURIComponent(JSON.stringify(mockUser))}`;

    const mock = {
      initData: mockInitData,
      initDataUnsafe: { user: mockUser, start_param: '' },
      version: '8.0',
      platform: 'web',
      colorScheme: 'dark',
      themeParams: {},
      viewportHeight: window.innerHeight,
      viewportStableHeight: window.innerHeight,
      isExpanded: true,
      safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
      headerColor: '#0b0f1a',
      backgroundColor: '#0b0f1a',
      ready: noop,
      expand: noop,
      close: noop,
      enableClosingConfirmation: noop,
      disableClosingConfirmation: noop,
      setHeaderColor: noop,
      setBackgroundColor: noop,
      disableVerticalSwipes: noop,
      enableVerticalSwipes: noop,
      openInvoice: (url, cb) => {
        // Simulate a successful Telegram Stars payment in dev preview
        console.log('[devmock] openInvoice simulated success:', url);
        setTimeout(() => cb && cb('paid'), 900);
      },
      openTelegramLink: (u) => window.open(u, '_blank'),
      openLink: (u) => window.open(u, '_blank'),
      HapticFeedback: {
        impactOccurred: noop,
        notificationOccurred: noop,
        selectionChanged: noop,
      },
      BackButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
      MainButton: {
        show: noop, hide: noop, setText: noop, enable: noop, disable: noop,
        onClick: noop, offClick: noop, setParams: noop,
      },
      SettingsButton: { show: noop, hide: noop, onClick: noop, offClick: noop },
      showAlert: (msg) => window.alert(msg),
      showConfirm: (msg, cb) => cb && cb(window.confirm(msg)),
      showPopup: (p, cb) => cb && cb('ok'),
      ready_3: noop,
    };

    window.Telegram = window.Telegram || {};
    window.Telegram.WebApp = mock;
    window.__ORAEL_DEV__ = true;
    console.info('[devmock] Telegram WebApp mock installed for browser preview (DEV_MODE).');

    // AdsGram mock: simulate a rewarded video that resolves as "watched" after
    // ~1.2s so all ad-gated actions (refuel, faucet, spin, scratch, ...) work in
    // the browser preview without a real AdsGram block. Supports addEventListener
    // (no-op) so production ad.js code runs unmodified.
    window.Adsgram = {
      init: ({ blockId }) => {
        const noop = () => {};
        const listeners = {};
        const controller = {
          show: () => new Promise((resolve) => {
            setTimeout(() => resolve({ done: true, description: 'dev mock ad', state: 'destroy', error: false }), 1200);
          }),
          addEventListener: (ev, cb) => { listeners[ev] = cb; },
          removeEventListener: noop,
          destroy: noop,
        };
        controller._listeners = listeners;
        return controller;
      },
    };
    console.info('[devmock] AdsGram mock installed (resolves show() after 1.2s).');
  }
}
