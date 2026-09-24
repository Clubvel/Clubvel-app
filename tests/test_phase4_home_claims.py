"""Verify Home's existing claim source in memory; no server import or services."""
import ast
from datetime import datetime
import unittest
from unittest.mock import AsyncMock
from test_phase2_contributions import SOURCE, Collection, environment

node = next(n for n in ast.parse(SOURCE.read_text(encoding='utf-8-sig')).body
            if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_member_payout_schedule')
node.decorator_list = []
CODE = compile(ast.Module(body=[node], type_ignores=[]), str(SOURCE), 'exec')


def claims_environment(rows):
    ns = environment()
    ns['db'].claims = Collection(rows)
    ns['get_active_membership_contexts'] = AsyncMock(return_value=[(ns['db'].members.rows[0], ns['db'].groups.rows[0])])
    exec(CODE, ns)
    return ns


class HomeClaimsTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_real_person_membership_and_matching_group_claims_are_returned(self):
        actual = dict(member_id='membership', group_id='group', claim_amount=987, scheduled_claim_date=datetime(2026, 10, 1))
        ns = claims_environment([actual, dict(actual, member_id='other-person', claim_amount=99999),
                                 dict(actual, group_id='unrelated', claim_amount=88888)])
        result = await ns['get_member_payout_schedule']('person')
        self.assertEqual(len(result['schedules']), 1)
        self.assertEqual(result['schedules'][0]['amount'], 987)
        ns['get_active_membership_contexts'].assert_awaited_once_with('person')
        for collection in vars(ns['db']).values(): self.assertEqual(collection.writes, [])

    async def test_no_stored_claim_is_empty_not_a_prediction_from_group_contributions(self):
        ns = claims_environment([])
        ns['db'].groups.rows[0]['monthly_contribution'] = 50000
        self.assertEqual(await ns['get_member_payout_schedule']('person'), {'schedules': []})
        for collection in vars(ns['db']).values(): self.assertEqual(collection.writes, [])

    async def test_claim_read_failure_is_not_converted_to_empty(self):
        ns = claims_environment([])
        ns['db'].claims.find = lambda _: (_ for _ in ()).throw(RuntimeError('database unavailable'))
        with self.assertRaises(RuntimeError): await ns['get_member_payout_schedule']('person')


if __name__ == '__main__':
    unittest.main(verbosity=2)
