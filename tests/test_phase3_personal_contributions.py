"""Person-level contribution routes against memory only; never import the server."""
import ast
import copy
from types import SimpleNamespace
import unittest
from test_phase2_contributions import SOURCE, environment, record, HTTPError

route = next(n for n in ast.parse(SOURCE.read_text(encoding='utf-8-sig')).body
             if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_personal_contributions')
route.decorator_list = []
CODE = compile(ast.Module(body=[route], type_ignores=[]), str(SOURCE), 'exec')


def personal_environment(records=(), role='admin', **group):
    ns = environment(records, **group)
    ns['db'].members.rows[0]['role_in_group'] = role
    exec(CODE, ns)
    return ns


class PersonalContributionTests(unittest.IsolatedAsyncioTestCase):
    def assert_no_writes(self, ns):
        for collection in vars(ns['db']).values():
            self.assertEqual(collection.writes, [])

    async def test_admin_sees_genuine_personal_record(self):
        ns = personal_environment([record(amount_due=321.75, amount_paid=80)], monthly_contribution=9999)
        result = await ns['get_personal_contributions']('person', 'person')
        self.assertEqual(len(result['contributions']), 1)
        row = result['contributions'][0]
        self.assertEqual(row['contribution_id'], 'obligation')
        self.assertEqual((row['amount_due'], row['amount_paid'], row['outstanding_amount']), (321.75, 80, 241.75))
        self.assert_no_writes(ns)

    async def test_treasurer_has_same_personal_records_as_member(self):
        results = []
        for role in ('admin', 'treasurer', 'member'):
            ns = personal_environment([record()], role=role)
            results.append(await ns['get_personal_contributions']('person', 'person'))
            self.assertEqual(ns['db'].members.rows[0]['role_in_group'], role)
            self.assert_no_writes(ns)
        self.assertEqual(results[0], results[1]); self.assertEqual(results[1], results[2])

    async def test_admin_without_obligation_is_empty_without_manufacturing_records(self):
        ns = personal_environment(monthly_contribution=9999)
        self.assertEqual(await ns['get_personal_contributions']('person', 'person'), {'contributions': []})
        self.assertEqual(await ns['get_proof_eligible_contributions']('person', 'person'), {'contributions': []})
        self.assert_no_writes(ns)

    async def test_personal_member_and_proof_views_agree_on_amount_and_status(self):
        for status in ('pending', 'due', 'late', 'confirmed', 'excused', 'proof_uploaded'):
            ns = personal_environment([record(contribution_status=status)])
            personal = (await ns['get_personal_contributions']('person', 'person'))['contributions'][0]
            member = (await ns['get_member_club_details']('group', 'person'))['current_contribution']
            self.assertEqual(personal['status'], member['status'])
            self.assertEqual(personal['outstanding_amount'], member['outstanding_amount'])
            self.assertEqual(personal['amount_due'], member['amount_due'])
            eligible = (await ns['get_proof_eligible_contributions']('person', 'person'))['contributions']
            self.assertEqual(eligible, [personal] if member['proof_eligible'] else [])
            self.assert_no_writes(ns)

    async def test_paid_excused_fully_paid_and_uploaded_records_remain_visible_but_not_eligible(self):
        for change in [dict(contribution_status=s) for s in ('confirmed', 'paid', 'excused', 'proof_uploaded')] + [
                dict(amount_paid=125.5), dict(proof_of_payment='proof')]:
            ns = personal_environment([record(**change)])
            personal = (await ns['get_personal_contributions']('person', 'person'))['contributions']
            self.assertEqual(len(personal), 1); self.assertFalse(personal[0]['proof_eligible'])
            self.assertEqual(await ns['get_proof_eligible_contributions']('person', 'person'), {'contributions': []})
            self.assert_no_writes(ns)

    async def test_travel_never_gains_a_monthly_obligation_and_real_records_stay_flexible(self):
        for records in ([], [record(contribution_status='pending', amount_due=73)]):
            ns = personal_environment(records, group_type='travel', contribution_mode='flexible_goal', monthly_contribution=8888)
            personal = (await ns['get_personal_contributions']('person', 'person'))['contributions']
            self.assertEqual(len(personal), len(records))
            if personal:
                self.assertEqual(personal[0]['amount_due'], 73)
                self.assertIsNone(personal[0]['due_date'])
                self.assertEqual(personal[0]['status'], 'pending')
            self.assert_no_writes(ns)

    async def test_other_people_and_group_totals_cannot_enter_personal_results(self):
        ns = personal_environment([record(), record(id='other-obligation', member_id='other-member', amount_due=50000)])
        other = dict(ns['db'].members.rows[0], id='other-member', user_id='someone-else')
        ns['db'].members.rows.append(other)
        ns['db'].groups.rows[0].update(total_collected=60000, expected=70000)
        personal = (await ns['get_personal_contributions']('person', 'person'))['contributions']
        self.assertEqual([r['contribution_id'] for r in personal], ['obligation'])
        self.assertEqual(personal[0]['amount_due'], 125.5)
        with self.assertRaises(HTTPError) as caught:
            await ns['get_personal_contributions']('someone-else', 'person')
        self.assertEqual(caught.exception.status_code, 403)
        self.assert_no_writes(ns)

    async def test_active_memberships_across_roles_only_and_no_invitation_acceptance(self):
        ns = personal_environment([record()])
        for number, role, status in [(2, 'member', 'active'), (3, 'treasurer', 'active'), (4, 'admin', 'removed'), (5, 'member', 'pending')]:
            group = dict(ns['db'].groups.rows[0], id=f'group-{number}')
            ns['db'].groups.rows.append(group)
            ns['db'].members.rows.append(dict(ns['db'].members.rows[0], id=f'm-{number}', group_id=group['id'], role_in_group=role, status=status))
            ns['db'].contributions.rows.append(record(id=f'c-{number}', group_id=group['id'], member_id=f'm-{number}'))
        before = copy.deepcopy(ns['db'].members.rows)
        rows = (await ns['get_personal_contributions']('person', 'person'))['contributions']
        self.assertEqual({r['contribution_id'] for r in rows}, {'obligation', 'c-2', 'c-3'})
        self.assertEqual(ns['db'].members.rows, before); self.assert_no_writes(ns)

    async def test_invalid_amounts_fail_instead_of_presenting_an_empty_or_zero_position(self):
        ns = personal_environment([record(amount_paid=None)])
        with self.assertRaises(HTTPError) as caught:
            await ns['get_personal_contributions']('person', 'person')
        self.assertEqual(caught.exception.status_code, 409); self.assert_no_writes(ns)

    async def test_admin_upload_uses_the_same_phase2_record_and_refreshes_to_awaiting_confirmation(self):
        ns = personal_environment([record()])
        row = (await ns['get_proof_eligible_contributions']('person', 'person'))['contributions'][0]
        await ns['upload_proof_of_payment'](SimpleNamespace(contribution_id=row['contribution_id'],
            user_id='person', proof_image='proof', reference_number='REF'))
        updated = (await ns['get_personal_contributions']('person', 'person'))['contributions'][0]
        self.assertEqual(updated['status'], 'proof_uploaded'); self.assertFalse(updated['proof_eligible'])
        self.assertEqual(ns['db'].members.rows[0]['role_in_group'], 'admin')
        self.assertEqual(updated['amount_paid'], 25)


if __name__ == '__main__':
    unittest.main(verbosity=2)
