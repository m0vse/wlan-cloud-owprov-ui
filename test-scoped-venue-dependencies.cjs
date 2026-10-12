/* Actual VenuePage/layout/header/details/form/breadcrumb/contacts/address with synthetic HTTP. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><body><div id="app"></div></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement', 'Node', 'Event', 'MutationObserver', 'localStorage']) global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle; global.requestAnimationFrame = (cb) => setTimeout(cb, 0); global.cancelAnimationFrame = clearTimeout; global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const React = require('react'), { createRoot } = require('react-dom/client'), { act } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react'), { QueryClient, QueryClientProvider } = require('@tanstack/react-query'), { MemoryRouter } = require('react-router-dom');
const { useField } = require('formik');
const venueId = '11111111-1111-4111-8111-111111111111', parentId = '22222222-2222-4222-8222-222222222222', locationId = '33333333-3333-4333-8333-333333333333';
let actor = { id: 'synthetic-admin', userRole: 'admin', securityPolicy: 'synthetic-policy-one' }, calls = [], denyLocation = false;
const venue = { id: venueId, name: 'Assigned venue', description: 'Assigned description', entity: parentId, location: locationId, boards: [], devices: [], contacts: [], configurations: [], variables: [], notes: [], modified: 1 };
const transport = { defaults: { baseURL: 'http://prov.invalid' }, get: async (url) => {
  calls.push(url);
  if (url === `venue/${venueId}` || actor.userRole === 'root' && url === `venue/${venueId}?withExtendedInfo=true`) return { data: venue };
  if (url === `location/${locationId}?venueId=${venueId}`) {
    if (denyLocation) throw { response: { status: 403, data: { ErrorCode: 7, ErrorDescription: 'forbidden-parent-secret' } } };
    return { data: { name: 'Assigned address', addressLines: ['Synthetic road'], city: 'Synthetic city', state: '', postal: '', country: '' } };
  }
  if (actor.userRole !== 'root') throw new Error(`Scoped forbidden dependency: ${url}`);
  if (url === 'entity?getTree=true') return { data: { uuid: parentId, name: 'Root parent', type: 'entity', children: [], venues: [{ uuid: venueId, name: venue.name, type: 'venue', children: [] }] } };
  if (url === `entity/${parentId}?withExtendedInfo=true`) return { data: { id: parentId, contacts: [], locations: [] } };
  if (url.startsWith('venue?locationsForVenue=')) return { data: { locations: [] } };
  if (url === `location/${locationId}`) return { data: { name: 'Root address', addressLines: [], city: '', state: '', postal: '', country: '', geoCode: '' } };
  if (url.startsWith('systemSecret')) return { data: { value: 'synthetic-map-key' } };
  throw new Error(`Unexpected root dependency ${url}`);
} };
const empty = () => null, container = ({ children }) => React.createElement('div', null, children);
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'contexts/AuthProvider') return { useAuth: () => ({ user: actor }) };
  if (name === 'utils/axiosInstances') return { axiosProv: transport, axiosSec: { defaults: { baseURL: 'http://sec.invalid' } }, axiosAnalytics: { defaults: { baseURL: 'http://analytics.invalid' } } };
  if (name === 'react-i18next') return { useTranslation: () => ({ t: (key) => key }) };
  if (name === 'hooks/Network/Analytics') return { useGetAnalyticsBoardDevices: ({ id }) => { assert.equal(id, undefined, 'no scoped analytics'); return { isLoading: true }; } };
  if (name === 'constants/formSchemas') return { VenueSchema: () => require('yup').object() };
  if (name === 'hooks/useFormModal') return { __esModule: true, default: () => ({ isOpen: false }) };
  if (name === 'hooks/useDefaultPage') return { __esModule: true, default: () => () => {} };
  if (name === 'hooks/Network/Contacts') return { useGetSelectContacts: () => ({ data: [], isFetching: false }) };
  if (name === 'hooks/Network/Secrets') return { useGetSystemSecret: () => { calls.push('systemSecret/google.maps.apikey'); assert.equal(actor.userRole, 'root'); return { data: { value: 'synthetic-map-key' } }; } };
  if (name === 'react-masonry-css') return { __esModule: true, default: container };
  if (name === 'components/FormFields/StringField') return { __esModule: true, default: ({ name, isDisabled }) => { const [props] = useField(name); return React.createElement('input', { ...props, disabled: isDisabled, 'aria-label': name }); } };
  if (name === 'components/Buttons/ToggleEditButton') return { __esModule: true, default: ({ isDisabled }) => React.createElement('button', { disabled: isDisabled, 'aria-label': 'toggle-edit' }, 'Edit') };
  if (name === 'components/CreateObjectsForms/LocationPickerCreator') return { __esModule: true, default: () => { React.useEffect(() => { transport.get(`venue?locationsForVenue=${venueId}`); }, []); return React.createElement('span', null, 'Root location picker'); } };
  if (name === 'components/EntityBreadcrumb') name = path.resolve('src', name);
  else if (name.startsWith('components/')) return { __esModule: true, default: name.startsWith('components/Card') ? container : empty, GoogleMap: empty, GoogleMapMarker: empty, Modal: empty };
  if (name.startsWith('layout/')) return { __esModule: true, default: empty };
  if (parent?.filename.includes('/VenuePage/') && ['./Actions', './DeleteVenuePopover', './StartAnalyticsModal', './ViewAnalyticsSettingsModal', './Monitoring', './BehaviorsCard', './InventoryCard', './Configuration', './Resources', './VenueNotes', './ContactDisplay', './ContactsTable'].includes(name)) return { __esModule: true, default: empty };
  if (name === '../UseContactExistingModal') name = path.resolve('src/pages/VenuePage/Layout/UseContactExistingModal');
  if (name === './Actions' && parent?.filename.includes('/UseContactExistingModal/')) return { __esModule: true, default: empty };
  if (/^(helpers|hooks|constants|models|utils|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, filename);
const VenuePage = require('./src/pages/VenuePage/index.tsx').default;
let root, client; const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
const render = async () => {
  if (root) { await settle(() => root.unmount()); client.clear(); }
  document.body.innerHTML = '<div id="app"></div>'; root = createRoot(document.getElementById('app'));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
  await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client }, React.createElement(MemoryRouter, null, React.createElement(VenuePage, { idToUse: venueId }))))));
  for (let i = 0; i < 6 && !document.body.textContent.includes(denyLocation ? 'Location reference:' : actor.userRole === 'root' ? 'Root location picker' : 'Assigned address'); ++i) await settle();
};
let checks = 0; const check = (value, label) => { assert.ok(value, label); ++checks; };
(async () => {
  await render();
  check(document.body.textContent.includes('Assigned venue') && document.body.textContent.includes('Assigned site'), 'actual venue page minimal header/context');
  check(document.body.textContent.includes('Assigned address') && document.body.textContent.includes('Synthetic road'), 'narrowly referenced scoped address displayed');
  check(calls.includes(`location/${locationId}?venueId=${venueId}`), 'location read includes exact venue reference');
  check(!calls.some((url) => /entity|locationsForVenue|systemSecret|withExtendedInfo/.test(url)), 'no parent/tree/picker/global secret requests');
  check(document.querySelector('[aria-label="toggle-edit"]')?.disabled, 'scoped details cannot edit unsupported venue fields');
  check(document.body.textContent.includes('Contact details are not available'), 'scoped contacts never mount closed parent assignment modal');
  check(document.querySelectorAll('[aria-selected="true"]')[0]?.textContent === 'Management', 'management remains active');
  denyLocation = true; calls = []; await render();
  check(document.body.textContent.includes('Location reference:') && !document.body.textContent.includes('forbidden-parent-secret'), 'narrow location failure gracefully falls back without secret/toast');
  actor = { ...actor, userRole: 'root' }; denyLocation = false; calls = []; await render(); await settle();
  check(calls.includes(`venue/${venueId}?withExtendedInfo=true`) && calls.includes('entity?getTree=true'), 'root extended venue and full breadcrumb retained');
  check(calls.includes(`entity/${parentId}?withExtendedInfo=true`), 'root closed contact assignment context retained');
  check(calls.includes(`venue?locationsForVenue=${venueId}`) && calls.includes(`location/${locationId}`) && calls.includes('systemSecret/google.maps.apikey'), 'root picker/direct location/map key retained');
  await settle(() => root.unmount()); client.clear(); console.log(`PASS ${checks} actual venue dependency/root/address/fallback interactions`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
