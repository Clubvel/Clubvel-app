"""Read-only, in-memory reminder checks. No server imports or messaging."""
import ast
import unittest
from test_phase2_contributions import SOURCE, environment, record, HTTPError
route = next(n for n in ast.parse(SOURCE.read_text(encoding='utf-8-sig')).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_contribution_reminder')
route.decorator_list = []
CODE = compile(ast.Module(body=[route], type_ignores=[]), str(SOURCE), 'exec')
def setup(records=(), **group):
    ns = environment(records, **group)
    ns['db'].members.rows[0]['role_in_group'] = 'admin'
    exec(CODE, ns)
    return ns
class ReminderTests(unittest.IsolatedAsyncioTestCase):
    async def call(self, ns, group='group', person='person'):
        try: return await ns['get_contribution_reminder']('obligation', group, person)
        finally:
            for c in vars(ns['db']).values(): self.assertEqual(c.writes, [])
    async def test_exact_record_partial_amount_and_real_person(self):
        ns=setup([record()], monthly_contribution=9999)
        result=await self.call(ns)
        self.assertEqual((result['amount_due'],result['amount_paid']), (125.5,25))
        self.assertEqual((result['member_id'],result['member_name'],result['group_id']), ('membership','Test person','group'))
    async def test_nonpayable_and_unknown_states_never_prepared(self):
        for change in [dict(contribution_status=s) for s in ('excused','paid','confirmed','proof_uploaded','unknown')] + [dict(proof_of_payment='proof'),dict(amount_paid=125.5),dict(amount_paid=None)]:
            with self.assertRaises(HTTPError): await self.call(setup([record(**change)]))
    async def test_no_record_including_travel_never_creates_obligation(self):
        for g in ({},dict(group_type='travel',contribution_mode='flexible_goal')):
            with self.assertRaises(HTTPError): await self.call(setup(**g))
    async def test_authority_is_active_contextual_membership_not_ownership(self):
        for role,status,person,group in [('member','active','person','group'),('admin','removed','person','group'),('admin','active','other','group'),('admin','active','person','other')]:
            ns=setup([record()]); ns['db'].members.rows[0].update(role_in_group=role,status=status)
            with self.assertRaises(HTTPError) as caught: await self.call(ns,group,person)
            self.assertEqual(caught.exception.status_code,403)
        ns=setup([record()]); ns['db'].members.rows[0]['role_in_group']='treasurer'
        self.assertEqual((await self.call(ns))['contribution_id'],'obligation')
    async def test_status_recalculation_already_preserves_nonpayable_states(self):
        ns=setup()
        for s in ('excused','paid','confirmed','proof_uploaded'):
            self.assertEqual(ns['calculate_contribution_status'](record(contribution_status=s,year=2020),15),s)
        self.assertEqual(ns['personal_contribution_status'](record(proof_of_payment='proof'),ns['db'].groups.rows[0]),'proof_uploaded')
    async def test_real_flexible_record_uses_actual_balance_without_calendar_debt(self):
        ns=setup([record(contribution_status='pending',year=2020)],group_type='travel',contribution_mode='flexible_goal')
        result=await self.call(ns)
        self.assertEqual(result['status'],'pending'); self.assertNotIn('due_date',result)
