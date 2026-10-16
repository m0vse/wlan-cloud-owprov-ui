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

## Email and SMS alerts

1. An administrator configures **System → Email** for SMTP and, optionally,
   **System → SMS** for Twilio. Settings start blank and delivery is disabled.
   Save before using **Send test email** or **Send test SMS**. Test messages are
   sent only when clicked. Twilio requires an account SID, auth token and sender
   number; phone numbers include `+` and the country code. Stored credentials are
   never displayed. Ordinary saves retain them unless replacement or clearing is
   explicitly selected.
2. Open an entity or venue's **Alerts** card and select **Edit**. Enable alerts,
   enter up to 20 email and/or SMS recipients per channel, then select delivery
   channels and timing for **AP offline**, **Critical fault** and **Radio fault**.
   Separate recipients with commas or new lines. **Save** applies the policy;
   cancelling edits discards changes after confirmation.
3. Configure a parent entity for shared site defaults. A venue inherits the
   nearest configured parent venue or entity policy until its own policy is
   saved. A disabled local policy also overrides its parent. **Use inherited
   rules** removes the local override; it is available when editing an unchanged
   local policy. The card identifies inherited settings.

Each rule has an initial fault delay, recovery delay, optional repeat interval
(`0` disables repeats), and optional recovery messages. Times in the rule table
are minutes. A recovery is sent only after that recipient's fault notification
was accepted. New policies default to disabled, with a five-minute fault delay,
one-minute recovery delay and no repeats. No AP settings or firmware are changed.

**Group emails by** combines notifications for a venue or entity and the same
explicitly configured recipient. The grouping window is in seconds, defaults to
60, and is added after each rule's delay; `0` disables batching. For example, a
five-minute offline delay and 60-second grouping window normally send after
about six minutes, plus the collector's polling interval and provider latency.
SMS notifications remain individual. Unrelated recipients do not receive the
other sites' grouped notifications.

Quiet hours use the selected IANA time zone and weekdays, including overnight
periods. **Mute until** uses the operator browser's local time. Both suppress
delivery without disabling fault observation. Faults that clear before delivery
do not produce a delayed obsolete outage message. Missing, stale or unavailable
telemetry is not treated as proof of a healthy AP or a failed AP.

**Delivery history** lists recent queued, accepted, retried, cancelled or failed
attempts visible within the current access scope. **Provider accepted** means
SMTP or Twilio accepted the request, not that an inbox or handset received it.
An ambiguous send result, or a restart during an in-flight send, is held rather
than automatically resent, preventing duplicate notification storms. Check
provider logs before taking any manual resend action. If the card reports alerts
unavailable, delivery is paused; an administrator should investigate service
logs and the alert-state storage rather than resetting APs.

Viewing policies requires device-read access; editing requires resource-write
access to that entity or venue. Central SMTP/Twilio settings require root access.
The backend enforces these permissions independently of the buttons.
