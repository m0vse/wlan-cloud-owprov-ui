/* Real venue/SMS components and query hooks; only transport/auth are synthetic. */
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
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaults = () => ({ enabled: false, emails: [], phones: [], groupBy: 'venue', groupWindowSeconds: 60,
  rules: ['down', 'critical', 'radio'].map(type => ({ type, enabled: true, delaySeconds: 300, recoveryDelaySeconds: 60, repeatSeconds: 0, recovery: true, email: true, sms: false })),
  quietHours: { enabled: false, timezone: 'Europe/London', start: '22:00', end: '08:00', days: [1,2,3,4,5,6,7] }, muteUntil: 0 });
let actor = { id: 'root-alerts', userRole: 'root', securityPolicy: '' }, venueId = 'venue-a', kind = 'venue', failGet = false, failPut = false, smsFail = false;
let gets = [], puts = [], posts = [], configured = {}, venues = { 'venue-a': defaults(), 'venue-b': { ...defaults(), emails: ['other@example.invalid'] }, 'entity-a': { ...defaults(), emails: ['site@example.invalid'] } };
let sms = { configured: false, enabled: false, accountSid: '', fromNumber: '', tokenSet: false };
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'contexts/AuthProvider') return { useAuth: () => ({ user: actor }) };
  if (name === 'utils/axiosInstances') return {
    axiosProv: {
      get: async (url) => { gets.push(url); if (failGet) throw { response: { status: 403 } }; const id = url.split('/')[1].split('?')[0];
        return { data: { settings: clone(venues[id]), available: true, configured: !!configured[id], inherited: !configured[id], sourceScope: { kind: 'entity', id: 'parent', name: 'Parent site' }, events: id === 'venue-a' ? [{ id: 'evt1', type: 'down', device: 'ap-a', name: 'Front AP', status: 'accepted', channel: 'email', recipient: 'operator@example.invalid', time: 1700000000, recovery: true }] : [] } }; },
      put: async (url, payload) => { puts.push({ url, payload: clone(payload) }); if (failPut) throw new Error('private-server-detail'); const id = url.split('/')[1].split('?')[0];
        configured[id] = !payload.inherit; venues[id] = payload.inherit ? { ...defaults(), emails: ['inherited@example.invalid'] } : clone(payload);
        return { data: { settings: clone(venues[id]), available: true, configured: !!configured[id], inherited: !configured[id], events: [] } }; },
    },
    axiosSec: {
      get: async (url) => { assert.equal(url, 'smsSettings'); gets.push(url); return { data: { ...sms, token: 'server-token-do-not-display' } }; },
      put: async (url, payload) => { assert.equal(url, 'smsSettings'); puts.push({ url, payload: clone(payload) }); if (failPut) throw new Error('secret failure');
        sms = { ...payload, configured: true, tokenSet: payload.tokenAction === 'set' ? true : payload.tokenAction === 'clear' ? false : sms.tokenSet };
        return { data: { ...sms, token: 'server-token-do-not-display' } }; },
      post: async (url, payload) => { posts.push({ url, payload }); if (smsFail) throw new Error('server-token-do-not-display'); return { data: { accepted: true } }; },
    },
  };
  if (/^(components|helpers|hooks|constants|models|utils|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
for (const extension of ['.ts', '.tsx', '.jsx']) Module._extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename);
const Venue = require('./src/pages/VenuePage/Layout/Alerts/index.tsx').default;
const Sms = require('./src/pages/SmsSettingsPage/index.tsx').default;
const { splitRecipients, validateAlertSettings } = require('./src/helpers/venueAlerts.ts');
let root, container, client, page = 'venue', checks = 0;
const check = (condition, label) => { assert.ok(condition, label); ++checks; };
const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise(resolve => setTimeout(resolve, 35)); });
const view = () => React.createElement(ChakraProvider, null, React.createElement(QueryClientProvider, { client }, page === 'venue' ? React.createElement(Venue, { id: venueId, kind }) : React.createElement(Sms)));
const render = async (fresh = true) => {
  if (fresh) { if (root) { await settle(() => root.unmount()); client.clear(); } document.body.innerHTML = ''; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } }, logger: { log() {}, warn() {}, error() {} } }); }
  await settle(() => root.render(view())); await settle();
};
const find = (name) => container.querySelector(`[aria-label="${name}"]`) || container.querySelector(`#${name}`);
const change = (name, value) => settle(() => { const input = find(name); assert.ok(input, name); input.value = value; Simulate.change(input, { target: input }); });
const toggle = (name, checked) => settle(() => { const input = find(name); assert.ok(input, name); Simulate.change(input, { target: { checked } }); });
const click = (name) => settle(() => Simulate.click(find(name)));
const edit = () => click('toggle-edit');
const save = async () => { await click('save'); await settle(); };
const discard = async () => { await edit(); const dialog = document.querySelector('[role="alertdialog"]'); assert.ok(dialog); await settle(() => Simulate.click([...dialog.querySelectorAll('button')].find(button => button.textContent === 'common.confirm'))); };
(async () => {
  check(JSON.stringify(splitRecipients('a@example.invalid, a@example.invalid\nb@example.invalid')) === JSON.stringify(['a@example.invalid', 'b@example.invalid']), 'recipient list deduplicates');
  check(!validateAlertSettings(defaults()), 'defaults validate without enabling delivery');
  check(validateAlertSettings({ ...defaults(), emails: ['name:part@example.invalid'] }).includes('valid email'), 'email validation agrees with native parser');
  check(validateAlertSettings({ ...defaults(), quietHours: { ...defaults().quietHours, days: [] } }).includes('quiet days'), 'empty quiet days rejected consistently');
  await render();
  check(find('alert-emails').disabled && find('save').hidden, 'venue uses read-only heading and shared edit controls');
  check(container.textContent.includes('Provider accepted') && container.textContent.includes('Front AP'), 'delivery history does not claim handset delivery');
  check(container.textContent.includes('AP offline cleared'), 'delivery history distinguishes recovery from fault');
  check(validateAlertSettings({ ...defaults(), emails: Array.from({length:21}, (_, i) => `user${i}@example.invalid`) }).includes('20 recipients'), 'recipient cap agrees with backend');
  check(container.textContent.includes('Inherited from Parent site'), 'inherited policy identified concisely');
  await edit(); await toggle('Enable alerts', true); await save();
  check(puts.length === 0 && container.textContent.includes('Add an email recipient'), 'enabled rules require channel recipients');
  await change('alert-emails', 'bad email'); await save(); check(puts.length === 0 && container.textContent.includes('valid email'), 'invalid email blocked');
  await change('alert-emails', 'operator@example.invalid, operator@example.invalid\nsecond@example.invalid');
  await change('AP offline delaySeconds', '2'); await change('AP offline recoveryDelaySeconds', '3'); await change('AP offline repeatSeconds', '15');
  await change('alert-group-by', 'entity'); await change('alert-group-window', '90');
  await save();
  check(puts.length === 1 && puts[0].payload.emails.length === 2 && puts[0].payload.enabled, 'actual hook saves validated deduplicated recipients');
  check(puts[0].payload.rules[0].delaySeconds === 120 && puts[0].payload.rules[0].recoveryDelaySeconds === 180 && puts[0].payload.rules[0].repeatSeconds === 900, 'minute inputs serialized as seconds independently');
  check(puts[0].payload.groupBy === 'entity' && puts[0].payload.groupWindowSeconds === 90 && find('alert-emails').disabled, 'email grouping saved and editing closes');
  await edit(); await change('alert-timezone', 'Not/AZone'); await save(); check(puts.length === 1 && container.textContent.includes('valid time zone'), 'invalid IANA timezone blocked');
  await change('alert-timezone', 'Europe/London'); await change('AP offline delaySeconds', '0.5'); await save(); check(puts.length === 1, 'fractional minutes blocked');
  await change('AP offline delaySeconds', '2'); await change('alert-phones', '07700123456'); await save(); check(puts.length === 1 && container.textContent.includes('international'), 'SMS requires international recipient');
  await change('alert-phones', '+447700123456'); await toggle('AP offline sms', true); await save();
  check(puts.length === 2 && puts[1].payload.rules[0].sms && puts[1].payload.phones[0] === '+447700123456', 'SMS per-rule channel saved');
  await edit(); await change('alert-emails', 'discard@example.invalid'); await discard();
  check(find('alert-emails').value.includes('operator@example.invalid') && puts.length === 2, 'discard restores saved values without write');
  await edit(); const inheritButton = [...container.querySelectorAll('button')].find(button => button.textContent === 'Use inherited rules');
  check(!!inheritButton, 'configured override offers inherited rules'); await settle(() => Simulate.click(inheritButton)); await settle();
  check(JSON.stringify(puts.at(-1).payload) === JSON.stringify({ inherit: true }) && find('alert-emails').value === 'inherited@example.invalid' && find('alert-emails').disabled, 'clear override uses explicit inherit contract and displays parent settings');
  await edit(); await change('alert-emails', 'unsaved@example.invalid'); venueId = 'venue-b'; await render(false);
  check(find('alert-emails').disabled && find('alert-emails').value === 'other@example.invalid' && !container.textContent.includes('Front AP'), 'venue change clears draft, edit mode and previous delivery history');
  failGet = true; await settle(() => client.invalidateQueries(['venue-alerts'])); await settle();
  check(!find('alert-emails') && !container.textContent.includes('other@example.invalid') && container.textContent.includes('could not be loaded'), '403 refresh hides all stale venue data');
  failGet = false;
  kind = 'entity'; venueId = 'entity-a'; await render(); await edit(); await change('alert-group-window', '120'); await save();
  check(puts.at(-1).url === 'entity/entity-a?alerts=true' && puts.at(-1).payload.groupWindowSeconds === 120, 'same actual Alerts card saves entity policy through entity endpoint');
  kind = 'venue'; venueId = 'venue-b';
  actor = { id: 'viewer', userRole: 'noc', securityPolicy: JSON.stringify({version:1,grants:[{scopeType:'venue',scopeId:'11111111-1111-1111-1111-111111111111',includeDescendants:false,capabilities:['devices.read']}]}) };
  await render(); check(find('alert-emails').disabled && !find('toggle-edit'), 'read-only scoped user cannot edit');
  actor = { id: 'denied', userRole: 'noc', securityPolicy: '' }; const beforeDenied = gets.length; await render();
  check(!find('alert-emails') && gets.length === beforeDenied, 'user without device read cannot request venue settings');
  page = 'sms'; actor = { id: 'root-alerts', userRole: 'root', securityPolicy: '' }; await render();
  check(find('sms-account').value === '' && find('sms-from').value === '' && find('sms-enabled').value === 'disabled', 'SMS blank by default and disabled');
  check(!JSON.stringify(client.getQueryData(['sms-settings', actor.id])).includes('server-token'), 'GET token dropped from query cache');
  await edit(); await change('sms-enabled', 'enabled'); await save(); check(container.textContent.includes('valid Twilio account'), 'Twilio SID validation');
  await change('sms-account', `AC${'a'.repeat(32)}`); await change('sms-from', '+441234567890'); await save(); check(container.textContent.includes('Set an auth token'), 'enabling requires stored or replacement token');
  await change('sms-token-action', 'set'); await change('sms-token', 'synthetic-test-token'); await save();
  check(sms.enabled && sms.tokenSet && puts.at(-1).payload.token === 'synthetic-test-token', 'explicit replacement token sent');
  check(!find('sms-token') && find('sms-token-action').value === 'retain' && !container.innerHTML.includes('synthetic-test-token'), 'saved token cleared from form');
  check(!JSON.stringify(client.getMutationCache().getAll().map(mutation => mutation.state)).includes('synthetic-test-token'), 'replacement token not retained in mutation cache');
  const testButton = () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('Send test SMS'));
  check(testButton().disabled && posts.length === 0, 'SMS tests never autosend');
  await change('sms-test-recipient', '+447700123456'); await settle(() => Simulate.click(testButton()));
  check(posts.length === 1 && JSON.stringify(posts[0].payload) === JSON.stringify({recipient:'+447700123456'}) && container.textContent.includes('Twilio accepted'), 'explicit test sends recipient only and reports provider acceptance');
  smsFail = true; await settle(() => Simulate.click(testButton())); check(container.textContent.includes('Test SMS failed') && !container.textContent.includes('server-token'), 'SMS test error sanitized'); smsFail = false;
  await edit(); await change('sms-from', '+441234567891'); check(testButton().disabled, 'unsaved SMS settings cannot be tested'); await save();
  check(puts.at(-1).payload.tokenAction === 'retain' && !Object.hasOwn(puts.at(-1).payload, 'token'), 'ordinary save retains existing token without retransmission');
  await edit(); await change('sms-token-action', 'clear'); const beforeClear = puts.length; await save(); check(puts.length === beforeClear, 'enabled token clearing blocked');
  await change('sms-enabled', 'disabled'); await save(); check(!sms.enabled && !sms.tokenSet, 'disabled explicit token clear allowed');
  await edit(); await change('sms-from', '+441234567892'); failPut = true; await save(); check(container.textContent.includes('could not be saved') && !container.textContent.includes('secret failure'), 'save failures generic without secret'); failPut = false;
  await discard(); check(find('sms-from').value === sms.fromNumber && find('sms-from').disabled, 'SMS discard restores public saved fields');
  actor = { id: 'viewer', userRole: 'noc', securityPolicy: '' }; const beforeRoot = gets.length; await render();
  check(container.textContent.includes('Administrator access is required') && gets.length === beforeRoot, 'SMS page root-only before fetching');
  await settle(() => root.unmount()); client.clear(); console.log(`PASS ${checks} venue alerts and SMS real component interactions`);
})().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
