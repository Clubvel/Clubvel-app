"""Payout integrity tests: in-memory collections, never start/import the server."""
import ast
from datetime import datetime
import unittest
from unittest.mock import AsyncMock
from test_phase2_contributions import SOURCE, Collection, environment, record, HTTPError
from test_phase4_home_claims import claims_environment

node = next(n for n in ast.parse(SOURCE.read_text(encoding='utf-8-sig')).body
            if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_admin_payout_schedules')
node.decorator_list = []
CODE = compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), 'exec')


def payout_environment(claims=(), **group):
    ns = environment([record()], **group)
    ns['db'].claims = Collection(claims)
    ns['verify_treasurer_owns_groups'] = AsyncMock(return_value=ns['db'].groups.rows)
    exec(CODE, ns)
    return ns


class PayoutTests(unittest.IsolatedAsyncioTestCase):
    def assert_read_only(self, ns):
        for collection in vars(ns['db']).values(): self.assertEqual(collection.writes, [])

    async def test_contribution_amount_and_membership_order_never_create_payouts(self):
        for amount in (0, 500, 99999):
            ns = payout_environment(monthly_contribution=amount)
            ns['db'].members.rows[0]['payout_position'] = 1
            ns['db'].members.rows.insert(0, dict(ns['db'].members.rows[0], id='arbitrary', payout_position=0))
            self.assertEqual(await ns['get_admin_payout_schedules']('person'), {'schedules': []})
            self.assert_read_only(ns)

    async def test_all_group_types_including_travel_without_claims_have_no_schedule(self):
        for group_type in ('savings', 'burial', 'investment', 'grocery', 'social', 'travel'):
            ns = payout_environment(group_type=group_type, contribution_mode='flexible_goal' if group_type == 'travel' else 'fixed_monthly')
            self.assertEqual(await ns['get_admin_payout_schedules']('person'), {'schedules': []})
            self.assert_read_only(ns)

    async def test_only_persisted_claim_defines_recipient_amount_date_not_current_time_or_first_member(self):
        claim = dict(id='real-claim', member_id='membership', group_id='group', claim_amount=123.45,
                     scheduled_claim_date=datetime(2031, 7, 9), claim_status='upcoming')
        ns = payout_environment([claim, dict(claim, id='other', group_id='unmanaged')], monthly_contribution=99999)
        ns['db'].members.rows.insert(0, dict(ns['db'].members.rows[0], id='first', user_id='other-person', payout_position=1))
        ns['db'].users.rows.append(dict(id='other-person', full_name='Wrong recipient'))
        ns['datetime'] = None  # This route must not derive a date from the current clock.
        result = await ns['get_admin_payout_schedules']('person')
        self.assertEqual(result, {'schedules': [dict(claim_id='real-claim', club_name='Test group', recipient='Test person',
            payout_date='2031-07-09', amount=123.45, status='upcoming')]})
        ns['verify_treasurer_owns_groups'].assert_awaited_once_with('person')
        self.assert_read_only(ns)

    async def test_missing_claim_details_remain_unknown_without_amount_date_or_recipient_fallbacks(self):
        ns = payout_environment([dict(id='partial', group_id='group', member_id='missing', claim_status='upcoming')])
        row = (await ns['get_admin_payout_schedules']('person'))['schedules'][0]
        self.assertIsNone(row['amount']); self.assertIsNone(row['payout_date']); self.assertIsNone(row['recipient'])
        self.assert_read_only(ns)

    async def test_person_claims_do_not_expose_join_order_as_payout_order(self):
        ns = claims_environment([dict(id='claim', group_id='group', member_id='membership', claim_amount=70,
                                     scheduled_claim_date=datetime(2030, 1, 2))])
        ns['db'].members.rows[0]['payout_position'] = 99
        row = (await ns['get_member_payout_schedule']('person'))['schedules'][0]
        self.assertIsNone(row['position']); self.assertEqual(row['amount'], 70)
        self.assert_read_only(ns)

    async def test_authorization_failure_does_not_return_an_empty_schedule(self):
        ns = payout_environment()
        ns['verify_treasurer_owns_groups'].side_effect = HTTPError(403, 'Forbidden')
        with self.assertRaises(HTTPError): await ns['get_admin_payout_schedules']('person')
        self.assert_read_only(ns)

    async def test_database_failure_is_not_an_empty_arrangement(self):
        ns = payout_environment()
        ns['db'].claims.find = lambda _: (_ for _ in ()).throw(RuntimeError('offline'))
        with self.assertRaises(RuntimeError): await ns['get_admin_payout_schedules']('person')
        self.assert_read_only(ns)


if __name__ == '__main__':
    unittest.main(verbosity=2)
