import React, { useCallback, useEffect, useMemo } from 'react';
import useWebSocketNotification from './hooks/NotificationContent/useWebSocketNotification';
import { useProvisioningStore } from './useStore';
import { ProvisioningSocketRawMessage } from './utils';
import { useAuth } from 'contexts/AuthProvider';
import { axiosProv, axiosSec } from 'utils/axiosInstances';

export type ProvisioningSocketContextReturn = Record<string, unknown>;

const ProvisioningSocketContext = React.createContext<ProvisioningSocketContextReturn>({
  webSocket: undefined,
  isOpen: false,
});

export const ProvisioningSocketProvider = ({ children }: { children: React.ReactElement }) => {
  const { token, isUserLoaded, user } = useAuth();
  const canSubscribe = isUserLoaded && user?.userRole === 'root' && !!token;
  const { pushNotification, modal } = useWebSocketNotification();
  const { addMessage, isOpen, webSocket, onStartWebSocket } = useProvisioningStore((state) => ({
    addMessage: state.addMessage,
    isOpen: state.isWebSocketOpen,
    webSocket: state.webSocket,
    onStartWebSocket: state.startWebSocket,
  }));

  const onMessage = useCallback((message: MessageEvent<string>) => {
    try {
      const data = JSON.parse(message.data) as ProvisioningSocketRawMessage | undefined;
      if (data) {
        addMessage(data, pushNotification);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }, []);

  // useEffect for created the WebSocket and 'storing' it in useRef
  useEffect(() => {
    const enabled = canSubscribe && axiosProv?.defaults?.baseURL !== axiosSec?.defaults?.baseURL;
    useProvisioningStore.getState().setNotificationsEnabled(enabled);
    if (enabled) {
      onStartWebSocket(token ?? '');
    }

    return () => useProvisioningStore.getState().setNotificationsEnabled(false);
  }, [canSubscribe, token]);

  // useEffect for generating global notifications
  useEffect(() => {
    if (webSocket) {
      webSocket.addEventListener('message', onMessage);
    }

    return () => {
      if (webSocket) webSocket.removeEventListener('message', onMessage);
    };
  }, [webSocket]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      let timeoutId;

      if (webSocket) {
        if (document.visibilityState === 'hidden') {
          /* timeoutId = setTimeout(() => {
            if (webSocket) webSocket.onclose = () => {};
            webSocket?.close();
            setIsOpen(false);
          }, 5000); */
        } else {
          // If tab is active again, verify if browser killed the WS
          clearTimeout(timeoutId);

          if (!isOpen && canSubscribe && axiosProv?.defaults?.baseURL !== axiosSec?.defaults?.baseURL) {
            onStartWebSocket(token ?? '');
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [webSocket, isOpen, canSubscribe, token]);

  const values: ProvisioningSocketContextReturn = useMemo(() => ({}), []);

  return (
    <ProvisioningSocketContext.Provider value={values}>
      <>
        {children}
        {modal}
      </>
    </ProvisioningSocketContext.Provider>
  );
};

export const useGlobalProvisioningSocket: () => ProvisioningSocketContextReturn = () =>
  React.useContext(ProvisioningSocketContext);
