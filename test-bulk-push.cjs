const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/components/Tables/InventoryTable/BulkPushConfig/helpers.js', 'utf8');
const context = { Set, Error };
vm.createContext(context);
vm.runInContext(source.replace(/export /g, ''), context);
(async () => {
  const nodes = {
    'entity:e': { devices: ['a'], children: ['child'], venues: ['v'] },
    'entity:child': { devices: ['b'], children: ['e'], venues: [] },
    'venue:v': { devices: ['a', 'c'], children: ['sub'] },
    'venue:sub': { devices: ['d'], children: [] },
  };
  assert.deepEqual(Array.from(await context.collectTargets('entity', 'e', async (k, id) => nodes[`${k}:${id}`])), ['a', 'b', 'c', 'd']);
  await assert.rejects(context.collectTargets('venue', 'bad', async () => undefined));
  let calls = [];
  const results = await context.pushTargets(['a', 'b', 'c', 'd'], async (s) => {
    calls.push(s);
    if (s === 'b') return { errorCode: 7 };
    if (s === 'c') throw { response: { status: 403 } };
    return { errorCode: 0 };
  }, () => {});
  assert.deepEqual(Array.from(results, (r) => r.status), ['Sent', 'Failed', 'Failed', 'Skipped']);
  assert.deepEqual(calls, ['a', 'b', 'c']);
  const page = fs.readFileSync('src/components/Tables/InventoryTable/BulkPushConfig/index.tsx', 'utf8');
  assert.match(page, /title="Push config"/);
  assert.match(page, /encodeURIComponent\(serial\)/);
  for (const kind of ['Entity', 'Venue']) assert.match(fs.readFileSync(`src/pages/${kind}Page/Layout/InventoryCard/index.tsx`, 'utf8'), /<BulkPushConfig/);
  console.log('PASS: complete hierarchy, deduplication, fail-closed scope, per-AP results, authorization stop and both buttons');
})().catch((error) => { console.error(error); process.exit(1); });
