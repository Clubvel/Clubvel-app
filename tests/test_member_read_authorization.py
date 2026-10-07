"""Signed offline JWTs exercising actual Member reads and historical proof policy."""
import ast
import copy
import math
import unittest
from unittest.mock import AsyncMock

from test_account_authorization import DenyDatabase, bearer
from test_account_authorization import HTTPError as AuthHTTPError
from test_account_authorization import environment as jwt_environment
from test_payment_proof_review import SOURCE, Collection, HTTPError
from test_payment_proof_review import environment as proof_environment


class ReadCollection(Collection):
    async def count_documents(self, query):
        return sum(self.matches(row, query) for row in self.records)

    async def find_one(self, query, projection=None, sort=None):
        return await super().find_one(query, projection)


def environment():
    ns = proof_environment()
    ns['math'] = math
    names = {'get_member_dashboard', 'get_active_membership_contexts'}
    nodes = [node for node in ast.parse(SOURCE.read_text()).body
             if isinstance(node, ast.AsyncFunctionDef) and node.name in names]
    assert {node.name for node in nodes} == names
    for node in nodes:
        node.decorator_list = []
    ns['reconcile_legacy_admin_memberships'] = AsyncMock()
    auth = jwt_environment()
    ns.update({key: auth[key] for key in ('authenticated_user_id', 'require_account_owner')})
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'member-read-routes', 'exec'), ns)  # noqa: S102 - Actual handlers, isolated DB.
    for name, collection in vars(ns['db']).copy().items():
        setattr(ns['db'], name, ReadCollection(collection.records))
    ns['db'].claims = ReadCollection()
    ns['db'].groups.records[0].update(bank_name='Synthetic Bank', bank_account_number='000', bank_account_holder='Club')
    return ns


def snapshot(ns):
    return {name: copy.deepcopy(collection.records) for name, collection in vars(ns['db']).items()}


class MemberReadAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def deny_before_database(self, route, token, expected):
        ns = environment()
        ns['db'] = DenyDatabase()
        args = ('member-user',) if route == 'get_member_dashboard' else ('group-a', 'member-user')
        with self.assertRaises(AuthHTTPError) as caught:
            await ns[route](*args, authorization=token)
        self.assertEqual(caught.exception.status_code, expected)
        self.assertEqual(ns['db'].accesses, 0)
        ns['reconcile_legacy_admin_memberships'].assert_not_awaited()

    async def test_dashboard_missing_bearer_denied_before_reads(self):
        await self.deny_before_database('get_member_dashboard', None, 401)

    async def test_dashboard_invalid_forged_expired_tokens_denied_before_reads(self):
        for token in ('Bearer invalid', bearer('member-user', key='wrong-key'), bearer('member-user', expired=True)):
            await self.deny_before_database('get_member_dashboard', token, 401)

    async def test_dashboard_other_account_denied_before_reads_or_reconciliation(self):
        await self.deny_before_database('get_member_dashboard', bearer('other-member'), 403)

    async def test_dashboard_rejected_impersonation_does_not_mutate_records(self):
        ns = environment()
        before = snapshot(ns)
        with self.assertRaises(AuthHTTPError):
            await ns['get_member_dashboard']('member-user', authorization=bearer('admin-user'))
        self.assertEqual(snapshot(ns), before)
        self.assertTrue(all(not collection.reads for collection in vars(ns['db']).values()))
        ns['reconcile_legacy_admin_memberships'].assert_not_awaited()

    async def test_dashboard_authenticated_owner_succeeds(self):
        ns = environment()
        result = await ns['get_member_dashboard']('member-user', authorization=bearer('member-user'))
        self.assertEqual(result['user']['id'], 'member-user')
        self.assertEqual([club['id'] for club in result['clubs']], ['group-a'])
        self.assertEqual(result['summary']['active_clubs'], 1)
        ns['reconcile_legacy_admin_memberships'].assert_awaited_once_with('member-user')

    async def test_dashboard_removed_inactive_memberships_and_clubs_excluded(self):
        for kind in ('removed', 'inactive', 'inactive-club', 'deleted-club'):
            with self.subTest(kind=kind):
                ns = environment()
                if kind.endswith('-club'):
                    if kind == 'deleted-club':
                        ns['db'].groups.records.pop(0)
                    else:
                        ns['db'].groups.records[0]['status'] = 'inactive'
                else:
                    ns['db'].members.records[0]['status'] = kind
                before = snapshot(ns)
                result = await ns['get_member_dashboard']('member-user', authorization=bearer('member-user'))
                self.assertEqual(result['clubs'], [])
                self.assertEqual(result['summary']['active_clubs'], 0)
                self.assertEqual(result['summary']['total_saved'], 0)
                self.assertEqual(result['summary']['claims_count'], 0)
                self.assertEqual(ns['db'].contributions.reads, [])
                self.assertEqual(snapshot(ns), before)

    async def test_club_missing_bearer_denied_before_reads(self):
        await self.deny_before_database('get_member_club_details', None, 401)

    async def test_club_invalid_forged_expired_tokens_denied_before_reads(self):
        for token in ('Bearer invalid', bearer('member-user', key='wrong-key'), bearer('member-user', expired=True)):
            await self.deny_before_database('get_member_club_details', token, 401)

    async def test_club_other_account_denied_before_reads(self):
        await self.deny_before_database('get_member_club_details', bearer('other-member'), 403)

    async def test_club_nonmember_denied(self):
        ns = environment()
        with self.assertRaises(HTTPError) as caught:
            await ns['get_member_club_details']('group-a', 'other-member', authorization=bearer('other-member'))
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(ns['db'].contributions.reads, [])

    async def test_club_removed_inactive_deleted_member_denied(self):
        for state in ('removed', 'inactive', 'deleted'):
            ns = environment()
            if state == 'deleted':
                ns['db'].members.records.pop(0)
            else:
                ns['db'].members.records[0]['status'] = state
            before = snapshot(ns)
            with self.assertRaises(HTTPError) as caught:
                await ns['get_member_club_details']('group-a', 'member-user', authorization=bearer('member-user'))
            self.assertEqual(caught.exception.status_code, 404)
            self.assertEqual(ns['db'].contributions.reads, [])
            self.assertEqual(snapshot(ns), before)

    async def test_club_active_owner_succeeds_with_same_response(self):
        ns = environment()
        before = snapshot(ns)
        result = await ns['get_member_club_details']('group-a', 'member-user', authorization=bearer('member-user'))
        self.assertEqual(result['group']['id'], 'group-a')
        self.assertEqual(result['current_contribution']['id'], 'contribution-a')
        self.assertEqual(len(result['payment_history']), 2)
        self.assertEqual(result['payment_reference']['reference_code'], 'A')
        self.assertEqual(snapshot(ns), before)

    async def test_club_changed_group_and_inactive_group_denied(self):
        for target, inactive in (('group-b', False), ('group-a', True)):
            ns = environment()
            if inactive:
                ns['db'].groups.records[0]['status'] = 'inactive'
            with self.assertRaises(HTTPError) as caught:
                await ns['get_member_club_details'](target, 'member-user', authorization=bearer('member-user'))
            self.assertEqual(caught.exception.status_code, 404)
            self.assertEqual(ns['db'].contributions.reads, [])

    async def proof_result(self, ns, actor, allowed):
        before = snapshot(ns)
        if allowed:
            result = await ns['get_contribution_proof']('contribution-a', actor, authorization=bearer(actor))
            self.assertEqual(result['proof_image'], before['contributions'][0]['proof_of_payment'])
        else:
            with self.assertRaises(HTTPError) as caught:
                await ns['get_contribution_proof']('contribution-a', actor, authorization=bearer(actor))
            self.assertIn(caught.exception.status_code, (403, 404))
        self.assertEqual(snapshot(ns), before)

    async def test_proof_active_owner_allowed(self):
        await self.proof_result(environment(), 'member-user', True)

    async def test_proof_other_ordinary_member_in_same_club_denied(self):
        ns = environment()
        ns['db'].members.records[2]['group_id'] = 'group-a'
        await self.proof_result(ns, 'other-member', False)

    async def test_proof_removed_inactive_deleted_owner_denied_and_records_retained(self):
        for state in ('removed', 'inactive', 'deleted'):
            ns = environment()
            if state == 'deleted':
                ns['db'].members.records.pop(0)
            else:
                ns['db'].members.records[0]['status'] = state
            await self.proof_result(ns, 'member-user', False)

    async def test_proof_active_admin_treasurer_allowed(self):
        for role in ('admin', 'treasurer'):
            ns = environment()
            ns['db'].members.records[1]['role_in_group'] = role
            await self.proof_result(ns, 'admin-user', True)

    async def test_proof_other_club_admin_denied(self):
        await self.proof_result(environment(), 'outsider', False)

    async def test_proof_removed_demoted_deleted_admin_denied(self):
        for state in ('removed', 'demoted', 'deleted'):
            ns = environment()
            if state == 'deleted':
                ns['db'].members.records.pop(1)
            elif state == 'demoted':
                ns['db'].members.records[1]['role_in_group'] = 'member'
            else:
                ns['db'].members.records[1]['status'] = 'removed'
            await self.proof_result(ns, 'admin-user', False)

    async def test_proof_inactive_deleted_club_denied_for_owner_and_admin(self):
        for actor in ('member-user', 'admin-user'):
            for state in ('inactive', 'deleted'):
                ns = environment()
                if state == 'deleted':
                    ns['db'].groups.records.pop(0)
                else:
                    ns['db'].groups.records[0]['status'] = state
                await self.proof_result(ns, actor, False)
