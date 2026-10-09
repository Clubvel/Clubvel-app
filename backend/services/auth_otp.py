"""Backend-owned, purpose-bound OTP challenges shared across API workers."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta


class OTPError(ValueError):
    pass


def runtime_mock_otp_allowed(environ):
    """Deployable mock delivery is staging-only and rejects conflicting flags.

    Offline tests may inject allow_mock into AuthOTP with an in-memory store;
    test/development environment labels never enable runtime mock delivery.
    """
    return (
        environ.get("CLUBVEL_ENV", "").strip().lower() == "staging"
        and environ.get("ALLOW_MOCK_OTP", "").strip().lower() == "true"
        and environ.get("PRODUCTION_MODE", "false").strip().lower() == "false"
        and environ.get("RAILWAY_ENVIRONMENT_NAME", "staging").strip().lower() == "staging"
    )


class AuthOTP:
    def __init__(self, collection, send, notification_status, secret, *, allow_mock=False):
        self.collection = collection
        self.send = send
        self.notification_status = notification_status
        self.secret = secret.encode()
        self.allow_mock = allow_mock

    def digest(self, challenge, code):
        return hmac.new(self.secret, f"{challenge}:{code}".encode(), hashlib.sha256).hexdigest()

    async def issue(self, phone, purpose, channel="whatsapp"):
        if purpose not in ("registration", "password_reset"):
            raise ValueError("Unknown OTP purpose")
        status = self.notification_status()
        # Never silently downgrade a requested live delivery to a demo code.
        if status["real_notifications_enabled"] and not status["twilio_configured"]:
            raise OTPError("SMS/WhatsApp delivery is not configured. Please contact support.")
        mock = not status["real_notifications_enabled"]
        if mock and not self.allow_mock:
            raise OTPError("Test verification is not enabled for this environment. Please contact support.")
        code = "1234" if mock else f"{secrets.randbelow(1000000):06d}"
        challenge = secrets.token_hex(16)
        await self.collection.create_index("expires_at", expireAfterSeconds=0)
        result = await self.send(phone, preferred_channel=channel, otp=code)
        if not result.get("success") or (not mock and result.get("mock") is not False):
            raise OTPError("Could not confirm live verification delivery. Please try again.")
        await self.collection.replace_one({"_id": f"{purpose}:{phone}"}, {
            "_id": f"{purpose}:{phone}", "challenge": challenge,
            "digest": self.digest(challenge, code), "attempts": 0,
            "expires_at": datetime.utcnow() + timedelta(minutes=10),
        }, upsert=True)
        response = {"message": "Verification code sent.", "channel": result.get("channel", channel),
                    "notification_mode": "mock" if mock else "live"}
        if mock:
            response["mock_otp"] = code
        return response

    async def check(self, phone, purpose, code, consume=False):
        key = f"{purpose}:{phone}"
        record = await self.collection.find_one(
            {"_id": key, "expires_at": {"$gt": datetime.utcnow()}, "attempts": {"$lt": 5}}
        )
        if not record:
            raise OTPError("Code expired, already used, or too many attempts. Please request a new code.")
        # Bind every mutation to this exact challenge, its lifetime and budget.
        # A resend or concurrent consume must never mutate/consume its successor.
        current = {"_id": key, "challenge": record["challenge"],
                   "expires_at": {"$gt": datetime.utcnow()}, "attempts": {"$lt": 5}}
        if not hmac.compare_digest(record["digest"], self.digest(record["challenge"], code.strip())):
            await self.collection.find_one_and_update(current, {"$inc": {"attempts": 1}})
            raise OTPError("Invalid verification code. Please try again.")
        # Count failed guesses only. The reset UI validates the same code before
        # submitting a new password; that confirmation must not spend two tries.
        if consume:
            result = await self.collection.delete_one(current)
            if result.deleted_count != 1:
                raise OTPError("Code already used or replaced. Please request a new code.")
