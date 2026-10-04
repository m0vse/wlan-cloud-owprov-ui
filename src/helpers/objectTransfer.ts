export type TransferObject = {
  id: string;
  name: string;
  entity?: string;
  venue?: string;
  [key: string]: unknown;
};

export type Destination = { type: 'entity' | 'venue' | 'ap'; id: string };

// Deliberately omit IDs, usage lists, audit fields and source ownership on copies.
export function copyPayload(
  source: TransferObject,
  kind: 'configuration' | 'resource',
  name: string,
  destination: Destination,
) {
  const keys =
    kind === 'configuration'
      ? ['description', 'notes', 'tags', 'deviceTypes', 'deviceRules', 'configuration', 'variables']
      : ['description', 'notes', 'tags', 'variables'];
  const payload: Record<string, unknown> = { name: name.trim(), entity: '', venue: '' };
  for (const key of keys) if (source[key] !== undefined) payload[key] = JSON.parse(JSON.stringify(source[key]));
  if (destination.type !== 'ap') payload[destination.type] = destination.id;
  return payload;
}

export function movePayload(source: TransferObject, destination: Destination) {
  if (destination.type === 'ap') throw new Error('AP destinations support copying configurations only.');
  return {
    id: source.id,
    name: source.name,
    entity: destination.type === 'entity' ? destination.id : '',
    venue: destination.type === 'venue' ? destination.id : '',
  };
}

export function sameParent(source: TransferObject, destination: Destination) {
  return destination.type !== 'ap' && source[destination.type] === destination.id;
}

type TransferApi = {
  get: (url: string) => Promise<{ data: TransferObject }>;
  post: (url: string, payload: unknown) => Promise<{ data: TransferObject }>;
  put: (url: string, payload: unknown) => Promise<unknown>;
  delete: (url: string) => Promise<unknown>;
};

export async function copyConfigurationToAp(
  api: TransferApi,
  source: TransferObject,
  name: string,
  serial: string,
  expectedConfiguration: string,
) {
  const inventoryUrl = `inventory/${encodeURIComponent(serial)}`;
  const { data: ap } = await api.get(inventoryUrl);
  if ((ap.deviceConfiguration || '') !== expectedConfiguration)
    throw new Error('The AP configuration changed. Reopen this dialog and confirm again.');
  if (
    Array.isArray(source.deviceTypes) &&
    !source.deviceTypes.includes(ap.deviceType) &&
    !source.deviceTypes.includes('*')
  )
    throw new Error(
      'This configuration does not include the destination AP model. Copy to its entity or venue and edit the device types first.',
    );
  const payload = copyPayload(source, 'configuration', name, { type: 'ap', id: serial });
  payload.deviceTypes = [ap.deviceType];
  const { data: copied } = await api.post('configuration/0', payload);
  if (!copied.id) throw new Error('The server did not return an ID for the copy. No AP assignment attempted.');
  try {
    // Explicit assignment updates the old and new usage lists. The nested creation
    // route does not reliably remove the old usage entry on this server version.
    const { data: rechecked } = await api.get(inventoryUrl);
    if ((rechecked.deviceConfiguration || '') !== expectedConfiguration)
      throw new Error('The AP configuration changed during copying.');
    await api.put(inventoryUrl, { name: ap.name || serial, devClass: ap.devClass, deviceConfiguration: copied.id });
    const { data: assigned } = await api.get(inventoryUrl);
    if (assigned.deviceConfiguration !== copied.id) throw new Error('Could not verify the AP assignment.');
  } catch (error) {
    // A lost response can follow a successful write. Never delete a copy without
    // knowing whether it is assigned; leave a clear ID for operator recovery.
    throw new Error(
      `Could not verify replacement; copy ${copied.id} retained. Refresh before retrying. ${
        error instanceof Error ? error.message : ''
      }`,
    );
  }
  let cleanupWarning = '';
  if (expectedConfiguration && expectedConfiguration !== source.id) {
    try {
      const { data: old } = await api.get(`configuration/${encodeURIComponent(expectedConfiguration)}`);
      if (!old.entity && !old.venue && !old.subscriber && Array.isArray(old.inUse) && old.inUse.length === 0) {
        // The server also refuses deletion while the config is in use.
        await api.delete(`configuration/${encodeURIComponent(expectedConfiguration)}`);
      }
    } catch {
      cleanupWarning = 'Replacement succeeded, but the old configuration could not be removed.';
    }
  }
  return cleanupWarning;
}
