"""Execute selected route functions against memory only. Never import/start server.

No Mongo connection, env loading, seed scripts, or real notifications are used.
"""
import ast
import copy
from datetime import datetime, timedelta
import math
from pathlib import Path
from types import SimpleNamespace
from typing import Optional
import unittest
from unittest.mock import AsyncMock

SOURCE = Path(__file__).resolve().parents[1] / 'backend' / 'server.py'
NAMES = {'contribution_outstanding', 'proof_is_eligible', 'calculate_contribution_status',
         'get_person_contribution_records', 'personal_contribution_status', 'personal_contribution_view',
         'get_proof_eligible_contributions', 'record_monthly_contribution',
         'get_member_club_details', 'upload_proof_of_payment', 'get_club_detail',
         'get_group_contributions', 'confirm_payment'}
functions = [n for n in ast.parse(SOURCE.read_text(encoding='utf-8-sig')).body
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in NAMES]
assert {n.name for n in functions} == NAMES
for n in functions:
    n.decorator_list = []
CODE = compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), 'exec')


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)


def matches(row, query):
    return all(row.get(k) in v['$in'] if isinstance(v, dict) else row.get(k) == v for k, v in query.items())


class Cursor:
    def __init__(self, rows): self.rows = rows
    def sort(self, key, direction):
        self.rows.sort(key=lambda r: r.get(key, 0), reverse=direction < 0)
        return self
    def limit(self, count): self.rows = self.rows[:count]; return self
    async def to_list(self, count): return copy.deepcopy(self.rows if count is None else self.rows[:count])


class Collection:
    def __init__(self, rows=()): self.rows = copy.deepcopy(list(rows)); self.writes = []; self.reject_update = False
    def find(self, query): return Cursor([r for r in self.rows if matches(r, query)])
    async def find_one(self, query): return copy.deepcopy(next((r for r in self.rows if matches(r, query)), None))
    async def update_one(self, query, update, upsert=False):
        self.writes.append((query, update))
        if self.reject_update: return SimpleNamespace(modified_count=0)
        row = next((r for r in self.rows if matches(r, query)), None)
        if row is not None:
            row.update(update.get('$set', {}))
            return SimpleNamespace(modified_count=1 if '$set' in update else 0)
        if upsert: self.rows.append(copy.deepcopy(update['$setOnInsert']))
        return SimpleNamespace(modified_count=0)
    async def insert_one(self, row): self.writes.append(row); self.rows.append(copy.deepcopy(row))


class Model:
    def __init__(self, **kwargs): self.data = kwargs
    def dict(self): return dict(self.data)


class Contribution(Model):
    def dict(self):
        return dict(id='created-obligation', amount_paid=0, contribution_status='pending', proof_of_payment=None, **self.data)


def record(**changes):
    now = datetime.utcnow()
    return dict(dict(id='obligation', member_id='membership', group_id='group', month=now.month, year=now.year,
                     amount_due=125.5, amount_paid=25, contribution_status='pending', proof_of_payment=None), **changes)


def environment(records=(), **group_changes):
    group = dict(id='group', status='active', group_name='Test group', group_type='savings',
                 contribution_mode='fixed_monthly', monthly_contribution=125.5, payment_due_date=15,
                 bank_name='Test bank', bank_account_number='test', bank_account_holder='Test', treasurer_user_id='admin')
    group.update(group_changes)
    member = dict(id='membership', group_id='group', user_id='person', status='active',
                  role_in_group='member', unique_reference_code='REF')
    ns = dict(Optional=Optional, math=math, datetime=datetime, timedelta=timedelta,
              HTTPException=HTTPError, Header=lambda _: None, RecordMonthlyContribution=SimpleNamespace,
              ProofUpload=SimpleNamespace, ConfirmPayment=SimpleNamespace, Contribution=Contribution,
              DuplicateKeyError=type('DuplicateKeyError', (Exception,), {}), Alert=Model,
              authenticated_user_id=lambda token: token, decrypt_sensitive_field=lambda value: value,
              verify_user_is_group_treasurer=AsyncMock(), send_payment_confirmation=AsyncMock(return_value={}))
    ns['db'] = SimpleNamespace(groups=Collection([group]), members=Collection([member]),
        contributions=Collection(records), users=Collection([dict(id='person', full_name='Test person', phone_number='test')]),
        alerts=Collection(), trust_scores=Collection())
    exec(CODE, ns)
    return ns


