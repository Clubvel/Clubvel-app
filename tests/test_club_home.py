"""Offline shared Club Home context: no reconciliation, writes or private roster."""
import ast
import copy
import unittest
from pathlib import Path
from typing import Optional
from test_member_read_authorization import environment, snapshot, bearer
from test_account_authorization import DenyDatabase, HTTPError as AuthHTTPError


def context_environment():
    ns = environment()
    node = next(n for n in ast.parse((Path(__file__).resolve().parents[1] / 'backend/server.py').read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_club_home_context')
    node.decorator_list = []
    ns['Optional'] = Optional
    ns['Header'] = lambda default: default
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'club-home-route', 'exec'), ns)
    return ns


class ClubHomeTests(unittest.IsolatedAsyncioTestCase):
    async def test_member_and_admin_context_uses_club_membership_role_without_reconciliation(self):
        for actor in ['member-user', 'admin-user']:
            ns = context_environment(); before = snapshot(ns)
            result = await ns['get_club_home_context']('group-a', bearer(actor), 10, 2026)
            membership = next(row for row in ns['db'].members.records if row['user_id'] == actor and row['group_id'] == 'group-a')
            self.assertEqual(result['membership'], {'id': membership['id'], 'role': membership.get('role_in_group', 'member'), 'status': 'active'})
            self.assertEqual(result['club']['id'], 'group-a')
            self.assertEqual(result['period'], {'month': 10, 'year': 2026, 'timezone': 'Africa/Johannesburg'})
            self.assertEqual(snapshot(ns), before)
            ns['reconcile_legacy_admin_memberships'].assert_not_awaited()
            self.assertNotIn('members', result)
            self.assertNotIn('profile_photo', str(result)); self.assertNotIn('phone_number', str(result))

    async def test_missing_invalid_forged_expired_auth_denied_before_reads(self):
        for token in [None, 'Bearer invalid', bearer('member-user', key='wrong'), bearer('member-user', expired=True)]:
            ns = context_environment(); ns['db'] = DenyDatabase()
            with self.assertRaises(AuthHTTPError): await ns['get_club_home_context']('group-a', token)
            self.assertEqual(ns['db'].accesses, 0)

    async def test_former_revoked_inactive_cross_club_and_inactive_account_denied(self):
        for condition in ['removed', 'inactive', 'deleted', 'club', 'account', 'foreign']:
            ns = context_environment()
            if condition in ['removed', 'inactive']: ns['db'].members.records[0]['status'] = condition
            elif condition == 'deleted': ns['db'].members.records.pop(0)
            elif condition == 'club': ns['db'].groups.records[0]['status'] = 'inactive'
            elif condition == 'account': ns['db'].users.records[0]['status'] = 'inactive'
            before = snapshot(ns)
            with self.assertRaises(ns['HTTPException']): await ns['get_club_home_context']('group-a', bearer('other-member' if condition == 'foreign' else 'member-user'))
            self.assertEqual(snapshot(ns), before)
            self.assertFalse(ns['db'].contributions.reads)

    async def test_own_financial_records_only_and_confirmed_contract(self):
        ns = context_environment(); db = ns['db']; sample = copy.deepcopy(db.contributions.records[0])
        db.contributions.records = [dict(sample, id='confirmed', month=10, year=2026, amount_due=100, amount_paid=100, contribution_status='confirmed'), dict(sample, id='partial', month=10, year=2026, amount_due=100, amount_paid=30, contribution_status='pending'), dict(sample, id='private', member_id='another-person', month=10, year=2026, amount_due=999, amount_paid=999, contribution_status='confirmed'), dict(sample, id='old', month=9, year=2026, amount_due=888, amount_paid=888, contribution_status='confirmed')]
        before = snapshot(ns)
        result = await ns['get_club_home_context']('group-a', bearer('member-user'), 10, 2026)
        self.assertEqual(result['record_count'], 2)
        self.assertEqual(result['own_financial_summary']['total_expected'], 200)
        self.assertEqual(result['own_financial_summary']['collected'], 100)
        self.assertEqual(result['own_financial_summary']['outstanding'], 70)
        self.assertEqual(snapshot(ns), before)

    async def test_no_obligation_and_malformed_amount_are_distinct(self):
        ns = context_environment(); ns['db'].contributions.records = []
        result = await ns['get_club_home_context']('group-a', bearer('member-user'), 10, 2026)
        self.assertEqual(result['record_count'], 0); self.assertEqual(result['own_financial_summary']['collected'], 0)
        ns = context_environment(); ns['db'].contributions.records[0].update(month=10, year=2026, amount_due='bad')
        result = await ns['get_club_home_context']('group-a', bearer('member-user'), 10, 2026)
        self.assertIsNone(result['own_financial_summary']['collected']); self.assertEqual(result['availability']['collected'], 'UNAVAILABLE')

    async def test_mixed_roles_switcher_uses_only_active_owned_clubs(self):
        ns = context_environment(); db = ns['db']
        db.groups.records.append(dict(db.groups.records[0], id='second', group_name='Second'))
        db.members.records.append(dict(db.members.records[0], id='second-member', group_id='second', role_in_group='admin'))
        member = await ns['get_club_home_context']('group-a', bearer('member-user'), 10, 2026)
        admin = await ns['get_club_home_context']('second', bearer('member-user'), 10, 2026)
        self.assertEqual(member['membership']['role'], 'member'); self.assertEqual(admin['membership']['role'], 'admin')
        self.assertEqual({row['id'] for row in member['clubs']}, {'group-a', 'second'})
        db.groups.records[-1]['status'] = 'inactive'
        result = await ns['get_club_home_context']('group-a', bearer('member-user'), 10, 2026)
        self.assertEqual([row['id'] for row in result['clubs']], ['group-a'])

    async def test_invalid_period_rejected(self):
        ns = context_environment()
        with self.assertRaises(ns['HTTPException']): await ns['get_club_home_context']('group-a', bearer('member-user'), 13, 2026)

    async def test_retained_owned_memberships_do_not_drop_obligations_or_grant_inactive_roles(self):
        ns = context_environment(); db = ns['db']
        sample = dict(db.contributions.records[0], month=10, year=2026, amount_due=100, amount_paid=100, contribution_status='confirmed')
        db.members.records.append(dict(db.members.records[0], id='retained-owned', role_in_group='member'))
        db.members.records.append(dict(db.members.records[0], id='inactive-admin', role_in_group='admin', status='inactive'))
        db.contributions.records = [dict(sample, id='one'), dict(sample, id='two', member_id='retained-owned'), dict(sample, id='wrong-club', group_id='foreign')]
        before = snapshot(ns)
        result = await ns['get_club_home_context']('group-a', bearer('member-user'), 10, 2026)
        self.assertEqual(result['membership']['role'], 'member')
        self.assertEqual(result['record_count'], 2)
        self.assertEqual(result['own_financial_summary']['collected'], 200)
        self.assertEqual(len(result['clubs']), 1)
        self.assertEqual(snapshot(ns), before)
