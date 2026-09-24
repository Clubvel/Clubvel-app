"""Reporting tests execute AST-selected functions with memory collections only."""
import ast
import unittest
from test_phase2_contributions import SOURCE, environment, record, HTTPError

NAMES = {'contribution_report', 'get_group_report'}
functions = [n for n in ast.parse(SOURCE.read_text(encoding='utf-8-sig')).body
             if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in NAMES]
assert {n.name for n in functions} == NAMES
for n in functions: n.decorator_list = []
CODE = compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), 'exec')


def reporting(records=(), **group):
    ns = environment(records, **group)
    ns['db'].members.rows[0]['role_in_group'] = 'admin'
    exec(CODE, ns)
    return ns


def row(**changes):
    return record(**dict(dict(year=2020, month=2), **changes))


class ReportTests(unittest.IsolatedAsyncioTestCase):
    async def report(self, ns, month=2, year=2020):
        result = await ns['get_group_report']('group', year, month, 'person')
        for collection in vars(ns['db']).values(): self.assertEqual(collection.writes, [])
        return result

    async def test_partial_paid_and_unpaid_are_not_full_collection(self):
        ns = reporting([row(amount_due=300, amount_paid=70), row(id='second', amount_due=200, amount_paid=0)])
        r = await self.report(ns)
        self.assertEqual(r['summary']['total_collected'], 70)
        self.assertEqual(r['summary']['outstanding'], 430)
        self.assertEqual(r['summary']['recorded_obligations'], 500)
        self.assertEqual(r['summary']['collection_rate'], 14)

    async def test_no_record_no_manufactured_obligation_or_rate_for_fixed_or_travel(self):
        for options in ({'monthly_contribution': 9999}, {'group_type': 'travel', 'contribution_mode': 'flexible_goal', 'monthly_contribution': 9999}):
            r = await self.report(reporting(**options))
            self.assertEqual(r['rows'], [])
            self.assertIsNone(r['summary']['collection_rate'])
            for k, v in r['summary'].items():
                if k != 'collection_rate': self.assertEqual(v, 0)

    async def test_zero_denominator_is_unavailable(self):
        r = await self.report(reporting([row(amount_due=0, amount_paid=25)]))
        self.assertEqual(r['summary']['total_collected'], 25)
        self.assertIsNone(r['summary']['collection_rate'])

    async def test_excused_is_not_obligation_but_recorded_paid_remains_paid(self):
        r = await self.report(reporting([row(contribution_status='excused', amount_paid=10)]))
        self.assertEqual(r['summary']['outstanding'], 0)
        self.assertEqual(r['summary']['total_collected'], 10)
        self.assertEqual(r['summary']['recorded_obligations'], 0)
        self.assertIsNone(r['summary']['collection_rate'])

    async def test_settled_and_overpaid_never_outstanding_or_rate_over_100(self):
        for status, paid in [('confirmed', 125.5), ('paid', 125.5), ('pending', 200)]:
            r = await self.report(reporting([row(contribution_status=status, amount_paid=paid)]))
            self.assertEqual(r['summary']['outstanding'], 0)
            self.assertEqual(r['summary']['late_members'], 0)
            self.assertEqual(r['summary']['collection_rate'], 100)
            self.assertEqual(r['summary']['total_collected'], paid)

    async def test_status_never_invents_paid_amount(self):
        r = await self.report(reporting([row(contribution_status='confirmed', amount_paid=0)]))
        self.assertEqual(r['summary']['total_collected'], 0)
        self.assertEqual(r['summary']['outstanding'], 0)
        self.assertEqual(r['summary']['collection_rate'], 0)

    async def test_uploaded_proof_separate_from_outstanding_and_late(self):
        for changes in ({'contribution_status': 'proof_uploaded'}, {'proof_of_payment': 'stored-proof'}):
            r = await self.report(reporting([row(**changes)]))
            self.assertEqual(r['summary']['outstanding'], 0)
            self.assertEqual(r['summary']['late_members'], 0)
            self.assertEqual(r['summary']['awaiting_verification'], 100.5)
            self.assertEqual(r['summary']['total_collected'], 25)

    async def test_late_people_deduplicated_across_records_and_memberships(self):
        ns = reporting([row(contribution_status='late'), row(id='second', member_id='another', contribution_status='late')])
        ns['db'].members.rows.append(dict(ns['db'].members.rows[0], id='another'))
        r = await self.report(ns)
        self.assertEqual(len(r['rows']), 2)
        self.assertEqual(r['summary']['late_members'], 1)
        self.assertEqual(r['summary']['total_collected'], 50)

    async def test_travel_status_not_inferred_from_past_month(self):
        r = await self.report(reporting([row(contribution_status='pending')], group_type='travel', contribution_mode='flexible_goal'))
        self.assertEqual(r['rows'][0]['status'], 'pending')
        self.assertEqual(r['summary']['late_members'], 0)
        self.assertEqual(r['summary']['outstanding'], 100.5)

    async def test_group_month_year_and_empty_history(self):
        ns = reporting([row(), row(id='march', month=3), row(id='other-year', year=2021), row(id='other-group', group_id='elsewhere')])
        self.assertEqual(len((await self.report(ns))['rows']), 1)
        self.assertEqual(len((await self.report(ns, month=None))['rows']), 2)
        self.assertEqual((await self.report(ns, month=4))['rows'], [])
        self.assertEqual((await self.report(ns, year=2019))['rows'], [])

    async def test_former_member_historical_record_is_retained(self):
        ns = reporting([row(member_id='former')])
        ns['db'].members.rows.append(dict(id='former', user_id='ex-person', group_id='group', status='removed'))
        r = await self.report(ns)
        self.assertEqual(r['rows'][0]['person_id'], 'ex-person')
        self.assertIsNone(r['rows'][0]['member_name'])
        self.assertIsNone(r['rows'][0]['payment_date'])

    async def test_invalid_money_status_or_orphan_fails_not_zero(self):
        for changes in ({'amount_paid': None}, {'amount_due': float('nan')}, {'amount_paid': True}, {'contribution_status': 'unknown'}, {'member_id': 'missing'}, {'id': ''}):
            with self.assertRaises(HTTPError) as caught: await self.report(reporting([row(**changes)]))
            self.assertEqual(caught.exception.status_code, 409)

    async def test_duplicate_record_ids_rejected_not_double_counted(self):
        with self.assertRaises(HTTPError) as caught: await self.report(reporting([row(), row()]))
        self.assertEqual(caught.exception.status_code, 409)

    async def test_access_is_person_and_active_group_membership_not_ownership(self):
        for role, status, person, group in [('member', 'active', 'person', 'group'), ('admin', 'removed', 'person', 'group'),
                                            ('admin', 'active', 'someone-else', 'group'), ('admin', 'active', 'person', 'other-group')]:
            ns = reporting([row()]); ns['db'].members.rows[0].update(role_in_group=role, status=status)
            with self.assertRaises(HTTPError) as caught: await ns['get_group_report'](group, 2020, 2, person)
            self.assertEqual(caught.exception.status_code, 403)
            for collection in vars(ns['db']).values(): self.assertEqual(collection.writes, [])
        for role in ('admin', 'treasurer'):
            ns = reporting([row()]); ns['db'].members.rows[0]['role_in_group'] = role
            self.assertEqual(len((await self.report(ns))['rows']), 1)

    async def test_invalid_period_rejected(self):
        for year, month in [(0, 2), (2020, 0), (2020, 13), (10000, None)]:
            with self.assertRaises(HTTPError) as caught: await self.report(reporting(), month, year)
            self.assertEqual(caught.exception.status_code, 422)

    async def test_cents_add_without_float_accumulation(self):
        r = await self.report(reporting([row(amount_due=.3, amount_paid=.1), row(id='b', amount_due=.3, amount_paid=.2)]))
        self.assertEqual(r['summary']['total_collected'], .3)
        self.assertEqual(r['summary']['outstanding'], .3)
        self.assertEqual(r['summary']['collection_rate'], 50)


if __name__ == '__main__': unittest.main()
