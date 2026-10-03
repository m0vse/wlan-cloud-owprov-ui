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
  const inventory = Array.from({ length: 205 }, (_, n) => ({ id: `id-${n}` }));
  const pages = [];
  assert.equal((await context.collectInventoryIds(async () => 205, async (offset, limit) => {
    pages.push(offset); return inventory.slice(offset, offset + limit);
  })).length, 205);
  assert.deepEqual(pages, [0, 100, 200]);
  assert.equal((await context.collectInventoryIds(async () => 0, async () => { throw new Error('Unexpected page'); })).length, 0);
  await assert.rejects(context.collectInventoryIds(async () => 1, async () => []));
  await assert.rejects(context.collectInventoryIds(async () => 2, async () => [{ id: 'a' }, { id: 'a' }]));
  await assert.rejects(context.collectInventoryIds(async () => -1, async () => []));
  let countReads = 0;
  await assert.rejects(context.collectInventoryIds(async () => ++countReads, async () => [{ id: 'a' }]));
  const names = {};
  const resolved = await context.resolveSerials(['inventory-uuid-a', 'inventory-uuid-b'], async () => [
    { id: 'inventory-uuid-a', serialNumber: '000456994617', name: ' Phil Test E410 ' },
    { id: 'inventory-uuid-b', serialNumber: 'fc1165bea5be' },
    { id: 'outside-scope', serialNumber: 'DO-NOT-PUSH' },
  ], ({ serial, name }) => { names[serial] = name; });
  assert.deepEqual(Array.from(resolved), ['000456994617', 'fc1165bea5be']);
  assert.deepEqual(names, { '000456994617': 'Phil Test E410', fc1165bea5be: '' });
  await assert.rejects(context.resolveSerials(['missing'], async () => []));
  await assert.rejects(context.resolveSerials(['duplicate'], async () => [{ id: 'duplicate', serialNumber: 'a' }, { id: 'duplicate', serialNumber: 'b' }]));
  const batches = [];
  await context.resolveSerials(Array.from({ length: 101 }, (_, n) => `id-${n}`), async (ids) => {
    batches.push(ids.length);
    return ids.map((id) => ({ id, serialNumber: id.replace('id-', 'serial-') }));
  });
  assert.deepEqual(batches, [100, 1]);
  let calls = [];
  const results = await context.pushTargets(['a', 'b', 'c', 'd'], async (s) => {
    calls.push(s);
    if (s === 'b') return { errorCode: 7 };
    if (s === 'c') throw { response: { status: 403 } };
    return { errorCode: 0 };
  }, () => {}, 1);
  assert.deepEqual(Array.from(results, (r) => r.status), ['Sent', 'Failed', 'Failed', 'Skipped']);
  assert.deepEqual(calls, ['a', 'b', 'c']);
  let active = 0;
  let maxActive = 0;
  const fleet = Array.from({ length: 55 }, (_, n) => `ap-${n}`);
  const parallel = await context.pushTargets(fleet, async () => {
    active++; maxActive = Math.max(active, maxActive);
    await Promise.resolve();
    active--;
    return { errorCode: 0 };
  }, () => {});
  assert.equal(maxActive, 20);
  assert.equal(parallel.length, 55);
  assert.deepEqual(Array.from(parallel, (r) => r.serial), fleet);
  assert.ok(parallel.every((r) => r.status === 'Sent'));
  calls = [];
  const stopped = await context.pushTargets(fleet, async (serial) => {
    calls.push(serial);
    if (serial === 'ap-0') throw { response: { status: 403 } };
    await Promise.resolve();
    return { errorCode: 0 };
  }, () => {});
  assert.equal(calls.length, 20); // Already in-flight requests complete; no more are dispatched.
  assert.equal(stopped.filter((r) => r.status === 'Skipped').length, 35);
  const page = fs.readFileSync('src/components/Tables/InventoryTable/BulkPushConfig/index.tsx', 'utf8');
  assert.match(page, /title="Push config"/);
  assert.match(page, /<Th>AP name<\/Th>/);
  assert.match(page, /names\[serial\] \|\| 'Unnamed AP'/);
  const button = page.match(/<IconButton[^>]+/)[0];
  assert.doesNotMatch(button, /size="sm"|borderRadius=/);
  assert.match(page, /encodeURIComponent\(serial\)/);
  for (const kind of ['Entity', 'Venue']) assert.match(fs.readFileSync(`src/pages/${kind}Page/Layout/InventoryCard/index.tsx`, 'utf8'), /<BulkPushConfig/);
  const inventoryPage = fs.readFileSync('src/pages/InventoryPage/Table/index.tsx', 'utf8');
  assert.match(inventoryPage, /<BulkPushConfig loadIds={loadScopeIds}/);
  assert.match(inventoryPage, /Filter by entity/);
  assert.match(inventoryPage, /Filter by venue/);
  console.log('PASS: complete hierarchy, deduplication, fail-closed scope, per-AP results, authorization stop and both buttons');
})().catch((error) => { console.error(error); process.exit(1); });
