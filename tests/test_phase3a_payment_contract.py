"""Offline Stage 3A routes: financial agreement, bounded history and read-only integrity."""
import copy
import ast
import subprocess
from pathlib import Path
import unittest
from test_payment_proof_review import environment, HTTPError


class PaymentContractTests(unittest.IsolatedAsyncioTestCase):
    def setup_records(self):
        ns = environment()
        db = ns['db']
        db.groups.records[0].update(group_type='travel', bank_name='Fixture', bank_account_number='000', bank_account_holder='Club')
        sample = db.contributions.records[0]
        sample.update(month=10, year=2026, amount_due=100, amount_paid=0,
                      contribution_status='pending', proof_of_payment=None)
        db.contributions.records = [copy.deepcopy(sample)]
        return ns, db, sample

    async def test_admin_member_same_record_and_period_financial_agreement(self):
        ns, db, sample = self.setup_records()
        for status, paid, review in [('pending', 30, None), ('confirmed', 100, 'approved'),
                                    ('paid', 100, 'approved'), ('proof_uploaded', 0, 'pending'),
                                    ('pending', 0, 'declined'), ('excused', 0, None)]:
            db.contributions.records[0].update(contribution_status=status, amount_paid=paid, proof_review_status=review)
            before = copy.deepcopy(vars(db))
            admin = await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', 'Bearer admin-user')
            member = await ns['get_member_club_details']('group-a', 'member-user', 'Bearer member-user', month=10, year=2026)
            self.assertEqual(admin['summary'], member['financial_summary'])
            own = member['contributions'][0]
            row = next(row for row in admin['contributions'] if row['id'])
            for key in ['expected_amount', 'confirmed_amount', 'outstanding_amount', 'payment_state', 'financial_warnings']:
                self.assertEqual(own[key], row[key])
            for name, collection in before.items():
                self.assertEqual(collection.records, getattr(db, name).records)

    async def test_multiple_records_months_history_identity_and_no_synthetic_obligations(self):
        ns, db, sample = self.setup_records()
        db.contributions.records += [{**sample, 'id': 'second'}, {**sample, 'id': 'old', 'month': 9}]
        result = await ns['get_member_club_details']('group-a', 'member-user', 'Bearer member-user', month=10, year=2026)
        self.assertEqual(len(result['contributions']), 2)
        self.assertEqual({r['contribution_id'] for r in result['payment_history']}, {sample['id'], 'second', 'old'})
        empty = await ns['get_member_club_details']('group-a', 'member-user', 'Bearer member-user', month=8, year=2026)
        self.assertIsNone(empty['current_contribution'])
        self.assertEqual(empty['financial_summary']['total_expected'], 0)
        self.assertEqual(len(db.contributions.records), 3)

    async def test_retained_former_owner_history_does_not_grant_current_club_or_writes(self):
        ns, db, sample = self.setup_records()
        db.members.records[0]['status'] = 'removed'
        history = await ns['get_personal_contributions']('member-user', 'Bearer member-user')
        self.assertTrue(history['contributions'][0]['historical_only'])
        self.assertFalse(history['contributions'][0]['proof_eligible'])
        self.assertFalse(history['contributions'][0]['proof_delete_eligible'])
        eligible = await ns['get_proof_eligible_contributions']('member-user', 'Bearer member-user')
        self.assertEqual(eligible['contributions'], [])
        with self.assertRaises(HTTPError):
            await ns['get_member_club_details']('group-a', 'member-user', 'Bearer member-user')

    async def test_orphan_retained_in_admin_totals_never_assigned_to_an_account(self):
        ns, db, sample = self.setup_records()
        db.members.records.pop(0)
        admin = await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', 'Bearer admin-user')
        row = next(r for r in admin['contributions'] if r['id'])
        self.assertEqual(row['member_name'], 'Former / unknown member')
        self.assertEqual(admin['summary']['total_expected'], 100)
        own = await ns['get_personal_contributions']('member-user', 'Bearer member-user')
        self.assertEqual(own['contributions'], [])

    async def test_authentication_other_account_and_other_club_denied(self):
        ns, db, sample = self.setup_records()
        for token in [None, 'Bearer outsider']:
            with self.assertRaises(HTTPError):
                await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', token)
            with self.assertRaises(HTTPError):
                await ns['get_personal_contributions']('member-user', token)
        with self.assertRaises(HTTPError):
            await ns['get_group_contributions']('group-b', 10, 2026, 'admin-user', 'Bearer admin-user')

    async def test_invalid_amount_never_zero_and_settled_legacy_discrepancy_warns(self):
        ns, db, sample = self.setup_records()
        db.contributions.records[0]['amount_due'] = None
        result = await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', 'Bearer admin-user')
        self.assertIsNone(result['summary']['total_expected'])
        self.assertEqual(next(r for r in result['contributions'] if r['id'])['payment_state'], 'invalid_amount')
        db.contributions.records[0].update(amount_due=100, amount_paid=30, contribution_status='confirmed')
        result = await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', 'Bearer admin-user')
        self.assertEqual(result['summary']['outstanding'], 0)
        self.assertEqual(result['summary']['collected'], 30)
        self.assertIn('SETTLED_AMOUNT_MISMATCH', next(r for r in result['contributions'] if r['id'])['financial_warnings'])

    async def test_unconfirmed_full_recorded_amount_never_confirmed(self):
        ns, db, sample = self.setup_records()
        db.contributions.records[0]['amount_paid'] = 100
        result = await ns['get_personal_contributions']('member-user', 'Bearer member-user')
        row = result['contributions'][0]
        self.assertEqual(row['payment_state'], 'awaiting_payment')
        self.assertEqual(row['confirmed_amount'], 0)
        self.assertEqual(row['outstanding_amount'], 0)
        self.assertIn('UNCONFIRMED_RECORDED_PAYMENT', row['financial_warnings'])

    def test_approved_read_changes_cannot_write_and_existing_write_auth_summary_handlers_unchanged(self):
        root = Path(__file__).resolve().parents[1]
        current = ast.parse((root / 'backend/server.py').read_text())
        previous = ast.parse(subprocess.check_output(['git', 'show', 'eca3c952b8978d632c45cb79b5009540cbeef8a7:backend/server.py'], cwd=root, text=True))
        functions = lambda tree: {node.name: node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
        old, new = functions(previous), functions(current)
        reads = {'get_group_payment_records', 'get_person_contribution_records', 'personal_contribution_view', 'get_personal_contributions', 'get_member_club_details', 'get_group_contributions', 'get_club_detail', 'get_member_dashboard'}
        self.assertEqual({name for name in old if ast.dump(old[name]) != ast.dump(new[name])}, reads)
        mutations = {'insert_one', 'insert_many', 'update_one', 'update_many', 'delete_one', 'delete_many', 'replace_one', 'find_one_and_update', 'find_one_and_delete'}
        for name in reads:
            self.assertFalse(any(isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in mutations for node in ast.walk(new[name])), name)
        for name in ['confirm_payment', 'upload_proof_of_payment', 'decline_contribution_proof', 'delete_contribution_proof', 'delete_member', 'get_intelligence_summary', 'verify_user_is_group_treasurer', 'authenticated_user_id']:
            self.assertEqual(ast.dump(old[name]), ast.dump(new[name]), name)

    async def test_duplicate_ids_poison_totals_but_distinct_monthly_ids_remain_valid(self):
        ns, db, sample = self.setup_records()
        db.contributions.records.append(copy.deepcopy(sample))
        result = await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', 'Bearer admin-user')
        self.assertIsNone(result['summary']['total_expected'])
        db.contributions.records[1]['id'] = 'distinct'
        result = await ns['get_group_contributions']('group-a', 10, 2026, 'admin-user', 'Bearer admin-user')
        self.assertEqual(result['summary']['total_expected'], 200)
