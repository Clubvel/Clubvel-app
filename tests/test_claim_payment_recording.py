"""Offline execution of real payout handlers with atomic in-memory Mongo semantics."""
import ast
import copy
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo
from decimal import Decimal
from types import SimpleNamespace
from pydantic import Field, ValidationError
from test_claim_payouts import environment as schedule_environment, claim
from test_member_read_authorization import ReadCollection
from test_account_authorization import bearer
from test_payment_proof_review import SOURCE

class Payments(ReadCollection):
    async def update_one(self, query, update, **kwargs):
        if self.before_update:
            callback, self.before_update = self.before_update, None
            result = callback(self.records)
            if hasattr(result, '__await__'): await result
        for row in self.records:
            if self.matches(row, query):
                before = copy.deepcopy(row)
                row.update(copy.deepcopy(update.get('$set', {})))
                for field, value in update.get('$push', {}).items(): row.setdefault(field, []).append(copy.deepcopy(value))
                return SimpleNamespace(modified_count=int(before != row))
        return SimpleNamespace(modified_count=0)

def environment():
    ns = schedule_environment(); ns.update(Decimal=Decimal, uuid=uuid, Field=Field, ZoneInfo=ZoneInfo)
    nodes = [n for n in ast.parse(SOURCE.read_text()).body if (
        isinstance(n, (ast.ClassDef, ast.AsyncFunctionDef)) and n.name in {'ClaimPaymentRecord', 'record_claim_payment'}
    ) or (
        isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'BUSINESS_TIMEZONE' for t in n.targets)
    )]
    for n in nodes:
        if hasattr(n, 'decorator_list'): n.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'claim-payment', 'exec'), ns)
    ns['db'].claims = Payments([claim(scheduled_claim_date=datetime(2026, 11, 20),
        reviewed_by='admin-user', reviewed_at=datetime(2026, 1, 1)), claim('untouched')])
    return ns

class SouthAfricanMidnight(datetime):
    # 00:30 on 2 January in South Africa; UTC still has 1 January.
    instant = datetime(2026, 1, 1, 22, 30, tzinfo=UTC)

    @classmethod
    def now(cls, tz=None):
        return cls.instant.astimezone(tz) if tz is not None else cls.instant.replace(tzinfo=None)

    @classmethod
    def utcnow(cls):
        return cls.instant.replace(tzinfo=None)


