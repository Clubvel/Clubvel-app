"""Exercise actual invitation handlers and Mongo-like atomic CAS offline."""
import asyncio
import copy
import unittest
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as Obj

from test_member_invitations import (
    Collection,
    HTTPError,
    environment,
    request,
    sms_delivery,
)


def admin_request(phone='0821234567', channel='whatsapp', **fields):
    return Obj(group_id='group', new_admin_phone=phone, channel=channel,
               admin_user_id='admin', **fields)


def recipient_member(ns, status='active', role='member'):
    row = {'id': 'existing-member', 'user_id': 'recipient', 'group_id': 'group',
           'status': status, 'role_in_group': role, 'unique_reference_code': 'KEEP123',
           'date_joined_group': datetime(2020, 1, 1, tzinfo=UTC), 'payout_position': 7}
    ns['db'].members.records.append(row)
    return row


async def invite(ns, **kwargs):
    return await ns['invite_admin'](admin_request(**kwargs), 'Bearer admin')


async def accept(ns, invitation_id):
    return await ns['accept_invitation'](Obj(invitation_id=invitation_id, user_id='recipient'), 'Bearer recipient')


class AdminInvitationTests(unittest.IsolatedAsyncioTestCase):
    async def test_unregistered_and_registered_create_no_access(self):
        for phone in ['0841234567', '0821234567']:
            ns = environment(); before = copy.deepcopy((ns['db'].members.records, ns['db'].users.records))
            result = await invite(ns, phone=phone)
            self.assertEqual(result['intended_role'], 'admin')
            self.assertEqual(before, (ns['db'].members.records, ns['db'].users.records))
            self.assertNotIn('admin_user_ids', ns['db'].groups.records[0])
            self.assertEqual(ns['db'].invitations.records[0]['status'], 'pending')

    async def test_member_invitation_does_not_promote_until_accept_and_preserves_identity(self):
        ns = environment(); row = recipient_member(ns); before = copy.deepcopy(row)
        ns['db'].users.records[2]['stokvel_memberships'] = [{'stokvel_id': 'group', 'role': 'member', 'status': 'active', 'joined_at': 'keep'}]
        result = await invite(ns); self.assertEqual(row, before)
        await accept(ns, result['invitation_id'])
        for key in ['id', 'unique_reference_code', 'date_joined_group', 'payout_position']:
            self.assertEqual(row[key], before[key])
        self.assertEqual(row['role_in_group'], 'admin')
        self.assertEqual(sum(m['user_id'] == 'recipient' for m in ns['db'].members.records), 1)
        entries = ns['db'].users.records[2]['stokvel_memberships']
        self.assertEqual(len(entries), 1); self.assertEqual(entries[0]['joined_at'], 'keep')
        self.assertEqual(entries[0]['role'], 'admin')

    async def test_nonmember_acceptance_and_double_acceptance_are_idempotent(self):
        ns = environment(); result = await invite(ns)
        await accept(ns, result['invitation_id']); await accept(ns, result['invitation_id'])
        rows = [m for m in ns['db'].members.records if m['user_id'] == 'recipient']
        self.assertEqual(len(rows), 1); self.assertEqual(rows[0]['role_in_group'], 'admin')
        self.assertEqual(ns['db'].groups.records[0]['admin_user_ids'], ['recipient'])
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])

    async def test_existing_admin_treasurer_inactive_removed_rejected(self):
        for status, role in [('active', 'admin'), ('active', 'treasurer'), ('removed', 'member'), ('inactive', 'member')]:
            ns = environment(); recipient_member(ns, status, role)
            with self.assertRaises(HTTPError): await invite(ns)
            self.assertEqual(ns['db'].invitations.records, [])

    async def test_alias_reuse_expiry_and_single_alert(self):
        ns = environment(); first = await invite(ns)
        original = copy.deepcopy(ns['db'].invitations.records[0])
        second = await invite(ns, phone='0027821234567')
        self.assertEqual(first['invitation_id'], second['invitation_id'])
        self.assertEqual(original['expires_at'], ns['db'].invitations.records[0]['expires_at'])
        self.assertEqual(len(ns['db'].alerts.records), 1)
        self.assertIn('become an Admin', ns['db'].alerts.records[0]['alert_message'])
        self.assertNotIn(original['id'], second['invitation_message'])

    async def test_conflicts_both_directions_and_legacy_member_default(self):
        ns = environment(); await ns['invite_member'](request(), 'Bearer admin')
        ns['db'].invitations.records[0].pop('intended_role')
        with self.assertRaises(HTTPError): await invite(ns)
        ns = environment(); await invite(ns)
        with self.assertRaises(HTTPError): await ns['invite_member'](request(), 'Bearer admin')

    async def test_pending_capacity_five_and_concurrent_attempts(self):
        ns = environment()
        outcomes = await asyncio.gather(*(invite(ns, phone=f'084123456{i}') for i in range(8)), return_exceptions=True)
        self.assertEqual(sum(isinstance(o, dict) for o in outcomes), 3)  # two existing administrators
        self.assertEqual(len(ns['db'].invitations.records), 3)
        self.assertEqual(len(ns['db'].groups.records[0]['admin_invitation_slots']), 3)
        for i in range(3):
            ns['db'].members.records.append({'user_id': f'extra{i}', 'group_id': 'group', 'status': 'active', 'role_in_group': 'admin'})
        with self.assertRaises(HTTPError): await invite(ns)

    async def test_concurrent_duplicate_creation_one_invitation_and_alert(self):
        ns = environment(); results = await asyncio.gather(*(invite(ns) for _ in range(8)))
        self.assertEqual(len({r['invitation_id'] for r in results}), 1)
        self.assertEqual(len(ns['db'].invitations.records), 1)
        self.assertEqual(len(ns['db'].alerts.records), 1)

    async def test_expiry_and_decline_release_capacity(self):
        ns = environment(); result = await invite(ns)
        for phone in ['0841234567', '0851234567']: await invite(ns, phone=phone)
        with self.assertRaises(HTTPError): await invite(ns, phone='0861234567')
        payload = Obj(invitation_id=result['invitation_id'], user_id='recipient')
        await ns['decline_invitation'](payload, 'Bearer recipient')
        await ns['decline_invitation'](payload, 'Bearer recipient')
        await invite(ns, phone='0861234567')
        slots = ns['db'].groups.records[0]['admin_invitation_slots']
        record = next(i for i in ns['db'].invitations.records if i['phone_number'] == '+27841234567')
        expired = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
        record['expires_at'] = expired
        next(i for i in slots if i['id'] == record['id'])['expires_at'] = expired
        await invite(ns, phone='0871234567')
        self.assertFalse(any(m['user_id'] == 'recipient' for m in ns['db'].members.records))

    async def test_authentication_body_impersonation_and_wrong_recipient(self):
        for token, status in [(None, 401), ('Bearer invalid', 401), ('Bearer outsider', 403)]:
            ns = environment()
            with self.assertRaises(HTTPError) as caught: await ns['invite_admin'](admin_request(), token)
            self.assertEqual(caught.exception.status_code, status)
        ns = environment(); result = await invite(ns)
        for action in ['accept_invitation', 'decline_invitation']:
            with self.assertRaises(HTTPError):
                await ns[action](Obj(invitation_id=result['invitation_id'], user_id='outsider'), 'Bearer outsider')
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'pending')

    async def test_removed_inviter_unverified_recipient_and_expired_accept(self):
        for change in ['inviter', 'verification', 'expiry']:
            ns = environment(); result = await invite(ns)
            if change == 'inviter': ns['db'].members.records[0]['status'] = 'removed'
            if change == 'verification': ns['db'].users.records[2]['otp_verified'] = False
            if change == 'expiry': ns['db'].invitations.records[0]['expires_at'] = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
            with self.assertRaises(HTTPError): await accept(ns, result['invitation_id'])
            self.assertFalse(any(m['user_id'] == 'recipient' for m in ns['db'].members.records))

    async def test_sms_failure_and_unregistered_alert_behavior(self):
        ns = environment()
        with sms_delivery(side_effect=RuntimeError('offline')):
            result = await invite(ns, channel='sms', phone='0841234567')
        self.assertEqual(result['delivery_status'], 'failed')
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'pending')
        self.assertEqual(ns['db'].alerts.records, [])

    async def test_discovery_uses_current_name_and_role(self):
        ns = environment(); await invite(ns)
        ns['db'].groups.records[0]['group_name'] = 'Renamed Club'
        result = await ns['get_pending_invitations']('recipient', 'Bearer recipient')
        self.assertEqual(result['invitations'][0]['group_name'], 'Renamed Club')
        self.assertEqual(result['invitations'][0]['intended_role'], 'admin')

    async def test_unregistered_person_registers_and_discovers_then_accepts(self):
        ns = environment(); result = await invite(ns, phone='0841234567')
        ns['db'].users.records[2].update(phone_number='+27841234567', otp_verified=True)
        pending = await ns['get_pending_invitations']('recipient', 'Bearer recipient')
        self.assertEqual(pending['invitations'][0]['id'], result['invitation_id'])
        await accept(ns, result['invitation_id'])
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'accepted')

    async def test_acceptance_recovery_after_summary_failure_keeps_capacity_and_existing_member(self):
        ns = environment(); member = recipient_member(ns); identity = member['id']
        result = await invite(ns)
        original = ns['db'].users.update_one
        async def fail_summary(query, update, **kwargs):
            if '$set' in update and 'stokvel_memberships' in update['$set']:
                raise RuntimeError('Interrupted acceptance')
            return await original(query, update, **kwargs)
        ns['db'].users.update_one = fail_summary
        with self.assertRaises(RuntimeError): await accept(ns, result['invitation_id'])
        self.assertEqual(member['role_in_group'], 'admin')
        self.assertEqual(member['id'], identity)
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'accepting')
        ns['db'].invitations.records[0]['expires_at'] = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
        ns['db'].users.update_one = original
        discovery = await ns['get_pending_invitations']('recipient', 'Bearer recipient')
        self.assertEqual(discovery['invitations'][0]['status'], 'accepting')
        await accept(ns, result['invitation_id'])
        self.assertEqual(member['role_in_group'], 'admin')
        self.assertEqual(member['id'], identity)
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'accepted')

    async def test_precommit_accepting_expiry_cancels_and_releases_capacity(self):
        ns = environment(); result = await invite(ns)
        record = ns['db'].invitations.records[0]
        record.update(status='accepting', accepting_by='recipient',
                      expires_at=datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1))
        for phone in ['0841234567', '0851234567']: await invite(ns, phone=phone)
        await invite(ns, phone='0861234567')
        with self.assertRaises(HTTPError): await accept(ns, result['invitation_id'])
        admins = [m for m in ns['db'].members.records if m['role_in_group'] in ('admin', 'treasurer')]
        self.assertEqual(len(admins), 2)

    async def test_interrupted_creation_repairs_same_reservation_without_duplicate(self):
        ns = environment(); original = ns['db'].invitations.update_one
        async def fail(*args, **kwargs): raise RuntimeError('Interrupted persistence')
        ns['db'].invitations.update_one = fail
        with self.assertRaises(RuntimeError): await invite(ns)
        identity = ns['db'].groups.records[0]['admin_invitation_slots'][0]['id']
        ns['db'].invitations.update_one = original
        result = await invite(ns)
        self.assertEqual(result['invitation_id'], identity)
        self.assertEqual(len(ns['db'].invitations.records), 1)

    async def test_concurrent_acceptance_does_not_duplicate_admin_or_membership(self):
        ns = environment(); result = await invite(ns)
        results = await asyncio.gather(*(accept(ns, result['invitation_id']) for _ in range(4)), return_exceptions=True)
        self.assertTrue(any(isinstance(result, dict) for result in results))
        self.assertEqual(sum(m['user_id'] == 'recipient' for m in ns['db'].members.records), 1)
        self.assertEqual(ns['db'].groups.records[0]['admin_user_ids'], ['recipient'])

    async def test_acceptance_rechecks_capacity_and_removed_member(self):
        for change in ['capacity', 'removed']:
            ns = environment(); result = await invite(ns)
            if change == 'removed': recipient_member(ns, status='removed')
            else:
                for i in range(3):
                    ns['db'].members.records.append({'user_id': f'other{i}', 'group_id': 'group', 'role_in_group': 'admin', 'status': 'active'})
            with self.assertRaises(HTTPError): await accept(ns, result['invitation_id'])
            self.assertFalse(any(m['user_id'] == 'recipient' and m['role_in_group'] == 'admin' for m in ns['db'].members.records))

    async def test_legacy_member_acceptance_still_creates_member_only(self):
        ns = environment(); result = await ns['invite_member'](request(), 'Bearer admin')
        ns['db'].invitations.records[0].pop('intended_role')
        await accept(ns, result['invitation_id'])
        membership = next(m for m in ns['db'].members.records if m['user_id'] == 'recipient')
        self.assertEqual(membership['role_in_group'], 'member')
        self.assertNotIn('admin_user_ids', ns['db'].groups.records[0])

    async def test_inactive_group_and_missing_inviter_account_cannot_invite(self):
        for change in ['group', 'user']:
            ns = environment()
            if change == 'group': ns['db'].groups.records[0]['status'] = 'inactive'
            else: ns['db'].users.records = [u for u in ns['db'].users.records if u['id'] != 'admin']
            with self.assertRaises(HTTPError): await invite(ns)
            self.assertEqual(ns['db'].invitations.records, [])

    async def test_concurrent_accept_decline_has_one_authoritative_outcome(self):
        ns = environment(); result = await invite(ns)
        payload = Obj(invitation_id=result['invitation_id'], user_id='recipient')
        await asyncio.gather(accept(ns, result['invitation_id']), ns['decline_invitation'](payload, 'Bearer recipient'), return_exceptions=True)
        record = ns['db'].invitations.records[0]
        self.assertIn(record['status'], ('accepted', 'declined'))
        admins = [m for m in ns['db'].members.records if m['user_id'] == 'recipient' and m['role_in_group'] == 'admin']
        self.assertEqual(len(admins), 1 if record['status'] == 'accepted' else 0)

    async def test_group_capacity_can_accept_distinct_recipients_concurrently(self):
        ns = environment()
        ns['db'].users.records[3]['phone_number'] = '+27841234567'
        first = await invite(ns)
        second = await invite(ns, phone='0841234567')
        results = await asyncio.gather(
            accept(ns, first['invitation_id']),
            ns['accept_invitation'](Obj(invitation_id=second['invitation_id'], user_id='outsider'), 'Bearer outsider'))
        self.assertEqual(len(results), 2)
        self.assertEqual(sum(m['role_in_group'] in ('admin', 'treasurer') for m in ns['db'].members.records), 4)
        self.assertEqual(len(ns['db'].groups.records[0]['admin_user_ids']), 2)


