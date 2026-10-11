import { v4 as uuid } from 'uuid';
import create from 'zustand';
import {
  ACCEPTED_VENUE_NOTIFICATION_TYPES,
  ProvisioningCommandResponse,
  ProvisioningSocketRawMessage,
  ProvisioningVenueNotificationMessage,
  SocketEventCallback,
  SocketWebSocketNotificationData,
} from './utils';
import { NotificationType } from 'models/Socket';
import { axiosProv } from 'utils/axiosInstances';

export type ProvisioningWebSocketMessage =
  | {
      type: 'NOTIFICATION';
      data: SocketWebSocketNotificationData;
      timestamp: Date;
      id: string;
    }
  | {
      type: 'COMMAND';
      data: ProvisioningCommandResponse;
      timestamp: Date;
      id: string;
    }
  | {
      type: 'UNKNOWN';
      data: {
        type?: string;
        type_id?: number;
        [key: string]: unknown;
      };
      timestamp: Date;
      id: string;
    };

const parseRawWebSocketMessage = (
  message?: ProvisioningSocketRawMessage,
): SocketWebSocketNotificationData | undefined => {
  if (message && message.notification) {
    if (message.notification.type_id === 1) {
      return {
        type: 'LOG',
        log: message.notification.content,
      };
    }
    if (
      message.notification.type_id === 1000 ||
      message.notification.type_id === 2000 ||
      message.notification.type_id === 3000
    ) {
      return {
        type: 'NOTIFICATION',
        data: message.notification,
      };
    }
  } else if (message?.notificationTypes) {
    return {
      type: 'INITIAL_MESSAGE',
      message,
    };
  } else if (message?.response && message.command_response_id) {
    return {
      type: 'COMMAND',
      data: message as ProvisioningCommandResponse,
    };
  }
  return undefined;
};

export type ProvisioningStoreState = {
  availableLogTypes: NotificationType[];
  hiddenLogIds: number[];
  setHiddenLogIds: (logsToHide: number[]) => void;
  lastMessage?: ProvisioningWebSocketMessage;
  allMessages: ProvisioningWebSocketMessage[];
  addMessage: (
    rawMsg: ProvisioningSocketRawMessage,
    pushNotification: (notification: ProvisioningVenueNotificationMessage['notification']) => void,
  ) => void;
  eventListeners: SocketEventCallback[];
  addEventListeners: (callback: SocketEventCallback[]) => void;
  webSocket?: WebSocket;
  send: (str: string) => void;
  startWebSocket: (token: string, tries?: number) => void;
  notificationsEnabled: boolean;
  retryTimer?: ReturnType<typeof setTimeout>;
  setNotificationsEnabled: (enabled: boolean) => void;
  isWebSocketOpen: boolean;
  setWebSocketOpen: (isOpen: boolean) => void;
  lastSearchResults: string[];
  setLastSearchResults: (result: string[]) => void;
  errors: { str: string; timestamp: Date }[];
};

export const useProvisioningStore = create<ProvisioningStoreState>((set, get) => ({
  availableLogTypes: [],
  hiddenLogIds: [],
  setHiddenLogIds: (logsToHide: number[]) => {
    get().send(JSON.stringify({ 'drop-notifications': logsToHide }));
    set(() => ({
      hiddenLogIds: logsToHide,
    }));
  },
  allMessages: [] as ProvisioningWebSocketMessage[],
  addMessage: (rawMsg, pushNotification) => {
    try {
      const msg = parseRawWebSocketMessage(rawMsg);
      if (msg) {
        // Handle notification-specific logic
        if (msg.type === 'INITIAL_MESSAGE') {
          if (msg.message.notificationTypes) {
            set({ availableLogTypes: msg.message.notificationTypes });
          }
        }
        // Handle venue notifications
        if (msg.type === 'NOTIFICATION' && ACCEPTED_VENUE_NOTIFICATION_TYPES.includes(msg.data.type_id)) {
          pushNotification(msg.data);
        }
        // General handling
        const obj: ProvisioningWebSocketMessage =
          msg.type === 'COMMAND'
            ? {
                type: 'COMMAND',
                data: msg.data,
                timestamp: new Date(),
                id: uuid(),
              }
            : {
                type: 'NOTIFICATION',
                data: msg,
                timestamp: msg.log?.timestamp ? new Date(msg.log.timestamp * 1000) : new Date(),
                id: uuid(),
              };

        const eventsToFire = get().eventListeners.filter(({ type }) => type === msg.type);

        if (eventsToFire.length > 0) {
          for (const event of eventsToFire) {
            event.callback();
          }

          return set((state) => ({
            allMessages:
              state.allMessages.length <= 1000 ? [...state.allMessages, obj] : [...state.allMessages.slice(1), obj],
            lastMessage: obj,
            eventListeners: get().eventListeners.filter(
              ({ id }) => !eventsToFire.find(({ id: findId }) => findId === id),
            ),
          }));
        }

        return set((state) => ({
          allMessages:
            state.allMessages.length <= 1000 ? [...state.allMessages, obj] : [...state.allMessages.slice(1), obj],
          lastMessage: obj,
        }));
      }
      return undefined;
    } catch {
      // TODO - Add error message to socket logs
      return set((state) => ({
        errors: [...state.errors, { str: JSON.stringify(rawMsg), timestamp: new Date() }],
      }));
    }
  },
  eventListeners: [] as SocketEventCallback[],
  addEventListeners: (events: SocketEventCallback[]) =>
    set((state) => ({ eventListeners: [...state.eventListeners, ...events] })),
  isWebSocketOpen: false,
  notificationsEnabled: false,
  setNotificationsEnabled: (enabled) => {
    clearTimeout(get().retryTimer);
    const socket = get().webSocket;
    if (socket) { socket.onclose = null; socket.close(); }
    set({ notificationsEnabled: enabled, webSocket: undefined, isWebSocketOpen: false,
      retryTimer: undefined, allMessages: [], lastMessage: undefined, availableLogTypes: [], eventListeners: [], lastSearchResults: [], errors: [] });
  },
  setWebSocketOpen: (isOpen: boolean) => set({ isWebSocketOpen: isOpen }),
  send: (str: string) => {
    const ws = get().webSocket;
    if (ws) ws.send(str);
  },
  startWebSocket: (token: string, tries = 0) => {
    if (!get().notificationsEnabled || !token) return;
    const newTries = tries + 1;
    if (tries <= 10) {
      set({
        webSocket: new WebSocket(
          `${
            axiosProv?.defaults?.baseURL ? axiosProv.defaults.baseURL.replace('https', 'wss').replace('http', 'ws') : ''
          }/ws`,
        ),
      });
      const ws = get().webSocket;
      if (ws) {
        ws.onopen = () => {
          set({ isWebSocketOpen: true });
          ws.send(`token:${token}`);
        };
        ws.onclose = () => {
          set({ isWebSocketOpen: false });
          set({ retryTimer: setTimeout(() => get().startWebSocket(token, newTries), 3000) });
        };
      }
    }
  },
  lastSearchResults: [] as string[],
  setLastSearchResults: (results: string[]) => set({ lastSearchResults: results }),
  errors: [],
}));
