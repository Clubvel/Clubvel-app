# Person-first Clubvel audit and implementation plan

## Current architecture

- **Frontend:** Expo 54 / React Native 0.81 with Expo Router. `AuthContext` owns the
  persisted account session. `(member)` contains the personal/member experience and
  `(treasurer)` contains the established group administration screens.
- **Backend:** one FastAPI application backed by MongoDB. Users, groups, members,
  contributions, claims, alerts and invitations are stored as separate collections.
- **Authentication:** a phone number uniquely identifies an account. Password login
  returns a JWT and account data; OTP verifies registration. The registration UI
  already submits no role.

## Data model and reusable behavior

- `users` is the person/account record. Its nullable `role` and `roles` fields are
  retained only to deserialize legacy records; they are not populated for new people
  and are never used for routing or authorization. `stokvel_memberships` is a
  denormalized contextual-role cache.
- `members` is the authoritative person-to-group relationship. `role_in_group` holds
  `member`, `admin`, or legacy `treasurer` and `status` controls active membership.
- `groups` retains `treasurer_user_id` and `admin_user_ids` for compatibility with
  existing administration endpoints.
- Group creation already creates the group, an active creator membership, and the
  creator's contextual membership. Existing member/admin dashboards and group-detail
  screens can therefore be reused rather than rebuilt.
- Invitations identify a group and phone number. They remain pending through account
  creation and create a contextual membership only when the addressed person accepts.

## Production mock/demo audit

- The personal member dashboard is backed by `/api/member/dashboard/{user_id}` and
  uses MongoDB contributions, claims, memberships and groups; it does not seed cards.
- `services/bank_feed_service.py` deliberately returns mock accounts and transactions
  when no provider is configured. It must not be surfaced as real financial data.
- the treasurer reports screen uses `generateSampleReportData` and hard-coded R500
  totals. It should remain outside the personal home and be disabled/replaced with a
  real report query in a later focused change.
- the treasurer dashboard's WhatsApp reminder control currently reports success
  without calling the reminder API. This is a pre-existing dead-control risk to fix
  before presenting reminders as production-ready.
- notification mock mode exposes test OTP behavior. This is an environment fallback,
  not dashboard data, but production configuration must use a real provider.

## Incremental changes in this slice

1. Always route a signed-in person to the personal home, regardless of legacy roles.
2. Present real zero-value personal metrics and explicit **Create a Group** and
   **Join via Invitation** actions.
3. Reuse the existing create-group API and open the established treasurer group detail
   only when the selected membership has an admin/treasurer role.
4. Return each membership's contextual role from the dashboard.
5. Show invitations to the addressed account and create membership only after explicit
   acceptance; registration itself never consumes an invitation.
6. Stop registration, login, group creation and admin invitation from reading or
   promoting legacy account-wide roles. Sessions identify a person only.

## Risks and follow-up sequence

- Legacy accounts can contain duplicate or inconsistent membership caches. Reads use
  `members` as the source of truth; a future migration should reconcile the cache.
- Legacy `groups.treasurer_user_id` and `groups.admin_user_ids` remain as compatibility
  metadata for deployed clients, but backend authorization now reads the active
  `members.role_in_group` relationship. A data migration should eventually remove the
  redundant group and user role fields after legacy clients are retired.
- Invitation acceptance is phone-based. Phone normalization and tokenized deep links
  should be added together so links cannot be guessed or accepted by another person.
- Replace sample reports, mock bank feeds, and simulated reminders with real data or
  disable their controls in separate reviewable changes.
- Finally remove `users.role`, `users.roles`, and the contextual cache only after
  deployed clients no longer depend on their serialized presence.
