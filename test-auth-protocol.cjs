const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const filename = './src/helpers/authProtocol.ts';
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { encryptionForProtocol } = loaded.exports;
const keys = ['psk', 'psk2', 'psk-mixed', 'psk2-radius', 'sae', 'sae-mixed'];
for (const from of keys) for (const to of keys) {
  const current = { proto: from, key: 'test-password-not-a-real-secret' };
  assert.equal(encryptionForProtocol(to, current, keys, ['sae', 'sae-mixed']).key, current.key);
  assert.equal(current.proto, from);
}
assert.equal(encryptionForProtocol('psk2', { key: 'newly-edited-password' }, keys, []).key, 'newly-edited-password');
assert.equal(encryptionForProtocol('sae', undefined, keys, ['sae']).key, '');
assert.equal(encryptionForProtocol('sae', { key: '' }, keys, ['sae']).key, '');
assert.equal(encryptionForProtocol('sae', { key: 'test' }, keys, ['sae']).ieee80211w, 'required');
for (const proto of ['none', 'owe', 'wpa2']) {
  assert.equal(encryptionForProtocol(proto, { key: 'test' }, keys, []).key, undefined);
}
const source = fs.readFileSync('src/pages/ConfigurationPage/ConfigurationCard/ConfigurationSectionsCard/InterfaceSection/SingleInterface/SsidList/Encryption/index.tsx', 'utf8');
assert.match(source, /e.target.value, encryptionValue, ENCRYPTION_PROTOS_REQUIRE_KEY/);
assert.match(source, /\[encryptionValue, onEncryptionChange/);
assert.doesNotMatch(source, /YOUR_SECRET/);
console.log('PASS: PSK preserved across all personal auth transitions, current edits retained, no invented password, open/enterprise keys omitted');
