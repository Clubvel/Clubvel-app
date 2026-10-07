"""Offline execution of Phase 1 handlers; never connect to live data/delivery."""
import ast
import copy
import unittest
from types import SimpleNamespace as Obj

from services.phone_numbers import normalize_phone
from test_payment_proof_review import (
    SOURCE,
    Collection,
    HTTPError,
    environment,
    review,
    upload,
)


class AlertsCollection(Collection):
    def find(self, query, projection=None):
        # The Alerts endpoint uses an exclusion projection; retain legacy fields.
        return super().find(query)


def setup():
    ns = environment()
    ns['db'].alerts = AlertsCollection()
    ns['SendReminderRequest'] = Obj
    ns['CreateGroupRequest'] = Obj
    ns['format_phone_number'] = normalize_phone
    names = {'get_user_alerts', 'send_payment_reminder_endpoint', 'create_group'}
    nodes = [n for n in ast.parse(SOURCE.read_text()).body
             if isinstance(n, ast.AsyncFunctionDef) and n.name in names]
    for node in nodes:
        node.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'phase1-handlers', 'exec'), ns)  # noqa: S102 - Execute actual handlers offline.
    for user in ns['db'].users.records:
        user['phone_number'] = '+27821234567'
    return ns


def pending(ns, identity='contribution-a'):
    row = next(r for r in ns['db'].contributions.records if r['id'] == identity)
    row.update(contribution_status='pending', amount_due=600, amount_paid=100, month=8, year=2025)
    row.pop('proof_of_payment', None)
    return row


