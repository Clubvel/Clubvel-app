"""Contact opt-in uses synthetic accounts only; no server startup or live storage."""
import ast
import unittest
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import AsyncMock
from test_account_authorization import environment as auth_environment, bearer, HTTPError, DenyDatabase

SOURCE = Path(__file__).resolve().parents[1] / 'backend/server.py'


def environment():
    ns = auth_environment()
    ns['ContactVisibilityUpdate'] = Obj
    nodes = [n for n in ast.parse(SOURCE.read_text(encoding='utf-8')).body
             if isinstance(n, ast.AsyncFunctionDef) and n.name in {'get_contact_visibility', 'update_contact_visibility'}]
    for node in nodes:
        node.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'actual-contact-routes', 'exec'), ns)
    ns['db'] = Obj(users=Obj(find_one=AsyncMock(return_value={'id': 'user-b'}),
                             update_one=AsyncMock(return_value=Obj(matched_count=1))))
    return ns


class ContactVisibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_authentication_and_ownership_are_required_before_any_database_access(self):
        for token in [None, 'Bearer invalid', bearer(key='wrong'), bearer(expired=True), bearer('other')]:
            for route in ['get_contact_visibility', 'update_contact_visibility']:
                ns = environment(); ns['db'] = DenyDatabase()
                with self.assertRaises(HTTPError):
                    if route.startswith('get'): await ns[route]('user-b', authorization=token)
                    else: await ns[route]('user-b', Obj(share_mobile_with_clubs=True), authorization=token)
                self.assertEqual(ns['db'].accesses, 0)

    async def test_missing_preference_and_nonboolean_legacy_values_are_private(self):
        for value in [None, False, 'true', 1, True]:
            ns = environment(); ns['db'].users.find_one.return_value = {'share_mobile_with_clubs': value}
            self.assertEqual(await ns['get_contact_visibility']('user-b', bearer()),
                             {'share_mobile_with_clubs': value is True})
            ns['db'].users.update_one.assert_not_awaited()

    async def test_owner_can_change_only_the_opt_in_field(self):
        for value in [True, False]:
            ns = environment()
            self.assertEqual(await ns['update_contact_visibility']('user-b', Obj(share_mobile_with_clubs=value), bearer()),
                             {'share_mobile_with_clubs': value})
            ns['db'].users.update_one.assert_awaited_once_with(
                {'id': 'user-b', 'status': None}, {'$set': {'share_mobile_with_clubs': value}})
            self.assertEqual(set(vars(ns['db'])), {'users'})

    async def test_missing_or_inactive_accounts_cannot_read_or_write_preferences(self):
        for account in [None, {'id': 'user-b', 'status': 'inactive'}]:
            ns = environment(); ns['db'].users.find_one.return_value = account
            with self.assertRaises(HTTPError): await ns['get_contact_visibility']('user-b', bearer())
            with self.assertRaises(HTTPError): await ns['update_contact_visibility']('user-b', Obj(share_mobile_with_clubs=True), bearer())
            ns['db'].users.update_one.assert_not_awaited()

    async def test_account_change_during_save_is_not_reported_as_success(self):
        ns = environment(); ns['db'].users.update_one.return_value.matched_count = 0
        with self.assertRaises(HTTPError) as caught:
            await ns['update_contact_visibility']('user-b', Obj(share_mobile_with_clubs=True), bearer())
        self.assertEqual(caught.exception.status_code, 409)

    def test_actual_request_model_accepts_only_explicit_booleans(self):
        from pydantic import BaseModel, StrictBool, ValidationError
        model = next(n for n in ast.parse(SOURCE.read_text(encoding='utf-8')).body
                     if isinstance(n, ast.ClassDef) and n.name == 'ContactVisibilityUpdate')
        ns = dict(BaseModel=BaseModel, StrictBool=StrictBool)
        exec(compile(ast.Module(body=[model], type_ignores=[]), 'actual-contact-model', 'exec'), ns)
        for value in ['true', 'false', 1, 0, None]:
            with self.assertRaises(ValidationError): ns['ContactVisibilityUpdate'](share_mobile_with_clubs=value)
        self.assertTrue(ns['ContactVisibilityUpdate'](share_mobile_with_clubs=True).share_mobile_with_clubs)
