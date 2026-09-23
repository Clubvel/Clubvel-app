"""Isolated membership tests: execute only selected functions, never import server.

No Mongo client, environment file, network, seed, or application startup runs.
"""
import ast
import asyncio
from pathlib import Path
from types import SimpleNamespace
from typing import Optional
import unittest
from unittest.mock import AsyncMock


SOURCE = Path(__file__).resolve().parents[1] / 'backend' / 'server.py'
NAMES = {'get_legacy_group_admin_role', 'reconcile_legacy_group_admin_membership',
         'get_active_membership_contexts', 'get_member_clubs', 'get_member_club_details'}
tree = ast.parse(SOURCE.read_text(encoding='utf-8-sig'))
functions = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in NAMES]
for node in functions:
    node.decorator_list = []
code = compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), 'exec')


class Cursor:
    def __init__(self, records): self.records = records
    async def to_list(self, limit): return self.records if limit is None else self.records[:limit]


def matches(record, query):
    return all(record.get(k) in v['$in'] if isinstance(v, dict) else record.get(k) == v for k, v in query.items())


class Collection:
    def __init__(self, records):
        self.records = records
        self.update_one = AsyncMock()
    def find(self, query): return Cursor([r for r in self.records if matches(r, query)])
    async def find_one(self, query): return next((r for r in self.records if matches(r, query)), None)


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        super().__init__(detail)


def environment(members, groups):
    ns = {'Optional': Optional, 'HTTPException': HTTPError}
    exec(code, ns)
    ns['db'] = SimpleNamespace(members=Collection(members), groups=Collection(groups), users=Collection([{'id': 'person'}]))
    ns['reconcile_legacy_admin_memberships'] = AsyncMock()
    return ns


class MembershipTests(unittest.IsolatedAsyncioTestCase):
    async def test_removed_membership_cannot_open_member_workspace(self):
        ns = environment([dict(id='m1', user_id='person', group_id='a', status='removed')],
                         [dict(id='a', status='active')])
        with self.assertRaises(HTTPError) as error:
            await ns['get_member_club_details']('a', 'person')
        self.assertEqual(error.exception.status_code, 404)

    async def test_inactive_group_cannot_open_member_workspace(self):
        ns = environment([dict(id='m1', user_id='person', group_id='a', status='active')],
                         [dict(id='a', status='inactive')])
        with self.assertRaises(HTTPError) as error:
            await ns['get_member_club_details']('a', 'person')
        self.assertEqual(error.exception.status_code, 404)

    async def test_active_memberships_only_with_active_groups_and_contextual_roles(self):
        members = [dict(id='m1', user_id='person', group_id='a', status='active', role_in_group='admin'),
                   dict(id='m2', user_id='person', group_id='b', status='active', role_in_group='member'),
                   dict(id='m3', user_id='person', group_id='c', status='removed', role_in_group='admin'),
                   dict(id='m4', user_id='person', group_id='d', status='active', role_in_group='member')]
        groups = [dict(id=g, status='active' if g != 'd' else 'inactive', group_name=g, monthly_contribution=500) for g in 'abcd']
        ns = environment(members, groups)
        result = await ns['get_member_clubs']('person')
        self.assertEqual([(c['id'], c['role']) for c in result['clubs']], [('a', 'admin'), ('b', 'member')])
        self.assertEqual([c['membership_id'] for c in result['clubs']], ['m1', 'm2'])

    async def test_pending_invitation_is_not_a_membership(self):
        ns = environment([], [])
        self.assertEqual(await ns['get_member_clubs']('person'), {'clubs': []})
        ns['db'].members.update_one.assert_not_called()

    async def test_removed_or_demoted_member_is_not_promoted_by_legacy_ownership(self):
        for status, role in [('removed', 'admin'), ('inactive', 'treasurer'), ('active', 'member')]:
            ns = environment([dict(id='m1', user_id='person', group_id='a', status=status, role_in_group=role)], [])
            result = await ns['reconcile_legacy_group_admin_membership']('person', {'id': 'a', 'treasurer_user_id': 'person'})
            self.assertIsNone(result)
            ns['db'].members.update_one.assert_not_called()

    async def test_existing_active_admin_identity_is_preserved(self):
        membership = dict(id='m1', user_id='person', group_id='a', status='active', role_in_group='admin')
        ns = environment([membership], [])
        self.assertEqual(await ns['reconcile_legacy_group_admin_membership']('person', {'id': 'a', 'admin_user_ids': ['person']}), membership)
        ns['db'].members.update_one.assert_not_called()

    async def test_modern_admin_list_overrides_stale_treasurer_field(self):
        ns = environment([], [])
        self.assertIsNone(ns['get_legacy_group_admin_role']('person', {'admin_user_ids': [], 'treasurer_user_id': 'person'}))

    async def test_more_than_100_memberships_not_silently_truncated(self):
        members = [dict(id=str(i), user_id='person', group_id=str(i), status='active', role_in_group='member') for i in range(101)]
        groups = [dict(id=str(i), status='active', group_name=str(i), monthly_contribution=0) for i in range(101)]
        ns = environment(members, groups)
        self.assertEqual(len((await ns['get_member_clubs']('person'))['clubs']), 101)


if __name__ == '__main__':
    unittest.main()