class Phase1Tests(unittest.IsolatedAsyncioTestCase):
    async def test_alerts_require_session_and_reject_other_account(self):
        ns = setup()
        for token, status in [(None, 401), ('Bearer invalid', 401), ('Bearer other-member', 403)]:
            with self.assertRaises(HTTPError) as caught:
                await ns['get_user_alerts']('member-user', token)
            self.assertEqual(caught.exception.status_code, status)
        self.assertEqual(ns['db'].alerts.reads, [])

    async def test_alerts_preserve_legacy_records_and_scope_to_signed_person(self):
        ns = setup()
        ns['db'].alerts.records = [
            {'id': 'legacy', 'user_id': 'member-user', 'created_at': 1, 'read_status': True},
            {'id': 'other', 'user_id': 'other-member', 'created_at': 2},
        ]
        result = await ns['get_user_alerts']('member-user', 'Bearer member-user')
        self.assertEqual(result['alerts'], [ns['db'].alerts.records[0]])

    async def test_decline_alert_is_exactly_once_and_has_selected_proof_context(self):
        ns = setup(); before = copy.deepcopy(ns['db'].contributions.records)
        request = review(ns, reason='Not visible')
        await ns['decline_contribution_proof']('contribution-a', request, 'Bearer admin-user')
        await ns['decline_contribution_proof']('contribution-a', Obj(proof_version=request.proof_version, reason='Changed'), 'Bearer admin-user')
        alerts = ns['db'].alerts.records
        self.assertEqual(len(alerts), 1)
        alert = alerts[0]
        self.assertEqual((alert['user_id'], alert['group_id'], alert['contribution_id']),
                         ('member-user', 'group-a', 'contribution-a'))
        self.assertEqual(alert['proof_version'], request.proof_version)
        for fragment in ['group-a', 'R175.00', f"{before[0]['month']:02d}/{before[0]['year']}", 'Decline reason: Not visible']:
            self.assertIn(fragment, alert['alert_message'])
        self.assertNotIn('Changed', alert['alert_message'])
        self.assertEqual(ns['db'].contributions.records[1:], before[1:])
        self.assertEqual(ns['db'].contributions.records[0]['amount_paid'], 25)
        self.assertEqual(ns['db'].contributions.records[0]['proof_of_payment'], before[0]['proof_of_payment'])

    async def test_decline_retry_repairs_alert_failure_without_repeating_review(self):
        ns = setup(); request = review(ns)
        def fail(_records):
            raise RuntimeError('Temporary alert write failure')
        ns['db'].alerts.before_update = fail
        with self.assertRaises(RuntimeError):
            await ns['decline_contribution_proof']('contribution-a', request, 'Bearer admin-user')
        self.assertEqual(ns['db'].contributions.records[0]['proof_review_status'], 'declined')
        await ns['decline_contribution_proof']('contribution-a', request, 'Bearer admin-user')
        self.assertEqual(len(ns['db'].alerts.records), 1)
        self.assertNotIn('Decline reason:', ns['db'].alerts.records[0]['alert_message'])

    async def test_replacement_proof_gets_its_own_alert_old_review_cannot_target_it(self):
        ns = setup(); old = review(ns)
        await ns['decline_contribution_proof']('contribution-a', old, 'Bearer admin-user')
        await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
        with self.assertRaises(HTTPError) as caught:
            await ns['decline_contribution_proof']('contribution-a', old, 'Bearer admin-user')
        self.assertEqual(caught.exception.status_code, 409)
        await ns['decline_contribution_proof']('contribution-a', review(ns), 'Bearer admin-user')
        declined = [a for a in ns['db'].alerts.records if a['alert_type'] == 'payment_proof_declined']
        self.assertEqual(len(declined), 2)
        self.assertNotEqual(declined[0]['id'], declined[1]['id'])

    async def test_reminder_requires_session_and_group_admin_not_supplied_identity(self):
        for token, status in [(None, 401), ('Bearer invalid', 401), ('Bearer member-user', 403), ('Bearer outsider', 403)]:
            ns = setup(); pending(ns)
            with self.assertRaises(HTTPError) as caught:
                await ns['send_payment_reminder_endpoint'](Obj(contribution_id='contribution-a', treasurer_id='admin-user'), token)
            self.assertEqual(caught.exception.status_code, status)
            self.assertEqual(ns['db'].alerts.records, [])

    async def test_reminder_uses_specific_contribution_amount_period_and_preserves_records(self):
        ns = setup(); pending(ns); before = copy.deepcopy(ns['db'].contributions.records)
        result = await ns['send_payment_reminder_endpoint'](Obj(contribution_id='contribution-a'), 'Bearer admin-user')
        self.assertEqual(result['message'], 'Reminder added to member Alerts')
        self.assertEqual(result['phone_number'], '+27821234567')
        alert = ns['db'].alerts.records[0]
        self.assertEqual(alert['contribution_id'], 'contribution-a')
        self.assertEqual(alert['user_id'], 'member-user')
        for fragment in ['R600.00', 'R500.00 outstanding', '08/2025', 'group-a']:
            self.assertIn(fragment, alert['alert_message'])
        self.assertNotIn('R200.00', alert['alert_message'])
        self.assertEqual(result['reminder_message'], alert['alert_message'])
        self.assertEqual(ns['db'].contributions.records, before)

    async def test_self_reminder_rejected_without_removing_own_contribution(self):
        ns = setup(); row = pending(ns); row['member_id'] = 'admin-a'
        before = copy.deepcopy(ns['db'].contributions.records)
        with self.assertRaises(HTTPError) as caught:
            await ns['send_payment_reminder_endpoint'](Obj(contribution_id='contribution-a'), 'Bearer admin-user')
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(ns['db'].alerts.records, [])
        self.assertEqual(ns['db'].contributions.records, before)

    async def test_reminder_rejects_non_outstanding_paid_excused_or_pending_review(self):
        for changes in [{'amount_paid': 600}, {'contribution_status': 'confirmed'},
                        {'contribution_status': 'excused'}, {'contribution_status': 'proof_uploaded', 'proof_of_payment': 'proof'}]:
            ns = setup(); row = pending(ns); row.update(changes)
            with self.assertRaises(HTTPError) as caught:
                await ns['send_payment_reminder_endpoint'](Obj(contribution_id='contribution-a'), 'Bearer admin-user')
            self.assertEqual(caught.exception.status_code, 409)
            self.assertEqual(ns['db'].alerts.records, [])

    async def test_reminders_for_same_member_month_remain_separate(self):
        ns = setup(); pending(ns); second = pending(ns, 'contribution-a-other'); second['amount_due'] = 250
        for identity in ['contribution-a', 'contribution-a-other']:
            await ns['send_payment_reminder_endpoint'](Obj(contribution_id=identity), 'Bearer admin-user')
        self.assertEqual([a['contribution_id'] for a in ns['db'].alerts.records], ['contribution-a', 'contribution-a-other'])
        self.assertIn('R250.00', ns['db'].alerts.records[1]['alert_message'])
        self.assertEqual(len(ns['db'].contributions.records), 3)

    async def test_declined_outstanding_proof_can_receive_reminder_without_changing_proof(self):
        ns = setup(); await ns['decline_contribution_proof']('contribution-a', review(ns), 'Bearer admin-user')
        before = copy.deepcopy(ns['db'].contributions.records)
        await ns['send_payment_reminder_endpoint'](Obj(contribution_id='contribution-a'), 'Bearer admin-user')
        self.assertEqual(ns['db'].contributions.records, before)
        self.assertEqual(ns['db'].alerts.records[-1]['alert_type'], 'payment_reminder')

    async def test_invalid_phone_does_not_block_authoritative_in_app_reminder(self):
        ns = setup(); pending(ns); ns['db'].users.records[0]['phone_number'] = 'invalid'
        result = await ns['send_payment_reminder_endpoint'](Obj(contribution_id='contribution-a'), 'Bearer admin-user')
        self.assertIsNone(result['phone_number'])
        self.assertEqual(len(ns['db'].alerts.records), 1)

    async def test_create_group_still_requires_signed_owner_session(self):
        ns = setup()
        for token, status in [(None, 401), ('Bearer invalid', 401), ('Bearer member-user', 403)]:
            with self.assertRaises(HTTPError) as caught:
                await ns['create_group'](Obj(admin_user_id='admin-user'), token)
            self.assertEqual(caught.exception.status_code, status)
        self.assertEqual(len(ns['db'].groups.records), 2)

    async def test_payment_rows_expose_person_identity_separately_from_membership(self):
        ns = setup(); result = await ns['get_club_detail']('group-a', 'admin-user', authorization='Bearer admin-user')
        rows = result['contributions']
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r['user_id'] == 'member-user' and r['id'] == 'membership-a' for r in rows))
        self.assertEqual({r['contribution_id'] for r in rows}, {'contribution-a', 'contribution-a-other'})


    async def test_completed_decline_retry_cannot_bypass_paid_state(self):
        ns = setup(); request = review(ns)
        await ns['decline_contribution_proof']('contribution-a', request, 'Bearer admin-user')
        ns['db'].contributions.records[0]['amount_paid'] = 175
        with self.assertRaises(HTTPError) as caught:
            await ns['decline_contribution_proof']('contribution-a', request, 'Bearer admin-user')
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(ns['db'].alerts.records), 1)
