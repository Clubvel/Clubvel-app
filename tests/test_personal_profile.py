"""Offline execution of the actual self-only name handler; no live database."""
import ast
import types
import unicodedata
import unittest
from unittest.mock import AsyncMock
from test_account_authorization import environment as auth_environment, bearer, HTTPError
from test_payment_proof_review import SOURCE


def environment():
    auth = auth_environment()
    ns = {'authenticated_user_id': auth['authenticated_user_id'], 'HTTPException': HTTPError,
          'PersonalProfileUpdate': object, 'Optional': __import__('typing').Optional,
          'Header': lambda default=None: default, 'unicodedata': unicodedata,
          'db': types.SimpleNamespace(users=types.SimpleNamespace(
              find_one=AsyncMock(return_value={'id': 'person', 'full_name': 'Old Name'}),
              update_one=AsyncMock(return_value=types.SimpleNamespace(matched_count=1))))}
    node = next(n for n in ast.parse(SOURCE.read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'update_personal_profile')
    node.decorator_list = []
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'actual-personal-profile', 'exec'), ns)
    return ns


class PersonalProfileTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_forged_and_expired_auth_denied_before_database(self):
        for token in (None, 'Bearer invalid', bearer('person', key='wrong-key'), bearer('person', expired=True)):
            ns = environment()
            with self.assertRaises(HTTPError):
                await ns['update_personal_profile'](types.SimpleNamespace(full_name='New Name'), authorization=token)
            ns['db'].users.find_one.assert_not_awaited()
            ns['db'].users.update_one.assert_not_awaited()

    async def test_only_authenticated_account_and_name_can_change(self):
        ns = environment()
        result = await ns['update_personal_profile'](types.SimpleNamespace(full_name='  Zoë  van der Merwe  '), authorization=bearer('person'))
        self.assertEqual(result, {'full_name': 'Zoë van der Merwe'})
        ns['db'].users.update_one.assert_awaited_once_with(
            {'id': 'person', 'status': {'$ne': 'inactive'}}, {'$set': {'full_name': 'Zoë van der Merwe'}})
        self.assertEqual(set(vars(ns['db'])), {'users'})

    async def test_invalid_names_do_not_write(self):
        for name in ('', ' ', 'x', '1234', 'x' * 101, 'Name\nSurname', '<script>Name</script>'):
            ns = environment()
            with self.assertRaises(HTTPError) as error:
                await ns['update_personal_profile'](types.SimpleNamespace(full_name=name), authorization=bearer('person'))
            self.assertEqual(error.exception.status_code, 422)
            ns['db'].users.update_one.assert_not_awaited()

    async def test_inactive_missing_account_cannot_update(self):
        ns = environment(); ns['db'].users.find_one.return_value = None
        with self.assertRaises(HTTPError) as error:
            await ns['update_personal_profile'](types.SimpleNamespace(full_name='New Name'), authorization=bearer('person'))
        self.assertEqual(error.exception.status_code, 404)
        ns['db'].users.update_one.assert_not_awaited()

    async def test_account_removed_during_request_is_not_reported_as_success(self):
        ns = environment(); ns['db'].users.update_one.return_value.matched_count = 0
        with self.assertRaises(HTTPError) as error:
            await ns['update_personal_profile'](types.SimpleNamespace(full_name='New Name'), authorization=bearer('person'))
        self.assertEqual(error.exception.status_code, 404)

    def test_input_model_forbids_sensitive_fields(self):
        # Execute the real Pydantic request model, not a permissive stand-in.
        from pydantic import BaseModel, ValidationError
        node = next(n for n in ast.parse(SOURCE.read_text()).body if isinstance(n, ast.ClassDef) and n.name == 'PersonalProfileUpdate')
        ns = {'BaseModel': BaseModel}; exec(compile(ast.Module(body=[node], type_ignores=[]), 'profile-model', 'exec'), ns)
        model = ns['PersonalProfileUpdate']
        for field in ('user_id', 'phone_number', 'password', 'role', 'stokvel_memberships', 'profile_photo'):
            with self.assertRaises(ValidationError): model(full_name='New Name', **{field: 'forbidden'})
