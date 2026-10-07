"""Runtime configuration tests; no network, database, or process secrets."""
import ast
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from services.auth_otp import AuthOTP, OTPError, runtime_mock_otp_allowed


class MockPolicyTests(unittest.IsolatedAsyncioTestCase):
    def runtime_flag(self, env):
        tree = ast.parse((ROOT / 'backend/server.py').read_text(encoding='utf-8-sig'))
        assignment = next(n for n in tree.body if isinstance(n, ast.Assign)
                          and any(isinstance(t, ast.Name) and t.id == 'auth_otp' for t in n.targets))
        expression = next(k.value for k in assignment.value.keywords if k.arg == 'allow_mock')
        return eval(compile(ast.Expression(expression), 'runtime-mock-policy', 'eval'), {
            'os': SimpleNamespace(environ=env), 'runtime_mock_otp_allowed': runtime_mock_otp_allowed})

    def test_only_explicit_staging_opt_in_enables_deployable_mock(self):
        for label in ('production', 'prod', 'test', 'development', ''):
            for flag in ('true', 'false', ''):
                with self.subTest(label=label, flag=flag):
                    self.assertFalse(self.runtime_flag({'CLUBVEL_ENV': label, 'ALLOW_MOCK_OTP': flag}))
        for flag in ('false', '', '1'):
            self.assertFalse(self.runtime_flag({'CLUBVEL_ENV': 'staging', 'ALLOW_MOCK_OTP': flag}))
        self.assertTrue(self.runtime_flag({'CLUBVEL_ENV': 'staging', 'ALLOW_MOCK_OTP': 'true'}))

    def test_production_flags_override_a_mislabelled_staging_environment(self):
        env = {'CLUBVEL_ENV': 'staging', 'ALLOW_MOCK_OTP': 'true'}
        for flag in ('true', 'TRUE', '1', 'yes', 'on', 'invalid'):
            self.assertFalse(self.runtime_flag({**env, 'PRODUCTION_MODE': flag}))
        for label in ('production', 'prod', 'development', ''):
            self.assertFalse(self.runtime_flag({**env, 'RAILWAY_ENVIRONMENT_NAME': label}))
        self.assertTrue(self.runtime_flag({**env, 'PRODUCTION_MODE': 'false', 'RAILWAY_ENVIRONMENT_NAME': 'staging'}))

    async def test_production_rejects_before_delivery_or_database_access(self):
        send = AsyncMock()
        otp = AuthOTP(None, send, lambda: {'real_notifications_enabled': False, 'twilio_configured': False},
                      'offline-test-key', allow_mock=self.runtime_flag({'CLUBVEL_ENV': 'production', 'ALLOW_MOCK_OTP': 'true'}))
        with self.assertRaises(OTPError):
            await otp.issue('+27821234567', 'registration')
        send.assert_not_awaited()
