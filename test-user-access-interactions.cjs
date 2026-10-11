/* Run with jsdom 22 available in NODE_PATH; all network traffic is replaced. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element', 'HTMLInputElement', 'HTMLSelectElement', 'Node', 'Event', 'MutationObserver'])
  global[key] = dom.window[key];
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.cancelAnimationFrame = clearTimeout;
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act, Simulate } = require('react-dom/test-utils');
const { ChakraProvider } = require('@chakra-ui/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { useField } = require('formik');
let actor = { id: 'root-a', userRole: 'root' };
let loadError = false;
let failSave = false;
let requests = [];
let closed = 0;
const siteId = '11111111-1111-4111-8111-111111111111';
const field = ({ name, label, isDisabled, options }) => {
  const [props] = useField(name);
  return React.createElement('label', null, label,
    React.createElement(options ? 'select' : 'input', { ...props, 'aria-label': name, disabled: isDisabled },
      options?.map((o) => React.createElement('option', { key: o.value, value: o.value }, o.label))));
};
const mocks = {
  'contexts/AuthProvider': { useAuth: () => ({ user: actor }) },
  'react-i18next': { useTranslation: () => ({ t: (key) => key }) },
  'hooks/useApiRequirements': { __esModule: true, default: () => ({ passwordPolicyLink: 'http://localhost/policy', passwordPattern: '.*' }) },
  'components/FormFields/StringField': { __esModule: true, default: field },
  'components/FormFields/SelectField': { __esModule: true, default: field },
  'components/FormFields/NotesField': { NotesField: () => null },
  'hooks/Network/Entity': { useGetEntities: () => ({ data: [{ id: siteId, name: 'Test entity' }], isError: loadError }) },
  'hooks/Network/Venues': { useGetVenues: () => ({ data: [{ id: siteId, name: 'Test venue' }], isError: loadError }) },
  'utils/axiosInstances': { axiosSec: { put: async (url, body) => {
    requests.push({ url, body });
    if (failSave) throw Object.assign(new Error('stale policy'), { isAxiosError: true, response: { data: { ErrorDescription: 'Policy revision changed' } } });
    return { data: body };
  } } },
};
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (mocks[name]) return mocks[name];
  if (/^(helpers|hooks|constants|models)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText, filename);
};
const Form = require('./src/pages/UsersPage/Table/EditUserModal/Form.tsx').default;
const policyApi = require('./src/helpers/userAccessPolicy.ts');
const target = { id: 'viewer-a', userRole: 'csr', name: 'Test user', email: 'test@example.invalid',
  description: 'Original description', currentPassword: '', notes: [], securityPolicy: '', securityPolicyChange: 7 };
let root, container, ref;
const settle = async (callback) => act(async () => { if (callback) await callback(); await new Promise((resolve) => setTimeout(resolve, 20)); });
const render = async (selectedUser = target, editing = true) => {
  if (root) await settle(() => root.unmount());
  document.body.innerHTML = '';
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container); ref = React.createRef();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
  await settle(() => root.render(React.createElement(ChakraProvider, null,
    React.createElement(QueryClientProvider, { client }, React.createElement(Form, { editing, isOpen: true,
      onClose: () => ++closed, selectedUser, formRef: ref })))));
};
const find = (label) => container.querySelector(`[aria-label="${label}"]`);
const button = (text) => [...container.querySelectorAll('button')].find((b) => b.textContent === text);
const click = async (text) => { const b = button(text); assert.ok(b, text); await settle(() => Simulate.click(b)); };
const change = async (label, value) => {
  const node = find(label); assert.ok(node, label);
  await settle(() => { node.value = value; Simulate.change(node, { target: node }); });
};
const submit = () => settle(() => ref.current.submitForm());
const check = (condition, message) => { assert.ok(condition, message); ++checks; };
let checks = 0;
(async () => {
  await render();
  check(container.textContent.includes('No site permissions assigned'), 'blank policy accurately described');
  await click('Set site access'); await click('Add site');
  await change('Scope type', 'entity'); await change('Site', siteId);
  await change('Scope type', 'venue');
  check(find('Site').value === '', 'scope change clears selected site');
  await submit();
  check(requests.length === 0, 'incomplete site blocked before API');
  check(container.textContent.includes('Select a site and at least one permission.'), 'validation displayed');
  await change('Site', siteId); await change('Permission preset', 'operator');
  await settle(() => ref.current.setFieldValue('notes', [{ text: 'Existing', isNew: false }, { text: 'New', isNew: true }]));
  await change('name', 'Updated user'); await change('description', 'Updated description'); await change('currentPassword', 'Replacement123!');
  const descendants = [...container.querySelectorAll('input[type=checkbox]')].find((node) => node.parentElement.textContent.includes('Include child sites'));
  await settle(() => Simulate.change(descendants, { target: { checked: true } }));
  await submit();
  const saved = requests.at(-1);
  check(saved.url === 'user/viewer-a', 'real mutation hook uses user API');
  check(saved.body.name === 'Updated user' && saved.body.description === 'Updated description' && saved.body.currentPassword === 'Replacement123!', 'profile/password fields preserved');
  check(saved.body.notes.length === 1 && saved.body.notes[0].text === 'New', 'only new notes submitted');
  check(saved.body.expectedPolicyRevision === 7, 'optimistic revision sent');
  const savedPolicy = JSON.parse(saved.body.securityPolicy);
  check(savedPolicy.grants[0].scopeId === siteId && savedPolicy.grants[0].includeDescendants, 'site and descendants saved');
  check(savedPolicy.grants[0].capabilities.includes('devices.reboot') && !savedPolicy.grants[0].capabilities.includes('resources.write'), 'operator supported capabilities');
  check(!container.textContent.includes('Manage site users') && !container.textContent.includes('Run diagnostics'), 'unsupported capabilities not offered');
  await render({ ...target, securityPolicy: JSON.stringify(savedPolicy) });
  await change('Permission preset', 'editor');
  check(!ref.current.values.securityPolicy.includes('devices.reboot') && ref.current.values.securityPolicy.includes('configuration.write'), 'editor preset edits configuration without reboot');
  const secrets = [...container.querySelectorAll('input[type=checkbox]')].find((node) => node.parentElement.textContent.includes('View secrets'));
  await settle(() => Simulate.change(secrets, { target: { checked: true } }));
  check(find('Permission preset').value === 'custom' && ref.current.values.securityPolicy.includes('secrets.read'), 'advanced capability switches preset to custom');
  await click('Remove'); await submit();
  check(JSON.parse(requests.at(-1).body.securityPolicy).grants.length === 0, 'explicit empty grants revoke');
  await render(); await change('name', 'Profile only'); await submit();
  check(!('securityPolicy' in requests.at(-1).body) && !('expectedPolicyRevision' in requests.at(-1).body), 'unchanged access omitted');
  check(requests.at(-1).body.currentPassword === undefined, 'blank password omitted');
  await render(); await click('Set site access'); await click('Add site'); await change('Site', siteId);
  for (const checkbox of [...container.querySelectorAll('input[type=checkbox]')].filter((n) => n.checked))
    await settle(() => Simulate.change(checkbox, { target: { checked: false } }));
  const before = requests.length; await submit(); check(requests.length === before, 'empty capability grant blocked');
  await render({ ...target, securityPolicyChange: undefined }); await click('Set site access'); await submit();
  check(requests.length === before, 'missing revision blocked');
  actor = { id: 'admin-a', userRole: 'admin' }; await render();
  check(button('Set site access').disabled && find('name').disabled, 'non-root controls disabled');
  await settle(() => ref.current.setFieldValue('name', 'Forced')); await submit();
  check(requests.length === before, 'non-root programmatic submit denied');
  actor = { id: 'root-a', userRole: 'root' }; await render({ ...target, id: 'root-a' });
  check(button('Set site access').disabled, 'self access protected');
  await render({ ...target, userRole: 'root' }); check(container.textContent.includes('Full administrator access.') && !button('Add site'), 'root access protected');
  loadError = true; await render({ ...target, securityPolicy: JSON.stringify(savedPolicy) });
  check(find('Site').disabled && container.textContent.includes('Sites could not be loaded.'), 'site loading error visible'); loadError = false;
  await render({ ...target, securityPolicy: '{unsupported}' });
  check(container.textContent.includes('Unsupported access policy'), 'malformed policy preserved with warning');
  await change('name', 'Safe profile edit'); await submit(); check(!('securityPolicy' in requests.at(-1).body), 'legacy malformed policy not overwritten by profile edits');
  failSave = true; const closesBefore = closed;
  await render(); await click('Set site access'); await click('Add site'); await change('Site', siteId); await submit();
  check(closed === closesBefore && ref.current.values.securityPolicy.includes(siteId) && !ref.current.isSubmitting, 'failed save retains edits and clears busy state');
  check(document.body.textContent.includes('Policy revision changed'), 'backend conflict surfaced');
  await settle(() => root.unmount());
  console.log(`PASS ${checks} real React/Formik/Chakra and user API interaction checks`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
