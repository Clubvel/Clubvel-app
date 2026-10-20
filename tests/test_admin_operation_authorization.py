"""Actual Admin route guards with signed offline JWTs and synthetic records."""
import ast
import copy
import logging
import unittest
from types import SimpleNamespace as Obj
from unittest.mock import AsyncMock

from test_account_authorization import HTTPError as AccountHTTPError
from test_account_authorization import bearer
from test_account_authorization import environment as jwt_environment
from test_member_invitations import Collection as MembershipCollection
from test_payment_proof_review import (
    SOURCE,
    Collection,
    HTTPError,
    confirmation,
    upload,
)
from test_payment_proof_review import environment as proof_environment

GUARDED = {
    'update_group', 'delete_club', 'delete_member', 'get_club_detail', 'confirm_payment',
    'admin_upload_proof_of_payment', 'get_group_contributions', 'get_admin_stats',
    'get_admin_clubs', 'get_admin_payout_schedules', 'get_admin_dashboard',
    'get_treasurer_dashboard', 'get_group_details', 'get_contribution_proof', 'send_late_payment_alert_endpoint',
}
AGGREGATES = {'get_admin_stats', 'get_admin_clubs', 'get_admin_payout_schedules',
              'get_admin_dashboard', 'get_treasurer_dashboard'}


class ProjectedMembershipCollection(MembershipCollection):
    def find(self, query, projection=None):
        return super().find(query)


class FinancialCollection(Collection):
    async def delete_many(self, query):
        self.records[:] = [row for row in self.records if not self.matches(row, query)]


class ClaimsCollection(Collection):
    async def find_one(self, query, sort=None):
        return await super().find_one(query)


def environment():
    ns = proof_environment()
    names = GUARDED | {'verify_treasurer_owns_groups', 'verify_user_is_group_member'}
    nodes = [node for node in ast.parse(SOURCE.read_text()).body
             if isinstance(node, ast.AsyncFunctionDef) and node.name in names]
    for node in nodes: node.decorator_list = []
    ns['send_late_payment_alert'] = AsyncMock(return_value={})
    ns.update(UpdateGroupRequest=Obj, DeleteMemberRequest=Obj, DeleteClubRequest=Obj,
              logging=logging, encrypt_sensitive_field=lambda value: value,
              reconcile_legacy_admin_memberships=AsyncMock())
    auth = jwt_environment()
    ns.update({key: auth[key] for key in ('authenticated_user_id', 'require_account_owner')})
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'admin-operation-routes', 'exec'), ns)  # noqa: S102 - Actual handlers, isolated DB.
    for name in ('groups', 'members', 'users'):
        setattr(ns['db'], name, ProjectedMembershipCollection(getattr(ns['db'], name).records))
    ns['db'].claims = ClaimsCollection()
    ns['db'].contributions = FinancialCollection(ns['db'].contributions.records)
    for group in ns['db'].groups.records:
        group.update(admin_user_ids=['admin-user'] if group['id'] == 'group-a' else ['outsider'])
    return ns


def arguments(ns, route, actor='admin-user'):
    if route == 'send_late_payment_alert_endpoint': return ('membership-a',)
    if route in AGGREGATES: return (actor,)
    if route == 'get_group_details': return ('group-a', actor)
    if route == 'get_contribution_proof': return ('contribution-a', actor)
    if route == 'get_club_detail': return ('group-a', actor)
    if route == 'get_group_contributions':
        record = ns['db'].contributions.records[0]
        return ('group-a', record['month'], record['year'], actor)
    if route == 'confirm_payment':
        payload = confirmation(ns); payload.treasurer_id = actor; return (payload,)
    if route == 'admin_upload_proof_of_payment':
        payload = upload(); payload.user_id = actor; return (payload,)
    if route == 'update_group':
        return (Obj(group_id='group-a', admin_user_id=actor, group_name='Renamed', group_type=None,
                    monthly_contribution=None, payment_due_date=None, bank_name=None,
                    bank_account_number=None, bank_account_holder=None, description=None),)
    if route == 'delete_club': return (Obj(group_id='group-a', admin_user_id=actor, confirmation='DELETE'),)
    return (Obj(group_id='group-a', admin_user_id=actor, member_user_id='member-user', reason=None),)


def snapshot(ns):
    return {name: copy.deepcopy(collection.records) for name, collection in vars(ns['db']).items()}


class AdminOperationAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_invalid_expired_and_forged_signature_tokens_rejected(self):
        for route in GUARDED:
            for token in (None, 'Bearer invalid', bearer('admin-user', key='wrong-test-key'),
                          bearer('admin-user', expired=True)):
                with self.subTest(route=route, token_kind='invalid'):
                    ns = environment(); before = snapshot(ns)
                    with self.assertRaises((HTTPError, AccountHTTPError)) as caught:
                        await ns[route](*arguments(ns, route), authorization=token)
                    self.assertEqual(caught.exception.status_code, 401)
                    self.assertEqual(snapshot(ns), before)

    async def test_member_and_unrelated_user_cannot_impersonate_admin_or_membership_id(self):
        for route in GUARDED:
            for actor in ('member-user', 'other-member'):
                for claimed in ('admin-user', 'admin-a', None):
                    with self.subTest(route=route, actor=actor, claimed=claimed):
                        ns = environment(); before = snapshot(ns)
                        with self.assertRaises((HTTPError, AccountHTTPError)) as caught:
                            await ns[route](*arguments(ns, route, claimed), authorization=bearer(actor))
                        self.assertEqual(caught.exception.status_code, 403)
                        self.assertEqual(snapshot(ns), before)

    async def test_self_identity_cannot_bypass_club_role_or_cross_club_checks(self):
        for route in GUARDED - AGGREGATES:
            for actor in ('other-member', 'outsider'):
                with self.subTest(route=route, actor=actor):
                    ns = environment(); before = snapshot(ns)
                    with self.assertRaises((HTTPError, AccountHTTPError)) as caught:
                        await ns[route](*arguments(ns, route, actor), authorization=bearer(actor))
                    self.assertEqual(caught.exception.status_code, 403)
                    self.assertEqual(snapshot(ns), before)

    async def test_removed_admin_cannot_use_club_endpoints(self):
        for route in GUARDED - AGGREGATES:
            with self.subTest(route=route):
                ns = environment(); ns['db'].members.records[1]['status'] = 'removed'
                before = snapshot(ns)
                with self.assertRaises((HTTPError, AccountHTTPError)) as caught:
                    await ns[route](*arguments(ns, route), authorization=bearer('admin-user'))
                self.assertEqual(caught.exception.status_code, 403)
                self.assertEqual(snapshot(ns), before)

    async def test_removed_and_non_admin_aggregate_reads_contain_no_admin_clubs(self):
        for route in AGGREGATES:
            for actor in ('admin-user', 'member-user'):
                ns = environment(); ns['db'].members.records[1]['status'] = 'removed'
                result = await ns[route](actor, authorization=bearer(actor))
                self.assertEqual(result.get('clubs', result.get('schedules', [])), [])
                if route == 'get_admin_stats': self.assertEqual(result['clubs_managed'], 0)
                if 'summary' in result: self.assertEqual(result['summary']['total_clubs'], 0)

    async def test_active_admin_and_treasurer_still_succeed(self):
        for route in GUARDED:
            for role in ('admin', 'treasurer'):
                with self.subTest(route=route, role=role):
                    ns = environment(); ns['db'].members.records[1]['role_in_group'] = role
                    result = await ns[route](*arguments(ns, route), authorization=bearer('admin-user'))
                    self.assertIsInstance(result, dict)
                    if route == 'confirm_payment':
                        self.assertEqual(ns['db'].contributions.records[0]['confirmed_by_treasurer_id'], 'admin-user')
                    if route == 'delete_member':
                        self.assertFalse(any(row['user_id'] == 'member-user' for row in ns['db'].members.records))

    async def test_proof_owner_can_view_but_cannot_claim_admin_to_approve(self):
        ns = environment()
        result = await ns['get_contribution_proof']('contribution-a', 'member-user', authorization=bearer('member-user'))
        self.assertTrue(result['proof_image'])
        with self.assertRaises((HTTPError, AccountHTTPError)) as caught:
            await ns['confirm_payment'](confirmation(ns), authorization=bearer('member-user'))
        self.assertEqual(caught.exception.status_code, 403)

    def test_all_corrections_authenticate_before_database_access(self):
        tree = ast.parse(SOURCE.read_text())
        for node in tree.body:
            if isinstance(node, ast.AsyncFunctionDef) and node.name in GUARDED:
                first = node.body[1] if isinstance(node.body[0], ast.Expr) and isinstance(node.body[0].value, ast.Constant) else node.body[0]
                self.assertEqual(first.value.func.id, 'authenticated_user_id' if node.name == 'send_late_payment_alert_endpoint' else 'require_account_owner', node.name)
