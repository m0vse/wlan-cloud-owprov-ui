// The deployment's controller is the same HTTPS host on its standard port.
// No bearer credentials appear in URLs, logs, or persistent storage.
let pendingSession: Promise<void> | undefined;
export const receiveControllerSession = (): Promise<void> => {
  pendingSession ??= receiveSession();
  return pendingSession;
};

const receiveSession = (): Promise<void> => {
  const url = new URL(window.location.href);
  if (url.searchParams.get('controller-login') !== '1') return Promise.resolve();
  url.searchParams.delete('controller-login');
  window.history.replaceState(null, '', url.href);
  const controller = window.opener;
  if (!controller || window.location.protocol !== 'https:') return Promise.resolve();
  const origin = new URL(window.location.origin);
  origin.port = '';
  const nonce = window.crypto.randomUUID();
  return new Promise((resolve) => {
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      window.opener = null;
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== controller || event.origin !== origin.origin ||
          event.data?.type !== 'openwifi-controller-session' || event.data.nonce !== nonce ||
          typeof event.data.token !== 'string') return;
      // Replace any previous portal account; normal server profile/permission checks follow.
      try {
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('access_token');
        if (event.data.token) sessionStorage.setItem('access_token', event.data.token);
      } finally {
        cleanup();
      }
    };
    window.addEventListener('message', onMessage);
    const timer = window.setTimeout(cleanup, 5000);
    controller.postMessage({ type: 'openwifi-portal-ready', nonce }, origin.origin);
  });
};
