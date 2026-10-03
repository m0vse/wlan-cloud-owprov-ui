// Resolve the whole selected hierarchy, not only the visible inventory page.
export async function collectTargets(kind, id, read) {
  const seen = new Set();
  const devices = new Set();
  async function visit(type, uuid) {
    const key = `${type}:${uuid}`;
    if (seen.has(key)) return;
    if (seen.size >= 1000) throw new Error('Hierarchy is too large');
    seen.add(key);
    const node = await read(type, uuid);
    if (!node || !Array.isArray(node.devices)) throw new Error('Unable to read device scope');
    node.devices.forEach((serial) => { if (typeof serial === 'string' && serial) devices.add(serial); });
    for (const child of node.children ?? []) await visit(type, child);
    if (type === 'entity') for (const venue of node.venues ?? []) await visit('venue', venue);
  }
  await visit(kind, id);
  return [...devices].sort();
}

// Entity/venue devices contain inventory UUIDs, not gateway serial numbers.
export async function resolveSerials(ids, readInventory) {
  const serials = new Set();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const tags = await readInventory(batch);
    if (!Array.isArray(tags)) throw new Error('Unable to resolve inventory');
    for (const id of batch) {
      const matches = tags.filter((tag) => tag.id === id);
      if (matches.length !== 1 || typeof matches[0].serialNumber !== 'string' || !matches[0].serialNumber)
        throw new Error('Incomplete inventory mapping');
      serials.add(matches[0].serialNumber);
    }
  }
  return [...serials].sort();
}

export async function pushTargets(targets, push, progress) {
  const results = [];
  let denied = false;
  for (const serial of targets) {
    let result;
    if (denied) result = { serial, status: 'Skipped', detail: 'Access denied earlier in this batch' };
    else {
      try {
        const response = await push(serial);
        result = response?.errorCode === 0
          ? { serial, status: 'Sent', detail: response?.warnings?.length ? 'Controller returned warnings' : '' }
          : { serial, status: 'Failed', detail: `Controller error ${response?.errorCode ?? 'unknown'}` };
      } catch (error) {
        const code = error?.response?.status;
        denied = code === 401 || code === 403;
        result = { serial, status: 'Failed', detail: denied ? 'Access denied' : 'Request failed; check the AP before retrying' };
      }
    }
    results.push(result);
    progress([...results]);
  }
  return results;
}
