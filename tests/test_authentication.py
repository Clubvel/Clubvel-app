"""Offline tests of actual auth functions; no server import, database or SMS."""
import ast
import asyncio
import copy
import re
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as Obj
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from services.phone_numbers import normalize_phone, phone_aliases, phone_identity_query
from services.auth_otp import AuthOTP, OTPError


def matches(record, query):
    for key, value in query.items():
        if key == '$or':
            if not any(matches(record, part) for part in value): return False
        elif isinstance(value, dict):
            actual = record.get(key)
            for op, expected in value.items():
                if op == '$regex' and (not isinstance(actual, str) or not re.search(expected, actual)): return False
                if op == '$gt' and not (actual is not None and actual > expected): return False
                if op == '$lt' and not (actual is not None and actual < expected): return False
        elif record.get(key) != value: return False
    return True


class DuplicateKeyError(Exception): pass
class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail
        super().__init__(str(detail))


class Collection:
    def __init__(self, records=()): self.records = copy.deepcopy(list(records))
    async def create_index(self, *args, **kwargs): pass
    def find(self, query):
        found = [r for r in self.records if matches(r, query)]
        return Obj(to_list=AsyncMock(side_effect=lambda limit: found[:limit]))
    async def find_one(self, query):
        return next((r for r in self.records if matches(r, query)), None)
    async def insert_one(self, record):
        if record.get('phone_e164') and any(r.get('phone_e164') == record['phone_e164'] for r in self.records):
            raise DuplicateKeyError()
        self.records.append(copy.deepcopy(record))
    async def replace_one(self, query, record, upsert=False):
        await self.delete_one(query)
        self.records.append(copy.deepcopy(record))
    async def update_one(self, query, update):
        record = await self.find_one(query)
        if record is not None: record.update(update.get('$set', {}))
        return Obj(matched_count=int(record is not None))
    async def find_one_and_update(self, query, update):
        record = await self.find_one(query)
        if record is None: return None
        before = copy.deepcopy(record)
        for key, delta in update.get('$inc', {}).items(): record[key] = record.get(key, 0) + delta
        return before
    async def delete_one(self, query):
        record = await self.find_one(query)
        if record is not None: self.records.remove(record)
        return Obj(deleted_count=int(record is not None))


class User(Obj):
    def __init__(self, **kwargs): super().__init__(id='new-person', **kwargs)


def environment(records=(), live=False, configured=False):
    ns = dict(HTTPException=HTTPError, Request=Obj, UserCreate=Obj, UserLogin=Obj,
              OTPVerify=Obj, SendOTPRequest=Obj, ForgotPasswordRequest=Obj,
              VerifyResetOTPRequest=Obj, ResetPasswordRequest=Obj, User=User,
              DuplicateKeyError=DuplicateKeyError, OTPError=OTPError,
              normalize_phone=normalize_phone, phone_identity_query=phone_identity_query,
              hash_password=lambda password: 'hash:' + password,
              verify_password=lambda password, hashed: hashed == 'hash:' + password,
              person_document=lambda user: vars(user).copy(),
              reconcile_legacy_admin_memberships=AsyncMock(),
              create_access_token=lambda data: 'token:' + data['user_id'])
    names = {'auth_phone', 'find_auth_user', 'issue_auth_code', 'check_auth_code', 'register',
             'send_otp_endpoint', 'verify_otp', 'login', 'forgot_password', 'verify_reset_otp', 'reset_password'}
    tree = ast.parse((ROOT / 'backend/server.py').read_text(encoding='utf-8-sig'))
    functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for node in functions: node.decorator_list = []
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'auth-routes', 'exec'), ns)
    ns['db'] = Obj(users=Collection(records), auth_otp_challenges=Collection())
    ns['delivery'] = AsyncMock(return_value={'success': True, 'channel': 'whatsapp'})
    ns['auth_otp'] = AuthOTP(ns['db'].auth_otp_challenges, ns['delivery'],
                           lambda: {'real_notifications_enabled': live, 'twilio_configured': configured}, 'test-only-secret', allow_mock=True)
    return ns


def person(phone='0821234567', verified=True, identity='existing-person'):
    return dict(id=identity, full_name='Test Person', phone_number=phone,
                password_hash='hash:original', otp_verified=verified)


