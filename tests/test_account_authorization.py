"""Actual route guards and JWT verifier, executed with database-denying fixtures."""
import ast
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as Obj
from typing import Optional
from jose import jwt, JWTError
from test_authentication import Collection

SOURCE = Path(__file__).resolve().parents[1] / 'backend/server.py'
TEST_KEY = 'offline-authz-test-key-not-a-live-secret'


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code


class DatabaseReached(Exception):
    pass


class DenyDatabase:
    def __init__(self): self.accesses = 0
    def __getattr__(self, name):
        self.accesses += 1
        raise DatabaseReached()


ROUTES = {
    'get_user_stats': lambda: 'user-b',
    'update_profile_photo': lambda: Obj(user_id='user-b', profile_photo='synthetic-photo'),
    'get_notification_preferences': lambda: 'user-b',
    'update_notification_preferences': lambda: Obj(user_id='user-b'),
    'delete_user_account': lambda: Obj(user_id='user-b', confirmation='DELETE'),
}


def environment():
    tree = ast.parse(SOURCE.read_text(encoding='utf-8-sig'))
    names = {*ROUTES, 'require_account_owner', 'authenticated_user_id', 'verify_token'}
    functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for node in functions: node.decorator_list = []
    ns = dict(Optional=Optional, Header=lambda default: default, HTTPException=HTTPError,
              ProfilePhotoUpdate=Obj, NotificationPreferencesUpdate=Obj, DeleteAccountRequest=Obj,
              jwt=jwt, JWTError=JWTError, SECRET_KEY=TEST_KEY, ALGORITHM='HS256', db=DenyDatabase())
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'account-routes', 'exec'), ns)
    return ns


def bearer(person='user-b', key=TEST_KEY, expired=False):
    return 'Bearer ' + jwt.encode({'user_id': person, 'exp': datetime.utcnow() + timedelta(minutes=-1 if expired else 5)}, key, algorithm='HS256')


class AccountAuthorizationTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_invalid_wrong_signature_expired_tokens_never_access_database(self):
        for route, payload in ROUTES.items():
            for token in (None, 'Bearer invalid', bearer(key='wrong-test-key'), bearer(expired=True)):
                with self.subTest(route=route, token_kind='missing/invalid/expired'):
                    ns = environment()
                    with self.assertRaises(HTTPError) as error:
                        await ns[route](payload(), authorization=token)
                    self.assertEqual(error.exception.status_code, 401)
                    self.assertEqual(ns['db'].accesses, 0)

    async def test_user_a_cannot_read_or_modify_user_b(self):
        for route, payload in ROUTES.items():
            with self.subTest(route=route):
                ns = environment()
                with self.assertRaises(HTTPError) as error:
                    await ns[route](payload(), authorization=bearer('user-a'))
                self.assertEqual(error.exception.status_code, 403)
                self.assertEqual(ns['db'].accesses, 0)

    async def test_owner_is_allowed_past_each_guard(self):
        for route, payload in ROUTES.items():
            with self.subTest(route=route):
                ns = environment()
                with self.assertRaises(DatabaseReached):
                    await ns[route](payload(), authorization=bearer())
                self.assertEqual(ns['db'].accesses, 1)

    async def test_profile_update_changes_only_authenticated_owner(self):
        ns = environment()
        ns['db'] = Obj(users=Collection([{'id': 'user-a', 'profile_photo': 'a'}, {'id': 'user-b', 'profile_photo': 'b'}]))
        await ns['update_profile_photo'](ROUTES['update_profile_photo'](), authorization=bearer())
        self.assertEqual(ns['db'].users.records, [
            {'id': 'user-a', 'profile_photo': 'a'}, {'id': 'user-b', 'profile_photo': 'synthetic-photo'}])
