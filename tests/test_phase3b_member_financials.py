"""Offline Member dashboard contract and unchanged write-handler safeguards."""
import ast
import copy
from datetime import datetime
from pathlib import Path
import subprocess
import unittest
from test_member_read_authorization import environment, snapshot, bearer

class MemberFinancialTests(unittest.IsolatedAsyncioTestCase):
    async def test_dashboard_multiple_records_confirmed_only_and_no_financial_writes(self):
        ns = environment()
        now = datetime.now(ns['BUSINESS_TIMEZONE'])
        db = ns['db']
        sample = copy.deepcopy(db.contributions.records[0])
        db.contributions.records = [dict(sample, id='confirmed', month=now.month, year=now.year, amount_due=100, amount_paid=100, contribution_status='confirmed'),
            dict(sample, id='paid', month=now.month, year=now.year, amount_due=100, amount_paid=100, contribution_status='paid'),
            dict(sample, id='partial', month=now.month, year=now.year, amount_due=100, amount_paid=30, contribution_status='pending')]
        before = snapshot(ns)
        result = await ns['get_member_dashboard']('member-user', bearer('member-user'))
        self.assertEqual(result['summary']['total_saved'], 100)
        self.assertEqual(result['summary']['confirmed_collected'], 200)
        self.assertEqual(result['summary']['confirmed_collected_availability'], 'AVAILABLE')
        self.assertEqual(result['clubs'][0]['financial_summary']['total_expected'], 300)
        self.assertEqual(result['clubs'][0]['financial_summary']['outstanding'], 70)
        self.assertEqual(before, snapshot(ns))

    async def test_dashboard_missing_obligation_zero_and_invalid_amount_unavailable(self):
        ns = environment(); ns['db'].contributions.records = []
        result = await ns['get_member_dashboard']('member-user', bearer('member-user'))
        self.assertEqual(result['clubs'][0]['financial_summary']['total_expected'], 0)
        self.assertEqual(result['summary']['total_saved'], 0)
        sample = dict(id='invalid', member_id='membership-a', group_id='group-a', month=datetime.now().month, year=datetime.now().year, amount_due=None, amount_paid=10, contribution_status='pending')
        ns['db'].contributions.records = [sample]
        result = await ns['get_member_dashboard']('member-user', bearer('member-user'))
        self.assertEqual(result['summary']['total_saved'], 0)
        self.assertIsNone(result['summary']['confirmed_collected'])
        self.assertEqual(result['summary']['confirmed_collected_availability'], 'UNAVAILABLE')

    def test_write_handlers_and_frozen_intelligence_unchanged_from_stage3a(self):
        root = Path(__file__).resolve().parents[1]
        def functions(source): return {node.name: ast.dump(node) for node in ast.parse(source).body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
        old = functions(subprocess.check_output(['git', 'show', 'e471647344053e8736b644045f9dcf7eef6e2ee0:backend/server.py'], cwd=root, text=True))
        new = functions((root/'backend/server.py').read_text())
        self.assertEqual({name for name in old if old[name] != new[name]}, {'get_member_dashboard', 'get_member_club_details'})
        dashboard = next(node for node in ast.parse((root/'backend/server.py').read_text()).body if isinstance(node, ast.AsyncFunctionDef) and node.name == 'get_member_dashboard')
        self.assertFalse(any(isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in {'update_one','insert_one','delete_one','update_many'} for node in ast.walk(dashboard)))

    async def test_current_club_missing_bank_details_are_explicitly_unavailable(self):
        ns = environment()
        for key in ['bank_name','bank_account_number','bank_account_holder']:
            ns['db'].groups.records[0].pop(key, None)
        result = await ns['get_member_club_details']('group-a','member-user',bearer('member-user'))
        self.assertIsNone(result['payment_reference']['bank_name'])
        self.assertIsNone(result['payment_reference']['account_number'])
        self.assertIsNone(result['group']['bank_account_holder'])

    async def test_confirmed_malformed_amounts_fail_closed_without_record_changes(self):
        for amount in [None, '25', float('nan'), float('inf'), float('-inf'), -1, True]:
            with self.subTest(amount=repr(amount)):
                ns=environment(); sample=copy.deepcopy(ns['db'].contributions.records[0])
                ns['db'].contributions.records=[dict(sample, contribution_status='confirmed', amount_paid=amount)]
                before=repr(snapshot(ns))
                with self.assertRaises(ns['HTTPException']) as caught:
                    await ns['get_member_dashboard']('member-user',bearer('member-user'))
                self.assertEqual(caught.exception.status_code,409)
                self.assertEqual(before,repr(snapshot(ns)))

    async def test_legacy_valid_amount_with_invalid_obligation_keeps_numeric_compatibility(self):
        ns=environment(); sample=copy.deepcopy(ns['db'].contributions.records[0])
        ns['db'].contributions.records=[dict(sample, contribution_status='confirmed', amount_paid=25, amount_due=None)]
        result=await ns['get_member_dashboard']('member-user',bearer('member-user'))
        self.assertEqual(result['summary']['total_saved'],25)
        self.assertIsInstance(result['summary']['total_saved'],(int,float))
        self.assertIsNone(result['summary']['confirmed_collected'])
        self.assertEqual(result['summary']['confirmed_collected_availability'],'UNAVAILABLE')

    async def test_dashboard_legacy_total_ignores_other_members_and_unconfirmed_records(self):
        ns=environment(); sample=copy.deepcopy(ns['db'].contributions.records[0])
        ns['db'].contributions.records=[dict(sample,id='own',contribution_status='confirmed',amount_paid=25),
            dict(sample,id='other',member_id='membership-b',group_id='group-b',contribution_status='confirmed',amount_paid=999),
            dict(sample,id='pending',contribution_status='pending',amount_paid=50)]
        result=await ns['get_member_dashboard']('member-user',bearer('member-user'))
        self.assertEqual(result['summary']['total_saved'],25)
        self.assertEqual(result['summary']['confirmed_collected'],25)

    async def test_cross_club_mismatched_legacy_record_fails_closed(self):
        ns=environment(); sample=copy.deepcopy(ns['db'].contributions.records[0])
        ns['db'].contributions.records=[dict(sample,group_id='group-b',contribution_status='confirmed',amount_paid=999)]
        with self.assertRaises(ns['HTTPException']) as caught:
            await ns['get_member_dashboard']('member-user',bearer('member-user'))
        self.assertEqual(caught.exception.status_code,409)

    async def test_authoritative_records_are_counted_once_across_retained_memberships(self):
        ns=environment(); member=copy.deepcopy(ns['db'].members.records[0]); member['id']='second-membership'; ns['db'].members.records.append(member)
        sample=copy.deepcopy(ns['db'].contributions.records[0])
        ns['db'].contributions.records=[dict(sample,id='first',contribution_status='confirmed',amount_paid=25),dict(sample,id='second',member_id='second-membership',contribution_status='confirmed',amount_paid=50)]
        result=await ns['get_member_dashboard']('member-user',bearer('member-user'))
        self.assertEqual(result['summary']['total_saved'],75)
        self.assertEqual(result['summary']['confirmed_collected'],75)
