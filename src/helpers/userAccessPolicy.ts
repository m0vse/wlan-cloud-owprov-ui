export const accessCapabilities = [
  ['devices.read', 'Devices'], ['clients.read', 'Clients'], ['configuration.read', 'View configuration'],
  ['configuration.write', 'Edit configuration'], ['configuration.push', 'Push configuration'],
  ['devices.reboot', 'Reboot'], ['firmware.read', 'View firmware'], ['firmware.upgrade', 'Upgrade firmware'],
  ['diagnostics.read', 'View diagnostics'], ['diagnostics.run', 'Run diagnostics'], ['devices.console', 'Console'],
  ['enrollment.manage', 'Enrolment'], ['resources.write', 'Edit resources'], ['resources.delete', 'Delete resources'],
  ['resources.move', 'Move resources'], ['users.manage', 'Manage site users'], ['secrets.read', 'View secrets'],
  ['rrm.read', 'View RRM'], ['rrm.manage', 'Manage RRM'],
] as const;

// Retain all known policy keys when reading existing policies, but offer only
// capabilities with enforced controller handlers in this deployment.
export const editableAccessCapabilities = accessCapabilities.filter(([key]) =>
  ['devices.read', 'clients.read', 'configuration.read', 'configuration.write', 'configuration.push',
    'devices.reboot', 'firmware.read', 'firmware.upgrade', 'diagnostics.read', 'secrets.read', 'rrm.read'].includes(key));

export type AccessGrant = {
  scopeType: 'entity' | 'venue';
  scopeId: string;
  includeDescendants: boolean;
  capabilities: string[];
};
export type AccessPolicy = { version: 1; grants: AccessGrant[] };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const known = new Set<string>(accessCapabilities.map(([key]) => key));
export const accessPreset = (name: string) => {
  const viewer = ['devices.read', 'clients.read', 'configuration.read', 'firmware.read', 'diagnostics.read', 'rrm.read'];
  if (name === 'viewer') return viewer;
  if (name === 'editor') return [...viewer, 'configuration.write'];
  if (name === 'operator') return [...viewer, 'configuration.write', 'configuration.push', 'devices.reboot'];
  return [];
};
export const validAccessPolicy = (value: unknown, draft = false): value is AccessPolicy => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as AccessPolicy;
  if (Object.keys(policy).sort().join(',') !== 'grants,version' || policy.version !== 1 ||
      !Array.isArray(policy.grants) || policy.grants.length > 256) return false;
  return policy.grants.every((grant) => grant && typeof grant === 'object' &&
    Object.keys(grant).sort().join(',') === 'capabilities,includeDescendants,scopeId,scopeType' &&
    ['entity', 'venue'].includes(grant.scopeType) && typeof grant.scopeId === 'string' && (draft || uuidPattern.test(grant.scopeId)) &&
    typeof grant.includeDescendants === 'boolean' && Array.isArray(grant.capabilities) && (draft || grant.capabilities.length > 0) &&
    grant.capabilities.length <= accessCapabilities.length &&
    grant.capabilities.every((capability) => typeof capability === 'string' && known.has(capability)) &&
    new Set(grant.capabilities).size === grant.capabilities.length);
};
export const parseAccessPolicy = (text: string, draft = false): AccessPolicy | null => {
  if (!text || new TextEncoder().encode(text).length > 65536) return null;
  try {
    const policy: unknown = JSON.parse(text);
    return validAccessPolicy(policy, draft) ? policy : null;
  } catch { return null; }
};
export const grantPreset = (grant: AccessGrant) => ['viewer', 'editor', 'operator'].find((name) =>
  [...accessPreset(name)].sort().join(',') === [...grant.capabilities].sort().join(',')) ?? 'custom';
export const canEditAccess = (actor: { id: string; userRole: string } | undefined,
  target: { id: string; userRole: string }) => actor?.userRole === 'root' && target.userRole !== 'root' && actor.id !== target.id;

export const hasAccessCapability = (user: { userRole: string; securityPolicy: string } | undefined, capability: string) =>
  user?.userRole === 'root' || !!parseAccessPolicy(user?.securityPolicy ?? '')?.grants.some((grant) => grant.capabilities.includes(capability));

// Navigation eligibility only. Individual records and actions remain authorized
// by the controller, including descendant scopes and device ownership.
export const canAccessRoute = (user: { userRole: string; securityPolicy: string } | undefined,
  route: { id: string; authorized: string[] }) => {
  if (!user) return false;
  if (user.userRole === 'root') return true;
  const policy = parseAccessPolicy(user.securityPolicy ?? '');
  if (user.userRole === 'subscriber' && !policy) return route.authorized.includes('subscriber');
  if (route.id === 'account-page') return true;
  if (!policy || policy.grants.length === 0) return false;
  const capabilities = new Set(policy.grants.flatMap((grant) => grant.capabilities));
  if (route.id === 'entity-page' || route.id === 'venue-page')
    return editableAccessCapabilities.some(([capability]) => capabilities.has(capability));
  const pageCapabilities: Record<string, string[]> = {
    'inventory-page': ['devices.read', 'clients.read', 'configuration.push', 'devices.reboot', 'firmware.upgrade', 'diagnostics.read'],
    'map-page': ['devices.read'],
    'configuration-page': ['configuration.read', 'configuration.write', 'configuration.push'],
  };
  return (pageCapabilities[route.id] ?? []).some((capability) => capabilities.has(capability));
};
