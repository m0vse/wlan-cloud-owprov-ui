/* Real ConfigCard, Formik form and network hooks; isolated transport/section widgets. */
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
const { act, Simulate } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { MemoryRouter } = require('react-router-dom');
const { useField } = require('formik');
const siteId = '11111111-1111-4111-8111-111111111111';
let user, allowed = true, calls = [], puts = [], mutation;
const makeUser = (preset, userRole = 'noc') => ({ id: siteId, userRole, securityPolicyChange: 1,
  securityPolicy: JSON.stringify({ version: 1, grants: [{ scopeType: 'venue', scopeId: siteId,
    includeDescendants: true, capabilities: policyApi.accessPreset(preset) }] }) });
const config = { id: siteId, name: 'Original', description: 'Original description', venue: siteId, entity: '',
  subscriber: '', inUse: [], variables: [], deviceTypes: ['test-model'], notes: [],
  deviceRules: { rrm: {}, rcOnly: 'false', firmwareUpgrade: 'false' }, configuration: [] };
const field = ({ name, label, isDisabled, options }) => {
  const [props] = useField(name);
  return React.createElement('label', null, label, React.createElement('input', { ...props, 'aria-label': name, disabled: isDisabled }));
};
const wrapper = ({ children }) => React.createElement('div', null, children);
const button = (label) => ({ isDisabled }) => React.createElement('button', { disabled: isDisabled }, label);
const transport = {
  defaults: { baseURL: 'http://isolated.invalid/api/v1' },
  get: async (url) => {
    calls.push(url);
    if (user.userRole !== 'root' && /withExtendedInfo|expandInUse|computedAffected/.test(url)) throw new Error('Scoped expansion forbidden');
    if (url.startsWith('configuration/')) return { data: config };
    if (url.startsWith('configuration?')) return { data: { configurations: [config] } };
    if (url.startsWith('entity?')) return { data: { entities: [] } };
    if (url.startsWith('entity/')) return { data: { id: siteId, name: 'Entity', configurations: [siteId] } };
    if (url.startsWith('venue?')) return { data: { venues: [{ id: siteId, name: 'Venue' }] } };
    if (url.startsWith('venue/')) return { data: { id: siteId, name: 'Venue', configurations: [siteId] } };
    if (url.startsWith('variable?')) return { data: { variableBlocks: [] } };
    if (url.startsWith('variable/')) return { data: { id: siteId, name: 'Resource' } };
    if (url.startsWith('inventory?')) return { data: { taglist: [] } };
    if (url.startsWith('contact?')) return { data: { contacts: [] } };
    if (url.startsWith('location?')) return { data: { locations: [] } };
    throw new Error(`Unexpected GET ${url}`);
  },
  post: async (url, body) => { calls.push({ url, body }); assert.equal(url, 'access/check'); return { data: { allowed } }; },
  put: async (url, body) => { puts.push({ url, body }); return { data: { ...config, ...body } }; },
};
const mocks = {
  'contexts/AuthProvider': { useAuth: () => ({ user }) },
  'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
  'utils/axiosInstances': { axiosProv: transport, axiosSec: { defaults: { baseURL: 'http://sec.invalid/api/v1' } } },
  'components/FormFields/StringField': { __esModule: true, default: field },
  'components/FormFields/MultiSelectField': { __esModule: true, default: ({ isDisabled }) => React.createElement('input', { 'aria-label': 'deviceTypes', disabled: isDisabled, readOnly: true, value: 'test-model' }) },
  'components/FormFields/SelectWithSearchField': { __esModule: true, default: field },
  'components/CustomFields/DeviceRulesField': { __esModule: true, default: ({ isDisabled }) => React.createElement('input', { 'aria-label': 'deviceRules', disabled: isDisabled }) },
  'components/CustomFields/NotesTable': { __esModule: true, default: () => null },
  'components/Modals/Configuration/ConfigurationInUseModal': { __esModule: true, default: () => null },
  'hooks/Network/DeviceTypes': { __esModule: true, default: () => ({ data: ['test-model'] }) },
  'contexts/ConfigurationProvider': { ConfigurationProvider: wrapper },
  'components/Modals/ObjectTransfer': { __esModule: true, default: button('Transfer configuration') },
  'components/Modals/Actions/ConfirmCloseAlert': { __esModule: true, default: () => null },
  'components/LoadingOverlay': { __esModule: true, default: wrapper },
};
for (const name of ['Card', 'Card/CardBody', 'Card/CardHeader']) mocks[`components/${name}`] = { __esModule: true, default: wrapper };
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (mocks[name]) return mocks[name];
  if (parent?.filename.endsWith('/ConfigurationCard/index.jsx')) {
    if (name === './DeleteConfigurationPopover') return { __esModule: true, default: button('Delete configuration') };
    if (name === './ConfirmConfigurationWarnings') return { __esModule: true, default: () => null };
    if (name === './ConfigurationSectionsCard') return { __esModule: true, default: ({ setSections }) => {
      React.useEffect(() => setSections({ activeConfigurations: ['unit'], data: { unit: { data: { configuration: { hostname: 'Test' } } } },
        invalidValues: [], isDirty: true, warnings: {} }), [setSections]);
      return React.createElement('p', null, 'Configuration sections');
    } };
  }
  if (/^(helpers|hooks|constants|models|utils|contexts|components)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx', '.jsx']) Module._extensions[extension] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true, allowJs: true } }).outputText, filename);
};
const policyApi = require('./src/helpers/userAccessPolicy.ts');
const Card = require('./src/pages/ConfigurationPage/ConfigurationCard/index.jsx').default;
const api = require('./src/hooks/Network/Configurations.ts');
const entityApi = require('./src/hooks/Network/Entity.ts');
const venueApi = require('./src/hooks/Network/Venues.ts');
const resourceApi = require('./src/hooks/Network/Resources.ts');
const inventoryApi = require('./src/hooks/Network/Inventory.ts');
const contactApi = require('./src/hooks/Network/Contacts.ts');
const locationApi = require('./src/hooks/Network/Locations.ts');
const HookProbe = () => {
  mutation = api.useUpdateConfiguration({ id: siteId });
  api.useGetSelectConfigurations({ select: [siteId] }); api.useGetConfigurations();
  entityApi.useGetEntity({ id: siteId }); venueApi.useGetVenue({ id: siteId });
  entityApi.useGetSelectEntities({ select: [siteId] }); venueApi.useGetSelectVenues({ select: [siteId] });
  resourceApi.useGetResource({ id: siteId, enabled: true }); resourceApi.useGetResources({ select: [siteId] });
  inventoryApi.useGetInventoryTags({ tagSelect: [siteId], enabled: true });
  inventoryApi.useGetSelectInventoryPaginated({ serialNumbers: [siteId], pageInfo: { limit: 10, index: 0 } });
  contactApi.useGetSelectContacts({ select: [siteId] }); contactApi.useGetAllContacts();
  locationApi.useGetSelectLocations({ select: [siteId], enabled: true }); locationApi.useGetAllLocations({});
  return null;
};
let root, container, client;
const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
const render = async () => {
  if (root) { await settle(() => root.unmount()); client.clear(); }
  document.body.innerHTML = ''; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
  await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client },
    React.createElement(MemoryRouter, null, React.createElement(React.Fragment, null, React.createElement(Card, { id: siteId }), React.createElement(HookProbe)))))));
  await settle();
};
const find = (label) => container.querySelector(`[aria-label="${label}"]`);
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); ++checks; };
(async () => {
  user = makeUser('viewer'); await render();
  check(container.textContent.includes('Original') && find('toggle-edit').disabled, 'viewer loads configuration with editing disabled');
  check(!container.textContent.includes('Transfer configuration') && !container.textContent.includes('Delete configuration'), 'scoped global ownership actions absent');
  check(calls.filter((call) => typeof call === 'string').every((url) => !/withExtendedInfo|expandInUse|computedAffected/.test(url)), 'all scoped config/entity/venue/resource/inventory/contact/location reads plain');
  const before = puts.length; await settle(() => mutation.mutateAsync({ name: 'Forbidden' }).catch(() => {}));
  check(puts.length === before, 'viewer direct update hook denied');
  user = makeUser('editor', 'installer'); calls = []; await render();
  check(!find('toggle-edit').disabled && calls.some((call) => call.url === 'access/check' && call.body.objectType === 'configuration'), 'editor edit enabled by server object-scope decision');
  await settle(() => Simulate.click(find('toggle-edit')));
  check(!find('name').disabled && find('entity').disabled && find('deviceRules').disabled, 'editor allowed fields editable but ownership/device rules locked');
  await settle(() => { const input = find('name'); input.value = 'Updated config'; Simulate.change(input, { target: input }); });
  check(!find('save').disabled, 'scoped plain DTO passes save validation');
  await settle(() => Simulate.click(find('save')));
  check(puts.at(-1).url === `configuration/${siteId}` && puts.at(-1).body.name === 'Updated config', 'actual editor form PUT workflow');
  check(Object.keys(puts.at(-1).body).sort().join(',') === 'configuration,description,deviceTypes,name,notes', 'scoped PUT contains exactly permitted fields');
  check(!('entity' in puts.at(-1).body) && !('venue' in puts.at(-1).body) && !('deviceRules' in puts.at(-1).body), 'foreign ownership fields never posted');
  allowed = false; await render(); check(find('toggle-edit').disabled, 'write grant in another scope cannot enable this object edit');
  user = makeUser('editor', 'root'); calls = []; allowed = true; await render();
  check(calls.some((call) => typeof call === 'string' && call === `configuration/${siteId}?withExtendedInfo=true`), 'root expanded configuration read retained');
  check(container.textContent.includes('Transfer configuration') && container.textContent.includes('Delete configuration'), 'root management controls retained');
  await settle(() => mutation.mutateAsync({ name: 'Root', entity: siteId, deviceRules: config.deviceRules }));
  check(puts.at(-1).body.entity === siteId && puts.at(-1).body.deviceRules === config.deviceRules, 'root full PUT unchanged');
  await settle(() => root.unmount()); client.clear();
  console.log(`PASS ${checks} real scoped ConfigCard/form/GET/PUT interaction checks`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
