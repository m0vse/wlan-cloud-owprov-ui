/* Actual SMTP page/Formik/network hooks; only authenticated transport is synthetic. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
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
let actor = { id: 'root-smtp', userRole: 'root' }, gets = 0, puts = [], posts = [], fail = false, testFail = false, releaseTest;
const empty = { configured: false, enabled: false, host: '', port: null, tlsMode: '', sender: '', username: '', authMethod: '', passwordSet: false };
let stored = { ...empty };
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'contexts/AuthProvider') return { useAuth: () => ({ user: actor }) };
  if (name === 'utils/axiosInstances') return { axiosSec: {
    post: async (url, payload) => {
      assert.equal(url, 'emailSettings'); posts.push(payload);
      if (releaseTest) await new Promise((resolve) => { releaseTest = resolve; });
      if (testFail) throw { response: { data: { ErrorDescription: 'server-secret-never-returned-to-form' } } };
      return { data: { accepted: true } };
    },
    get: async (url) => { assert.equal(url, 'emailSettings'); ++gets; return { data: { ...stored, password: 'server-secret-never-returned-to-form' } }; },
    put: async (url, payload) => {
      assert.equal(url, 'emailSettings'); puts.push(payload);
      if (fail) throw { response: { status: 400, data: { ErrorDescription: 'server-secret-never-returned-to-form' } }, config: { data: payload } };
      stored = { ...payload, configured: true, passwordSet: payload.passwordAction === 'set' ? true : payload.passwordAction === 'clear' ? false : stored.passwordSet };
      return { data: { ...stored, password: 'server-secret-never-returned-to-form' } };
    },
  } };
  if (/^(components|helpers|hooks|constants|models|utils|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx', '.jsx']) Module._extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename);
const Page = require('./src/pages/EmailSettingsPage/index.tsx').default;
const { canAccessRoute } = require('./src/helpers/userAccessPolicy.ts');
let root, container, client;
const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
const render = async () => {
  if (root) { await settle(() => root.unmount()); client.clear(); }
  document.body.innerHTML = ''; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } });
  await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client }, React.createElement(Page)))));
  await settle();
};
const find = (name) => container.querySelector(`[aria-label="${name}"]`);
const change = (name, value) => settle(() => { const input = find(name); assert.ok(input, name); input.value = value; Simulate.change(input, { target: input }); });
const submit = () => settle(() => Simulate.submit(container.querySelector('form')));
const edit = () => settle(() => Simulate.click(find('toggle-edit')));
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); ++checks; };
(async () => {
  await render();
  for (const field of ['enabledChoice', 'host', 'port', 'tlsMode', 'sender', 'senderName', 'username', 'authMethod']) check(find(field).value === '', `${field} blank initially`);
  check(find('host').disabled && find('save').hidden, 'settings initially read-only with shared header buttons');
  await edit(); check(!find('host').disabled && !find('save').hidden, 'shared edit button enables settings');
  check(!find('password') && !container.textContent.includes('server-secret-never-returned-to-form'), 'stored secret never echoed');
  check(!JSON.stringify(client.getQueryData(['email-settings', actor.id])).includes('server-secret-never-returned-to-form'), 'password dropped from query state');
  await submit(); check(puts.length === 0 && container.textContent.includes('Choose enabled or disabled.'), 'blank settings rejected with visible validations');
  await change('enabledChoice', 'enabled'); await change('host', 'smtp.example.invalid'); await change('port', '2525');
  await change('tlsMode', 'starttls'); await change('sender', 'sender@example.invalid'); await change('authMethod', 'login'); await change('username', 'example-user');
  await change('senderName', 'OpenWiFi Operations');
  await submit(); check(puts.length === 0, 'enabled authentication requires password');
  await change('passwordAction', 'set'); await change('password', 'synthetic-smtp-secret');
  await settle(() => Simulate.click(find('save')));
  for (let i = 0; i < 8 && !container.textContent.includes('Email settings saved.'); ++i) await settle();
  check(puts.length === 1 && puts[0].enabled === true && puts[0].port === 2525 && puts[0].tlsMode === 'starttls', 'explicit settings saved through actual mutation hook');
  check(puts[0].senderName === 'OpenWiFi Operations' && find('senderName').value === 'OpenWiFi Operations' && find('host').disabled, 'From name saved and successful save exits edit mode');
  check(puts[0].passwordAction === 'set' && puts[0].password === 'synthetic-smtp-secret', 'password sent only as deliberate replacement');
  check(!find('password') && find('passwordAction').value === 'retain' && !container.innerHTML.includes('synthetic-smtp-secret'), 'successful save clears replacement password');
  check(container.textContent.includes('A password is stored.'), 'only stored-password indicator shown');
  const testButton = () => [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Send test email'));
  check(find('Test recipient').value === '' && testButton().disabled, 'test recipient blank and required');
  await change('Test recipient', 'not an email'); check(testButton().disabled, 'invalid test recipient disabled');
  await change('Test recipient', 'operator@example.invalid');
  releaseTest = true;
  await settle(() => Simulate.click(testButton()));
  check(testButton().disabled && posts.length === 1, 'pending send disabled');
  check(JSON.stringify(posts[0]) === JSON.stringify({ recipient: 'operator@example.invalid' }), 'test sends only recipient, no credentials');
  await settle(() => { const resolve = releaseTest; releaseTest = undefined; resolve(); });
  check(container.textContent.includes('SMTP accepted the test email.'), 'success describes SMTP acceptance, not inbox delivery');
  testFail = true; await settle(() => Simulate.click(testButton()));
  check(container.textContent.includes('Test email failed.') && !container.textContent.includes('server-secret'), 'test failure shown without server details');
  await edit();
  await change('host', 'edited.example.invalid'); check(testButton().disabled && container.textContent.includes('Save changes before testing.'), 'unsaved configuration cannot be tested');
  await change('host', 'smtp.example.invalid'); testFail = false;
  await change('sender', 'updated@example.invalid'); await submit();
  check(puts.at(-1).passwordAction === 'retain' && !Object.hasOwn(puts.at(-1), 'password') && stored.passwordSet, 'ordinary save retains secret without resending it');
  await edit();
  await change('passwordAction', 'clear'); const beforeClear = puts.length; await submit();
  check(puts.length === beforeClear && container.textContent.includes('Disable SMTP or authentication'), 'enabled authenticated password clearing rejected');
  await change('enabledChoice', 'disabled'); await submit();
  check(puts.at(-1).enabled === false && puts.at(-1).passwordAction === 'clear' && !stored.passwordSet, 'explicit disabled password clearing saved');
  check(testButton().disabled, 'disabled SMTP cannot be tested');
  await edit();
  await change('port', '65536'); const beforeInvalid = puts.length; await submit(); check(puts.length === beforeInvalid, 'out-of-range port blocked');
  await change('port', '2525'); await change('sender', 'not an email'); await submit(); check(puts.length === beforeInvalid, 'invalid sender blocked');
  await change('sender', 'final@example.invalid'); fail = true; await submit();
  check(container.textContent.includes('could not be saved') && !container.textContent.includes('server-secret-never-returned-to-form') && find('sender').value === 'final@example.invalid', 'server rejection retains entries and shows credential-safe error');
  const beforeCancel = puts.length;
  await edit();
  check(!!document.querySelector('[role="alertdialog"]'), 'dirty cancellation uses shared discard confirmation');
  await settle(() => Simulate.click([...document.querySelectorAll('[role="alertdialog"] button')].find((button) => button.textContent === 'common.confirm')));
  check(find('host').disabled && find('sender').value === stored.sender && puts.length === beforeCancel, 'cancel restores saved values without a write');
  actor = { id: 'scoped-user', userRole: 'noc' }; const beforeGets = gets; await render();
  check(!container.querySelector('form') && container.textContent.includes('Administrator access is required.') && gets === beforeGets, 'nonroot page denial sends no API request');
  check(!canAccessRoute({ ...actor, securityPolicy: '' }, { id: 'system-email', authorized: ['root'] }) &&
    canAccessRoute({ id: 'root-smtp', userRole: 'root', securityPolicy: '' }, { id: 'system-email', authorized: ['root'] }), 'SMTP route root-only');
  await settle(() => root.unmount()); client.clear();
  console.log(`PASS ${checks} real SMTP blank-default/root/save/secret/rejection interactions`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
