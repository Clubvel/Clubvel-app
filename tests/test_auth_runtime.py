"""In-process HTTP/crypto smoke checks using requirements.txt, no live services."""
import importlib.util
import json
import os
import sys
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))


class DenyDatabase:
    def __getitem__(self, name): return self
    def __getattr__(self, name): return self
    def __call__(self, *args, **kwargs):
        raise AssertionError('No database operation is permitted in this smoke test')


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        # Override all relevant settings before import; never read local .env files.
        env = dict(PYTHON_DOTENV_DISABLED='true', MONGO_URL='mongodb://127.0.0.1:1', DB_NAME='offline_review',
                   JWT_SECRET_KEY='offline-jwt-test-value-not-a-live-key', FIELD_ENCRYPTION_KEY='offline-field-test-value-not-a-live-key',
                   CLUBVEL_ENV='staging', ALLOW_MOCK_OTP='true', PRODUCTION_MODE='false', RAILWAY_ENVIRONMENT_NAME='staging',
                   ENABLE_REAL_NOTIFICATIONS='false', ENABLE_BANK_FEED='false')
        spec = importlib.util.spec_from_file_location('offline_server_under_test', ROOT / 'backend/server.py')
        cls.server = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = cls.server
        with patch.dict(os.environ, env), patch('motor.motor_asyncio.AsyncIOMotorClient', return_value=DenyDatabase()), \
                patch('socket.socket.connect', side_effect=AssertionError('Network forbidden')):
            spec.loader.exec_module(cls.server)

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop('offline_server_under_test', None)

    async def request(self, method, path, body=None, token=None):
        headers = [(b'content-type', b'application/json')]
        if token is not None: headers.append((b'authorization', token.encode()))
        scope = dict(type='http', asgi={'version': '3.0'}, http_version='1.1', method=method, scheme='http',
                     path=path, raw_path=path.encode(), root_path='', query_string=b'', headers=headers,
                     client=('127.0.0.1', 1234), server=('offline.invalid', 80))
        sent = []
        async def receive():
            return {'type': 'http.request', 'body': json.dumps(body).encode() if body else b'', 'more_body': False}
        async def send(event): sent.append(event)
        with patch('socket.socket.connect', side_effect=AssertionError('Network forbidden')):
            await self.server.app(scope, receive, send)
        return next(event['status'] for event in sent if event['type'] == 'http.response.start')

    async def test_real_http_routes_reject_missing_invalid_and_foreign_identity(self):
        routes = [
            ('GET', '/api/user/stats/user-b', None),
            ('GET', '/api/user/notification-preferences/user-b', None),
            ('POST', '/api/user/profile-photo', {'user_id': 'user-b', 'profile_photo': 'synthetic'}),
            ('PUT', '/api/user/notification-preferences', {'user_id': 'user-b', 'claim_updates': True}),
            ('DELETE', '/api/user/delete-account', {'user_id': 'user-b', 'confirmation': 'DELETE'}),
        ]
        foreign = 'Bearer ' + self.server.create_access_token({'user_id': 'user-a'})
        expired = 'Bearer ' + self.server.create_access_token({'user_id': 'user-b'}, expires_delta=timedelta(minutes=-1))
        for method, path, body in routes:
            for token, expected in [(None, 401), ('Bearer invalid', 401), (expired, 401), (foreign, 403)]:
                with self.subTest(method=method, path=path, expected=expected):
                    self.assertEqual(await self.request(method, path, body, token), expected)

    def test_pinned_hashing_jwt_and_encryption(self):
        server = self.server
        hashed = server.hash_password('offline-test-password')
        self.assertTrue(server.verify_password('offline-test-password', hashed))
        self.assertFalse(server.verify_password('wrong', hashed))
        token = server.create_access_token({'user_id': 'offline-person'})
        self.assertEqual(server.authenticated_user_id('Bearer ' + token), 'offline-person')
        with self.assertRaises(server.HTTPException): server.verify_token(token + 'invalid')
        self.assertEqual(server.decrypt_sensitive_field(server.encrypt_sensitive_field('synthetic')), 'synthetic')
        self.assertTrue(server.auth_otp.allow_mock)
        self.assertIn('/api/auth/register', server.app.openapi()['paths'])
