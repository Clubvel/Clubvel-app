"""Offline security regression tests: no network, Twilio, or production database."""
import asyncio
import unittest

from services.auth_otp import AuthOTP, OTPError, runtime_mock_otp_allowed


class FakeCollection:
    def __init__(self):
        self.records = {}
        self.writes = 0
        self.lock = asyncio.Lock()

    async def create_index(self, *args, **kwargs):
        return None

    async def replace_one(self, selector, document, upsert=False):
        self.writes += 1
        self.records[selector["_id"]] = document

    async def find_one(self, selector):
        from datetime import datetime
        record = self.records.get(selector["_id"])
        if not record:
            return None
        if "challenge" in selector and record["challenge"] != selector["challenge"]:
            return None
        if "expires_at" in selector and not record["expires_at"] > selector["expires_at"]["$gt"]:
            return None
        if "attempts" in selector and not record["attempts"] < selector["attempts"]["$lt"]:
            return None
        return dict(record)

    async def find_one_and_update(self, selector, update):
        async with self.lock:
            record = await self.find_one(selector)
            if record:
                self.records[selector["_id"]]["attempts"] += update["$inc"]["attempts"]
            return record

    async def delete_one(self, selector):
        from types import SimpleNamespace
        async with self.lock:
            record = await self.find_one(selector)
            if record:
                del self.records[selector["_id"]]
            return SimpleNamespace(deleted_count=int(record is not None))


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


    async def test_wrong_purpose_cannot_verify_registration_code(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": False, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        await otp.issue("+27820000000", "registration")
        with self.assertRaises(OTPError):
            await otp.check("+27820000000", "password_reset", "123456")

    async def test_expired_code_is_rejected(self):
        from datetime import datetime, timedelta
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": False, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        await otp.issue("+27820000000", "registration")
        store.records["registration:+27820000000"]["expires_at"] = datetime.utcnow() - timedelta(seconds=1)
        with self.assertRaises(OTPError):
            await otp.check("+27820000000", "registration", "000000")

    async def test_five_bad_attempts_lock_challenge(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": True, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": False, "twilio_configured": False},
                      "test-secret", allow_mock=True)
        await otp.issue("+27820000000", "registration")
        for _ in range(5):
            with self.assertRaises(OTPError):
                await otp.check("+27820000000", "registration", "9999")
        with self.assertRaises(OTPError):
            await otp.check("+27820000000", "registration", "1234")

    async def test_consumed_code_cannot_be_replayed(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": True, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": False, "twilio_configured": False},
                      "test-secret", allow_mock=True)
        await otp.issue("+27820000000", "password_reset")
        await otp.check("+27820000000", "password_reset", "1234", consume=True)
        with self.assertRaises(OTPError):
            await otp.check("+27820000000", "password_reset", "1234", consume=True)

    async def test_concurrent_consumes_allow_only_one_winner(self):
        store = FakeCollection()

        async def sender(*args, **kwargs):
            return {"success": True, "mock": True, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": False, "twilio_configured": False},
                      "test-secret", allow_mock=True)
        await otp.issue("+27820000000", "registration")
        results = await asyncio.gather(
            otp.check("+27820000000", "registration", "1234", consume=True),
            otp.check("+27820000000", "registration", "1234", consume=True),
            return_exceptions=True,
        )
        self.assertEqual(sum(not isinstance(r, Exception) for r in results), 1)
        self.assertEqual(sum(isinstance(r, OTPError) for r in results), 1)


    async def test_resend_invalidates_prior_challenge(self):
        store = FakeCollection()
        codes = []

        async def sender(*args, **kwargs):
            codes.append(kwargs["otp"])
            return {"success": True, "mock": False, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        await otp.issue("+27820000000", "registration", "sms")
        old = dict(store.records["registration:+27820000000"])
        await otp.issue("+27820000000", "registration", "sms")
        new = store.records["registration:+27820000000"]
        self.assertNotEqual(old["challenge"], new["challenge"])
        self.assertNotEqual(old["digest"], new["digest"])
        self.assertEqual(new["attempts"], 0)
        if codes[0] != codes[1]:
            with self.assertRaises(OTPError):
                await otp.check("+27820000000", "registration", codes[0], consume=True)
        await otp.check("+27820000000", "registration", codes[1], consume=True)

    async def test_failed_delivery_does_not_replace_existing_challenge(self):
        store = FakeCollection()
        sent = 0

        async def sender(*args, **kwargs):
            nonlocal sent
            sent += 1
            return {"success": sent == 1, "mock": False, "channel": "sms"}

        otp = AuthOTP(store, sender,
                      lambda: {"real_notifications_enabled": True, "twilio_configured": True},
                      "test-secret")
        await otp.issue("+27820000000", "registration", "sms")
        original = dict(store.records["registration:+27820000000"])
        with self.assertRaises(OTPError):
            await otp.issue("+27820000000", "registration", "sms")
        self.assertEqual(store.records["registration:+27820000000"], original)

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
