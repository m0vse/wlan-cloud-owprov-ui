# ow-prov
# Private AP certificate lifecycle

The visible root-only **System → AP certificates** page is deployed as a UI-only
addition. Its admin-only backend is connected for real CA status, retained public
AP certificate observations, audit and Root-reviewed qualification evidence.
Enrollment, renewal, revocation and retirement remain unavailable while controller
service-account permissions and AP activation are integrated. The page uses the existing provisioning login/token
and new `pki/status`, `pki/audit` and `pki/authorize` backend contracts. The
navigation entry uses the same Root account role as the existing portal menus;
its visibility does not depend on a separate runtime feature flag. Backend OWSEC root
authorization is mandatory; hiding navigation never grants or denies access.

The page displays configured root names/fingerprints, retained trust, issued AP
certificates/expiry and operator audit records. Enrollment authorization stays in
memory, expires from view and is never written to browser storage. Live actions
remain unavailable until the backend reports real gateway enforcement.

The issuer foundation is in the owned deployment repository's `private-pki/`.
Only its admin-only portal adapter is production deployed. PKI requests use the
portal origin and reuse the existing authenticated provisioning client; no human
token is copied to persistent server storage. Gateway admission/session
revocation, fresh candidate management acceptance, AP activation/rollback,
renewal orchestration and fleet root retirement remain integration work. A
certificate shown as **Issued** is not proof of gateway acceptance or migration.

Runtime configuration is generated portably and JSON-escaped. The portal uses
hash routing: open `/#/certificates` on the portal origin for direct certificate
page access. Opening `/certificates` without the hash loads the Inventory route.
Missing `/api/` paths and asset files still return 404.
Both navigation and direct certificate page access require root role; the backend
must independently validate OWSEC authorization when deployed.

Run `node tests/private-pki/visibility-test.cjs` with installed portal dependencies
for the 18 flag/role guard checks. The deployed image layers the certificate page
on the existing live resource/copy UI; six live source differences are preserved
and recorded in a private deployment manifest, not silently overwritten.

The normal onboarding flow is select AP → Onboard, with resumable progress and
Cancel. Approval is durable until completion/cancellation; no operator countdown,
CSR upload, grant copying or qualification form is exposed. The current worker
still awaits controller/AP integration and reports that waiting state honestly.

## Controller login handoff

The controller's provisioning button can pass its current session to a new portal
tab using browser messages. The receiver accepts only its exact opener on the same
HTTPS hostname's standard controller port, matching a random per-opening nonce.
It replaces any previous portal account with tab-scoped credentials and then
disconnects the opener. Credentials are never added to the URL or persistent
storage; existing server-side profile and permission checks still apply. A direct
visit uses the normal portal login. Both UIs must be updated together.
