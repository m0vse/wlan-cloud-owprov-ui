const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/helpers/mloConfiguration.js', 'utf8').replace(/export /g, '') + '\nthis.check = mloConfigurationError;', context);
const config = { mlo: true, 'wifi-bands': ['5G', '6G'], 'bss-mode': 'ap', encryption: { proto: 'sae', ieee80211w: 'required', key: 'preserve-test-key' } };
const before = JSON.stringify(config);
assert.equal(context.check(config), null);
assert.equal(JSON.stringify(config), before, 'validation must not rewrite the PSK/security');
assert.equal(context.check({}), null);
assert.equal(context.check({ ...config, mlo: false, 'wifi-bands': ['2G'] }), null);
for (const bands of [['5G'], ['6G'], ['2G', '5G', '6G'], ['5G', '5G'], ['5G-upper', '6G'], null])
  assert.match(context.check({ ...config, 'wifi-bands': bands }), /exactly/);
assert.match(context.check({ ...config, 'bss-mode': 'sta' }), /AP-mode/);
assert.match(context.check({ ...config, purpose: 'onboarding-ap' }), /user-defined/);
assert.match(context.check({ ...config, roaming: { 'message-exchange': 'ds' } }), /roaming/);
assert.match(context.check({ ...config, 'multi-psk': [{ key: 'test' }] }), /Multi-PSK/);
assert.match(context.check({ ...config, services: ['captive'] }), /Captive/);
assert.equal(context.check({ ...config, services: ['dhcp'] }), null);
assert.match(context.check(config, { 'hostapd-bss-raw': ['mld_ap=0'] }), /hostapd/);
assert.equal(context.check({ ...config, roaming: false, 'multi-psk': [] }, { 'hostapd-bss-raw': [] }), null);
for (const proto of ['psk2', 'sae-mixed', 'none', 'wpa3'])
  assert.match(context.check({ ...config, encryption: { ...config.encryption, proto } }), /WPA3/);
assert.match(context.check({ ...config, encryption: { ...config.encryption, ieee80211w: 'optional' } }), /management/);
const root = 'src/pages/ConfigurationPage/ConfigurationCard/ConfigurationSectionsCard/InterfaceSection/';
assert.match(fs.readFileSync(root + 'interfacesConstants.js', 'utf8'), /mlo: bool\(\)\.default\(undefined\)/);
assert.match(fs.readFileSync(root + 'SingleInterface/SsidList/SingleSsid.jsx', 'utf8'), /<MloSettings/);
assert.match(fs.readFileSync('src/components/Modals/Resources/Sections/InterfaceSsid/Form.tsx', 'utf8'), /<MloSettings/);
assert.match(fs.readFileSync('src/components/FormFields/MloSettings.tsx', 'utf8'), /falseIsUndefined/);
assert.match(fs.readFileSync(root + 'SingleInterface/SsidList/LockedAdvanced.jsx', 'utf8'), /data\?\.mlo/);
// Exercise the actual Yup SSID schema, not just the shared validation helper.
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (/^(constants|utils|helpers)\//.test(request)) {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const file = path.resolve('src', request + ext);
      if (fs.existsSync(file)) return file;
    }
  }
  return originalResolve.call(this, request, ...args);
};
for (const ext of ['.ts', '.tsx', '.js']) {
  const original = Module._extensions[ext] || Module._extensions['.js'];
  Module._extensions[ext] = function(module, filename) {
    if (!filename.startsWith(path.resolve('src') + path.sep)) return original(module, filename);
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, filename);
  };
}
const schema = require(path.resolve(root + 'interfacesConstants.js')).INTERFACE_SSID_SCHEMA((key) => key, true);
const valid = { ...config, name: 'MLO test', services: [] };
const saved = JSON.parse(JSON.stringify(schema.validateSync(valid)));
assert.equal(saved.mlo, true);
assert.equal(saved.encryption.key, valid.encryption.key);
assert.deepEqual(saved['wifi-bands'], ['5G', '6G']);
assert.equal(Object.hasOwn(schema.cast({ name: 'Legacy' }), 'mlo'), false);
assert.throws(() => schema.validateSync({ ...valid, 'wifi-bands': ['5G'] }), /MLO/);
assert.throws(() => schema.validateSync({ ...valid, roaming: true }), /roaming/);
assert.throws(() => schema.validateSync({ ...valid, services: ['captive'] }), /Captive/);
console.log('PASS: MLO optional/off compatibility, 5+6 GHz/AP/SAE/PMF validation, no credential rewrite and shared resource/config controls');
