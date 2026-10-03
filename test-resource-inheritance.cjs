const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const filename = './src/contexts/ConfigurationProvider/inheritedResources.ts';
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(filename, module);
loaded._compile(compiled, filename);
const { collectInheritedResourceIds } = loaded.exports;
const owners = {
  'venue:site': { id: 'site', variables: [], entity: 'customer' },
  'venue:child': { id: 'child', variables: ['local'], parent: 'site' },
  'entity:customer': { id: 'customer', variables: ['ssid', 'duplicate'], parent: 'root' },
  'entity:root': { id: 'root', variables: ['common', 'duplicate'] },
  'entity:other': { id: 'other', variables: ['private-other-customer'] },
};
const seen = [];
const read = async (kind, id) => { seen.push(`${kind}:${id}`); return owners[`${kind}:${id}`]; };
(async () => {
  assert.deepEqual(await collectInheritedResourceIds({ venue: 'site' }, read), ['ssid', 'duplicate', 'common']);
  assert.deepEqual(seen, ['venue:site', 'entity:customer', 'entity:root']);
  assert.deepEqual(await collectInheritedResourceIds({ venue: 'child' }, read), ['local', 'ssid', 'duplicate', 'common']);
  assert.deepEqual(await collectInheritedResourceIds({ entity: 'customer' }, read), ['ssid', 'duplicate', 'common']);
  assert.deepEqual(await collectInheritedResourceIds({}, read), []);
  assert.deepEqual(await collectInheritedResourceIds({ entity: 'other' }, read), ['private-other-customer']);
  await assert.rejects(collectInheritedResourceIds({ entity: 'cycle' }, async (_, id) => ({ id, parent: id })), /hierarchy/);
  await assert.rejects(collectInheritedResourceIds({ entity: 'customer' }, async () => { throw new Error('403'); }), /403/);
  await assert.rejects(collectInheritedResourceIds({ entity: 'customer' }, async () => ({ id: 'other' })), /selected scope/);
  await assert.rejects(collectInheritedResourceIds({ entity: '0' }, async (_, id) => ({ id, parent: String(Number(id) + 1) })), /hierarchy/);
  console.log('PASS: 9 resource-ancestry controls, no writes or unrelated-customer enumeration');
})().catch((error) => { console.error(error); process.exitCode = 1; });
