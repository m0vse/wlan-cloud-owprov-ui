/* Actual Entity/Venue inventory cards/hooks, synthetic filtered transport and table. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'Node', 'Event', 'MutationObserver']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { MemoryRouter } = require('react-router-dom');
const siteId = '11111111-1111-4111-8111-111111111111';
const foreignId = '22222222-2222-4222-8222-222222222222';
let actor = { id: 'synthetic-user', userRole: 'noc' }, calls = [], table;
const tags = [0, 1].map((index) => ({ id: `tag-${index}`, serialNumber: `owned-ap-${index}`, name: `Owned AP ${index}` }));
const transport = {
  defaults: { baseURL: 'http://isolated.invalid/api/v1' },
  get: async (url) => {
    calls.push(url);
    if (url.startsWith('entity/') || url.startsWith('venue/')) return { data: {
      id: siteId, name: 'Owned site', devices: actor.userRole === 'root' ? tags.map((tag) => tag.serialNumber) : [] } };
    assert.ok(url.startsWith('inventory?'), `Unexpected URL ${url}`);
    const params = new URLSearchParams(url.split('?')[1]);
    if (actor.userRole !== 'root') {
      assert.equal(params.get('entity') || params.get('venue'), siteId, 'exact owned-site filter required');
      assert.ok(!params.has('withExtendedInfo') && !params.has('select') && !params.has('getChildren'), 'no expansion/relation/descendant request');
    } else assert.ok(params.has('select') && params.get('withExtendedInfo') === 'true', 'root reference path preserved');
    if (params.has('countOnly')) return { data: { count: 2 } };
    const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || 10);
    const selected = params.has('select') ? tags.filter((tag) => params.get('select').split(',').includes(tag.serialNumber)) : tags.slice(offset, offset + limit);
    return { data: { taglist: selected } };
  },
};
const Table = (props) => {
  table = props;
  React.useEffect(() => props.setPageInfo({ limit: 1, index: 0 }), [props.setPageInfo]);
  return React.createElement('div', null, React.createElement('span', null, `Count ${props.count}`),
    React.createElement('table', null, React.createElement('tbody', null, props.data.map((tag) => React.createElement('tr', { key: tag.serialNumber }, React.createElement('td', null, tag.name))))));
};
const mocks = {
  'contexts/AuthProvider': { useAuth: () => ({ user: actor }) },
  'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
  'utils/axiosInstances': { axiosProv: transport },
  'hooks/useDefaultPage': { __esModule: true, default: () => () => {} },
  'components/DataTable': { __esModule: true, default: Table },
};
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (mocks[name]) return mocks[name];
  if (name.startsWith('components/') && name !== 'components/DataTable') return { __esModule: true, default: ({ children }) => React.createElement('div', null, children) };
  if (name === './Actions' && parent?.filename.includes('/InventoryCard/')) return { __esModule: true, default: () => null };
  if (/^(helpers|hooks|constants|models|utils|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename);
const EntityCard = require('./src/pages/EntityPage/Layout/InventoryCard/index.tsx').default;
const VenueCard = require('./src/pages/VenuePage/Layout/InventoryCard/index.tsx').default;
let root, container, client;
const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
const render = async (Card) => {
  if (root) { await settle(() => root.unmount()); client.clear(); }
  document.body.innerHTML = ''; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
  await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client },
    React.createElement(MemoryRouter, null, React.createElement(Card, { id: siteId }))))));
  for (let i = 0; i < 6 && !container.textContent.includes('Owned AP 0'); ++i) await settle();
};
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); ++checks; };
(async () => {
  for (const [kind, Card] of [['entity', EntityCard], ['venue', VenueCard]]) {
    calls = []; actor = { ...actor, userRole: 'noc' }; await render(Card);
    check(container.textContent.includes('Owned AP 0') && container.textContent.includes('Count 2'), `${kind} empty metadata relations still show owned AP/count`);
    check(calls.some((url) => url === `inventory?${kind}=${siteId}&limit=1&offset=0`), `${kind} exact filtered first page`);
    check(!calls.some((url) => url.includes(foreignId) || url.includes('select=')), `${kind} no foreign/global/relation-ID request`);
    await settle(() => table.setPageInfo({ limit: 1, index: 1 }));
    check(container.textContent.includes('Owned AP 1') && !container.textContent.includes('Owned AP 0'), `${kind} pagination replaces page`);
    check(calls.some((url) => url === `inventory?${kind}=${siteId}&limit=1&offset=1`), `${kind} bounded next page`);
    calls = []; actor = { ...actor, userRole: 'root' }; await render(Card);
    check(container.textContent.includes('Owned AP 0') && calls.some((url) => url.includes('withExtendedInfo=true&select=owned-ap-0')), `${kind} root existing reference read unchanged`);
    check(!calls.some((url) => url.includes('countOnly') || url.includes(`${kind}=`)), `${kind} root never uses new scoped path`);
  }
  await settle(() => root.unmount()); client.clear();
  console.log(`PASS ${checks} real entity/venue card scoped pagination and root-reference interactions`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
