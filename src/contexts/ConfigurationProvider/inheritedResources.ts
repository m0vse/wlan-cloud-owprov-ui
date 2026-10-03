type Scope = { entity?: string; venue?: string };

export const inventoryResourceScope = (owner?: string): Scope => {
  const [kind, id, extra] = (owner ?? '').split(':');
  if (!id || extra !== undefined) return {};
  if (kind === 'ven') return { venue: id };
  if (kind === 'ent') return { entity: id };
  return {};
};
type ResourceOwner = { id: string; variables?: string[]; entity?: string; parent?: string };
type ReadOwner = (kind: 'entity' | 'venue', id: string) => Promise<ResourceOwner>;

// Read only the selected owner and its ancestry; never enumerate other customers.
export const collectInheritedResourceIds = async (scope: Scope, readOwner: ReadOwner): Promise<string[]> => {
  const resources = new Set<string>();
  const visited = new Set<string>();
  let kind: 'entity' | 'venue' = scope.venue ? 'venue' : 'entity';
  let id = scope.venue || scope.entity;
  while (id) {
    const key = `${kind}:${id}`;
    if (visited.has(key) || visited.size >= 64) throw new Error('Invalid resource-owner hierarchy');
    visited.add(key);
    const owner = await readOwner(kind, id);
    if (owner.id !== id) throw new Error('Resource owner does not match selected scope');
    (owner.variables ?? []).forEach((resourceId) => resources.add(resourceId));
    if (kind === 'venue' && owner.entity) {
      kind = 'entity';
      id = owner.entity;
    } else {
      id = owner.parent;
    }
  }
  return [...resources];
};
