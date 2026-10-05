"""Execute actual payment-proof handlers with isolated, Mongo-like test collections."""
import ast
import copy
import math
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as Obj
from typing import Optional

SOURCE = Path(__file__).resolve().parents[1] / 'backend/server.py'


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


class Cursor:
    def __init__(self, records): self.records = records
    async def to_list(self, limit): return copy.deepcopy(self.records[:limit] if limit else self.records)


class Collection:
    def __init__(self, records=()):
        self.records = copy.deepcopy(list(records))
        self.before_update = None

    @staticmethod
    def matches(record, query):
        return all(record.get(k) in v['$in'] if isinstance(v, dict) and '$in' in v
                   else record.get(k) == v for k, v in query.items())

    async def find_one(self, query):
        return copy.deepcopy(next((r for r in self.records if self.matches(r, query)), None))

    def find(self, query):
        return Cursor([r for r in self.records if self.matches(r, query)])

    async def update_one(self, query, update):
        if self.before_update:
            mutate, self.before_update = self.before_update, None
            mutate(self.records)
        for record in self.records:
            if self.matches(record, query):
                before = copy.deepcopy(record)
                record.update(copy.deepcopy(update.get('$set', {})))
                for key in update.get('$unset', {}): record.pop(key, None)
                return Obj(modified_count=int(before != record))
        return Obj(modified_count=0)

    async def insert_one(self, record): self.records.append(copy.deepcopy(record))


class Alert:
    def __init__(self, **data): self.data = data
    def dict(self): return self.data


async def no_legacy_membership(*args): return None
async def notification(**kwargs): return {}


def verify_token(token):
    # Existing JWT cryptographic verification has its own account/session tests.
    if token not in ('member-user', 'other-member', 'admin-user', 'outsider'):
        raise HTTPError(401, 'Invalid session')
    return {'user_id': token}


def environment():
    names = {'authenticated_user_id', 'verify_user_is_group_treasurer', 'calculate_contribution_status',
             'contribution_outstanding', 'proof_is_eligible', 'proof_version', 'proof_is_pending',
             'proof_review_details', 'proof_update_filter', 'require_pending_proof',
             'personal_contribution_status', 'personal_contribution_view', 'get_person_contribution_records',
             'get_personal_contributions', 'get_proof_eligible_contributions', 'upload_proof_of_payment',
             'get_contribution_proof', 'decline_contribution_proof', 'delete_contribution_proof',
             'confirm_payment', 'get_club_detail', 'admin_upload_proof_of_payment'}
    tree = ast.parse(SOURCE.read_text())
    functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    assert {n.name for n in functions} == names
    for n in functions: n.decorator_list = []
    now = datetime.utcnow()
    db = Obj(
        groups=Collection([{'id': group, 'status': 'active', 'group_name': group, 'treasurer_user_id': admin,
                            'monthly_contribution': 200, 'payment_due_date': 28, 'group_type': 'savings'}
                           for group, admin in [('group-a', 'admin-user'), ('group-b', 'outsider')]]),
        members=Collection([
            {'id': 'membership-a', 'user_id': 'member-user', 'group_id': 'group-a', 'status': 'active',
             'role_in_group': 'member', 'unique_reference_code': 'A'},
            {'id': 'admin-a', 'user_id': 'admin-user', 'group_id': 'group-a', 'status': 'active', 'role_in_group': 'admin', 'unique_reference_code': 'ADMIN'},
            {'id': 'membership-b', 'user_id': 'other-member', 'group_id': 'group-b', 'status': 'active',
             'role_in_group': 'member', 'unique_reference_code': 'B'},
            {'id': 'admin-b', 'user_id': 'outsider', 'group_id': 'group-b', 'status': 'active', 'role_in_group': 'treasurer'},
        ]),
        users=Collection([{'id': user, 'full_name': user, 'phone_number': '000'}
                          for user in ('member-user', 'other-member', 'admin-user', 'outsider')]),
        contributions=Collection([
            {'id': identity, 'member_id': member, 'group_id': group, 'month': now.month, 'year': now.year,
             'amount_due': 175.0, 'amount_paid': 25.0, 'contribution_status': 'proof_uploaded',
             'proof_of_payment': 'data:image/jpeg;base64,old-proof', 'proof_mime_type': 'image/jpeg',
             'proof_file_name': 'receipt.jpg', 'payment_date': now, 'reference_number': 'REF'}
            for identity, member, group in [('contribution-a', 'membership-a', 'group-a'),
                                            ('contribution-b', 'membership-b', 'group-b'),
                                            ('contribution-a-other', 'membership-a', 'group-a')]]),
        alerts=Collection(), trust_scores=Collection(),
    )
    ns = dict(db=db, Optional=Optional, Header=lambda default: default, HTTPException=HTTPError,
              ProofReviewRequest=Obj, ProofUpload=Obj, ConfirmPayment=Obj, datetime=datetime,
              timedelta=timedelta, math=math, uuid=uuid, Alert=Alert, verify_token=verify_token,
              reconcile_legacy_group_admin_membership=no_legacy_membership,
              decrypt_sensitive_field=lambda value: value, send_payment_confirmation=notification)
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'payment-proof-routes', 'exec'), ns)
    return ns


