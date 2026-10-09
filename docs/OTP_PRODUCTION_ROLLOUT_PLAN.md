# Clubvel controlled production OTP deployment plan (draft)

**Status: NO-GO. No production deployment authorised or performed.**

## Scope and evidence
- Production Railway GitHub source: `main`, backend root, auto-deploy enabled (previously visually verified).
- Production `main` legacy OTP returns predictable `1234` in mock mode and stores challenges in process memory. This must be replaced; do not rely on a config flag alone.
- Newer `person-first-final` uses purpose-bound, database-backed challenges and staging-only mock delivery.
- `main` and development diverged (development 57 commits ahead, 1 behind at inspection). No direct merge without compatibility review.
- Security branch `fix/otp-fail-closed-20261009` adds explicit live non-mock acknowledgement check, hides public mock OTP status and includes Twilio dependency fixes.
- Offline unit tests and CI workflow are committed; execution results must be collected before claiming pass.

## Required GO gates
1. **Tests**: run `cd backend && python -m unittest discover -s tests -p 'test_otp_delivery_security.py' -v`; capture exact results. Add tests for resend, expiry, wrong-purpose codes, max attempts, replay, concurrent consume, phone aliases, and rate limiting. Review failure handling if provider acknowledges send but DB write fails.
2. **Security review**: inspect every registration/forgot/reset endpoint and ensure mock OTP cannot be issued or disclosed in production. Confirm no logging of codes or secrets. Validate OTP state shared across workers.
3. **Dependency/build**: verify Twilio installation in the actual Railway builder and compatibility with Python version; run complete backend tests and staging smoke tests.
4. **Delivery**: with explicit approval for test messages, validate live SMS and WhatsApp senders, verified South African destination permissions, provider failure behavior, fallback, and rate limits. No test sends before approval.
5. **Data and compatibility**: read-only audit of production collections, phone normalization/aliases, indexes, secret/encryption key continuity, account registration states and old APK compatibility. Prepare an encrypted, verified restore-point backup. Do not paste secret values into issues or logs.
6. **Release isolation**: reconcile diverged branches on a dedicated release candidate, inspect diffs, and stage to Railway staging first. Validate registration, sign-in, password reset, invitation and contribution/claim flows using nonproduction accounts.
7. **Operations**: designate maintenance window, rollback owner and post-deploy checks; prepare known-good production commit SHA and recovery instructions. Understand whether DB migrations are backward-compatible before choosing rollback.

## Controlled deployment procedure (only after explicit approval)
1. Freeze production writes where required; record current production commit, deployment ID and backend image. Verify backup/restore and rollback readiness.
2. Confirm approved release commit and exact Railway environment; review diff and required variables without displaying secrets.
3. Deploy a reviewed release candidate through a deliberate, controlled production promotion (avoid accidental `main` push with auto-deploy). Confirm build success and service health.
4. Perform approved low-risk smoke tests using designated test accounts; verify OTP issuance/consumption, login, reset and legacy-client behavior, then contribution and claim read paths.
5. Monitor auth errors, 5xx rates, queue/notification failures and DB health; immediately rollback on security regression, data integrity risk or failed critical paths.
6. Document results and obtain separate approval before Google Play submission.

## Rollback
- Redeploy known-good code only if it is safe to return to the old OTP behavior; **do not** roll back to insecure mock authentication while the service is publicly reachable.
- Prefer fail-closed OTP/auth or temporary maintenance protection to reverting to predictable verification codes.
- Restore DB only with verified backups and explicit approval; avoid destructive rollbacks of user financial records.
- Rotate exposed secrets if any are found compromised, under an approved operational plan.

## Open blockers
- Unit/CI results not yet observed.
- Live Twilio provider delivery and sender permissions unverified.
- Production schema/secret compatibility and verified backup unverified.
- Full staging end-to-end tests unverified.
- Production deployment explicitly not approved.
