/* Actual page and shared controls; all API peers and certificate records are synthetic. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement', 'Node', 'Event', 'MutationObserver']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act, Simulate } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
let actor = { id: 'synthetic-root', userRole: 'root' }, reads = 0, posts = [], finish;
const status = { activeIssuer: 'issuer', nativeEnrollmentReady: true, nativeRenewalReady: true, roots: [],
  certificates: [{ fingerprint: 'synthetic-fingerprint', issuer: 'issuer', device: 'aa0000000001', expires: 4102444800, revoked: 0, canDelete: true }],
  enrollmentBatches: [{ id: 'synthetic-batch', active: 1, devices: 1, enrolled: 1 }],
  onboarding: [{ id: 'synthetic-job', serial: 'aa0000000003', state: 'waiting', message: 'Waiting' }] };
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'contexts/AuthProvider') return { useAuth: () => ({ user: actor }) };
  if (name === 'hooks/useEnrollmentClipboard') return { useEnrollmentClipboard: () => ({ onCopy() {}, hasCopied: false }) };
  if (name === 'components/Tables/InventoryTable/ImportDeviceCsvModal') return { __esModule: true, default: () => React.createElement('button', null, 'Synthetic CSV import') };
  if (name === 'utils/pkiClient') return { axiosPki: {
    get: async (url) => { ++reads; return { data: url === 'pki/status' ? status : { events: [] } }; },
    post: async (url, payload) => { posts.push({ url, payload }); await new Promise((resolve) => { finish = resolve; }); return { data: { id: 'synthetic-new-key', enrollmentKey: 'synthetic-only-key', server: 'enroll.example.invalid', devices: 1 } }; },
  } };
  if (name === 'utils/axiosInstances') return {
    axiosProv: { get: async () => { ++reads; return { data: { taglist: [{ serialNumber: 'aa0000000001' }, { serialNumber: 'aa0000000002' }] } }; } },
    axiosGw: { get: async () => { ++reads; return { data: { lastRecordedContact: 1, certificateExpiryDate: 4102444800 } }; } },
  };
  if (/^(components|helpers|hooks|constants|models|utils|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx', '.jsx']) Module._extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename);
const Page = require('./src/pages/CertificatesPage/index.tsx').default;
let root, client, container, checks = 0;
const check = (condition, message) => { assert.ok(condition, message); ++checks; };
const settle = (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
const find = (label) => container.querySelector(`[aria-label="${label}"]`);
const button = (text) => [...container.querySelectorAll('button')].find((item) => item.textContent === text);
const render = async () => {
  if (root) { await settle(() => root.unmount()); client.clear(); }
  document.body.innerHTML = ''; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
  await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client }, React.createElement(Page)))));
  await settle();
};
(async () => {
  await render();
  check(container.querySelector('h2')?.textContent === 'Certificates', 'standard Certificates header');
  check(find('Enrollment type').disabled && find('AP serial numbers for enrollment').disabled, 'initial read-only fields');
  for (const label of ['Create enrollment key', 'Replace key', 'Cancel enrollment', 'Delete unused', 'Cancel']) check(button(label).disabled, label + ' requires editing');
  check(!button('Synthetic CSV import') && posts.length === 0, 'read-only page neither imports nor mutates');
  const initialReads = reads;
  await settle(() => Simulate.click(button('Refresh')));
  check(reads > initialReads && posts.length === 0, 'Refresh performs reads only');
  const routes = fs.readFileSync('src/router/routes.tsx', 'utf8');
  check(routes.includes("label: 'Certificates'") && !routes.includes("label: 'AP certificates'"), 'menu renamed Certificates');
  await settle(() => { const input = find('AP to manage'); input.value = 'aa0000000001'; Simulate.change(input, { target: input }); });
  check(button('Renew certificate').disabled && posts.length === 0, 'AP selection reads only');
  await settle(() => Simulate.click(find('toggle-edit')));
  check(!find('Enrollment type').disabled && !!button('Synthetic CSV import'), 'shared edit toggle enables management');
  check(posts.length === 0, 'entering edit mode sends no mutation');
  for (const label of ['Replace key', 'Cancel enrollment', 'Delete unused', 'Cancel', 'Renew certificate']) check(!button(label).disabled, label + ' enabled only explicitly');
  await settle(() => Simulate.click(button('Use all pending APs')));
  check(find('AP serial numbers for enrollment').value === 'aa0000000002', 'pending selection preserves existing certificate exclusion');
  await settle(() => Simulate.click(button('Create enrollment key')));
  check(posts.length === 1 && posts[0].url === 'pki/create-enrollment-key' && posts[0].payload.serials[0] === 'aa0000000002', 'existing explicit create request unchanged');
  check(find('toggle-edit').disabled && button('Delete unused').disabled, 'pending operation locks edit and conflicting actions');
  await settle(() => { const resolve = finish; finish = undefined; resolve(); });
  await settle(() => Simulate.click(find('toggle-edit')));
  check(button('Delete unused').disabled && posts.length === 1, 'stop editing returns to read-only without another operation');
  const previousReads = reads;
  actor = { id: 'synthetic-scoped', userRole: 'admin' }; await render();
  check(!find('toggle-edit') && reads === previousReads, 'nonroot cannot query or manage certificates');
  await settle(() => root.unmount()); client.clear();
  console.log(`PASS ${checks} actual Certificates header/edit/read-only/API-preservation checks; synthetic peers only`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
