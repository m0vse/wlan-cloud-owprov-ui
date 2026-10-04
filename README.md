# ow-prov
# Private AP certificate lifecycle (source only)

The root-only `/certificates` page uses the existing provisioning login/token
and new `pki/status`, `pki/audit` and `pki/authorize` backend contracts. The
navigation entry is disabled unless `REACT_APP_PRIVATE_PKI_ENABLED=true` is
supplied through the normal private runtime configuration. Backend OWSEC root
authorization is mandatory; hiding navigation never grants or denies access.

The page displays configured root names/fingerprints, retained trust, issued AP
certificates/expiry and operator audit records. Enrollment authorization stays in
memory, expires from view and is never written to browser storage. Live actions
remain unavailable until the backend reports real gateway enforcement.

The issuer foundation is in the owned deployment repository's `private-pki/`.
It is isolated-tested, not production deployed. Gateway admission/session
revocation, fresh candidate management acceptance, AP activation/rollback,
renewal orchestration and fleet root retirement remain integration work. A
certificate shown as **Issued** is not proof of gateway acceptance or migration.