class ContributionTests(unittest.IsolatedAsyncioTestCase):
    async def assert_error(self, status, awaitable):
        with self.assertRaises(HTTPError) as caught: await awaitable
        self.assertEqual(caught.exception.status_code, status)

    def assert_no_writes(self, ns):
        for collection in vars(ns['db']).values(): self.assertEqual(collection.writes, [])

    async def test_pending_due_late_are_eligible_with_actual_remaining_amount(self):
        for status in ('pending', 'due', 'late'):
            ns = environment([record(contribution_status=status)])
            result = await ns['get_proof_eligible_contributions']('person', 'person')
            self.assertEqual([r['contribution_id'] for r in result['contributions']], ['obligation'])
            self.assertEqual(ns['contribution_outstanding'](record()), 100.5)
            self.assert_no_writes(ns)

    async def test_settled_proof_uploaded_and_invalid_amounts_are_not_eligible(self):
        for change in [dict(contribution_status=s) for s in ('confirmed', 'paid', 'excused', 'proof_uploaded')] + [
            dict(amount_paid=125.5), dict(amount_paid=200), dict(amount_paid=None), dict(amount_due=float('nan')),
            dict(amount_due=True), dict(proof_of_payment='already-uploaded')]:
            ns = environment([record(**change)])
            self.assertEqual(await ns['get_proof_eligible_contributions']('person', 'person'), {'contributions': []})
            self.assert_no_writes(ns)

    async def test_missing_obligation_and_inactive_membership_do_not_create_eligibility(self):
        ns = environment()
        self.assertEqual(await ns['get_proof_eligible_contributions']('person', 'person'), {'contributions': []})
        self.assert_no_writes(ns)
        ns = environment([record()]); ns['db'].members.rows[0]['status'] = 'removed'
        self.assertEqual(await ns['get_proof_eligible_contributions']('person', 'person'), {'contributions': []})
        await self.assert_error(403, ns['get_proof_eligible_contributions']('person', 'other'))
        self.assert_no_writes(ns)

    async def test_fixed_and_travel_member_reads_never_create_contributions(self):
        for mode, kind in [('fixed_monthly', 'savings'), ('flexible_goal', 'travel')]:
            ns = environment(contribution_mode=mode, group_type=kind)
            result = await ns['get_member_club_details']('group', 'person')
            self.assertIsNone(result['current_contribution']); self.assertIsNone(result['payment_reference']['amount'])
            self.assertEqual(ns['db'].contributions.rows, []); self.assert_no_writes(ns)

    async def test_real_flexible_obligation_remains_eligible_without_a_monthly_due_date(self):
        ns = environment([record(contribution_status='late')], contribution_mode='flexible_goal', group_type='travel')
        result = await ns['get_member_club_details']('group', 'person')
        self.assertIsNone(result['current_contribution']['due_date'])
        self.assertTrue(result['current_contribution']['proof_eligible'])
        self.assertEqual(result['current_contribution']['status'], 'late')
        self.assertEqual(len((await ns['get_proof_eligible_contributions']('person', 'person'))['contributions']), 1)
        self.assert_no_writes(ns)

    async def test_admin_read_exposes_exact_id_and_does_not_invent_amounts(self):
        for records in ([], [record()]):
            ns = environment(records)
            result = await ns['get_club_detail']('group', 'admin')
            self.assertEqual(result['members'][0]['contribution_id'], 'obligation' if records else None)
            self.assertEqual(result['expected'], 125.5 if records else 0)
            month = datetime.utcnow()
            rows = await ns['get_group_contributions']('group', month.month, month.year, 'admin')
            self.assertEqual(rows['summary']['outstanding'], 100.5 if records else 0)
            self.assertEqual(rows['summary']['total_expected'], 125.5 if records else 0)
            self.assertEqual(rows['summary']['collected'], 25 if records else 0)
            if not records:
                self.assertIsNone(rows['contributions'][0]['amount_due'])
                self.assertEqual(result['members'][0]['status'], 'unrecorded')
            self.assert_no_writes(ns)

    async def test_explicit_monthly_recording_is_authorized_and_idempotent(self):
        ns = environment(); data = SimpleNamespace(member_id='membership', treasurer_id='admin')
        first = await ns['record_monthly_contribution']('group', data, 'admin')
        second = await ns['record_monthly_contribution']('group', data, 'admin')
        self.assertEqual(first, second); self.assertEqual(len(ns['db'].contributions.rows), 1)
        self.assertEqual(ns['db'].contributions.rows[0]['amount_due'], 125.5)
        ns['verify_user_is_group_treasurer'].assert_awaited_with('admin', 'group')

    async def test_explicit_recording_rejects_travel_flexible_invalid_amount_and_unauthorized_person(self):
        data = SimpleNamespace(member_id='membership', treasurer_id='admin')
        for changes in [dict(group_type='travel'), dict(contribution_mode='flexible_goal'), dict(monthly_contribution=0)]:
            ns = environment(**changes)
            await self.assert_error(409, ns['record_monthly_contribution']('group', data, 'admin'))
            self.assert_no_writes(ns)
        ns = environment()
        await self.assert_error(403, ns['record_monthly_contribution']('group', data, 'other'))
        ns['verify_user_is_group_treasurer'].side_effect = HTTPError(403, 'Not an administrator')
        await self.assert_error(403, ns['record_monthly_contribution']('group', data, 'admin'))
        self.assert_no_writes(ns)

    async def test_upload_targets_exact_record_and_rejects_repeat_or_other_person(self):
        ns = environment([record(), record(id='untouched')])
        data = SimpleNamespace(contribution_id='obligation', user_id='person', proof_image='proof', reference_number='REF')
        await ns['upload_proof_of_payment'](data)
        self.assertEqual(ns['db'].contributions.rows[0]['contribution_status'], 'proof_uploaded')
        self.assertEqual(ns['db'].contributions.rows[1]['contribution_status'], 'pending')
        await self.assert_error(409, ns['upload_proof_of_payment'](data))
        self.assertEqual(len(ns['db'].alerts.rows), 1)
        data.user_id = 'other'
        await self.assert_error(403, ns['upload_proof_of_payment'](data))

    async def test_stale_upload_fails_before_notification(self):
        ns = environment([record()]); ns['db'].contributions.reject_update = True
        await self.assert_error(409, ns['upload_proof_of_payment'](SimpleNamespace(
            contribution_id='obligation', user_id='person', proof_image='proof', reference_number='REF')))
        self.assertEqual(ns['db'].alerts.rows, [])

    async def test_confirmation_requires_exact_contribution_and_preserves_authorization(self):
        ns = environment([record(), record(id='untouched')])
        data = SimpleNamespace(contribution_id='membership', treasurer_id='admin', notes=None)
        await self.assert_error(404, ns['confirm_payment'](data))
        data.contribution_id = 'obligation'
        ns['verify_user_is_group_treasurer'].side_effect = HTTPError(403, 'Not an administrator')
        await self.assert_error(403, ns['confirm_payment'](data)); self.assert_no_writes(ns)
        ns['verify_user_is_group_treasurer'].side_effect = None
        await ns['confirm_payment'](data)
        self.assertEqual(ns['db'].contributions.rows[0]['amount_paid'], 125.5)
        self.assertEqual(ns['db'].contributions.rows[1]['amount_paid'], 25)
        await self.assert_error(409, ns['confirm_payment'](data))
        ns['send_payment_confirmation'].assert_awaited_once()

    async def test_stale_or_excused_confirmation_never_notifies(self):
        for stale in (False, True):
            ns = environment([record(contribution_status='pending' if stale else 'excused')])
            ns['db'].contributions.reject_update = stale
            await self.assert_error(409, ns['confirm_payment'](SimpleNamespace(contribution_id='obligation', treasurer_id='admin', notes=None)))
            self.assertEqual(ns['db'].alerts.rows, []); ns['send_payment_confirmation'].assert_not_awaited()


if __name__ == '__main__':
    unittest.main(verbosity=2)
