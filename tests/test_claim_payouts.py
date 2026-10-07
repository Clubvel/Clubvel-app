"""Offline actual payout scheduling/dashboard handlers; no live data or app startup."""
import ast
import copy
import unittest
from datetime import date, datetime
from pydantic import BaseModel, ValidationError
from test_member_read_authorization import environment as read_environment, ReadCollection
from test_account_authorization import bearer
from test_payment_proof_review import SOURCE


def environment():
    ns = read_environment()
    ns.update(date=date, BaseModel=BaseModel)
    nodes = [n for n in ast.parse(SOURCE.read_text()).body
             if isinstance(n, (ast.ClassDef, ast.AsyncFunctionDef))
             and n.name in {'ClaimPayoutDate', 'set_claim_payout_date', 'get_member_claims', 'get_group_claims'}]
    for node in nodes:
        if hasattr(node, 'decorator_list'): node.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'claim-payout', 'exec'), ns)
    return ns


def claim(identity='approved', status='approved', amount=50000, **extra):
    return dict(id=identity, group_id='group-a', member_id='membership-a',
                claim_status=status, claim_amount=amount, **extra)


class ClaimPayoutTests(unittest.IsolatedAsyncioTestCase):
    async def dashboard(self, ns):
        return await ns['get_member_dashboard']('member-user', authorization=bearer('member-user'))

    async def test_approved_unpaid_total_with_or_without_date_and_existing_totals_unchanged(self):
        ns = environment()
        before = await self.dashboard(ns)
        ns['db'].claims.records = [claim(), claim('second', amount=20000, scheduled_claim_date=datetime(2026, 11, 20))]
        after = await self.dashboard(ns)
        self.assertEqual(after['summary']['upcoming_payout_amount'], 70000)
        for key in ('total_saved', 'upcoming_payments', 'overdue_contributions', 'active_clubs'):
            self.assertEqual(after['summary'][key], before['summary'][key])
        self.assertEqual(after['clubs'], before['clubs'])

    async def test_nonapproved_and_other_members_or_clubs_never_count(self):
        ns = environment()
        records = [claim(status=s, scheduled_claim_date=datetime(2026, 11, 20)) for s in ('pending_review', 'rejected', 'upcoming', 'ready', 'processing', 'paid', 'completed', 'confirmed')]
        other = claim('other'); other['member_id'] = 'membership-b'
        wrong_group = claim('wrong'); wrong_group['group_id'] = 'group-b'
        ns['db'].claims.records = records + [other, wrong_group]
        self.assertEqual((await self.dashboard(ns))['summary']['upcoming_payout_amount'], 0)

    async def test_recorded_amount_paid_is_not_counted_again(self):
        ns = environment()
        ns['db'].claims.records = [claim(actual_amount_paid=50000), claim('partial', amount=20000, actual_amount_paid=5000)]
        self.assertEqual((await self.dashboard(ns))['summary']['upcoming_payout_amount'], 15000)

    async def test_inactive_membership_not_counted(self):
        ns = environment(); ns['db'].claims.records = [claim()]
        ns['db'].members.records[0]['status'] = 'removed'
        self.assertEqual((await self.dashboard(ns))['summary']['upcoming_payout_amount'], 0)

    async def schedule(self, ns, user='admin-user', group='group-a', identity='approved', value='2026-11-20'):
        return await ns['set_claim_payout_date'](group, identity, ns['ClaimPayoutDate'](scheduled_claim_date=value), authorization=bearer(user) if user else None)

    async def test_admin_and_treasurer_can_set_change_date_specific_claim_without_payment(self):
        for role in ('admin', 'treasurer'):
            ns = environment(); ns['db'].claims.records = [claim(), claim('untouched')]
            ns['db'].members.records[1]['role_in_group'] = role
            other = copy.deepcopy(ns['db'].claims.records[1]); contributions = copy.deepcopy(ns['db'].contributions.records)
            result = await self.schedule(ns)
            self.assertEqual(result['scheduled_claim_date'], datetime(2026, 11, 20))
            await self.schedule(ns, value='2026-12-01')
            record = ns['db'].claims.records[0]
            self.assertEqual(record['scheduled_claim_date'], datetime(2026, 12, 1))
            self.assertEqual(record['claim_status'], 'approved')
            self.assertEqual(record['claim_amount'], 50000)
            self.assertNotIn('actual_amount_paid', record)
            self.assertEqual(ns['db'].claims.records[1], other)
            self.assertEqual(ns['db'].contributions.records, contributions)
            for result in [await ns['get_member_claims']('member-user', authorization=bearer('member-user')),
                           await ns['get_group_claims']('group-a', authorization=bearer('admin-user'))]:
                scheduled = next(c for c in result['claims'] if c['claim_id'] == 'approved')
                self.assertEqual(scheduled['scheduled_claim_date'], datetime(2026, 12, 1))

    async def test_member_outsider_missing_session_and_removed_admin_cannot_schedule(self):
        for user in ('member-user', 'other-member', None, 'removed-admin'):
            ns = environment(); ns['db'].claims.records = [claim()]
            if user == 'removed-admin':
                ns['db'].members.records[1]['status'] = 'removed'; user = 'admin-user'
                ns['db'].groups.records[0].pop('treasurer_user_id', None)
            before = copy.deepcopy(ns['db'].claims.records)
            with self.assertRaises(Exception) as error: await self.schedule(ns, user=user)
            self.assertIn(error.exception.status_code, (401, 403))
            self.assertEqual(ns['db'].claims.records, before)

    async def test_cross_group_identifier_and_nonapproved_claim_cannot_schedule(self):
        for status in ('pending_review', 'rejected', 'paid', 'completed'):
            ns = environment(); ns['db'].claims.records = [claim(status=status)]
            with self.assertRaises(Exception) as error: await self.schedule(ns)
            self.assertEqual(error.exception.status_code, 409)
        ns = environment(); ns['db'].claims.records = [claim()]
        with self.assertRaises(Exception) as error: await self.schedule(ns, group='group-b')
        self.assertEqual(error.exception.status_code, 403)
        foreign = claim('foreign'); foreign['group_id'] = 'group-b'
        ns['db'].claims.records.append(foreign)
        with self.assertRaises(Exception) as error: await self.schedule(ns, identity='foreign')
        self.assertEqual(error.exception.status_code, 404)

    async def test_invalid_date_rejected_and_no_backfill_required(self):
        ns = environment()
        for invalid in ('not-a-date', '2026-02-30', '2026-13-01', ''):
            with self.assertRaises(ValidationError): ns['ClaimPayoutDate'](scheduled_claim_date=invalid)
        ns['db'].claims.records = [claim()]
        self.assertEqual((await self.dashboard(ns))['summary']['upcoming_payout_amount'], 50000)
        self.assertNotIn('scheduled_claim_date', ns['db'].claims.records[0])

    async def test_payment_race_prevents_date_update(self):
        ns = environment(); ns['db'].claims = ReadCollection([claim()])
        ns['db'].claims.before_update = lambda records: records[0].update(claim_status='paid', actual_amount_paid=50000)
        with self.assertRaises(Exception) as error: await self.schedule(ns)
        self.assertEqual(error.exception.status_code, 409)
        self.assertNotIn('scheduled_claim_date', ns['db'].claims.records[0])
