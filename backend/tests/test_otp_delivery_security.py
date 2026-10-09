"""Offline security regression tests: no network, Twilio, or production database."""
import asyncio
import unittest

from services.auth_otp import AuthOTP, OTPError, runtime_mock_otp_allowed


class FakeCollection:
    def __init__(self):
        self.records = {}
        self.writes = 0

    async def create_index(self, *args, **kwargs):
        return None

    async def replace_one(self, selector, document, upsert=False):
        self.writes += 1
        self.records[selector["_id"]] = document


class OTPDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_notifications_fail_closed_outside_staging(self):
        store = FakeCollection()
        calls = []

        async def sender(*args, **kwargs):
            calls.append((args, kwargs))
            return {"success": True, "mock": True, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": False, "twilio_configured": True},
                      "test-secret")
        with self.assertRaises(OTPError):
            await otp.issue("+27820000000", "registration", "sms")
        self.assertEqual(calls, [])
        self.assertEqual(store.writes, 0)

    async def test_live_mode_rejects_mock_delivery_ack(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": True, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        with self.assertRaises(OTPError):
            await otp.issue("+27820000000", "password_reset", "sms")
        self.assertEqual(store.writes, 0)

    async def test_live_mode_requires_explicit_nonmock_ack(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        with self.assertRaises(OTPError):
            await otp.issue("+27820000000", "registration", "sms")
        self.assertEqual(store.writes, 0)

    async def test_live_mode_fails_when_provider_unconfigured(self):
        store = FakeCollection()
        calls = []

        async def sender(*args, **kwargs):
            calls.append(1)
            return {"success": True, "mock": False}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": False},
                      "test-secret")
        with self.assertRaises(OTPError):
            await otp.issue("+27820000000", "registration")
        self.assertEqual(calls, [])
        self.assertEqual(store.writes, 0)

    async def test_live_mode_creates_challenge_after_nonmock_ack(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": False, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        result = await otp.issue("+27820000000", "registration", "sms")
        self.assertEqual(result["notification_mode"], "live")
        self.assertNotIn("mock_otp", result)
        self.assertEqual(store.writes, 1)

    def test_runtime_mock_is_only_allowed_in_explicit_staging(self):
        staging = {"CLUBVEL_ENV": "staging", "ALLOW_MOCK_OTP": "true",
                   "PRODUCTION_MODE": "false", "RAILWAY_ENVIRONMENT_NAME": "staging"}
        self.assertTrue(runtime_mock_otp_allowed(staging))
        for key, value in [("CLUBVEL_ENV", "production"),
                           ("ALLOW_MOCK_OTP", "false"),
                           ("PRODUCTION_MODE", "true"),
                           ("RAILWAY_ENVIRONMENT_NAME", "production")]:
            env = dict(staging)
            env[key] = value
            self.assertFalse(runtime_mock_otp_allowed(env))


if __name__ == "__main__":
    unittest.main()