class ClaimPaymentTests(unittest.IsolatedAsyncioTestCase):
    async def record(self, ns, total=50000, expected=0, user='admin-user', group='group-a', identity='approved', day='2026-01-02'):
        data = ns['ClaimPaymentRecord'](actual_amount_paid=total, expected_actual_amount_paid=expected, actual_payment_date=day)
        return await ns['record_claim_payment'](group, identity, data, authorization=bearer(user) if user else None)

    async def test_south_african_today_accepted_while_utc_is_previous_day(self):
        ns = environment()
        self.assertEqual(SouthAfricanMidnight.utcnow().date().isoformat(), '2026-01-01')
        self.assertEqual(SouthAfricanMidnight.now(ns['BUSINESS_TIMEZONE']).date().isoformat(), '2026-01-02')
        with patch.dict(ns, datetime=SouthAfricanMidnight):
            result = await self.record(ns, day='2026-01-02')
        self.assertEqual(result['status'], 'paid')
        self.assertEqual(ns['db'].claims.records[0]['actual_payment_date'], datetime(2026, 1, 2))
        self.assertEqual(ns['db'].claims.records[0]['scheduled_claim_date'], datetime(2026, 11, 20))

    async def test_south_african_tomorrow_rejected_at_midnight_without_mutation(self):
        ns = environment(); before = copy.deepcopy(ns['db'].claims.records)
        with patch.dict(ns, datetime=SouthAfricanMidnight):
            with self.assertRaises(Exception) as error:
                await self.record(ns, day='2026-01-03')
        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(ns['db'].claims.records, before)

    async def test_south_african_yesterday_remains_accepted(self):
        ns = environment()
        with patch.dict(ns, datetime=SouthAfricanMidnight):
            result = await self.record(ns, day='2026-01-01')
        self.assertEqual(result['status'], 'paid')
        self.assertEqual(ns['db'].claims.records[0]['actual_payment_date'], datetime(2026, 1, 1))

    async def test_south_african_midnight_does_not_bypass_authorization(self):
        ns = environment(); before = copy.deepcopy(ns['db'].claims.records)
        with patch.dict(ns, datetime=SouthAfricanMidnight):
            with self.assertRaises(Exception) as error:
                await self.record(ns, user='member-user', day='2026-01-02')
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(ns['db'].claims.records, before)

    async def test_south_african_midnight_payment_retry_is_idempotent(self):
        for total in (20000, 50000):
            ns = environment()
            with patch.dict(ns, datetime=SouthAfricanMidnight):
                await self.record(ns, total=total, day='2026-01-02')
                result = await self.record(ns, total=total, day='2026-01-02')
            self.assertTrue(result['already_recorded'])
            self.assertEqual(result['actual_amount_paid'], total)
            self.assertEqual(len(ns['db'].claims.records[0]['payout_payments']), 1)

    async def dashboard(self, ns):
        return (await ns['get_member_dashboard']('member-user', authorization=bearer('member-user')))['summary']

    async def test_admin_treasurer_full_payment_preserves_claim_schedule_approval_and_other_records(self):
        for role in ('admin', 'treasurer'):
            ns=environment(); ns['db'].members.records[1]['role_in_group']=role
            before=copy.deepcopy(ns['db'].claims.records); contributions=copy.deepcopy(ns['db'].contributions.records)
            result=await self.record(ns); row=ns['db'].claims.records[0]
            self.assertEqual(result['status'], 'paid'); self.assertEqual(row['actual_amount_paid'],50000)
            self.assertEqual(row['actual_payment_date'],datetime(2026,1,2))
            for field in ('claim_amount','scheduled_claim_date','reviewed_by','reviewed_at'): self.assertEqual(row[field],before[0][field])
            self.assertEqual(ns['db'].claims.records[1],before[1]); self.assertEqual(ns['db'].contributions.records,contributions)
            event=row['payout_payments'][0];self.assertEqual(event['recorded_by_user_id'],'admin-user')
            self.assertIsInstance(event['recorded_at'],datetime); self.assertEqual(event['amount'],50000)
            self.assertEqual(event['actual_payment_date'],row['actual_payment_date'])

    async def test_partial_cumulative_total_balance_and_completion_history(self):
        ns=environment();ns['db'].claims.records=ns['db'].claims.records[:1]
        before=await self.dashboard(ns)
        await self.record(ns,total=20000)
        self.assertEqual(ns['db'].claims.records[0]['claim_status'],'approved')
        self.assertEqual((await self.dashboard(ns))['upcoming_payout_amount'],30000)
        await self.record(ns,total=50000,expected=20000,day='2026-01-03')
        after=await self.dashboard(ns);self.assertEqual(after['upcoming_payout_amount'],0)
        for key in ('upcoming_payments','total_saved','active_clubs','overdue_contributions'):self.assertEqual(after[key],before[key])
        row=ns['db'].claims.records[0];self.assertEqual(row['actual_amount_paid'],50000)
        self.assertEqual([p['amount'] for p in row['payout_payments']],[20000,30000])
        self.assertEqual(row['payout_payments'][0]['actual_payment_date'],datetime(2026,1,2))
        self.assertEqual(row['actual_payment_date'],datetime(2026,1,3))
        for result in (await ns['get_member_claims']('member-user',authorization=bearer('member-user')),
                       await ns['get_group_claims']('group-a',authorization=bearer('admin-user'))):
            record=result['claims'][0];self.assertEqual(record['status'],'paid')
            self.assertEqual(record['actual_amount_paid'],50000);self.assertEqual(record['actual_payment_date'],datetime(2026,1,3))

    async def test_missing_session_member_outsider_removed_and_inactive_cannot_record(self):
        for user,state in ((None,None),('member-user',None),('other-member',None),('admin-user','removed'),('admin-user','inactive')):
            ns=environment()
            if state:ns['db'].members.records[1]['status']=state;ns['db'].groups.records[0].pop('treasurer_user_id',None)
            before=copy.deepcopy(ns['db'].claims.records)
            with self.assertRaises(Exception) as error:await self.record(ns,user=user)
            self.assertIn(error.exception.status_code,(401,403));self.assertEqual(ns['db'].claims.records,before)

    async def test_cross_group_and_nonapproved_claims_rejected(self):
        for status in ('pending_review','rejected','paid','completed'):
            ns=environment();ns['db'].claims.records[0]['claim_status']=status
            with self.assertRaises(Exception) as error:await self.record(ns)
            self.assertEqual(error.exception.status_code,409);self.assertNotIn('payout_payments',ns['db'].claims.records[0])
        ns=environment()
        with self.assertRaises(Exception) as error:await self.record(ns,group='group-b')
        self.assertEqual(error.exception.status_code,403)
        ns['db'].claims.records[0]['group_id']='group-b'
        with self.assertRaises(Exception) as error:await self.record(ns)
        self.assertEqual(error.exception.status_code,404)

    async def test_invalid_amounts_and_dates_never_write(self):
        ns=environment();before=copy.deepcopy(ns['db'].claims.records)
        for value in (0,-1,float('nan'),float('inf'),True):
            with self.assertRaises(ValidationError):ns['ClaimPaymentRecord'](actual_amount_paid=value,expected_actual_amount_paid=0,actual_payment_date='2026-01-02')
        for value in (50001,20000.001,1e100):
            with self.assertRaises(Exception) as error:await self.record(ns,total=value)
            self.assertEqual(error.exception.status_code,422)
        for value in ('2026-02-30','',None):
            with self.assertRaises(ValidationError):ns['ClaimPaymentRecord'](actual_amount_paid=50000,expected_actual_amount_paid=0,actual_payment_date=value)
        with self.assertRaises(Exception) as error:await self.record(ns,day='2999-01-01')
        self.assertEqual(error.exception.status_code,422);self.assertEqual(ns['db'].claims.records,before)

    async def test_duplicate_full_and_partial_retry_append_once_and_old_retry_returns_current_state(self):
        for total in (20000,50000):
            ns=environment();await self.record(ns,total=total)
            result=await self.record(ns,total=total);self.assertTrue(result['already_recorded'])
            self.assertEqual(len(ns['db'].claims.records[0]['payout_payments']),1)
        ns=environment();await self.record(ns,total=20000);await self.record(ns,total=50000,expected=20000)
        result=await self.record(ns,total=20000);self.assertTrue(result['already_recorded'])
        self.assertEqual(result['status'],'paid');self.assertEqual(result['actual_amount_paid'],50000)
        self.assertEqual(len(ns['db'].claims.records[0]['payout_payments']),2)

    async def test_identical_concurrent_requests_return_one_atomic_receipt(self):
        ns=environment()
        async def competing(_):await self.record(ns)
        ns['db'].claims.before_update=competing
        result=await self.record(ns);self.assertTrue(result['already_recorded'])
        self.assertEqual(len(ns['db'].claims.records[0]['payout_payments']),1)

    async def test_two_admins_full_payment_only_one_wins(self):
        ns=environment();ns['db'].members.records.append(dict(id='second-admin',user_id='other-member',group_id='group-a',role_in_group='admin',status='active'))
        async def competing(_):await self.record(ns,user='other-member')
        ns['db'].claims.before_update=competing
        with self.assertRaises(Exception) as error:await self.record(ns)
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(len(ns['db'].claims.records[0]['payout_payments']),1)
        self.assertEqual(ns['db'].claims.records[0]['payout_payments'][0]['recorded_by_user_id'],'other-member')

    async def test_stale_partial_amount_or_rejection_cannot_overwrite_newer_state(self):
        ns=environment()
        async def competing(_):await self.record(ns,total=10000)
        ns['db'].claims.before_update=competing
        with self.assertRaises(Exception) as error:await self.record(ns,total=20000)
        self.assertEqual(error.exception.status_code,409);self.assertEqual(ns['db'].claims.records[0]['actual_amount_paid'],10000)
        for total in (10000,5000):
            with self.assertRaises(Exception) as error:await self.record(ns,total=total,expected=10000)
            self.assertEqual(error.exception.status_code,422)
        with self.assertRaises(Exception) as error:await self.record(ns,total=20000)
        self.assertEqual(error.exception.status_code,409)
        ns=environment();ns['db'].claims.before_update=lambda rows:rows[0].update(claim_status='rejected')
        with self.assertRaises(Exception) as error:await self.record(ns)
        self.assertEqual(error.exception.status_code,409);self.assertNotIn('actual_payment_date',ns['db'].claims.records[0])

    def test_previously_reviewed_payment_scheduling_approval_and_dashboard_are_byte_unchanged(self):
        import hashlib
        expected = {'set_claim_payout_date': 'f82586d1f48eae8f157d99a0d0ed16bcf3976862fe490ccde24921c7d382f589', 'review_group_claim': '2e31ceaab239568a01c089e29ad637f1b678c36b54094602fd758744909f9002', 'get_member_dashboard': 'b7563e18fee807a12033ab4fa396a190ca898d22732a136af1c910696883ac54'}
        source = SOURCE.read_text()
        for node in ast.parse(source).body:
            if isinstance(node, ast.AsyncFunctionDef) and node.name in expected:
                self.assertEqual(hashlib.sha256(ast.get_source_segment(source, node).encode()).hexdigest(), expected[node.name], node.name)
