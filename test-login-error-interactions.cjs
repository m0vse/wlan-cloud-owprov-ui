/* Actual LoginForm + Formik and native input interaction, synthetic auth mutation. */
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
const { useField } = require('formik');
let code = 4, activeForms = [];
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'react-i18next') return { useTranslation: () => ({ t: (key) => key }) };
  if (name === 'contexts/AuthProvider') return { useAuth: () => ({ setToken: () => { throw new Error('Unexpected login success'); } }) };
  if (name === 'hooks/useApiRequirements') return { __esModule: true, default: () => ({ accessPolicyLink: '', passwordPolicyLink: '' }) };
  if (name === 'hooks/Network/Login') return { useLogin: () => {
    const [error, setError] = React.useState();
    return { error, mutateAsync: async (_, { onError }) => { const response = { response: { status: 403, data: { ErrorCode: code } } }; setError(response); onError(response); } };
  } };
  if (name === 'components/FormFields/StringField') return { __esModule: true, default: ({ name }) => {
    const [props] = useField(name); return React.createElement('input', { ...props, 'aria-label': name });
  } };
  if (/^(models|hooks|constants|contexts)\//.test(name)) name = path.resolve('src', name);
  return originalLoad.call(this, name, parent, isMain);
};
Module._extensions['.tsx'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText, filename);
const { LoginForm } = require('./src/pages/LoginPage/LoginForm.tsx');
const settle = async (cb) => act(async () => { if (cb) await cb(); await new Promise((resolve) => setTimeout(resolve, 40)); });
let checks = 0;
(async () => {
  for (const testCode of [4, 2, 1]) {
    code = testCode; activeForms = []; document.body.innerHTML = '<div id="app"></div>';
    const root = createRoot(document.getElementById('app'));
    await settle(() => root.render(React.createElement(ChakraProvider, null, React.createElement(LoginForm, { setActiveForm: (value) => activeForms.push(value) }))));
    for (const [name, value] of [['email', 'test@example.invalid'], ['password', 'synthetic-login-password']])
      await settle(() => { const input = document.querySelector(`[aria-label="${name}"]`); input.value = value; Simulate.change(input, { target: input }); });
    await settle(() => Simulate.submit(document.querySelector('form')));
    if (code === 4) { assert.ok(document.body.textContent.includes('login.waiting_for_email_verification')); assert.ok(!document.body.textContent.includes('login.invalid_credentials')); checks += 2; }
    if (code === 2) { assert.ok(document.body.textContent.includes('login.invalid_credentials')); assert.ok(!document.body.textContent.includes('login.waiting_for_email_verification')); checks += 2; }
    if (code === 1) { assert.equal(activeForms[0]?.form, 'change-password'); ++checks; }
    await settle(() => root.unmount());
  }
  console.log(`PASS ${checks} real pending4/invalid2/password-change1 login interactions`);
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
