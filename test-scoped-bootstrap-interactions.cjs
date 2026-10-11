/* Real auth/query/socket providers, isolated mocked HTTP and websocket transports. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'Node', 'Event', 'MutationObserver', 'localStorage', 'sessionStorage']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
let pollingCallback;
const originalInterval = global.setInterval;
global.setInterval = (callback, delay, ...args) => {
  if (delay === 30000) pollingCallback = callback;
  return originalInterval(callback, delay, ...args);
};
const sockets = [];
global.WebSocket = class {
  constructor(url) { this.url = url; this.messages = []; this.closed = false; sockets.push(this); }
  send(value) { this.messages.push(value); }
  close() { this.closed = true; this.onclose?.(); }
  addEventListener() {} removeEventListener() {}
};
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react');
const { QueryClient, QueryClientProvider, useQuery } = require('@tanstack/react-query');
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'react-i18next') return { useTranslation: () => ({ t: (key) => key }) };
  if (name === './hooks/NotificationContent/useWebSocketNotification') return { __esModule: true, default: () => ({ pushNotification() {}, modal: null }) };
  if (/^(helpers|hooks|constants|models|utils|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (mod, filename) => {
  const source = fs.readFileSync(filename, 'utf8').replace(/import\.meta\.env\.VITE_UCENTRALSEC_URL/g, '"http://localhost"');
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, filename);
};
const transports = require('./src/utils/axiosInstances.ts');
const calls = [];
let role = 'csr';
const adapter = async (config) => {
  calls.push(config.url);
  let data;
  if (config.url === 'oauth2?me=true') data = { id: 'test-user', userRole: role, avatar: '', name: 'Test user' };
  else if (config.url === 'preferences') data = { data: [] };
  else if (config.url === 'systemEndpoints') data = { endpoints: ['owprov', 'owfms', 'owgw'].map((type) => ({ type, uri: `http://${type}.invalid` })) };
  else if (config.url.includes('ucentral.schema.pretty.json')) data = { $defs: {} };
  else if (config.url.startsWith('users')) data = { users: [] };
  else throw new Error(`Unexpected network call ${config.url}`);
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
require('axios').defaults.adapter = adapter;
for (const transport of Object.values(transports)) if (transport?.defaults) transport.defaults.adapter = adapter;
const { AuthProvider, useAuth } = require('./src/contexts/AuthProvider/index.tsx');
const { SecuritySocketProvider } = require('./src/contexts/SecuritySocketProvider/index.tsx');
const { FirmwareSocketProvider } = require('./src/contexts/FirmwareSocketProvider/index.tsx');
const { ProvisioningSocketProvider } = require('./src/contexts/ProvisioningSocketProvider/index.tsx');
const { useGetUsers } = require('./src/hooks/Network/Users.ts');
const stores = ['Security', 'Firmware', 'Provisioning'].map((name) => require(`./src/contexts/${name}SocketProvider/useStore.ts`)[`use${name}Store`]);
let auth;
let resourceRefreshes = 0;
const Probe = () => {
  auth = useAuth(); useGetUsers();
  useQuery(['scoped-site-data'], async () => ++resourceRefreshes, { enabled: auth.isUserLoaded, staleTime: Infinity });
  return React.createElement('p', null, auth.isUserLoaded ? `Loaded ${auth.user.userRole}` : 'Loading');
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
const root = createRoot(document.getElementById('app'));
const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); ++checks; };
(async () => {
  await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client },
    React.createElement(AuthProvider, { token: 'isolated-test-token' }, React.createElement(SecuritySocketProvider, null,
      React.createElement(FirmwareSocketProvider, null, React.createElement(ProvisioningSocketProvider, null, React.createElement(Probe)))))))));
  for (let i = 0; i < 4 && !auth.isUserLoaded; ++i) await settle();
  check(auth.isUserLoaded && auth.token === 'isolated-test-token', 'scoped bootstrap completes with session retained');
  check(calls.includes('oauth2?me=true') && calls.includes('systemEndpoints') && calls.includes('preferences'), 'self/endpoints/preferences bootstrap');
  check(!calls.some((url) => url.startsWith('users') || url === 'roles'), 'no root-only users/roles requests during scoped bootstrap');
  check(sockets.length === 0 && stores.every((store) => !store.getState().notificationsEnabled), 'scoped users create no global websocket');
  for (const store of stores) store.getState().startWebSocket('isolated-test-token');
  check(sockets.length === 0, 'direct socket starts fail while scoped');
  const previousRefreshes = resourceRefreshes; await settle(() => pollingCallback());
  check(resourceRefreshes > previousRefreshes, 'polling updates active scoped query');
  role = 'root'; await settle(() => auth.refetchUser()); await settle();
  check(sockets.length === 3 && stores.every((store) => store.getState().notificationsEnabled), 'root retains three websocket connections');
  await settle(() => sockets.forEach((socket) => socket.onopen()));
  check(sockets.every((socket) => socket.messages.includes('token:isolated-test-token')), 'root token handshakes retained');
  await settle(() => stores[0].getState().webSocket.onclose());
  check(!!stores[0].getState().retryTimer, 'root websocket close schedules retry');
  await settle(() => stores[0].setState({ allMessages: [{ type: 'UNKNOWN', data: { private: true } }] }));
  role = 'csr'; await settle(() => auth.refetchUser()); await settle();
  check(sockets.every((socket) => socket.closed) && stores.every((store) => !store.getState().retryTimer), 'scoped transition closes root sockets and cancels retries');
  check(stores.every((store) => store.getState().allMessages.length === 0), 'root global notification data cleared');
  await settle(() => document.dispatchEvent(new Event('visibilitychange')));
  check(sockets.length === 3 && auth.token === 'isolated-test-token', 'visibility change cannot reopen denied socket or logout');
  const interceptor = transports.axiosSec.interceptors.response.handlers[0].rejected;
  localStorage.setItem('access_token', 'isolated-test-token');
  // ow_constants.h defines ACCESS_DENIED=7, INVALID_TOKEN=8, EXPIRED_TOKEN=9.
  const denial = { response: { status: 403, data: { ErrorCode: 7, ErrorDescription: 'Access denied' } } };
  await interceptor(denial).catch(() => {});
  check(localStorage.getItem('access_token') === 'isolated-test-token' && window.location.pathname === '/', 'ordinary permission denial does not revoke session');
  await settle(() => root.unmount()); client.clear();
  console.log(`PASS ${checks} real scoped bootstrap/socket/polling/session interaction checks`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
