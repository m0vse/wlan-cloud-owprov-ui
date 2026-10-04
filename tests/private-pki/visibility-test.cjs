/* Execute the actual route/page/navigation guards with mocked UI primitives. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
let role = 'root';
let enabled = 'true';
let requests = 0;
function textOf(element) {
  if (typeof element === 'string') return element;
  if (!element || typeof element !== 'object') return '';
  return (element.children || []).flat(Infinity).map(textOf).join('');
}
const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), lazy: () => 'LazyPage' };
const chakra = new Proxy({ useColorModeValue: (first) => first }, { get: (target, key) => target[key] || key });
function load(relative) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const requireMock = (name) => {
    if (name === 'react') return { __esModule: true, default: react, ...react };
    if (name === '@chakra-ui/react') return chakra;
    if (name === 'contexts/AuthProvider') return { useAuth: () => ({ user: role ? { userRole: role } : undefined }) };
    if (name === 'react-i18next') return { useTranslation: () => ({ t: (value) => value }) };
    if (name === 'utils/axiosInstances') return { axiosProv: { get: () => { requests++; throw Error('unexpected request'); }, post: () => { requests++; throw Error('unexpected mutation'); } } };
    if (name === '@tanstack/react-query') return {};
    return new Proxy({}, { get: (_, key) => key === '__esModule' ? true : key });
  };
  vm.runInNewContext(code, { exports, require: requireMock, window: { _env_: { REACT_APP_PRIVATE_PKI_ENABLED: enabled } } });
  return exports.default;
}
function subLinks(element, result = []) {
  if (!element || typeof element !== 'object') return result;
  if (element.props?.route?.path) result.push(element.props.route.path);
  for (const child of element.children || []) {
    if (Array.isArray(child)) child.forEach((item) => subLinks(item, result));
    else subLinks(child, result);
  }
  return result;
}
for (const flag of ['true', 'false', undefined]) {
  enabled = flag;
  for (const userRole of ['root', 'admin', 'partner', 'csr', 'system', undefined]) {
    role = userRole;
    const Page = load('src/pages/CertificatesPage/index.tsx');
    const page = Page();
    assert.strictEqual(typeof page.type === 'function', role === 'root');
    if (!role) assert(textOf(page).includes('Waiting for'));
    else if (role !== 'root') assert(textOf(page).includes(`account role as ${role}`));
    const routes = load('src/router/routes.tsx');
    const group = routes.find((route) => route.id === 'system-group');
    const Nested = load('src/layout/Sidebar/NestedNavButton/index.tsx');
    const links = subLinks(Nested({ isActive: () => false, route: group }));
    assert.strictEqual(links.includes('/certificates'), role === 'root');
    if (['root', 'admin', 'partner'].includes(role)) assert(links.includes('/systemConfiguration'));
  }
}
assert.strictEqual(requests, 0);
console.log('PASS: actual page and navigation guards, 18 flag/role combinations; denied users make no PKI requests; existing System navigation preserved');
