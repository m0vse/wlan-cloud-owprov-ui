const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = './src/helpers/objectTransfer.ts';
const loaded = new Module(path, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  path,
);
const { copyPayload, movePayload, sameParent, copyConfigurationToAp } = loaded.exports;
const source = {
  id: 'original',
  name: 'Original',
  entity: 'old',
  venue: '',
  created: 1,
  modified: 2,
  inUse: ['device'],
  configurations: ['configuration'],
  managementPolicy: 'old-policy',
  subscriber: 'subscriber',
  inventory: 'device',
  subscriberOnly: true,
  deviceTypes: ['cambium_e410'],
  variables: ['resource-id'],
  configuration: [{ name: 'radios', weight: 25, configuration: '{"radios":[]}' }],
};
const clone = copyPayload(source, 'configuration', ' Copy ', { type: 'venue', id: 'site' });
assert.equal(clone.name, 'Copy');
assert.equal(clone.entity, '');
assert.equal(clone.venue, 'site');
for (const key of [
  'id',
  'created',
  'modified',
  'inUse',
  'configurations',
  'managementPolicy',
  'subscriber',
  'inventory',
  'subscriberOnly',
])
  assert.equal(clone[key], undefined);
assert.deepEqual(clone.configuration, source.configuration);
clone.configuration[0].weight = 99;
assert.equal(source.configuration[0].weight, 25);
assert.deepEqual(clone.variables, ['resource-id']);
const resource = { ...source, variables: [{ type: 'json', prefix: 'radio', weight: 12, value: '{"band":"5G"}' }] };
const copiedResource = copyPayload(resource, 'resource', 'Radio', { type: 'entity', id: 'root' });
assert.deepEqual(copiedResource.variables, resource.variables);
copiedResource.variables[0].weight = 70;
assert.equal(resource.variables[0].weight, 12);
assert.equal(copiedResource.configuration, undefined);
assert.deepEqual(movePayload(source, { type: 'venue', id: 'site' }), {
  id: 'original',
  name: 'Original',
  entity: '',
  venue: 'site',
});
assert.deepEqual(movePayload(source, { type: 'entity', id: 'root' }), {
  id: 'original',
  name: 'Original',
  entity: 'root',
  venue: '',
});
assert.throws(() => movePayload(source, { type: 'ap', id: 'device' }));
assert.equal(sameParent(source, { type: 'entity', id: 'old' }), true);
assert.equal(sameParent(source, { type: 'venue', id: 'site' }), false);
const ui = fs.readFileSync('src/components/Modals/ObjectTransfer.tsx', 'utf8');
assert.match(ui, /copyConfigurationToAp\(axiosProv/);
assert.match(ui, /!confirmed/);
assert.doesNotMatch(ui, /axiosProv.delete|pushConfig|pushConfiguration/);
assert.match(ui, /kind === 'configuration' && mode === 'copy'/);
for (const file of [
  'src/pages/ConfigurationPage/ConfigurationCard/index.jsx',
  'src/pages/EntityPage/Layout/ConfigurationCard/EntityConfigurations.tsx',
  'src/pages/VenuePage/Layout/Configuration/ConfigurationsTable.tsx',
  'src/pages/EntityPage/Layout/ConfigurationCard/ResourceActions.tsx',
  'src/pages/VenuePage/Layout/Resources/ResourceActions.tsx',
  'src/components/Modals/Resources/EditModal/index.tsx',
  'src/components/CustomFields/SpecialConfigurationManager/index.jsx',
])
  assert.match(fs.readFileSync(file, 'utf8'), /ObjectTransfer/);
async function run() {
  for (const scenario of [
    'normal',
    'shared',
    'used',
    'source',
    'changed',
    'assign-fails',
    'verify-fails',
    'cleanup-fails',
  ]) {
    const calls = [];
    let reads = 0;
    let created = false;
    let assigned = false;
    const oldId = scenario === 'source' ? source.id : 'old-config';
    const api = {
      async get(url) {
        calls.push(['get', url]);
        if (url.startsWith('inventory/')) {
          reads++;
          return {
            data: {
              id: 'ap',
              name: 'AP',
              deviceType: 'cambium_e410',
              devClass: 'AP',
              deviceConfiguration:
                scenario === 'changed' ? 'changed' : assigned && scenario !== 'verify-fails' ? 'copy-id' : oldId,
            },
          };
        }
        return {
          data: {
            id: oldId,
            entity: scenario === 'shared' ? 'entity' : '',
            venue: '',
            inUse: scenario === 'used' ? ['other'] : [],
          },
        };
      },
      async post(url, payload) {
        calls.push(['post', url, payload]);
        created = true;
        return { data: { id: 'copy-id' } };
      },
      async put(url, payload) {
        calls.push(['put', url, payload]);
        if (scenario === 'assign-fails') throw new Error('lost response');
        assigned = true;
      },
      async delete(url) {
        calls.push(['delete', url]);
        if (scenario === 'cleanup-fails') throw new Error('cleanup failed');
      },
    };
    if (['changed', 'assign-fails', 'verify-fails'].includes(scenario)) {
      await assert.rejects(copyConfigurationToAp(api, source, 'copy', 'serial', oldId));
      assert.equal(
        calls.some(([method]) => method === 'delete'),
        false,
      );
      if (scenario === 'changed') assert.equal(created, false);
    } else {
      const warning = await copyConfigurationToAp(api, source, 'copy', 'serial', oldId);
      assert.equal(assigned, true);
      assert.equal(
        calls.some(([method]) => method === 'delete'),
        ['normal', 'cleanup-fails'].includes(scenario),
      );
      assert.equal(!!warning, scenario === 'cleanup-fails');
    }
  }
  console.log(
    'PASS: independent copies/weights, identity-preserving moves, AP assignment verification, unused-only cleanup, shared/source protection, failure recovery; no AP pushes',
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