def review(ns, record=None, reason=None):
    record = record or ns['db'].contributions.records[0]
    return Obj(proof_version=ns['proof_version'](record), reason=reason)


def confirmation(ns, version=True):
    return Obj(contribution_id='contribution-a', proof_version=review(ns).proof_version if version else None,
               notes=None, treasurer_id='admin-user')


def upload():
    return Obj(contribution_id='contribution-a', user_id='member-user', proof_image='data:application/pdf;base64,new-proof',
               proof_mime_type='application/pdf', proof_file_name='replacement.pdf', reference_number='NEW')


class PaymentProofTests(unittest.IsolatedAsyncioTestCase):
    async def test_decline_targets_only_selected_record_preserves_amounts_and_retains_proof(self):
        ns = environment(); records = ns['db'].contributions.records
        before, other, same_member_other = map(copy.deepcopy, records)
        club_before = await ns['get_club_detail']('group-a', 'admin-user')
        await ns['decline_contribution_proof']('contribution-a', review(ns, reason='Wrong reference'), 'Bearer admin-user')
        record = records[0]
        self.assertEqual(record['proof_review_status'], 'declined')
        self.assertEqual(record['contribution_status'], 'pending')
        for key in ('id', 'amount_due', 'amount_paid', 'proof_of_payment', 'proof_mime_type', 'proof_file_name'):
            self.assertEqual(record[key], before[key])
        self.assertEqual(record['proof_decline_reason'], 'Wrong reference')
        self.assertEqual(record['proof_declined_by'], 'admin-user')
        self.assertIsInstance(record['proof_declined_at'], datetime)
        self.assertEqual(records[1], other)
        self.assertEqual(records[2], same_member_other)
        self.assertEqual(len(records), 3)
        club_after = await ns['get_club_detail']('group-a', 'admin-user')
        self.assertEqual(club_before['collected'], club_after['collected'])
        self.assertEqual(club_before['expected'], club_after['expected'])
        proof = await ns['get_contribution_proof']('contribution-a', 'member-user')
        self.assertEqual(proof['proof_image'], before['proof_of_payment'])
        rows = await ns['get_personal_contributions']('member-user', 'Bearer member-user')
        self.assertEqual(rows['contributions'][0]['proof_review_status'], 'declined')
        self.assertEqual(rows['contributions'][0]['proof_decline_reason'], 'Wrong reference')
        self.assertNotEqual(rows['contributions'][0]['status'], 'proof_uploaded')
        self.assertTrue(rows['contributions'][0]['proof_eligible'])

    async def test_decline_requires_authenticated_admin_of_the_contribution_group(self):
        for token, expected in [(None, 401), ('Bearer invalid', 401), ('Bearer member-user', 403), ('Bearer outsider', 403)]:
            with self.subTest(token=token):
                ns = environment(); before = copy.deepcopy(ns['db'].contributions.records)
                with self.assertRaises(HTTPError) as e:
                    await ns['decline_contribution_proof']('contribution-a', review(ns), token)
                self.assertEqual(e.exception.status_code, expected)
                self.assertEqual(ns['db'].contributions.records, before)
        ns = environment()
        for m in ns['db'].members.records:
            if m['user_id'] == 'admin-user': m['role_in_group'] = 'treasurer'
        await ns['decline_contribution_proof']('contribution-a', review(ns), 'Bearer admin-user')

    async def test_declined_proof_can_be_replaced_clearing_decline_metadata(self):
        ns = environment(); old_version = review(ns).proof_version
        await ns['decline_contribution_proof']('contribution-a', review(ns, reason='Wrong receipt'), 'Bearer admin-user')
        eligible = await ns['get_proof_eligible_contributions']('member-user', 'Bearer member-user')
        self.assertEqual(eligible['contributions'][0]['contribution_id'], 'contribution-a')
        await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
        record = ns['db'].contributions.records[0]
        self.assertEqual((record['amount_due'], record['amount_paid']), (175, 25))
        self.assertEqual(record['proof_review_status'], 'pending')
        self.assertEqual(record['contribution_status'], 'proof_uploaded')
        self.assertEqual(record['proof_of_payment'], upload().proof_image)
        self.assertNotEqual(ns['proof_version'](record), old_version)
        for key in ('proof_decline_reason', 'proof_declined_by', 'proof_declined_at'):
            self.assertNotIn(key, record)
        self.assertEqual(record['proof_uploaded_by_user_id'], 'member-user')

    async def test_member_upload_uses_session_identity_and_rejects_confirmed_records(self):
        for token, expected in [(None, 401), ('Bearer invalid', 401), ('Bearer other-member', 403)]:
            ns = environment()
            with self.assertRaises(HTTPError) as e:
                await ns['upload_proof_of_payment'](upload(), token)
            self.assertEqual(e.exception.status_code, expected)
        ns = environment(); ns['db'].contributions.records[0]['contribution_status'] = 'confirmed'
        with self.assertRaises(HTTPError) as e:
            await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
        self.assertEqual(e.exception.status_code, 409)

    async def test_member_deletes_own_legacy_pending_proof_without_changing_contribution_or_amounts(self):
        ns = environment(); before = copy.deepcopy(ns['db'].contributions.records[1])
        await ns['delete_contribution_proof']('contribution-a', review(ns), 'Bearer member-user')
        record = ns['db'].contributions.records[0]
        self.assertEqual(record['id'], 'contribution-a')
        self.assertEqual((record['amount_due'], record['amount_paid']), (175, 25))
        self.assertEqual(record['contribution_status'], 'pending')
        self.assertEqual(ns['db'].contributions.records[1], before)
        for key in ('proof_of_payment', 'proof_mime_type', 'proof_file_name', 'reference_number', 'payment_date', 'proof_version', 'proof_review_status'):
            self.assertNotIn(key, record)
        self.assertTrue(ns['proof_is_eligible'](record))
        with self.assertRaises(HTTPError) as e:
            await ns['confirm_payment'](confirmation(ns, version=False))
        self.assertEqual(e.exception.status_code, 409)
        await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
        self.assertNotIn('proof_deleted_at', record)
        await ns['confirm_payment'](confirmation(ns))
        self.assertEqual(record['contribution_status'], 'confirmed')

    async def test_member_cannot_delete_other_member_approved_admin_or_declined_proof(self):
        cases = [('other-member', None, 403), ('member-user', 'confirmed', 409),
                 ('member-user', 'paid', 409), ('member-user', 'admin', 403), ('member-user', 'declined', 409)]
        for actor, state, expected in cases:
            with self.subTest(actor=actor, state=state):
                ns = environment(); record = ns['db'].contributions.records[0]
                if state in ('confirmed', 'paid'): record['contribution_status'] = state
                if state == 'admin': record['uploaded_by_admin'] = 'admin-user'
                if state == 'declined': record.update(contribution_status='pending', proof_review_status='declined')
                before = copy.deepcopy(record)
                with self.assertRaises(HTTPError) as e:
                    await ns['delete_contribution_proof']('contribution-a', review(ns), 'Bearer '+actor)
                self.assertEqual(e.exception.status_code, expected)
                self.assertEqual(record, before)
        for token in (None, 'Bearer invalid'):
            ns = environment()
            with self.assertRaises(HTTPError) as e:
                await ns['delete_contribution_proof']('contribution-a', review(ns), token)
            self.assertEqual(e.exception.status_code, 401)

    async def test_existing_approval_sets_specific_contribution_paid_and_preserves_other_record(self):
        ns = environment(); before = copy.deepcopy(ns['db'].contributions.records[1])
        await ns['confirm_payment'](confirmation(ns))
        record = ns['db'].contributions.records[0]
        self.assertEqual(record['contribution_status'], 'confirmed')
        self.assertEqual(record['amount_due'], 175)
        self.assertEqual(record['amount_paid'], 175)
        self.assertEqual(record['proof_review_status'], 'approved')
        self.assertEqual(record['confirmed_by_treasurer_id'], 'admin-user')
        self.assertEqual(ns['db'].contributions.records[1], before)
        self.assertEqual(ns['db'].alerts.records[0]['user_id'], 'member-user')

    async def test_stale_approval_cannot_approve_declined_deleted_or_replaced_proof(self):
        for action in ('decline', 'delete', 'replace'):
            with self.subTest(action=action):
                ns = environment(); stale = confirmation(ns)
                if action == 'delete':
                    await ns['delete_contribution_proof']('contribution-a', review(ns), 'Bearer member-user')
                else:
                    await ns['decline_contribution_proof']('contribution-a', review(ns), 'Bearer admin-user')
                    if action == 'replace': await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
                before = copy.deepcopy(ns['db'].contributions.records)
                with self.assertRaises(HTTPError) as e: await ns['confirm_payment'](stale)
                self.assertEqual(e.exception.status_code, 409)
                self.assertEqual(ns['db'].contributions.records, before)

    async def test_database_race_between_read_and_update_is_rejected_for_each_action(self):
        for action in ('approve', 'decline', 'delete', 'upload'):
            with self.subTest(action=action):
                ns = environment(); db = ns['db']; initial_review = review(ns)
                if action == 'upload':
                    db.contributions.records[0].update(contribution_status='pending', proof_review_status='declined')
                def replace(records):
                    records[0].update(proof_version='concurrent-version', proof_of_payment='replacement',
                                      proof_review_status='pending', contribution_status='proof_uploaded')
                db.contributions.before_update = replace
                with self.assertRaises(HTTPError) as e:
                    if action == 'approve': await ns['confirm_payment'](confirmation(ns))
                    elif action == 'decline': await ns['decline_contribution_proof']('contribution-a', initial_review, 'Bearer admin-user')
                    elif action == 'delete': await ns['delete_contribution_proof']('contribution-a', initial_review, 'Bearer member-user')
                    else: await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
                self.assertEqual(e.exception.status_code, 409)
                self.assertEqual(db.contributions.records[0]['amount_paid'], 25)
                self.assertEqual(db.contributions.records[0]['proof_of_payment'], 'replacement')

    async def test_stale_decline_and_delete_versions_are_rejected(self):
        for action in ('decline', 'delete'):
            ns = environment(); stale = Obj(proof_version='outdated', reason=None)
            with self.assertRaises(HTTPError) as e:
                if action == 'decline': await ns['decline_contribution_proof']('contribution-a', stale, 'Bearer admin-user')
                else: await ns['delete_contribution_proof']('contribution-a', stale, 'Bearer member-user')
            self.assertEqual(e.exception.status_code, 409)

    async def test_member_deletes_new_pending_upload_and_mismatched_uploader_is_blocked(self):
        ns = environment()
        await ns['decline_contribution_proof']('contribution-a', review(ns), 'Bearer admin-user')
        await ns['upload_proof_of_payment'](upload(), 'Bearer member-user')
        self.assertEqual(ns['db'].contributions.records[0]['proof_uploaded_by_user_id'], 'member-user')
        await ns['delete_contribution_proof']('contribution-a', review(ns), 'Bearer member-user')
        self.assertEqual((ns['db'].contributions.records[0]['amount_due'], ns['db'].contributions.records[0]['amount_paid']), (175, 25))
        ns = environment(); ns['db'].contributions.records[0]['proof_uploaded_by_user_id'] = 'other-member'
        with self.assertRaises(HTTPError) as e:
            await ns['delete_contribution_proof']('contribution-a', review(ns), 'Bearer member-user')
        self.assertEqual(e.exception.status_code, 403)

    async def test_decline_and_delete_cannot_overwrite_concurrent_approval(self):
        for action in ('decline', 'delete'):
            ns = environment(); selected = review(ns)
            def approve(records):
                records[0].update(contribution_status='confirmed', amount_paid=175, proof_review_status='approved')
            ns['db'].contributions.before_update = approve
            with self.assertRaises(HTTPError) as e:
                if action == 'decline': await ns['decline_contribution_proof']('contribution-a', selected, 'Bearer admin-user')
                else: await ns['delete_contribution_proof']('contribution-a', selected, 'Bearer member-user')
            self.assertEqual(e.exception.status_code, 409)
            self.assertEqual(ns['db'].contributions.records[0]['amount_paid'], 175)
            self.assertIn('proof_of_payment', ns['db'].contributions.records[0])

    async def test_identical_image_replacement_still_invalidates_old_approval(self):
        ns = environment(); stale = confirmation(ns)
        await ns['decline_contribution_proof']('contribution-a', review(ns), 'Bearer admin-user')
        data = upload(); data.proof_image = ns['db'].contributions.records[0]['proof_of_payment']
        await ns['upload_proof_of_payment'](data, 'Bearer member-user')
        with self.assertRaises(HTTPError) as e: await ns['confirm_payment'](stale)
        self.assertEqual(e.exception.status_code, 409)

    async def test_existing_confirmation_without_any_proof_keeps_its_original_semantics(self):
        ns = environment(); record = ns['db'].contributions.records[0]
        record.pop('proof_of_payment'); record['contribution_status'] = 'pending'
        await ns['confirm_payment'](confirmation(ns, version=False))
        self.assertEqual(record['amount_paid'], record['amount_due'])
        self.assertEqual(record['contribution_status'], 'confirmed')

    async def test_admin_upload_invalidates_previous_review_version(self):
        ns = environment(); stale = confirmation(ns); data = upload(); data.user_id = 'admin-user'
        await ns['admin_upload_proof_of_payment'](data)
        with self.assertRaises(HTTPError) as e: await ns['confirm_payment'](stale)
        self.assertEqual(e.exception.status_code, 409)


if __name__ == '__main__': unittest.main()