class ReceiptRaceTests(unittest.IsolatedAsyncioTestCase):
    async def setup_invitation(self):
        ns = environment()
        result = await invite(ns)
        return ns, result['invitation_id']

    async def remove(self, ns, person):
        await ns['delete_member'](Obj(group_id='group', admin_user_id='treasurer',
                                      member_user_id=person, reason='offline race'))

    def receipts(self, ns):
        return [value for row in ns['db'].members.records
                for value in row.get('admin_invitation_decisions', {}).values()
                if value['decision'] == 'granted']

    async def assert_no_access(self, ns):
        with self.assertRaises(HTTPError):
            await ns['verify_user_is_group_treasurer']('recipient', 'group')

    def assert_capacity(self, ns):
        admins = {row['user_id'] for row in ns['db'].members.records
                  if row['group_id'] == 'group' and row['status'] == 'active'
                  and row['role_in_group'] in ('admin', 'treasurer')}
        slots = ns['db'].groups.records[0].get('admin_invitation_slots', [])
        self.assertLessEqual(len(admins) + sum(slot['intended_role'] == 'admin'
                            and slot.get('recipient_id') not in admins for slot in slots), 5)

    def fail_projection(self, ns, before=None):
        original = ns['db'].members.update_one
        async def update(query, change, original=original, **kwargs):
            if 'admin_grant_applied' in change.get('$set', {}):
                if before: await before()
                raise RuntimeError('Offline interruption before projection')
            return await original(query, change, **kwargs)
        ns['db'].members.update_one = update
        return original

    async def test_A_revocation_wins_before_atomic_receipt(self):
        ns, identity = await self.setup_invitation()
        original = ns['commit_admin_grant']
        async def commit(*args, original=original, ns=ns):
            await self.remove(ns, 'admin')
            return await original(*args)
        ns['commit_admin_grant'] = commit
        with self.assertRaises(HTTPError): await accept(ns, identity)
        self.assertEqual(self.receipts(ns), [])
        await self.assert_no_access(ns)
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])

    async def test_B_receipt_wins_then_inviter_removed_before_projection(self):
        ns, identity = await self.setup_invitation()
        original = self.fail_projection(ns, lambda: self.remove(ns, 'admin'))
        with self.assertRaises(RuntimeError): await accept(ns, identity)
        self.assertEqual(len(self.receipts(ns)), 1)
        self.assertEqual(ns['db'].members.records[0]['status'], 'removed')
        ns['db'].members.update_one = original
        await accept(ns, identity)
        self.assertEqual(len(self.receipts(ns)), 1)
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'accepted')
        await ns['verify_user_is_group_treasurer']('recipient', 'group')
        self.assert_capacity(ns)
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])

    async def test_C_receipt_interruption_then_retry_once(self):
        ns, identity = await self.setup_invitation()
        original = self.fail_projection(ns)
        with self.assertRaises(RuntimeError): await accept(ns, identity)
        self.assert_capacity(ns)
        self.assertEqual(len(ns['db'].groups.records[0]['admin_invitation_slots']), 1)
        ns['db'].invitations.records[0]['expires_at'] = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=1)
        # Expiry cleanup may not free a committed, unprojected grant.
        for phone in ['0841234567', '0851234567']: await invite(ns, phone=phone)
        with self.assertRaises(HTTPError): await invite(ns, phone='0861234567')
        ns['db'].members.update_one = original
        await accept(ns, identity)
        await accept(ns, identity)
        self.assertEqual(len(self.receipts(ns)), 1)
        self.assertEqual(sum(row['user_id'] == 'recipient' for row in ns['db'].members.records), 1)
        self.assert_capacity(ns)

    async def test_D_failure_after_projection_repairs_finalization(self):
        ns, identity = await self.setup_invitation()
        original = ns['db'].invitations.update_one
        async def update(query, change, original=original, **kwargs):
            if change.get('$set', {}).get('status') == 'accepted': raise RuntimeError('Offline finalization failure')
            return await original(query, change, **kwargs)
        ns['db'].invitations.update_one = update
        with self.assertRaises(RuntimeError): await accept(ns, identity)
        await ns['verify_user_is_group_treasurer']('recipient', 'group')
        ns['db'].invitations.update_one = original
        await accept(ns, identity)
        self.assertEqual(len(self.receipts(ns)), 1)
        self.assertEqual(len(ns['db'].users.records[2]['stokvel_memberships']), 1)
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])

    async def test_E_removed_or_demoted_recipient_never_resurrects(self):
        for status in ('removed', 'active'):
            with self.subTest(status=status):
                ns, identity = await self.setup_invitation()
                original = ns['db'].invitations.update_one
                async def update(query, change, original=original, **kwargs):
                    if change.get('$set', {}).get('status') == 'accepted': raise RuntimeError('Offline failure')
                    return await original(query, change, **kwargs)
                ns['db'].invitations.update_one = update
                with self.assertRaises(RuntimeError): await accept(ns, identity)
                if status == 'removed': await self.remove(ns, 'recipient')
                else: await ns['db'].members.update_one({'user_id': 'recipient'}, {'$set': {'role_in_group': 'member'}})
                ns['db'].invitations.update_one = original
                await accept(ns, identity)
                await self.assert_no_access(ns)
                row = next(row for row in ns['db'].members.records if row['user_id'] == 'recipient')
                self.assertEqual(row['status'], status)
                self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])

    async def test_F_decline_wins_at_receipt_boundary(self):
        ns, identity = await self.setup_invitation()
        original = ns['commit_admin_grant']
        async def commit(*args, original=original, ns=ns):
            await ns['decline_invitation'](Obj(invitation_id=identity, user_id='recipient'), 'Bearer recipient')
            return await original(*args)
        ns['commit_admin_grant'] = commit
        with self.assertRaises(HTTPError): await accept(ns, identity)
        self.assertEqual(self.receipts(ns), [])
        await self.assert_no_access(ns)
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])

    async def test_G_committed_grant_beats_decline(self):
        ns, identity = await self.setup_invitation()
        original = self.fail_projection(ns)
        with self.assertRaises(RuntimeError): await accept(ns, identity)
        with self.assertRaises(HTTPError) as caught:
            await ns['decline_invitation'](Obj(invitation_id=identity, user_id='recipient'), 'Bearer recipient')
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(ns['db'].groups.records[0]['admin_invitation_slots']), 1)
        ns['db'].members.update_one = original
        await accept(ns, identity)
        self.assert_capacity(ns)

    async def test_H_expiry_cancellation_and_commit_have_one_winner(self):
        for cleanup in (True, False):
            with self.subTest(cleanup=cleanup):
                ns, identity = await self.setup_invitation()
                original = ns['commit_admin_grant']
                async def commit(*args, original=original, ns=ns, cleanup=cleanup):
                    ns['db'].invitations.records[0]['expires_at'] = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
                    if cleanup: await invite(ns, phone='0841234567')
                    return await original(*args)
                ns['commit_admin_grant'] = commit
                if cleanup:
                    with self.assertRaises(HTTPError): await accept(ns, identity)
                    self.assertEqual(self.receipts(ns), [])
                    await self.assert_no_access(ns)
                else:
                    await accept(ns, identity)
                    self.assertEqual(len(self.receipts(ns)), 1)
                self.assertFalse(any(slot['id'] == identity for slot in ns['db'].groups.records[0]['admin_invitation_slots']))
                self.assert_capacity(ns)

    async def test_I_different_invitations_compete_for_fifth_admin(self):
        ns = environment()
        for index in range(2):
            ns['db'].members.records.append({'id': f'extra{index}', 'user_id': f'extra{index}',
                                             'group_id': 'group', 'role_in_group': 'admin', 'status': 'active'})
        outcomes = await asyncio.gather(invite(ns), invite(ns, phone='0841234567'), return_exceptions=True)
        winners = [outcome for outcome in outcomes if isinstance(outcome, dict)]
        self.assertEqual(len(winners), 1)
        invitation = ns['db'].invitations.records[0]
        ns['db'].users.records[2]['phone_number'] = invitation['phone_number']
        await accept(ns, winners[0]['invitation_id'])
        self.assert_capacity(ns)

    async def test_J_two_devices_one_receipt_projection_capacity(self):
        ns, identity = await self.setup_invitation()
        outcomes = await asyncio.gather(accept(ns, identity), accept(ns, identity), return_exceptions=True)
        self.assertTrue(any(isinstance(outcome, dict) for outcome in outcomes))
        self.assertEqual(len(self.receipts(ns)), 1)
        self.assertEqual(sum(row['user_id'] == 'recipient' for row in ns['db'].members.records), 1)
        self.assertEqual(len(ns['db'].users.records[2]['stokvel_memberships']), 1)
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])
        self.assert_capacity(ns)

    async def test_K_club_deletion_before_and_after_receipt(self):
        for after_receipt in (False, True):
            with self.subTest(after_receipt=after_receipt):
                ns, identity = await self.setup_invitation()
                ns['db'].contributions = Collection()
                async def delete(ns=ns):
                    await ns['delete_club'](Obj(group_id='group', admin_user_id='treasurer', confirmation='DELETE'))
                if after_receipt:
                    original = self.fail_projection(ns, delete)
                    with self.assertRaises(RuntimeError): await accept(ns, identity)
                    ns['db'].members.update_one = original
                    with self.assertRaises(HTTPError): await accept(ns, identity)
                else:
                    original = ns['commit_admin_grant']
                    async def commit(*args, original=original, ns=ns):
                        await delete()
                        return await original(*args)
                    ns['commit_admin_grant'] = commit
                    with self.assertRaises(HTTPError): await accept(ns, identity)
                await self.assert_no_access(ns)
                self.assertEqual(ns['db'].groups.records, [])
                self.assertEqual(len(self.receipts(ns)), int(after_receipt))
                self.assertFalse(any(row['user_id'] == 'recipient' and row['status'] == 'active' for row in ns['db'].members.records))

    async def test_L_account_deletion_beyond_100_and_receipt_ordering(self):
        for committed in (False, True):
            with self.subTest(committed=committed):
                ns, identity = await self.setup_invitation()
                db = ns['db']
                db.deletion_logs = Collection(); db.claims = Collection(); db.contributions = Collection(); db.trust_scores = Collection()
                db.members.records[0:0] = [{'id': f'history{i}', 'user_id': 'admin', 'group_id': f'history-group{i}',
                                            'status': 'active', 'role_in_group': 'admin'} for i in range(101)]
                async def delete(ns=ns):
                    await ns['delete_user_account'](Obj(user_id='admin', confirmation='DELETE'), 'Bearer admin')
                if committed:
                    original = self.fail_projection(ns, delete)
                    with self.assertRaises(RuntimeError): await accept(ns, identity)
                    ns['db'].members.update_one = original
                    await accept(ns, identity)
                    self.assertEqual(len(self.receipts(ns)), 1)
                else:
                    original = ns['commit_admin_grant']
                    async def commit(*args, original=original, ns=ns):
                        await delete()
                        return await original(*args)
                    ns['commit_admin_grant'] = commit
                    with self.assertRaises(HTTPError): await accept(ns, identity)
                    self.assertEqual(self.receipts(ns), [])
                    await self.assert_no_access(ns)
                self.assertTrue(all(row['status'] == 'deleted' for row in db.members.records if row['user_id'] == 'admin'))
                self.assert_capacity(ns)

    async def test_recipient_account_deletion_fences_late_preparation(self):
        ns, identity = await self.setup_invitation()
        db = ns['db']
        db.deletion_logs = Collection(); db.claims = Collection(); db.contributions = Collection(); db.trust_scores = Collection()
        original = db.members.update_one
        async def update(query, change, original=original, **kwargs):
            if kwargs.get('upsert'):
                await ns['delete_user_account'](Obj(user_id='recipient', confirmation='DELETE'), 'Bearer recipient')
            return await original(query, change, **kwargs)
        db.members.update_one = update
        with self.assertRaises(HTTPError): await accept(ns, identity)
        self.assertEqual(self.receipts(ns), [])
        await self.assert_no_access(ns)
        self.assertEqual(ns['db'].groups.records[0]['admin_invitation_slots'], [])


    async def test_cancelled_provisional_membership_does_not_block_reinvitation(self):
        ns, identity = await self.setup_invitation()
        original = ns['commit_admin_grant']
        async def commit(*args, original=original, ns=ns):
            await ns['decline_invitation'](Obj(invitation_id=identity, user_id='recipient'), 'Bearer recipient')
            return await original(*args)
        ns['commit_admin_grant'] = commit
        with self.assertRaises(HTTPError): await accept(ns, identity)
        self.assertFalse(any(row['user_id'] == 'recipient' for row in ns['db'].members.records))
        ns['commit_admin_grant'] = original
        replacement = await invite(ns)
        await accept(ns, replacement['invitation_id'])
        self.assertEqual(len(self.receipts(ns)), 1)

    async def test_inactive_club_never_authorizes_projected_admin(self):
        ns, identity = await self.setup_invitation()
        await accept(ns, identity)
        ns['db'].groups.records[0]['status'] = 'deleting'
        await self.assert_no_access(ns)

    async def test_ordinary_legacy_member_removal_is_unchanged(self):
        ns = environment(); row = recipient_member(ns)
        row.pop('role_in_group')
        await self.remove(ns, 'recipient')
        self.assertFalse(any(member['user_id'] == 'recipient' for member in ns['db'].members.records))


    async def test_legacy_accepting_member_invitation_blocks_conflicting_admin_invite(self):
        ns = environment()
        result = await ns['invite_member'](request(), 'Bearer admin')
        ns['db'].groups.records[0]['admin_invitation_slots'] = []
        ns['db'].invitations.records[0].update(status='accepting', accepting_by='recipient')
        with self.assertRaises(HTTPError): await invite(ns)
        self.assertEqual(ns['db'].invitations.records[0]['id'], result['invitation_id'])
        self.assertEqual(len(ns['db'].invitations.records), 1)

    async def test_account_deletion_fences_late_legacy_issuer_binding(self):
        ns = environment()
        db = ns['db']
        db.deletion_logs = Collection(); db.claims = Collection(); db.contributions = Collection(); db.trust_scores = Collection()
        original = db.members.find_one
        async def find(query):
            if query.get('role_in_group') == {'$in': ['admin', 'treasurer']} and query.get('user_id') == 'admin':
                db.members.find_one = original
                await ns['delete_user_account'](Obj(user_id='admin', confirmation='DELETE'), 'Bearer admin')
                db.members.records.append({'id': 'late-legacy-issuer', 'user_id': 'admin', 'group_id': 'group',
                                           'status': 'active', 'role_in_group': 'admin'})
            return await original(query)
        # Trigger after the existing authorization helper has already run.
        original_reserve = ns['reserve_invitation']
        async def reserve(*args, **kwargs):
            db.members.find_one = find
            return await original_reserve(*args, **kwargs)
        ns['reserve_invitation'] = reserve
        with self.assertRaises(HTTPError): await invite(ns)
        self.assertEqual(db.invitations.records, [])
        self.assertEqual(self.receipts(ns), [])


    async def test_cancelled_stale_preparation_can_be_repaired_by_next_invitation(self):
        ns, identity = await self.setup_invitation()
        original_update = ns['db'].members.update_one
        async def update(query, change, **kwargs):
            if kwargs.get('upsert'):
                await ns['decline_invitation'](Obj(invitation_id=identity, user_id='recipient'), 'Bearer recipient')
            return await original_update(query, change, **kwargs)
        async def interrupted_commit(*args): raise RuntimeError('Offline stale preparation interruption')
        original_commit = ns['commit_admin_grant']
        ns['db'].members.update_one = update
        ns['commit_admin_grant'] = interrupted_commit
        with self.assertRaises(RuntimeError): await accept(ns, identity)
        ns['db'].members.update_one = original_update
        ns['commit_admin_grant'] = original_commit
        replacement = await invite(ns)
        await accept(ns, replacement['invitation_id'])
        self.assertEqual(len(self.receipts(ns)), 1)
        self.assertEqual(sum(row['user_id'] == 'recipient' for row in ns['db'].members.records), 1)


    async def test_club_closure_blocks_new_reservations_before_revocation_sweeps(self):
        ns = environment()
        ns['db'].groups.records[0]['admin_invitations_closed'] = True
        with self.assertRaises(HTTPError): await invite(ns)
        self.assertEqual(ns['db'].invitations.records, [])

    async def test_club_closure_revokes_projection_before_group_inactivation(self):
        ns, identity = await self.setup_invitation()
        original = self.fail_projection(ns)
        with self.assertRaises(RuntimeError): await accept(ns, identity)
        ns['db'].members.update_one = original
        ns['db'].contributions = Collection()
        original_group_update = ns['db'].groups.update_one
        async def update(query, change, **kwargs):
            if change.get('$set', {}).get('status') == 'deleting':
                await accept(ns, identity)
                await self.assert_no_access(ns)
            return await original_group_update(query, change, **kwargs)
        ns['db'].groups.update_one = update
        await ns['delete_club'](Obj(group_id='group', admin_user_id='treasurer', confirmation='DELETE'))
        await self.assert_no_access(ns)
        self.assertEqual(len(self.receipts(ns)), 1)


    async def test_club_delete_retains_explicit_demoted_legacy_owner_tombstone(self):
        ns = environment()
        ns['db'].groups.records[0]['admin_user_ids'] = ['admin', 'treasurer', 'recipient']
        recipient_member(ns)
        ns['db'].contributions = Collection()
        await ns['delete_club'](Obj(group_id='group', admin_user_id='treasurer', confirmation='DELETE'))
        row = next(row for row in ns['db'].members.records if row['user_id'] == 'recipient')
        self.assertEqual(row['status'], 'removed')
        self.assertEqual(row['role_in_group'], 'member')
        await self.assert_no_access(ns)


    async def test_legacy_member_rollback_cannot_erase_a_committed_admin_projection(self):
        ns, identity = await self.setup_invitation()
        legacy = {'id': 'legacy-member-invitation', 'group_id': 'group', 'phone_number': '+27821234567',
                  'status': 'pending', 'expires_at': datetime.now(UTC).replace(tzinfo=None) + timedelta(days=1)}
        ns['db'].invitations.records.append(legacy)
        original = ns['db'].invitations.update_one
        async def update(query, change, **kwargs):
            if query.get('id') == legacy['id'] and change.get('$set', {}).get('status') == 'accepted':
                await accept(ns, identity)
                raise RuntimeError('Offline legacy Member finalization failure')
            return await original(query, change, **kwargs)
        ns['db'].invitations.update_one = update
        with self.assertRaises(RuntimeError): await ns['accept_invitation'](Obj(invitation_id=legacy['id'], user_id='recipient'), 'Bearer recipient')
        await ns['verify_user_is_group_treasurer']('recipient', 'group')
        self.assertEqual(len(self.receipts(ns)), 1)
        row = next(row for row in ns['db'].members.records if row['user_id'] == 'recipient')
        self.assertEqual(row['admin_grant_applied'], identity)
        self.assertEqual(len(ns['db'].users.records[2]['stokvel_memberships']), 1)
