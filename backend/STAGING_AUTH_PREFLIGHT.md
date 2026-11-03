# Recovery staging preflight — no deployment performed

Target: the existing `https://clubvel-staging.up.railway.app` service only.
This document is a checklist for the next authorized staging step, not an instruction to deploy now.
Railway is now signed in. The workspace overview lists modest-nature and melodious-recreation, both labelled production. Neither project was opened; the owner must identify which serves the staging URL before service/database inspection. No staging database has been inspected.

## Isolation must be established before any database access

1. In the existing Railway staging service, confirm project/service/environment identity, deployment source and backend working directory. Do not create a replacement project.
2. Confirm staging `MONGO_URL` and `DB_NAME` point to a dedicated staging database. A staging URL alone is not evidence of database isolation. Obtain owner confirmation that these are not the production destination; do not connect to or inspect production to establish this.
3. Use a credential limited to that database, preferably read-only for the audit. The audit refuses collection reads if Mongo reports broader or unknown read privileges. A shared cluster may be acceptable only with independently confirmed, separate database and credential scope.
4. Do not use any connection string or key copied from old repository documentation. The documentation contained credential literals; they have been replaced by placeholders. Have the owner identify their scope and plan rotation separately. Replacing docs does not revoke exposed keys or erase Git history/backups.
5. Confirm existing private `JWT_SECRET_KEY` and `FIELD_ENCRYPTION_KEY` are present and at least 32 characters. Source now fails closed if either is missing/short. Preserve the actual existing encryption key: replacing it can make stored encrypted data unreadable. Do not generate or rotate keys as part of this preflight. JWT rotation would invalidate existing sessions and requires a separate decision.

## Read-only data audit

The script never imports `server.py`, writes data, migrates users, merges accounts, or creates indexes. It reports collection counts, index definitions, masked phone conflicts, malformed canonical keys, and the supplied test account's status. Its tests use in-memory fixtures.

Only after independently confirming isolation, supply these values privately in the audited shell:

- `CLUBVEL_ENV=staging`
- `CLUBVEL_STAGING_MONGO_URL`: the verified staging-only connection
- `CLUBVEL_STAGING_TEST_PHONE`: the owner's actual test phone (optional; not yet supplied)

Run from the backend directory, using the already installed backend dependencies:

```text
python scripts/audit_staging.py --expected-host <independently-confirmed-staging-host> --expected-database <independently-confirmed-staging-database>
```

Stop for any phone conflict, invalid phone, canonical-key mismatch, duplicate existing index key, unexpected indexes, broad credential scope, or uncertain isolation. Do not fix these by deletion or automatic account merging. Review the masked report privately with the owner. Record the before counts and verify user IDs, group IDs and membership relationships remain unchanged in any subsequent authorized test. Counts alone cannot prove all relationships are intact.

## Indexes the authentication source will request

| Collection | Index | Trigger and effect |
|---|---|---|
| `users` | `phone_e164_1`, ascending, unique, sparse | Requested during new registration. Missing legacy keys are excluded; explicit null values still participate. Existing duplicate/malformed keys must be reviewed before deployment/testing. No bulk backfill is performed. |
| `auth_otp_challenges` | `expires_at_1`, TTL with `expireAfterSeconds=0` | Requested when issuing OTP. Mongo eventually removes expired challenge documents only; the application rejects expiry immediately, without waiting for TTL. |
| `auth_otp_challenges` | Mongo's standard unique `_id_` | `_id` is purpose plus canonical phone. Resend replaces that purpose's challenge. |

No other new indexes are introduced by these repairs. No index has been created in any live database during this work. The sparse key protects new canonical registrations, while legacy aliases are checked before insertion. It is not a migration or a claim that unaudited legacy data is already globally unique.

## Existing test account

Its phone and live database record have not yet been identified.

- One matching verified account (or legacy account with no explicit false verification flag): sign in with the existing password, preserving its ID/data/memberships.
- One explicitly unverified account: resume registration with its original password; verify a new registration OTP. Do not replace the account or its password silently.
- More than one equivalent phone identity: return a conflict; owner review required. No automatic merge.
- No matching account: only then create a clearly designated staging test account, after approval for the staging test.

Local `082...`, `+2782...`, `2782...`, `002782...`, permitted spacing and punctuation resolve to the same South African phone identity. Invalid forms are rejected. Explicit international numbers stay international.

## Safe mock registration/OTP testing

Only after isolation is verified, the staging service can use:

```text
CLUBVEL_ENV=staging
ALLOW_MOCK_OTP=true
ENABLE_REAL_NOTIFICATIONS=false
ENABLE_BANK_FEED=false
```

These values have NOT been set in Railway. Mock OTP is `1234`, returned explicitly to the client as mock mode. It requires a real issued challenge, expires after 10 minutes, has a five-check limit, is purpose-bound and is consumed on verification/reset. Never enable this against production or a production database. Test mode is not proof of phone ownership and a publicly accessible staging instance must contain only appropriate test data.

Twilio is not needed for mock delivery. Live mode must not silently fall back to mock. Live SMS/WhatsApp testing is outstanding: Twilio credentials/channel setup and the Python Twilio package are required (the current pinned requirements do not include it). No dependency versions were changed in this repair.

## Deployment and verification still outstanding

- Confirm which dependency manifest Railway actually uses (`requirements.txt` versus `pyproject.toml` have differing constraints). Reproduce that environment before deploying; do not silently change versions.
- Review the existing legacy API authorization surface. These repairs authenticate the new Alerts read route, but are not a full security audit of every recovered endpoint; several older routes still accept user IDs without verifying a JWT.
- Obtain the separate staging deployment authorization after reviewing the diff and audit results. No push or deployment has been performed.
- After authorized deployment, use staging-only test data to exercise registration/resume, wrong/correct/expired/reused OTP, resend, alias login, sign-out/relogin, password reset, existing memberships, Alerts and preferences. Confirm a live-delivery configuration failure does not produce a mock code.
- Only after backend and source checks are satisfactory, ask for the next APK build authorization. Preserve `frontend/build-1790504151079.apk`.