class PhoneTests(unittest.TestCase):
    def test_equivalent_sa_formats_and_legacy_punctuation(self):
        for phone in ['0821234567', '+27821234567', '27821234567', '0027821234567', '821234567', '(082) 123-4567', '+27 (82) 123 4567']:
            self.assertEqual(normalize_phone(phone), '+27821234567')
            self.assertTrue(matches({'phone_number': phone}, phone_identity_query('0821234567')))
    def test_invalid_numbers_are_not_silently_repaired(self):
        for phone in ['', '082123', '+270821234567', '+2727821234567', 'letters', '0821234567x', '0000000000']:
            with self.assertRaises(ValueError): normalize_phone(phone)
    def test_explicit_international_identity_is_preserved(self):
        self.assertEqual(normalize_phone('+44 7700 900123'), '+447700900123')


class AuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def test_registration_verification_login_and_relogin_share_identity(self):
        ns = environment()
        result = await ns['register'](None, Obj(full_name='Test Person', phone_number='0821234567', password='original', email=None))
        self.assertEqual(result['notification_mode'], 'mock')
        self.assertEqual(ns['db'].users.records[0]['phone_number'], '+27821234567')
        with self.assertRaises(HTTPError) as error:
            await ns['login'](None, Obj(phone_number='+27821234567', password='original'))
        self.assertEqual(error.exception.detail['code'], 'verification_required')
        await ns['verify_otp'](Obj(phone_number='0821234567', otp=result['mock_otp']))
        sessions = [await ns['login'](None, Obj(phone_number=p, password='original')) for p in ['0821234567', '+27821234567']]
        self.assertEqual(sessions[0]['user']['id'], sessions[1]['user']['id'])
        self.assertEqual(len(ns['db'].users.records), 1)

    async def test_legacy_number_login_does_not_rewrite_account_or_roles(self):
        original = person('(082) 123-4567'); original['memberships'] = ['group-a']
        ns = environment([original])
        session = await ns['login'](None, Obj(phone_number='+27821234567', password='original'))
        self.assertEqual(session['user']['id'], original['id'])
        self.assertEqual(ns['db'].users.records, [original])
        ns['reconcile_legacy_admin_memberships'].assert_awaited_once_with(original['id'])

    async def test_duplicate_aliases_fail_without_merging(self):
        records = [person(), person('+27821234567', identity='other-person')]
        ns = environment(records)
        with self.assertRaises(HTTPError) as error: await ns['find_auth_user']('0821234567')
        self.assertEqual(error.exception.status_code, 409)
        self.assertEqual(ns['db'].users.records, records)

    async def test_interrupted_registration_resumes_without_password_replacement(self):
        original = person(verified=False); ns = environment([original])
        result = await ns['register'](None, Obj(full_name='Changed', phone_number='+27821234567', password='original', email=None))
        self.assertFalse(result['already_registered'])
        self.assertEqual(ns['db'].users.records, [original])
        wrong = await ns['register'](None, Obj(full_name='Changed', phone_number='0821234567', password='different', email=None))
        self.assertTrue(wrong['already_registered'])
        self.assertEqual(ns['delivery'].await_count, 1)

    async def test_wrong_password_remains_rejected(self):
        ns = environment([person()])
        with self.assertRaises(HTTPError) as error:
            await ns['login'](None, Obj(phone_number='+27821234567', password='wrong'))
        self.assertEqual(error.exception.status_code, 401)

    async def test_reset_uses_one_backend_challenge_then_consumes_it(self):
        ns = environment([person()])
        result = await ns['forgot_password'](None, Obj(phone_number='+27821234567'))
        await ns['verify_reset_otp'](Obj(phone_number='0821234567', otp=result['mock_otp']))
        await ns['reset_password'](Obj(phone_number='+27821234567', otp=result['mock_otp'], new_password='changed'))
        session = await ns['login'](None, Obj(phone_number='0821234567', password='changed'))
        self.assertEqual(session['user']['id'], 'existing-person')
        with self.assertRaises(HTTPError):
            await ns['reset_password'](Obj(phone_number='0821234567', otp=result['mock_otp'], new_password='replayed'))
        with self.assertRaises(HTTPError):
            await ns['login'](None, Obj(phone_number='0821234567', password='original'))

    async def test_registration_code_cannot_reset_password(self):
        ns = environment([person(verified=False)])
        await ns['send_otp_endpoint'](None, Obj(phone_number='0821234567', channel='sms'))
        with self.assertRaises(HTTPError):
            await ns['reset_password'](Obj(phone_number='0821234567', otp='1234', new_password='changed'))
        self.assertEqual(ns['db'].users.records[0]['password_hash'], 'hash:original')

    async def test_expiry_attempt_limit_and_cross_worker_storage(self):
        ns = environment([person()]); otp = ns['auth_otp']
        await otp.issue('+27821234567', 'password_reset')
        other_worker = AuthOTP(ns['db'].auth_otp_challenges, ns['delivery'], otp.notification_status, 'test-only-secret', allow_mock=True)
        await other_worker.check('+27821234567', 'password_reset', '1234')
        for _ in range(5):
            with self.assertRaises(OTPError): await otp.check('+27821234567', 'password_reset', '9999')
        with self.assertRaises(OTPError): await otp.check('+27821234567', 'password_reset', '1234', consume=True)
        await otp.issue('+27821234567', 'password_reset')
        ns['db'].auth_otp_challenges.records[0]['expires_at'] = datetime.utcnow() - timedelta(seconds=1)
        with self.assertRaises(OTPError): await otp.check('+27821234567', 'password_reset', '1234')

    async def test_live_delivery_never_downgrades_to_mock(self):
        ns = environment(live=True)
        with self.assertRaises(OTPError): await ns['auth_otp'].issue('+27821234567', 'registration')
        ns['delivery'].assert_not_awaited()
        ns = environment(live=True, configured=True)
        result = await ns['auth_otp'].issue('+27821234567', 'registration')
        self.assertNotIn('mock_otp', result)
        code = ns['delivery'].call_args.kwargs['otp']
        self.assertRegex(code, r'^\d{6}$')
        self.assertNotIn(code, str(ns['db'].auth_otp_challenges.records))

    async def test_mock_auth_requires_explicit_nonproduction_opt_in(self):
        ns = environment()
        guarded = AuthOTP(ns['db'].auth_otp_challenges, ns['delivery'], ns['auth_otp'].notification_status, 'test-only-secret')
        with self.assertRaises(OTPError): await guarded.issue('+27821234567', 'registration')
        ns['delivery'].assert_not_awaited()

    async def test_failed_delivery_can_resume_existing_pending_registration(self):
        ns = environment(); ns['delivery'].return_value = {'success': False}
        request = Obj(full_name='Test Person', phone_number='0821234567', password='original', email=None)
        with self.assertRaises(HTTPError): await ns['register'](None, request)
        self.assertEqual(len(ns['db'].users.records), 1)
        ns['delivery'].return_value = {'success': True}
        result = await ns['register'](None, request)
        self.assertFalse(result['already_registered'])
        self.assertEqual(len(ns['db'].users.records), 1)

    async def test_reset_succeeds_on_fifth_permitted_guess(self):
        ns = environment([person()])
        await ns['forgot_password'](None, Obj(phone_number='0821234567'))
        for _ in range(4):
            with self.assertRaises(HTTPError):
                await ns['verify_reset_otp'](Obj(phone_number='0821234567', otp='9999'))
        result = await ns['verify_reset_otp'](Obj(phone_number='0821234567', otp='1234'))
        self.assertTrue(result['can_reset'])
        self.assertEqual(ns['db'].auth_otp_challenges.records[0]['attempts'], 4)
        await ns['reset_password'](Obj(phone_number='0821234567', otp='1234', new_password='changed'))
        self.assertEqual(ns['db'].users.records[0]['password_hash'], 'hash:changed')
        self.assertEqual(ns['db'].auth_otp_challenges.records, [])
        with self.assertRaises(HTTPError):
            await ns['reset_password'](Obj(phone_number='0821234567', otp='1234', new_password='replayed'))

    async def test_five_invalid_guesses_block_even_the_correct_reset_code(self):
        ns = environment([person()])
        await ns['forgot_password'](None, Obj(phone_number='0821234567'))
        for _ in range(5):
            with self.assertRaises(HTTPError):
                await ns['reset_password'](Obj(phone_number='0821234567', otp='9999', new_password='changed'))
        self.assertEqual(ns['db'].auth_otp_challenges.records[0]['attempts'], 5)
        with self.assertRaises(HTTPError):
            await ns['verify_reset_otp'](Obj(phone_number='0821234567', otp='1234'))
        with self.assertRaises(HTTPError):
            await ns['reset_password'](Obj(phone_number='0821234567', otp='1234', new_password='changed'))
        self.assertEqual(ns['db'].users.records[0]['password_hash'], 'hash:original')

    async def test_code_expiring_after_confirmation_cannot_reset_password(self):
        ns = environment([person()])
        await ns['forgot_password'](None, Obj(phone_number='0821234567'))
        await ns['verify_reset_otp'](Obj(phone_number='0821234567', otp='1234'))
        ns['db'].auth_otp_challenges.records[0]['expires_at'] = datetime.utcnow() - timedelta(seconds=1)
        with self.assertRaises(HTTPError):
            await ns['reset_password'](Obj(phone_number='0821234567', otp='1234', new_password='changed'))
        self.assertEqual(ns['db'].users.records[0]['password_hash'], 'hash:original')


if __name__ == '__main__': unittest.main()
