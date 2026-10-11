const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const path = require('node:path');
const file = path.resolve('src/helpers/userAccessPolicy.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleObject = new Module(file);
moduleObject._compile(compiled, file);
const api = moduleObject.exports;
let checks = 0;
const check = (condition) => { assert.ok(condition); ++checks; };
const grant = { scopeType: 'venue', scopeId: '11111111-1111-4111-8111-111111111111',
  includeDescendants: false, capabilities: api.accessPreset('viewer') };
const policy = { version: 1, grants: [grant] };
check(api.validAccessPolicy(policy));
check(api.parseAccessPolicy(JSON.stringify(policy)) !== null);
check(api.validAccessPolicy({ version: 1, grants: [] }));
for (const capabilities of [['*'], ['devices.read', 'devices.read'], ['firmware.publish'], ['controller.manage'], [false], []])
  check(!api.validAccessPolicy({ version: 1, grants: [{ ...grant, capabilities }] }));
for (const value of [null, {}, [], { ...policy, version: true }, { ...policy, version: 2 },
  { ...policy, admin: true }, { ...policy, grants: [null] }, { ...policy, grants: 'all' }]) check(!api.validAccessPolicy(value));
for (const scopeId of ['', '*', '0000-0000-0000', 'not-a-site'])
  check(!api.validAccessPolicy({ version: 1, grants: [{ ...grant, scopeId }] }));
check(!api.validAccessPolicy({ version: 1, grants: [{ ...grant, includeDescendants: 'false' }] }));
check(api.parseAccessPolicy(JSON.stringify(policy) + '{}') === null);
check(api.parseAccessPolicy('') === null);
check(api.parseAccessPolicy('not json', true) === null);
// Draft rows must remain editable while the save validator rejects them.
const draft = JSON.stringify({ version: 1, grants: [{ ...grant, scopeId: '', capabilities: [] }] });
check(api.parseAccessPolicy(draft, true) !== null);
check(api.parseAccessPolicy(draft) === null);
const actor = { id: 'root-a', userRole: 'root' };
check(api.canEditAccess(actor, { id: 'viewer-a', userRole: 'csr' }));
check(!api.canEditAccess(actor, actor));
check(!api.canEditAccess(actor, { id: 'root-b', userRole: 'root' }));
check(!api.canEditAccess({ id: 'operator-a', userRole: 'noc' }, { id: 'viewer-a', userRole: 'csr' }));
for (const name of ['viewer', 'editor', 'operator']) {
  check(api.grantPreset({ ...grant, capabilities: api.accessPreset(name) }) === name);
  for (const capability of ['firmware.upgrade', 'devices.console', 'secrets.read', 'users.manage'])
    check(!api.accessPreset(name).includes(capability));
}
const form = fs.readFileSync('src/pages/UsersPage/Table/EditUserModal/Form.tsx', 'utf8');
check(form.includes('expectedPolicyRevision: selectedUser.securityPolicyChange'));
check(form.includes('securityPolicy !== selectedUser.securityPolicy && canEditAccess(user, selectedUser)'));
check(form.includes('<AccessEditor disabled={formIsDisabled() || !canEditAccess(user, selectedUser)}'));
console.log(`PASS ${checks} access editor and policy validation checks`);
