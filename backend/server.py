from fastapi import FastAPI, APIRouter, Header, HTTPException, status as http_status, Request
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import random
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Import notification service
from services.notification_service import (
    send_otp, verify_stored_otp, get_notification_status,
    send_payment_reminder, send_payment_confirmation, send_late_payment_alert,
    format_phone_number
)

# Import bank feed service
from services.bank_feed_service import (
    bank_feed_service, get_bank_feed_status
)
import ssl
import certifi
import certifi

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Rate limiter setup
limiter = Limiter(key_func=get_remote_address)

# MongoDB connection with SSL certificate handling
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')

# Configure SSL for MongoDB Atlas connections
if 'mongodb+srv' in mongo_url or 'mongodb.net' in mongo_url:
    # Use certifi for SSL certificates
    client = AsyncIOMotorClient(
        mongo_url,
        tls=True,
        tlsCAFile=certifi.where(),
        serverSelectionTimeoutMS=30000,
        connectTimeoutMS=30000
    )
else:
    # Local MongoDB - no SSL needed
    client = AsyncIOMotorClient(mongo_url)

db = client[os.environ.get('DB_NAME', 'clubvel')]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'clubvel-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30  # Session expires after 30 minutes of inactivity

# Field-level encryption key (for sensitive data at rest)
ENCRYPTION_KEY = os.environ.get('FIELD_ENCRYPTION_KEY', 'clubvel-encryption-key-32bytes!')

def get_fernet_key():
    """Generate a Fernet-compatible key from the encryption key"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b'clubvel_salt_v1',  # Fixed salt for consistent encryption
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(ENCRYPTION_KEY.encode()))
    return Fernet(key)

fernet = get_fernet_key()

def encrypt_sensitive_field(value: str) -> str:
    """Encrypt sensitive data for storage at rest"""
    if not value:
        return value
    return fernet.encrypt(value.encode()).decode()

def decrypt_sensitive_field(encrypted_value: str) -> str:
    """Decrypt sensitive data when reading"""
    if not encrypted_value:
        return encrypted_value
    try:
        return fernet.decrypt(encrypted_value.encode()).decode()
    except Exception:
        # If decryption fails, return original (might be unencrypted legacy data)
        return encrypted_value

def mask_sensitive_field(value: str, show_last: int = 4) -> str:
    """Mask sensitive data for display (e.g., ****1234)"""
    if not value or len(value) <= show_last:
        return '*' * len(value) if value else ''
    return '*' * (len(value) - show_last) + value[-show_last:]

# Create the main app
app = FastAPI(title="Clubvel API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class UserCreate(BaseModel):
    full_name: str
    phone_number: str
    email: Optional[str] = None
    password: str
    # Accepted and ignored only so older installed clients do not fail validation.
    role: Optional[str] = None

class UserLogin(BaseModel):
    phone_number: str
    password: str

class OTPVerify(BaseModel):
    phone_number: str
    otp: str

class SendOTPRequest(BaseModel):
    phone_number: str
    channel: str = "whatsapp"  # whatsapp or sms

class ResendOTPRequest(BaseModel):
    phone_number: str
    channel: str = "whatsapp"  # whatsapp or sms

class StokvelMembership(BaseModel):
    """Represents a user's role in a specific stokvel/group"""
    stokvel_id: str
    role: str  # "treasurer", "admin", or "member"
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    status: str = "active"

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    phone_number: str
    email: Optional[str] = None
    password_hash: str
    # Deprecated compatibility fields. They are never authorization inputs.
    role: Optional[str] = None
    roles: List[str] = Field(default_factory=list)
    # New contextual membership array - maps roles per stokvel dynamically
    stokvel_memberships: List[dict] = Field(default_factory=list)
    profile_photo: Optional[str] = None  # base64
    date_joined: datetime = Field(default_factory=datetime.utcnow)
    status: str = "active"  # active or inactive
    otp_verified: bool = False


def person_document(user: User) -> dict:
    """Serialize a new identity without deprecated account-wide role fields."""
    document = user.dict()
    document.pop("role", None)
    document.pop("roles", None)
    return document

class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_name: str
    group_type: str  # savings, burial society, investment, grocery, social
    monthly_contribution: float
    payment_due_date: int  # day of month (1-31)
    bank_name: str
    bank_account_number: str
    bank_account_holder: str
    payment_reference_prefix: str
    start_date: datetime
    status: str = "active"
    treasurer_user_id: str
    description: Optional[str] = None
    group_photo: Optional[str] = None  # base64

class Member(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    group_id: str
    unique_reference_code: str
    date_joined_group: datetime = Field(default_factory=datetime.utcnow)
    status: str = "active"
    role_in_group: str = "member"  # member or treasurer
    payout_position: int

class Contribution(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    group_id: str
    month: int
    year: int
    amount_due: float
    amount_paid: float = 0.0
    payment_date: Optional[datetime] = None
    payment_method: str = "EFT"  # EFT or cash
    reference_number: Optional[str] = None
    proof_of_payment: Optional[str] = None  # base64 image
    contribution_status: str = "pending"  # pending, proof_uploaded, confirmed, late, excused
    confirmed_by_treasurer_id: Optional[str] = None
    confirmation_date: Optional[datetime] = None
    notes: Optional[str] = None

class Claim(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    group_id: str
    claim_amount: float
    scheduled_claim_date: datetime
    claim_status: str = "upcoming"  # upcoming, ready, processing, paid, confirmed
    confirmed_by_treasurer_id: Optional[str] = None
    confirmation_date: Optional[datetime] = None
    notes: Optional[str] = None
    actual_amount_paid: Optional[float] = None

class Alert(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    group_id: Optional[str] = None
    alert_type: str  # payment_due, payment_late, payment_confirmed, claim_upcoming, claim_paid, group_announcement
    alert_message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    read_status: bool = False
    action_url: Optional[str] = None

class NotificationPreferences(BaseModel):
    """User notification preferences - all default to OFF for POPIA compliance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    contribution_reminders: bool = False  # Default OFF - opt-in required
    claim_updates: bool = False  # Default OFF - opt-in required
    group_announcements: bool = False  # Default OFF - opt-in required
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class NotificationPreferencesUpdate(BaseModel):
    """Request model for updating notification preferences"""
    user_id: str
    contribution_reminders: Optional[bool] = None
    claim_updates: Optional[bool] = None
    group_announcements: Optional[bool] = None


class ProofUpload(BaseModel):
    contribution_id: str
    proof_image: str  # base64
    reference_number: str
    user_id: str  # Requesting user - for authorization

class ConfirmPayment(BaseModel):
    contribution_id: str
    notes: Optional[str] = None
    treasurer_id: str  # Requesting treasurer - for authorization

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ==================== DATA ACCESS CONTROL HELPERS ====================

async def verify_user_exists(user_id: str) -> dict:
    """Verify user exists and return user data"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def verify_member_owns_data(user_id: str, target_user_id: str) -> bool:
    """Verify that a member is only accessing their own data"""
    if user_id != target_user_id:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: You can only access your own data"
        )
    return True


def get_legacy_group_admin_role(user_id: str, group: dict) -> Optional[str]:
    """Return a contextual role only when legacy group metadata proves admin access."""
    if group.get("treasurer_user_id") == user_id:
        return "treasurer"
    if user_id in (group.get("admin_user_ids") or []):
        return "admin"
    return None


async def reconcile_legacy_group_admin_membership(user_id: str, group: dict) -> Optional[dict]:
    """Lazily migrate a proven legacy group administrator into members.

    Group ownership metadata is used only as migration evidence. The resulting
    active members record remains the authorization source for the request and
    all subsequent requests.
    """
    role_in_group = get_legacy_group_admin_role(user_id, group)
    if not role_in_group:
        return None

    group_id = group["id"]
    existing_membership = await db.members.find_one({
        "user_id": user_id,
        "group_id": group_id,
        "status": "active",
        "role_in_group": {"$in": ["admin", "treasurer"]}
    })
    if existing_membership:
        return existing_membership

    member_count = await db.members.count_documents({"group_id": group_id})
    reference_prefix = group.get("payment_reference_prefix", "CLB")
    await db.members.update_one(
        {"user_id": user_id, "group_id": group_id},
        {
            "$set": {"status": "active", "role_in_group": role_in_group},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "unique_reference_code": generate_reference_code(
                    reference_prefix, member_count + 1
                ),
                "date_joined_group": datetime.utcnow(),
                "payout_position": member_count + 1
            }
        },
        upsert=True
    )
    membership = await db.members.find_one({"user_id": user_id, "group_id": group_id})
    logging.info("Reconciled legacy admin membership for user %s in group %s", user_id, group_id)
    return membership


async def reconcile_legacy_admin_memberships(user_id: str) -> None:
    """Migrate active groups that explicitly name this person as an administrator."""
    legacy_groups = await db.groups.find({
        "$or": [
            {"treasurer_user_id": user_id},
            {"admin_user_ids": user_id}
        ],
        "status": "active"
    }).to_list(100)
    for group in legacy_groups:
        await reconcile_legacy_group_admin_membership(user_id, group)


async def get_active_membership_contexts(user_id: str) -> list[tuple[dict, dict]]:
    """Return authoritative active membership/group pairs for a person."""
    await reconcile_legacy_admin_memberships(user_id)
    memberships = await db.members.find({"user_id": user_id, "status": "active"}).to_list(100)
    contexts = []
    for membership in memberships:
        group = await db.groups.find_one({"id": membership["group_id"], "status": "active"})
        if group:
            contexts.append((membership, group))
    return contexts


async def verify_user_is_group_member(user_id: str, group_id: str) -> dict:
    """Verify user is an active member of the specified group"""
    membership = await db.members.find_one({
        "user_id": user_id, 
        "group_id": group_id,
        "status": "active"
    })
    if not membership or membership.get("role_in_group") not in ("admin", "treasurer"):
        group = await db.groups.find_one({"id": group_id})
        if group:
            reconciled = await reconcile_legacy_group_admin_membership(user_id, group)
            if reconciled:
                membership = reconciled
    if not membership:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: You are not a member of this group"
        )
    return membership


async def verify_user_is_group_treasurer(user_id: str, group_id: str) -> dict:
    """Verify the user's active membership grants administration in this group."""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    membership = await db.members.find_one({
        "user_id": user_id,
        "group_id": group_id,
        "status": "active",
        "role_in_group": {"$in": ["admin", "treasurer"]}
    })
    if not membership:
        membership = await reconcile_legacy_group_admin_membership(user_id, group)
    if not membership:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: Group admin access required"
        )
    return group


async def verify_treasurer_owns_groups(user_id: str) -> list:
    """Get groups where the user's contextual membership is administrative."""
    await reconcile_legacy_admin_memberships(user_id)

    memberships = await db.members.find({
        "user_id": user_id,
        "status": "active",
        "role_in_group": {"$in": ["admin", "treasurer"]}
    }).to_list(100)
    group_ids = [membership["group_id"] for membership in memberships]
    groups = await db.groups.find({"id": {"$in": group_ids}, "status": "active"}).to_list(100)
    return groups


async def verify_contribution_access(user_id: str, contribution_id: str, require_treasurer: bool = False) -> dict:
    """
    Verify user has access to a contribution record.
    - Members can only access their own contributions
    - Treasurers can access contributions from their groups
    """
    contribution = await db.contributions.find_one({"id": contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Get the member record for this contribution
    member = await db.members.find_one({"id": contribution['member_id']})
    if not member:
        raise HTTPException(status_code=404, detail="Member record not found")
    
    # Check if user owns this contribution (is the member)
    if member['user_id'] == user_id:
        if require_treasurer:
            raise HTTPException(
                status_code=403, 
                detail="Access denied: Treasurer access required"
            )
        return contribution
    
    admin_membership = await db.members.find_one({
        "user_id": user_id, "group_id": contribution['group_id'], "status": "active",
        "role_in_group": {"$in": ["admin", "treasurer"]}
    })
    if admin_membership:
        return contribution
    
    raise HTTPException(
        status_code=403, 
        detail="Access denied: You cannot access this contribution"
    )


async def verify_member_access(user_id: str, member_id: str) -> dict:
    """
    Verify user has access to a member record.
    - Members can only access their own member records
    - Treasurers can access member records from their groups
    """
    member = await db.members.find_one({"id": member_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Check if user owns this member record
    if member['user_id'] == user_id:
        return member
    
    admin_membership = await db.members.find_one({
        "user_id": user_id, "group_id": member['group_id'], "status": "active",
        "role_in_group": {"$in": ["admin", "treasurer"]}
    })
    if admin_membership:
        return member
    
    raise HTTPException(
        status_code=403, 
        detail="Access denied: You cannot access this member's data"
    )

def create_access_token(data: dict, expires_delta: timedelta = None):
    """Create JWT access token with session expiration"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    # Include issued time for session tracking
    to_encode.update({
        "exp": expire,
        "iat": datetime.utcnow(),  # Issued at time
        "session_id": str(uuid.uuid4())  # Unique session identifier
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> dict:
    """Verify JWT token and check expiration"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid. Please log in again."
        )


def authenticated_user_id(authorization: Optional[str]) -> str:
    """Return the person identified by a Bearer session token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_token(authorization[7:])
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user_id


def phone_variants(phone_number: str) -> list[str]:
    """Match current E.164 and legacy local formatting for the same SA number."""
    normalized = format_phone_number(phone_number)
    variants = {phone_number, normalized}
    if normalized.startswith("+27"):
        variants.add("0" + normalized[3:])
        variants.add(normalized[1:])
    return list(variants)

def generate_reference_code(prefix: str, member_position: int) -> str:
    """Generate unique reference code for member"""
    return f"{prefix}{member_position:03d}"

def calculate_contribution_status(contribution: dict, due_day: int) -> str:
    """Calculate if contribution is late, due, or pending"""
    if contribution['contribution_status'] == 'confirmed':
        return 'confirmed'
    
    now = datetime.utcnow()
    current_due_date = datetime(contribution['year'], contribution['month'], min(due_day, 28))
    
    if contribution['contribution_status'] == 'proof_uploaded':
        return 'proof_uploaded'
    
    if now > current_due_date + timedelta(days=2):
        return 'late'
    elif now.date() == current_due_date.date():
        return 'due'
    else:
        return 'pending'

# ==================== AUTHENTICATION ROUTES ====================

@api_router.post("/auth/register")
@limiter.limit("5/minute")  # Limit to 5 registration attempts per minute
async def register(request: Request, user_data: UserCreate):
    # Check if phone number already exists
    existing_user = await db.users.find_one({"phone_number": user_data.phone_number})
    
    if existing_user:
        # A phone number identifies one person. Never create another identity or
        # mutate account-wide roles during registration.
        return {
            "message": "This phone number already has a Clubvel account. Please login.",
            "user_id": existing_user['id'],
            "already_registered": True
        }
    
    # Account creation establishes identity only. Group roles are created in members.
    user = User(
        full_name=user_data.full_name,
        phone_number=user_data.phone_number,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        stokvel_memberships=[],  # New contextual membership array - populated when joining stokvels
        otp_verified=False
    )
    
    await db.users.insert_one(person_document(user))
        
    # Send OTP via WhatsApp (with SMS fallback)
    otp_result = await send_otp(user_data.phone_number, preferred_channel='whatsapp')
    
    # Get notification status for response
    notif_status = get_notification_status()
    
    response = {
        "message": "User registered successfully. OTP sent to phone.",
        "user_id": user.id,
        "otp_channel": otp_result.get('channel', 'whatsapp'),
        "notification_mode": notif_status['mode']
    }
    
    # Include mock OTP in response if in mock mode
    if notif_status['mode'] == 'mock':
        response["mock_otp"] = "1234"
        response["note"] = "App is in demo mode. Real WhatsApp/SMS will be enabled when Twilio is configured."
    
    return response


@api_router.post("/auth/send-otp")
@limiter.limit("3/minute")  # Limit to 3 OTP requests per minute
async def send_otp_endpoint(request: Request, otp_request: SendOTPRequest):
    """Send or resend OTP to phone number"""
    # Check if user exists
    user = await db.users.find_one({"phone_number": otp_request.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Please register first.")
    
    if user.get('otp_verified'):
        raise HTTPException(status_code=400, detail="Phone already verified. Please login.")
    
    # Send OTP
    otp_result = await send_otp(otp_request.phone_number, preferred_channel=otp_request.channel)
    
    if not otp_result['success']:
        raise HTTPException(status_code=500, detail=f"Failed to send OTP: {otp_result.get('error', 'Unknown error')}")
    
    notif_status = get_notification_status()
    
    response = {
        "message": f"OTP sent via {otp_result['channel']}",
        "channel": otp_result['channel'],
        "notification_mode": notif_status['mode']
    }
    
    if notif_status['mode'] == 'mock':
        response["mock_otp"] = "1234"
    
    return response


@api_router.post("/auth/verify-otp")
async def verify_otp(otp_data: OTPVerify):
    # Verify OTP using notification service
    verification_result = verify_stored_otp(otp_data.phone_number, otp_data.otp)
    
    if not verification_result['valid']:
        raise HTTPException(status_code=400, detail=verification_result['error'])
    
    # Update user verification status
    result = await db.users.update_one(
        {"phone_number": otp_data.phone_number},
        {"$set": {"otp_verified": True}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "message": "OTP verified successfully",
        "channel": verification_result.get('channel', 'unknown')
    }


@api_router.get("/auth/notification-status")
async def get_notification_service_status():
    """Get current notification service configuration status"""
    return get_notification_status()

@api_router.post("/auth/login")
@limiter.limit("10/minute")  # Limit to 10 login attempts per minute
async def login(request: Request, login_data: UserLogin):
    # Find user
    user = await db.users.find_one({"phone_number": login_data.phone_number})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    # Verify password
    if not verify_password(login_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")

    # One-time/lazy compatibility migration for groups that explicitly identify
    # this existing person as a legacy treasurer or administrator.
    await reconcile_legacy_admin_memberships(user['id'])
    
    # The session identifies a person only. Authorization loads the selected
    # group's active membership instead of embedding global roles in the token.
    access_token = create_access_token(
        data={"user_id": user['id'], "phone": user['phone_number']}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user['id'],
            "full_name": user['full_name'],
            "phone_number": user['phone_number'],
            "profile_photo": user.get('profile_photo')
        }
    }


# ==================== FORGOT PASSWORD ENDPOINTS ====================

class ForgotPasswordRequest(BaseModel):
    phone_number: str

class VerifyResetOTPRequest(BaseModel):
    phone_number: str
    otp: str

class ResetPasswordRequest(BaseModel):
    phone_number: str
    otp: str
    new_password: str

@api_router.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, data: ForgotPasswordRequest):
    """Send password reset OTP to user's phone"""
    user = await db.users.find_one({"phone_number": data.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this phone number")
    
    # Send OTP via WhatsApp/SMS
    otp_result = await send_otp(data.phone_number, preferred_channel='whatsapp')
    
    if not otp_result['success']:
        raise HTTPException(status_code=500, detail="Failed to send reset code. Please try again.")
    
    notif_status = get_notification_status()
    response = {
        "message": f"Reset code sent via {otp_result['channel']}",
        "channel": otp_result['channel']
    }
    
    if notif_status['mode'] == 'mock':
        response["mock_otp"] = "1234"
    
    return response

@api_router.post("/auth/verify-reset-otp")
async def verify_reset_otp(data: VerifyResetOTPRequest):
    """Verify reset OTP before allowing password change"""
    user = await db.users.find_one({"phone_number": data.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    verification_result = verify_stored_otp(data.phone_number, data.otp)
    
    if not verification_result['valid']:
        raise HTTPException(status_code=400, detail=verification_result['error'])
    
    return {"message": "OTP verified successfully", "can_reset": True}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset user password after OTP verification"""
    user = await db.users.find_one({"phone_number": data.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify OTP again for security
    verification_result = verify_stored_otp(data.phone_number, data.otp)
    if not verification_result['valid']:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    
    # Update password
    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"phone_number": data.phone_number},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password reset successful"}


# ==================== USER STATS ENDPOINTS ====================

@api_router.get("/user/stats/{user_id}")
async def get_user_stats(user_id: str):
    """Get truthful profile statistics from authoritative records."""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    contexts = await get_active_membership_contexts(user_id)
    total_saved = 0.0
    total_contributions = 0
    on_time_contributions = 0
    for membership, _group in contexts:
        contributions = await db.contributions.find({"member_id": membership["id"], "contribution_status": "confirmed"}).to_list(1000)
        for contribution in contributions:
            total_saved += contribution.get("amount_paid", 0)
            total_contributions += 1
            if contribution.get("payment_date") and contribution.get("confirmation_date"):
                on_time_contributions += 1
    on_time_percentage = int(on_time_contributions / total_contributions * 100) if total_contributions else 0
    return {"clubs_count": len(contexts), "total_saved": total_saved, "on_time_percentage": on_time_percentage, "trust_score": None, "date_joined": user.get("date_joined")}

@api_router.get("/member/clubs/{user_id}")
async def get_member_clubs(user_id: str):
    if not await db.users.find_one({"id": user_id}):
        raise HTTPException(status_code=404, detail="User not found")
    clubs = [{"id": group["id"], "name": group["group_name"], "monthly_contribution": group["monthly_contribution"]} for _membership, group in await get_active_membership_contexts(user_id)]
    return {"clubs": clubs}

@api_router.get("/member/payout-schedule/{user_id}")
async def get_member_payout_schedule(user_id: str):
    """Return only stored payout/claim records; never manufacture dates or amounts."""
    if not await db.users.find_one({"id": user_id}):
        raise HTTPException(status_code=404, detail="User not found")
    schedules = []
    for membership, group in await get_active_membership_contexts(user_id):
        claims = await db.claims.find({"member_id": membership["id"], "group_id": group["id"]}).sort("scheduled_claim_date", 1).to_list(100)
        for claim in claims:
            scheduled = claim.get("scheduled_claim_date")
            schedules.append({"club_name": group["group_name"], "payout_date": scheduled.strftime("%B %Y") if scheduled else None, "amount": claim.get("claim_amount"), "position": membership.get("payout_position")})
    return {"schedules": schedules}


# ==================== ADMIN ENDPOINTS ====================

@api_router.get("/admin/stats/{user_id}")
async def get_admin_stats(user_id: str):
    """Get admin statistics for profile display"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all groups managed by this admin
    groups = await verify_treasurer_owns_groups(user_id)
    
    clubs_managed = len(groups)
    total_members = 0
    total_collected = 0.0
    
    for group in groups:
        # Count members
        member_count = await db.members.count_documents({"group_id": group['id'], "status": "active"})
        total_members += member_count
        
        # Sum confirmed contributions
        contributions = await db.contributions.find({
            "group_id": group['id'],
            "contribution_status": "confirmed"
        }).to_list(10000)
        
        for c in contributions:
            total_collected += c.get('amount_paid', 0)
    
    return {
        "clubs_managed": clubs_managed,
        "total_members": total_members,
        "total_collected": total_collected
    }

@api_router.get("/admin/clubs/{user_id}")
async def get_admin_clubs(user_id: str):
    """Get all clubs managed by an admin"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    groups = await verify_treasurer_owns_groups(user_id)
    
    clubs = []
    for group in groups:
        member_count = await db.members.count_documents({"group_id": group['id'], "status": "active"})
        clubs.append({
            "id": group['id'],
            "name": group['group_name'],
            "member_count": member_count,
            "monthly_contribution": group['monthly_contribution']
        })
    
    return {"clubs": clubs}

@api_router.get("/admin/payout-schedules/{user_id}")
async def get_admin_payout_schedules(user_id: str):
    """Get payout schedules for all clubs managed by an admin"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    groups = await verify_treasurer_owns_groups(user_id)
    
    schedules = []
    for group in groups:
        # Find next member to receive payout
        members = await db.members.find({
            "group_id": group['id'],
            "status": "active"
        }).sort("payout_position", 1).to_list(100)
        
        if members:
            next_member = members[0]
            next_user = await db.users.find_one({"id": next_member['user_id']})
            member_count = len(members)
            estimated_payout = group['monthly_contribution'] * member_count
            
            schedules.append({
                "club_name": group['group_name'],
                "next_payout_member": next_user['full_name'] if next_user else "Unknown",
                "payout_date": "Next Month",
                "amount": estimated_payout
            })
    
    return {"schedules": schedules}

@api_router.get("/admin/dashboard/{user_id}")
async def get_admin_dashboard(user_id: str):
    """Get admin/treasurer dashboard data"""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all groups managed by this admin
    groups = await verify_treasurer_owns_groups(user_id)
    
    total_clubs = len(groups)
    total_members = 0
    total_collected_this_month = 0.0
    late_members_count = 0
    urgent_alerts = []
    clubs_data = []
    next_claim = None
    
    now = datetime.utcnow()
    
    for group in groups:
        # Get members
        members = await db.members.find({"group_id": group['id'], "status": "active"}).to_list(100)
        member_count = len(members)
        total_members += member_count
        
        collected = 0.0
        expected = group['monthly_contribution'] * member_count
        late_in_club = 0
        
        for member in members:
            # Get current month contribution
            contribution = await db.contributions.find_one({
                "member_id": member['id'],
                "group_id": group['id'],
                "month": now.month,
                "year": now.year
            })
            
            if contribution:
                if contribution['contribution_status'] == 'confirmed':
                    collected += contribution.get('amount_paid', 0)
                    total_collected_this_month += contribution.get('amount_paid', 0)
                elif contribution['contribution_status'] in ['late', 'pending']:
                    # Check if actually late
                    due_date = datetime(now.year, now.month, min(group['payment_due_date'], 28))
                    if now > due_date + timedelta(days=2):
                        late_in_club += 1
                        late_members_count += 1
                        
                        # Get member user info for urgent alert
                        member_user = await db.users.find_one({"id": member['user_id']})
                        if member_user and len(urgent_alerts) < 5:
                            days_late = (now - due_date).days
                            urgent_alerts.append({
                                "member_name": member_user['full_name'],
                                "group_name": group['group_name'],
                                "days_late": days_late,
                                "amount": group['monthly_contribution'],
                                "phone": member_user['phone_number']
                            })
        
        clubs_data.append({
            "id": group['id'],
            "name": group['group_name'],
            "member_count": member_count,
            "due_date": group['payment_due_date'],
            "collected": collected,
            "expected": expected,
            "status": "active",
            "late_count": late_in_club
        })
    
    return {
        "summary": {
            "total_clubs": total_clubs,
            "total_members": total_members,
            "total_collected_this_month": total_collected_this_month,
            "late_members_count": late_members_count
        },
        "urgent_alerts": urgent_alerts,
        "clubs": clubs_data,
        "next_claim": next_claim
    }


# ==================== GROUP/CLUB MANAGEMENT ====================

class CreateGroupRequest(BaseModel):
    group_name: str
    group_type: str = "savings"
    monthly_contribution: float
    payment_due_date: int = 25
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_holder: Optional[str] = None
    admin_user_id: str
    payment_reference_prefix: str = "CLB"
    start_date: Optional[str] = None
    description: Optional[str] = None

@api_router.post("/groups/create")
async def create_group(data: CreateGroupRequest):
    """Create a new club/group"""
    # Verify admin user exists
    admin_user = await db.users.find_one({"id": data.admin_user_id})
    if not admin_user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    
    # Create group
    group_id = str(uuid.uuid4())
    start_date = datetime.fromisoformat(data.start_date.replace('Z', '+00:00')) if data.start_date else datetime.utcnow()
    
    group = {
        "id": group_id,
        "group_name": data.group_name,
        "group_type": data.group_type,
        "monthly_contribution": data.monthly_contribution,
        "payment_due_date": data.payment_due_date,
        "bank_name": encrypt_sensitive_field(data.bank_name) if data.bank_name else None,
        "bank_account_number": encrypt_sensitive_field(data.bank_account_number) if data.bank_account_number else None,
        "bank_account_holder": encrypt_sensitive_field(data.bank_account_holder) if data.bank_account_holder else None,
        "payment_reference_prefix": data.payment_reference_prefix,
        "start_date": start_date,
        "status": "active",
        "treasurer_user_id": data.admin_user_id,
        "admin_user_ids": [data.admin_user_id],  # Support for multiple admins (max 5)
        "max_admins": 5,
        "description": data.description,
        "created_at": datetime.utcnow()
    }
    
    await db.groups.insert_one(group)
    
    # Add creator as first member with admin role
    member = {
        "id": str(uuid.uuid4()),
        "user_id": data.admin_user_id,
        "group_id": group_id,
        "unique_reference_code": f"{data.payment_reference_prefix}001",
        "date_joined_group": datetime.utcnow(),
        "status": "active",
        "role_in_group": "admin",
        "payout_position": 1
    }
    
    await db.members.insert_one(member)
    
    # Update user's stokvel_memberships array with contextual role
    await db.users.update_one(
        {"id": data.admin_user_id},
        {
            "$addToSet": {
                "stokvel_memberships": {
                    "stokvel_id": group_id,
                    "role": "admin",
                    "joined_at": datetime.utcnow(),
                    "status": "active"
                }
            }
        }
    )
    
    logging.info(f"Group created: {data.group_name} by user {data.admin_user_id}")
    
    return {
        "message": "Club created successfully",
        "group_id": group_id,
        "group_name": data.group_name
    }



class UpdateGroupRequest(BaseModel):
    group_id: str
    admin_user_id: str
    group_name: Optional[str] = None
    group_type: Optional[str] = None
    monthly_contribution: Optional[float] = None
    payment_due_date: Optional[int] = None
    bank_name: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_account_holder: Optional[str] = None
    description: Optional[str] = None

@api_router.put("/groups/update")
async def update_group(data: UpdateGroupRequest):
    """Update an existing club/group"""
    # Find the group
    group = await db.groups.find_one({"id": data.group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Club not found")
    
    await verify_user_is_group_treasurer(data.admin_user_id, data.group_id)
    
    # Build update dict with only provided fields
    update_fields = {}
    if data.group_name is not None:
        update_fields['group_name'] = data.group_name
    if data.group_type is not None:
        update_fields['group_type'] = data.group_type
    if data.monthly_contribution is not None:
        update_fields['monthly_contribution'] = data.monthly_contribution
    if data.payment_due_date is not None:
        update_fields['payment_due_date'] = data.payment_due_date
    if data.bank_name is not None:
        update_fields['bank_name'] = encrypt_sensitive_field(data.bank_name)
    if data.bank_account_number is not None:
        update_fields['bank_account_number'] = encrypt_sensitive_field(data.bank_account_number)
    if data.bank_account_holder is not None:
        update_fields['bank_account_holder'] = encrypt_sensitive_field(data.bank_account_holder)
    if data.description is not None:
        update_fields['description'] = data.description
    
    if not update_fields:
        return {"message": "No fields to update"}
    
    update_fields['updated_at'] = datetime.utcnow()
    
    await db.groups.update_one(
        {"id": data.group_id},
        {"$set": update_fields}
    )
    
    logging.info(f"Group updated: {data.group_id} by user {data.admin_user_id}")
    
    return {
        "message": "Club updated successfully",
        "group_id": data.group_id
    }

# ==================== DELETE CLUB ENDPOINT ====================

class DeleteClubRequest(BaseModel):
    group_id: str
    admin_user_id: str
    confirmation: str = "DELETE"

@api_router.delete("/groups/delete")
async def delete_club(data: DeleteClubRequest):
    """Delete a club/group (admin only)"""
    # Find the group
    group = await db.groups.find_one({"id": data.group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Club not found")
    
    await verify_user_is_group_treasurer(data.admin_user_id, data.group_id)
    
    if data.confirmation != "DELETE":
        raise HTTPException(status_code=400, detail="Confirmation required")
    
    # Delete all members of this group
    await db.members.delete_many({"group_id": data.group_id})
    
    # Delete all contributions for this group
    await db.contributions.delete_many({"group_id": data.group_id})
    
    # Delete the group
    await db.groups.delete_one({"id": data.group_id})
    
    logging.info(f"Club deleted: {data.group_id} by user {data.admin_user_id}")
    
    return {"message": "Club deleted successfully"}

# ==================== DELETE MEMBER ENDPOINT ====================

class DeleteMemberRequest(BaseModel):
    group_id: str
    member_user_id: str
    admin_user_id: str
    reason: Optional[str] = None

@api_router.delete("/groups/member/delete")
async def delete_member(data: DeleteMemberRequest):
    """Remove a member from a club (admin only, notifies the member)"""
    # Find the group
    group = await db.groups.find_one({"id": data.group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Club not found")
    
    await verify_user_is_group_treasurer(data.admin_user_id, data.group_id)
    admin_user_ids = group.get('admin_user_ids', [])
    
    # Can't delete self if you're the only admin
    if data.member_user_id == data.admin_user_id:
        if len(admin_user_ids) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove yourself as the only admin. Transfer admin rights first.")
    
    # Find and remove the member
    member = await db.members.find_one({
        "group_id": data.group_id,
        "user_id": data.member_user_id
    })
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in this club")
    
    await db.members.delete_one({
        "group_id": data.group_id,
        "user_id": data.member_user_id
    })
    
    # Remove from admin list if they were an admin
    if data.member_user_id in admin_user_ids:
        admin_user_ids.remove(data.member_user_id)
        await db.groups.update_one(
            {"id": data.group_id},
            {"$set": {"admin_user_ids": admin_user_ids}}
        )
    
    # Get member details for notification
    removed_user = await db.users.find_one({"id": data.member_user_id})
    
    # TODO: Send notification to removed member (SMS/WhatsApp when Twilio is configured)
    # For now, log the removal
    logging.info(f"Member {data.member_user_id} removed from club {data.group_id} by admin {data.admin_user_id}. Reason: {data.reason}")
    
    return {
        "message": "Member removed successfully",
        "notification_sent": True,  # Will be true when Twilio is configured
        "notification_note": "Demo mode - notification logged. Real SMS will be sent when Twilio is configured."
    }

# ==================== INVITE ADMIN ENDPOINT ====================

class InviteAdminRequest(BaseModel):
    group_id: str
    admin_user_id: str  # Current admin making the invitation
    new_admin_phone: str

@api_router.post("/groups/admin/invite")
async def invite_admin(data: InviteAdminRequest):
    """Invite a new admin to the club (max 5 admins)"""
    # Find the group
    group = await db.groups.find_one({"id": data.group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Club not found")
    
    await verify_user_is_group_treasurer(data.admin_user_id, data.group_id)
    admin_user_ids = group.get('admin_user_ids', [])
    
    # Check max admins limit (5)
    max_admins = group.get('max_admins', 5)
    if len(admin_user_ids) >= max_admins:
        raise HTTPException(status_code=400, detail=f"Maximum {max_admins} admins allowed per club")
    
    # Find the user by phone number
    new_admin = await db.users.find_one({"phone_number": data.new_admin_phone})
    if not new_admin:
        raise HTTPException(status_code=404, detail="User not found. They must register first.")
    
    new_admin_id = new_admin['id']
    
    # Check if already an admin
    if new_admin_id in admin_user_ids:
        raise HTTPException(status_code=400, detail="This user is already an admin")
    
    # Check if already a member
    existing_member = await db.members.find_one({
        "group_id": data.group_id,
        "user_id": new_admin_id
    })
    
    if not existing_member:
        # Add as member first
        member = {
            "id": str(uuid.uuid4()),
            "user_id": new_admin_id,
            "group_id": data.group_id,
            "unique_reference_code": f"{group.get('payment_reference_prefix', 'CLB')}{str(len(admin_user_ids) + 1).zfill(3)}",
            "date_joined_group": datetime.utcnow(),
            "status": "active",
            "role_in_group": "admin",
            "payout_position": await db.members.count_documents({"group_id": data.group_id}) + 1
        }
        await db.members.insert_one(member)
    else:
        # Update existing member to admin role
        await db.members.update_one(
            {"group_id": data.group_id, "user_id": new_admin_id},
            {"$set": {"role_in_group": "admin", "status": "active"}}
        )
    
    # Add to admin list
    admin_user_ids.append(new_admin_id)
    await db.groups.update_one(
        {"id": data.group_id},
        {"$set": {"admin_user_ids": admin_user_ids}}
    )
    
    # Update new admin's stokvel_memberships array
    await db.users.update_one(
        {"id": new_admin_id},
        {
            "$push": {
                "stokvel_memberships": {
                    "stokvel_id": data.group_id,
                    "role": "admin",
                    "joined_at": datetime.utcnow(),
                    "status": "active"
                }
            }
        }
    )
    
    logging.info(f"New admin {new_admin_id} added to club {data.group_id} by admin {data.admin_user_id}")
    
    return {
        "message": "Admin added successfully",
        "new_admin_name": new_admin.get('full_name', 'Unknown'),
        "total_admins": len(admin_user_ids)
    }

@api_router.get("/groups/{group_id}")
async def get_group_details(group_id: str, user_id: str):
    """Get details of a specific group"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Club not found")
    
    membership = await verify_user_is_group_member(user_id, group_id)
    is_admin = membership.get('role_in_group') in ['admin', 'treasurer']
    
    # Get member count
    member_count = await db.members.count_documents({"group_id": group_id, "status": "active"})
    
    return {
        "id": group['id'],
        "group_name": group['group_name'],
        "group_type": group.get('group_type', 'savings'),
        "monthly_contribution": group['monthly_contribution'],
        "payment_due_date": group['payment_due_date'],
        "bank_name": decrypt_sensitive_field(group.get('bank_name', '')) if is_admin else '****',
        "bank_account_number": decrypt_sensitive_field(group.get('bank_account_number', '')) if is_admin else '****',
        "bank_account_holder": decrypt_sensitive_field(group.get('bank_account_holder', '')) if is_admin else '****',
        "description": group.get('description'),
        "member_count": member_count,
        "status": group.get('status', 'active'),
        "created_at": group.get('created_at'),
        "is_admin": is_admin
    }




# ==================== MEMBER ROUTES ====================

class ProfilePhotoUpdate(BaseModel):
    user_id: str
    profile_photo: str  # base64 encoded image

@api_router.post("/user/profile-photo")
async def update_profile_photo(data: ProfilePhotoUpdate):
    """Update user's profile photo"""
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Update profile photo
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {"profile_photo": data.profile_photo}}
    )
    
    return {"message": "Profile photo updated successfully"}


# ==================== NOTIFICATION PREFERENCES ====================

@api_router.get("/user/notification-preferences/{user_id}")
async def get_notification_preferences(user_id: str):
    """Get user's notification preferences. Creates default (all OFF) if not exists."""
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find existing preferences
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    
    if not prefs:
        # Create default preferences (all OFF for POPIA compliance)
        default_prefs = NotificationPreferences(user_id=user_id)
        await db.notification_preferences.insert_one(default_prefs.dict())
        prefs = default_prefs.dict()
    
    return {
        "user_id": prefs['user_id'],
        "contribution_reminders": prefs.get('contribution_reminders', False),
        "claim_updates": prefs.get('claim_updates', False),
        "group_announcements": prefs.get('group_announcements', False),
        "updated_at": prefs.get('updated_at', datetime.utcnow()).isoformat() if isinstance(prefs.get('updated_at'), datetime) else prefs.get('updated_at')
    }


@api_router.put("/user/notification-preferences")
async def update_notification_preferences(prefs_update: NotificationPreferencesUpdate):
    """Update user's notification preferences"""
    user = await db.users.find_one({"id": prefs_update.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find or create preferences
    existing = await db.notification_preferences.find_one({"user_id": prefs_update.user_id})
    
    update_data = {"updated_at": datetime.utcnow()}
    
    if prefs_update.contribution_reminders is not None:
        update_data["contribution_reminders"] = prefs_update.contribution_reminders
    if prefs_update.claim_updates is not None:
        update_data["claim_updates"] = prefs_update.claim_updates
    if prefs_update.group_announcements is not None:
        update_data["group_announcements"] = prefs_update.group_announcements
    
    if existing:
        await db.notification_preferences.update_one(
            {"user_id": prefs_update.user_id},
            {"$set": update_data}
        )
    else:
        # Create new with defaults, then apply updates
        new_prefs = NotificationPreferences(user_id=prefs_update.user_id)
        prefs_dict = new_prefs.dict()
        prefs_dict.update(update_data)
        await db.notification_preferences.insert_one(prefs_dict)
    
    # Return updated preferences
    updated = await db.notification_preferences.find_one({"user_id": prefs_update.user_id})
    
    logging.info(f"Notification preferences updated for user {prefs_update.user_id}: {update_data}")
    
    return {
        "message": "Notification preferences updated successfully",
        "preferences": {
            "contribution_reminders": updated.get('contribution_reminders', False),
            "claim_updates": updated.get('claim_updates', False),
            "group_announcements": updated.get('group_announcements', False)
        }
    }


async def check_user_notification_preference(user_id: str, notification_type: str) -> bool:
    """
    Check if user has opted in for a specific notification type.
    Returns False if no preference exists (default OFF for POPIA compliance).
    """
    prefs = await db.notification_preferences.find_one({"user_id": user_id})
    if not prefs:
        return False  # Default to OFF
    
    # Map notification type to preference field
    type_mapping = {
        "contribution_reminder": "contribution_reminders",
        "payment_reminder": "contribution_reminders",
        "payment_due": "contribution_reminders",
        "payment_late": "contribution_reminders",
        "claim_update": "claim_updates",
        "claim_upcoming": "claim_updates",
        "claim_paid": "claim_updates",
        "group_announcement": "group_announcements",
        "payment_confirmed": "contribution_reminders"
    }
    
    pref_field = type_mapping.get(notification_type, None)
    if not pref_field:
        return False
    
    return prefs.get(pref_field, False)


class DeleteAccountRequest(BaseModel):
    user_id: str
    confirmation: str = "DELETE"  # Must match to confirm


@api_router.delete("/user/delete-account")
async def delete_user_account(data: DeleteAccountRequest):
    """
    POPIA-compliant account deletion.
    - Deletes personal information (name, contact details, login credentials)
    - Keeps contribution/claims records but replaces member name with "Deleted Member"
    - Logs the deletion request with timestamp for compliance records
    """
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if data.confirmation != "DELETE":
        raise HTTPException(status_code=400, detail="Confirmation text must be 'DELETE'")
    
    deletion_timestamp = datetime.utcnow()
    user_phone = user.get("phone_number", "unknown")
    user_name = user.get("full_name", "unknown")
    
    # 1. Log the deletion request for compliance records
    deletion_log = {
        "id": str(uuid.uuid4()),
        "original_user_id": data.user_id,
        "original_phone_hash": hash_password(user_phone),  # Hash for compliance, not reversible
        "deletion_reason": "user_requested",
        "deleted_at": deletion_timestamp,
        "data_retained": ["contributions", "claims"],
        "personal_data_deleted": ["full_name", "phone_number", "email", "password_hash", "profile_photo"]
    }
    await db.deletion_logs.insert_one(deletion_log)
    
    # 2. Get all memberships for this user
    memberships = await db.members.find({"user_id": data.user_id}).to_list(100)
    member_ids = [m["id"] for m in memberships]
    
    # 3. Update contribution records - replace with "Deleted Member" identifier
    # Keep the financial records but anonymize the member reference
    for member_id in member_ids:
        # Update the member record to show as deleted (keep for financial history)
        await db.members.update_one(
            {"id": member_id},
            {"$set": {
                "status": "deleted",
                "deleted_at": deletion_timestamp,
                "anonymized_name": "Deleted Member"
            }}
        )
    
    # 4. Update claims to anonymize member name (records kept for group accounting)
    await db.claims.update_many(
        {"member_id": {"$in": member_ids}},
        {"$set": {"anonymized": True}}
    )
    
    # 5. Update contributions to anonymize (records kept for group accounting)  
    await db.contributions.update_many(
        {"member_id": {"$in": member_ids}},
        {"$set": {"anonymized": True}}
    )
    
    # 6. Delete user's personal alerts
    await db.alerts.delete_many({"user_id": data.user_id})
    
    # 7. Delete trust score
    await db.trust_scores.delete_many({"user_id": data.user_id})
    
    # 8. Delete the user record (personal information)
    await db.users.delete_one({"id": data.user_id})
    
    logging.info(f"Account deletion completed for user {data.user_id} at {deletion_timestamp}")
    
    return {
        "message": "Account successfully deleted",
        "deleted_at": deletion_timestamp.isoformat(),
        "note": "Financial records have been retained with anonymized references for group accounting purposes"
    }


@api_router.get("/member/dashboard/{user_id}")
async def get_member_dashboard(user_id: str):
    # Get user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    contexts = await get_active_membership_contexts(user_id)
    memberships = [membership for membership, _group in contexts]
    
    total_saved = 0.0
    clubs = []
    overdue_count = 0
    upcoming_payments = 0
    days_until_next_claim = None
    
    for membership, group in contexts:
        
        # Get current month contribution
        now = datetime.utcnow()
        current_contribution = await db.contributions.find_one({
            "member_id": membership['id'],
            "group_id": membership['group_id'],
            "month": now.month,
            "year": now.year
        })
        
        # Calculate status
        if current_contribution:
            status = calculate_contribution_status(current_contribution, group['payment_due_date'])
            current_contribution['contribution_status'] = status
            
            # Update status in DB if changed
            if status != current_contribution.get('original_status'):
                await db.contributions.update_one(
                    {"id": current_contribution['id']},
                    {"$set": {"contribution_status": status}}
                )
        else:
            status = None
        
        if status == "late":
            overdue_count += 1
        elif status in ("pending", "due", "proof_uploaded"):
            upcoming_payments += 1
        
        # Get all confirmed contributions for this member
        confirmed_contributions = await db.contributions.find({
            "member_id": membership['id'],
            "contribution_status": "confirmed"
        }).to_list(1000)
        
        member_total = sum(c['amount_paid'] for c in confirmed_contributions)
        total_saved += member_total
        
        # Get member count
        member_count = await db.members.count_documents({"group_id": membership['group_id'], "status": "active"})
        
        clubs.append({
            "id": group['id'],
            "name": group['group_name'],
            "member_count": member_count,
            "monthly_contribution": group['monthly_contribution'],
            "role": membership.get('role_in_group', 'member'),
            "status": status,
            "status_label": {
                "confirmed": "Paid",
                "pending": "Pending",
                "due": "Due Today",
                "late": "Late",
                "proof_uploaded": "Pending Confirmation"
            }.get(status, "No contribution recorded")
        })
    
    # Get next claim
    next_claim = await db.claims.find_one(
        {"member_id": {"$in": [m['id'] for m in memberships]}, "claim_status": "upcoming"},
        sort=[("scheduled_claim_date", 1)]
    )
    
    if next_claim:
        days_until_next_claim = (next_claim['scheduled_claim_date'] - datetime.utcnow()).days

    claims_count = await db.claims.count_documents({
        "member_id": {"$in": [m['id'] for m in memberships]}
    })
    
    return {
        "user": {
            "id": user['id'],
            "full_name": user['full_name'],
            "first_name": user['full_name'].split()[0],
            "profile_photo": user.get('profile_photo')
        },
        "summary": {
            "total_saved": total_saved,
            "active_clubs": len(clubs),
            "upcoming_payments": upcoming_payments,
            "claims_count": claims_count,
            "days_until_next_claim": days_until_next_claim,
            "overdue_contributions": overdue_count
        },
        "clubs": clubs
    }

@api_router.get("/member/club/{group_id}/user/{user_id}")
async def get_member_club_details(group_id: str, user_id: str):
    # Get group
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get membership
    membership = await db.members.find_one({"user_id": user_id, "group_id": group_id})
    if not membership:
        raise HTTPException(status_code=404, detail="Not a member of this group")
    
    # Get current month contribution
    now = datetime.utcnow()
    current_contribution = await db.contributions.find_one({
        "member_id": membership['id'],
        "group_id": group_id,
        "month": now.month,
        "year": now.year
    })
    
    # If no contribution exists for current month, create one
    if not current_contribution:
        contribution = Contribution(
            member_id=membership['id'],
            group_id=group_id,
            month=now.month,
            year=now.year,
            amount_due=group['monthly_contribution'],
            contribution_status="pending"
        )
        await db.contributions.insert_one(contribution.dict())
        current_contribution = contribution.dict()
    
    # Calculate status
    status = calculate_contribution_status(current_contribution, group['payment_due_date'])
    
    # Get payment history (last 6 months)
    payment_history = await db.contributions.find({
        "member_id": membership['id'],
        "group_id": group_id
    }).sort("year", -1).sort("month", -1).limit(6).to_list(6)
    
    return {
        "group": {
            "id": group['id'],
            "name": group['group_name'],
            "type": group['group_type'],
            "monthly_contribution": group['monthly_contribution'],
            "payment_due_date": group['payment_due_date'],
            "bank_name": group['bank_name'],
            "bank_account_number": decrypt_sensitive_field(group['bank_account_number']),  # Decrypted for display
            "bank_account_holder": group['bank_account_holder']
        },
        "current_contribution": {
            "id": current_contribution['id'],
            "amount_due": current_contribution['amount_due'],
            "status": status,
            "due_date": f"{now.year}-{now.month:02d}-{min(group['payment_due_date'], 28):02d}",
            "proof_uploaded": current_contribution.get('proof_of_payment') is not None,
            "payment_date": current_contribution.get('payment_date')
        },
        "payment_reference": {
            "reference_code": membership['unique_reference_code'],
            "bank_name": group['bank_name'],
            "account_number": decrypt_sensitive_field(group['bank_account_number']),  # Decrypted for display
            "amount": group['monthly_contribution']
        },
        "payment_history": [
            {
                "month": p['month'],
                "year": p['year'],
                "amount": p['amount_paid'],
                "status": p['contribution_status'],
                "payment_date": p.get('payment_date')
            }
            for p in payment_history
        ]
    }

@api_router.post("/contributions/upload-proof")
async def upload_proof_of_payment(proof_data: ProofUpload):
    # DATA ACCESS CONTROL: Verify user can only upload proof for their own contribution
    contribution = await db.contributions.find_one({"id": proof_data.contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Get the member record to verify ownership
    member = await db.members.find_one({"id": contribution['member_id']})
    if not member:
        raise HTTPException(status_code=404, detail="Member record not found")
    
    # AUTHORIZATION CHECK: Only the member who owns this contribution can upload proof
    if member['user_id'] != proof_data.user_id:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: You can only upload proof for your own contributions"
        )
    
    # Update contribution with proof
    await db.contributions.update_one(
        {"id": proof_data.contribution_id},
        {"$set": {
            "proof_of_payment": proof_data.proof_image,
            "reference_number": proof_data.reference_number,
            "contribution_status": "proof_uploaded",
            "payment_date": datetime.utcnow()
        }}
    )
    
    # Get group info for alert
    group = await db.groups.find_one({"id": contribution['group_id']})
    user = await db.users.find_one({"id": member['user_id']})
    
    # Create alert for treasurer
    alert = Alert(
        user_id=group['treasurer_user_id'],
        group_id=group['id'],
        alert_type="payment_proof_uploaded",
        alert_message=f"{user['full_name']} has uploaded proof of payment for {group['group_name']} - {contribution['month']}/{contribution['year']}",
        action_url=f"/treasurer/contributions/{group['id']}"
    )
    await db.alerts.insert_one(alert.dict())
    
    return {
        "message": "Proof of payment uploaded successfully",
        "status": "proof_uploaded"
    }


@api_router.get("/contributions/{contribution_id}/proof")
async def get_contribution_proof(contribution_id: str, user_id: str):
    """Get proof of payment image for a contribution"""
    contribution = await db.contributions.find_one({"id": contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Get the member record
    member = await db.members.find_one({"id": contribution['member_id']})
    if not member:
        raise HTTPException(status_code=404, detail="Member record not found")
    
    # AUTHORIZATION CHECK: User must be either:
    # 1. The member who made this contribution
    # 2. An admin/treasurer of this group
    is_owner = member['user_id'] == user_id
    admin_membership = await db.members.find_one({
        "user_id": user_id, "group_id": contribution['group_id'], "status": "active",
        "role_in_group": {"$in": ["admin", "treasurer"]}
    })
    is_admin = bool(admin_membership)
    
    if not is_owner and not is_admin:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: You can only view proof for your own contributions or clubs you manage"
        )
    
    proof_image = contribution.get('proof_of_payment')
    if not proof_image:
        raise HTTPException(status_code=404, detail="No proof of payment uploaded for this contribution")
    
    return {
        "contribution_id": contribution_id,
        "proof_image": proof_image,
        "reference_number": contribution.get('reference_number'),
        "upload_date": contribution.get('payment_date'),
        "status": contribution.get('contribution_status')
    }


@api_router.post("/contributions/admin-upload-proof")
async def admin_upload_proof_of_payment(proof_data: ProofUpload):
    """Allow admin/treasurer to upload proof for any contribution in their managed groups"""
    contribution = await db.contributions.find_one({"id": proof_data.contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Get the group to verify admin access
    group = await db.groups.find_one({"id": contribution['group_id']})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await verify_user_is_group_treasurer(proof_data.user_id, contribution['group_id'])
    
    # Update contribution with proof
    await db.contributions.update_one(
        {"id": proof_data.contribution_id},
        {"$set": {
            "proof_of_payment": proof_data.proof_image,
            "reference_number": proof_data.reference_number,
            "contribution_status": "proof_uploaded",
            "payment_date": datetime.utcnow(),
            "uploaded_by_admin": proof_data.user_id
        }}
    )
    
    return {
        "message": "Proof of payment uploaded successfully by admin",
        "status": "proof_uploaded"
    }



# ==================== TREASURER ROUTES ====================

@api_router.get("/treasurer/dashboard/{user_id}")
async def get_treasurer_dashboard(user_id: str):
    # Get all groups where user is treasurer
    groups = await verify_treasurer_owns_groups(user_id)
    
    total_members = 0
    total_collected_this_month = 0.0
    late_members_count = 0
    late_members_list = []
    
    clubs_summary = []
    
    now = datetime.utcnow()
    
    for group in groups:
        # Get all members of this group
        members = await db.members.find({"group_id": group['id'], "status": "active"}).to_list(1000)
        group_member_count = len(members)
        total_members += group_member_count
        
        collected = 0.0
        expected = group_member_count * group['monthly_contribution']
        late_count = 0
        
        for member in members:
            # Get current month contribution
            contribution = await db.contributions.find_one({
                "member_id": member['id'],
                "group_id": group['id'],
                "month": now.month,
                "year": now.year
            })
            
            if contribution:
                status = calculate_contribution_status(contribution, group['payment_due_date'])
                
                if status == "confirmed":
                    collected += contribution['amount_paid']
                elif status == "late":
                    late_count += 1
                    late_members_count += 1
                    
                    # Get user info
                    user = await db.users.find_one({"id": member['user_id']})
                    
                    due_date = datetime(now.year, now.month, min(group['payment_due_date'], 28))
                    days_late = (now - due_date).days
                    
                    late_members_list.append({
                        "member_name": user['full_name'],
                        "group_name": group['group_name'],
                        "days_late": days_late,
                        "amount": group['monthly_contribution'],
                        "phone": user['phone_number']
                    })
        
        total_collected_this_month += collected
        
        clubs_summary.append({
            "id": group['id'],
            "name": group['group_name'],
            "member_count": group_member_count,
            "due_date": group['payment_due_date'],
            "collected": collected,
            "expected": expected,
            "status": "all_paid" if late_count == 0 and collected == expected else "pending",
            "late_count": late_count
        })
    
    # Get next upcoming claim
    managed_group_ids = [group['id'] for group in groups]
    next_claim = await db.claims.find_one(
        {"group_id": {"$in": managed_group_ids}, "claim_status": "upcoming"},
        sort=[("scheduled_claim_date", 1)]
    )
    
    next_claim_info = None
    if next_claim:
        claim_member = await db.members.find_one({"id": next_claim['member_id']})
        claim_user = await db.users.find_one({"id": claim_member['user_id']})
        claim_group = await db.groups.find_one({"id": next_claim['group_id']})
        
        next_claim_info = {
            "member_name": claim_user['full_name'],
            "group_name": claim_group['group_name'],
            "amount": next_claim['claim_amount'],
            "date": next_claim['scheduled_claim_date'].strftime("%Y-%m-%d")
        }
    
    return {
        "summary": {
            "total_clubs": len(groups),
            "total_members": total_members,
            "total_collected_this_month": total_collected_this_month,
            "late_members_count": late_members_count
        },
        "urgent_alerts": late_members_list,
        "clubs": clubs_summary,
        "next_claim": next_claim_info
    }

@api_router.get("/treasurer/contributions/{group_id}/month/{month}/year/{year}")
async def get_group_contributions(group_id: str, month: int, year: int, treasurer_id: str):
    # DATA ACCESS CONTROL: Verify treasurer owns this group
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await verify_user_is_group_treasurer(treasurer_id, group_id)
    
    # Get all members
    members = await db.members.find({"group_id": group_id, "status": "active"}).to_list(1000)
    
    contributions_list = []
    collected = 0.0
    outstanding = 0.0
    
    for member in members:
        # Get contribution for this month
        contribution = await db.contributions.find_one({
            "member_id": member['id'],
            "group_id": group_id,
            "month": month,
            "year": year
        })
        
        # Get user info
        user = await db.users.find_one({"id": member['user_id']})
        
        if contribution:
            status = calculate_contribution_status(contribution, group['payment_due_date'])
            
            if status == "confirmed":
                collected += contribution['amount_paid']
            else:
                outstanding += contribution['amount_due']
            
            contributions_list.append({
                "id": contribution['id'],
                "member_id": member['id'],
                "member_name": user['full_name'],
                "reference_code": member['unique_reference_code'],
                "amount_due": contribution['amount_due'],
                "amount_paid": contribution['amount_paid'],
                "status": status,
                "proof_uploaded": contribution.get('proof_of_payment') is not None,
                "proof_of_payment": contribution.get('proof_of_payment'),
                "payment_date": contribution.get('payment_date'),
                "reference_number": contribution.get('reference_number')
            })
        else:
            outstanding += group['monthly_contribution']
            contributions_list.append({
                "id": None,
                "member_id": member['id'],
                "member_name": user['full_name'],
                "reference_code": member['unique_reference_code'],
                "amount_due": group['monthly_contribution'],
                "amount_paid": 0.0,
                "status": "pending",
                "proof_uploaded": False,
                "proof_of_payment": None,
                "payment_date": None,
                "reference_number": None
            })
    
    # Sort: confirmed last, proof_uploaded first, then late, then pending
    status_order = {"late": 0, "proof_uploaded": 1, "due": 2, "pending": 3, "confirmed": 4}
    contributions_list.sort(key=lambda x: status_order.get(x['status'], 99))
    
    return {
        "group": {
            "id": group['id'],
            "name": group['group_name']
        },
        "month": month,
        "year": year,
        "summary": {
            "collected": collected,
            "outstanding": outstanding,
            "total_expected": collected + outstanding,
            "collection_rate": round((collected / (collected + outstanding) * 100) if (collected + outstanding) > 0 else 0, 1)
        },
        "contributions": contributions_list
    }

@api_router.get("/treasurer/club/{group_id}")
async def get_club_detail(group_id: str, treasurer_id: str):
    """Get detailed information about a specific club for the treasurer"""
    # DATA ACCESS CONTROL: Verify treasurer owns this group
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Club not found")
    
    await verify_user_is_group_treasurer(treasurer_id, group_id)
    
    # A group's member count and roster include active memberships only. Pending
    # invitations do not have member records and therefore never appear here.
    members = await db.members.find({
        "group_id": group_id,
        "status": "active"
    }).to_list(100)
    
    now = datetime.now()
    month = now.month
    year = now.year
    
    collected = 0.0
    expected = len(members) * group['monthly_contribution']
    
    members_list = []
    for member in members:
        user = await db.users.find_one({"id": member['user_id']})
        
        # Get contribution for this month
        contribution = await db.contributions.find_one({
            "member_id": member['id'],
            "group_id": group_id,
            "month": month,
            "year": year
        })
        
        status = "pending"
        amount_paid = 0.0
        has_proof = False
        
        if contribution:
            status = calculate_contribution_status(contribution, group['payment_due_date'])
            amount_paid = contribution.get('amount_paid', 0)
            has_proof = contribution.get('proof_of_payment') is not None
            if status == "confirmed":
                collected += amount_paid
        
        members_list.append({
            "id": member['id'],
            "name": user['full_name'],
            "phone": user['phone_number'],
            "reference": member['unique_reference_code'],
            "membership_status": member['status'],
            "role_in_group": member.get('role_in_group', 'member'),
            # Payment status is intentionally separate from membership status.
            # A new active admin may not have a contribution yet.
            "status": status,
            "amount_paid": amount_paid,
            "amount_due": group['monthly_contribution'],
            "has_proof": has_proof
        })
    
    return {
        "id": group['id'],
        "name": group['group_name'],
        "type": group.get('group_type', 'savings'),
        "monthly_contribution": group['monthly_contribution'],
        "due_date": group['payment_due_date'],
        "bank_name": group.get('bank_name', 'N/A'),
        "bank_account": decrypt_sensitive_field(group.get('bank_account_number', 'N/A')),  # Decrypted for display
        "member_count": len(members),
        "collected": collected,
        "expected": expected,
        "members": members_list
    }

@api_router.post("/treasurer/confirm-payment")
async def confirm_payment(confirm_data: ConfirmPayment):
    # DATA ACCESS CONTROL: Verify treasurer owns the group for this contribution
    contribution = await db.contributions.find_one({"id": confirm_data.contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Get the group to verify treasurer authorization
    group = await db.groups.find_one({"id": contribution['group_id']})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await verify_user_is_group_treasurer(confirm_data.treasurer_id, contribution['group_id'])
    
    # Update contribution
    await db.contributions.update_one(
        {"id": confirm_data.contribution_id},
        {"$set": {
            "contribution_status": "confirmed",
            "amount_paid": contribution['amount_due'],
            "confirmation_date": datetime.utcnow(),
            "confirmed_by_treasurer_id": confirm_data.treasurer_id,
            "notes": confirm_data.notes
        }}
    )
    
    # Get member and user info
    member = await db.members.find_one({"id": contribution['member_id']})
    user = await db.users.find_one({"id": member['user_id']})
    
    # Create alert for member
    alert = Alert(
        user_id=user['id'],
        group_id=group['id'],
        alert_type="payment_confirmed",
        alert_message=f"Your R{contribution['amount_due']:.2f} payment for {group['group_name']} has been confirmed by your treasurer.",
        action_url=f"/member/club/{group['id']}"
    )
    await db.alerts.insert_one(alert.dict())
    
    # Send WhatsApp notification to member
    notification_result = await send_payment_confirmation(
        phone=user['phone_number'],
        member_name=user['full_name'].split()[0],  # First name
        group_name=group['group_name'],
        amount=contribution['amount_due']
    )
    
    # Recalculate trust score (simplified)
    trust_score = await db.trust_scores.find_one({"user_id": user['id']})
    if trust_score:
        # Simple increment for on-time payment
        new_score = min(100, trust_score['overall_score'] + 2)
        await db.trust_scores.update_one(
            {"user_id": user['id']},
            {"$set": {
                "overall_score": new_score,
                "payment_consistency_score": min(100, trust_score['payment_consistency_score'] + 3),
                "last_calculated": datetime.utcnow()
            }}
        )
    
    return {
        "message": "Payment confirmed successfully",
        "member_notified": True,
        "notification_channel": notification_result.get('channel', 'whatsapp'),
        "notification_mock": notification_result.get('mock', True)
    }


class InviteMemberRequest(BaseModel):
    phone_number: str
    name: Optional[str] = None
    group_id: str
    group_name: str
    invited_by: str
    treasurer_name: str


@api_router.post("/treasurer/invite-member")
async def invite_member(request: InviteMemberRequest):
    """Invite a new member to join a club via SMS"""
    
    # DATA ACCESS CONTROL: Verify treasurer owns this group
    group = await db.groups.find_one({"id": request.group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await verify_user_is_group_treasurer(request.invited_by, request.group_id)
    
    invited_phone = format_phone_number(request.phone_number)

    # Check if user already exists, including accounts stored in legacy local format.
    existing_user = await db.users.find_one({"phone_number": {"$in": phone_variants(request.phone_number)}})
    if existing_user:
        # Check if already a member of this group
        existing_member = await db.members.find_one({
            "user_id": existing_user['id'],
            "group_id": request.group_id
        })
        if existing_member:
            raise HTTPException(status_code=400, detail="This person is already a member of this club")

    existing_invitation = await db.invitations.find_one({
        "phone_number": {"$in": phone_variants(request.phone_number)},
        "group_id": request.group_id,
        "status": "pending",
        "expires_at": {"$gt": datetime.utcnow()}
    })
    if existing_invitation:
        raise HTTPException(status_code=400, detail="This person already has a pending invitation")
    
    # Store the invitation
    invitation = {
        "id": f"inv_{uuid.uuid4().hex}",
        "phone_number": invited_phone,
        "name": request.name,
        "group_id": request.group_id,
        "group_name": request.group_name,
        "invited_by": request.invited_by,
        "treasurer_name": request.treasurer_name,
        "status": "pending",
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(days=7)
    }
    
    await db.invitations.insert_one(invitation)

    # Send SMS invitation
    invite_message = f"Hi{' ' + request.name if request.name else ''}! You've been invited by {request.treasurer_name} to join {request.group_name} on Clubvel. Sign in or register with this number ({request.phone_number}), then accept the invitation in My Clubvel. https://clubvel.co.za/download"
    
    # Use the notification service to send SMS
    try:
        from services.notification_service import send_sms_otp
        sms_result = await send_sms_otp(invited_phone, "0000")  # We're just using the SMS functionality
        print(f"[INVITE SMS] To: {invited_phone}")
        print(f"[INVITE SMS] Message: {invite_message}")
    except Exception as e:
        print(f"[INVITE SMS MOCK] To: {invited_phone}")
        print(f"[INVITE SMS MOCK] Message: {invite_message}")
    
    return {
        "message": "Invitation sent successfully",
        "invitation_id": invitation['id'],
        "phone_number": invited_phone,
        "group_name": request.group_name,
        "expires_at": invitation['expires_at'].isoformat()
    }


class AcceptInvitationRequest(BaseModel):
    invitation_id: str
    user_id: str


@api_router.get("/invitations/pending/{user_id}")
async def get_pending_invitations(user_id: str, authorization: Optional[str] = Header(None)):
    """Return active invitations addressed to this person's account phone."""
    if authenticated_user_id(authorization) != user_id:
        raise HTTPException(status_code=403, detail="You can only view your own invitations")
    user = await verify_user_exists(user_id)
    invitations = await db.invitations.find({
        "phone_number": {"$in": phone_variants(user['phone_number'])},
        "status": "pending",
        "expires_at": {"$gt": datetime.utcnow()}
    }).to_list(100)
    return {"invitations": [{
        "id": invitation['id'],
        "group_id": invitation['group_id'],
        "group_name": invitation['group_name'],
        "invited_by_name": invitation.get('treasurer_name'),
        "expires_at": invitation['expires_at'].isoformat()
    } for invitation in invitations]}


@api_router.post("/invitations/accept")
async def accept_invitation(request: AcceptInvitationRequest, authorization: Optional[str] = Header(None)):
    """Create contextual membership only after the addressed person accepts."""
    if authenticated_user_id(authorization) != request.user_id:
        raise HTTPException(status_code=403, detail="You can only accept your own invitations")
    user = await verify_user_exists(request.user_id)
    invitation = await db.invitations.find_one({
        "id": request.invitation_id,
        "phone_number": {"$in": phone_variants(user['phone_number'])},
        "status": "pending",
        "expires_at": {"$gt": datetime.utcnow()}
    })
    if not invitation:
        raise HTTPException(status_code=404, detail="Pending invitation not found or expired")

    existing_member = await db.members.find_one({
        "user_id": request.user_id,
        "group_id": invitation['group_id']
    })
    if existing_member:
        raise HTTPException(status_code=400, detail="You already belong to this group")

    group = await db.groups.find_one({"id": invitation['group_id'], "status": "active"})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    # Claim the invitation before creating membership so repeated taps cannot
    # create duplicate contextual memberships.
    claimed = await db.invitations.update_one(
        {"id": invitation['id'], "status": "pending"},
        {"$set": {"status": "accepting", "accepting_by": request.user_id}}
    )
    if claimed.modified_count != 1:
        raise HTTPException(status_code=409, detail="Invitation is already being accepted")

    member_count = await db.members.count_documents({"group_id": invitation['group_id']})
    member = Member(
        user_id=request.user_id,
        group_id=invitation['group_id'],
        unique_reference_code=generate_reference_code(
            group.get('payment_reference_prefix', 'CLB'), member_count + 1
        ),
        status="active",
        role_in_group="member",
        payout_position=member_count + 1
    )
    try:
        member_document = member.dict()
        # A deterministic Mongo key closes the race between two invitations for
        # the same person and group, while the lookup above handles legacy rows.
        member_document["_id"] = f"membership:{request.user_id}:{invitation['group_id']}"
        await db.members.insert_one(member_document)
        await db.users.update_one(
            {"id": request.user_id},
            {"$addToSet": {"stokvel_memberships": {
                "stokvel_id": invitation['group_id'],
                "role": "member",
                "status": "active"
            }}}
        )
        await db.invitations.update_one(
            {"id": invitation['id'], "status": "accepting",
             "accepting_by": request.user_id},
            {"$set": {"status": "accepted", "accepted_at": datetime.utcnow(),
                      "accepted_by": request.user_id},
             "$unset": {"accepting_by": ""}}
        )
    except Exception as error:
        await db.invitations.update_one(
            {"id": invitation['id'], "status": "accepting",
             "accepting_by": request.user_id},
            {"$set": {"status": "pending"}, "$unset": {"accepting_by": ""}}
        )
        if isinstance(error, DuplicateKeyError):
            raise HTTPException(status_code=400, detail="You already belong to this group")
        await db.members.delete_one({"id": member.id})
        await db.users.update_one(
            {"id": request.user_id},
            {"$pull": {"stokvel_memberships": {
                "stokvel_id": invitation['group_id'],
                "role": "member"
            }}}
        )
        raise
    return {"message": "Invitation accepted", "group_id": invitation['group_id']}


class SendReminderRequest(BaseModel):
    member_id: str
    group_id: str
    treasurer_id: str  # Requesting treasurer - for authorization


@api_router.post("/treasurer/send-reminder")
async def send_payment_reminder_endpoint(request: SendReminderRequest):
    """Send payment reminder to a member via WhatsApp"""
    # DATA ACCESS CONTROL: Verify treasurer owns this group
    group = await db.groups.find_one({"id": request.group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await verify_user_is_group_treasurer(request.treasurer_id, request.group_id)
    
    # Get member and user info
    member = await db.members.find_one({"id": request.member_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Verify member belongs to this group
    if member['group_id'] != request.group_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied: This member does not belong to your group"
        )
    
    user = await db.users.find_one({"id": member['user_id']})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # CHECK NOTIFICATION PREFERENCE - Respect user's opt-in choice
    has_opted_in = await check_user_notification_preference(user['id'], "payment_reminder")
    if not has_opted_in:
        return {
            "message": f"Notification not sent - {user['full_name']} has not opted in for contribution reminders",
            "opted_in": False,
            "channel": "none"
        }
    
    # Calculate due date
    now = datetime.utcnow()
    due_date = f"{now.year}-{now.month:02d}-{min(group['payment_due_date'], 28):02d}"
    
    # Send WhatsApp reminder
    notification_result = await send_payment_reminder(
        phone=user['phone_number'],
        member_name=user['full_name'].split()[0],
        group_name=group['group_name'],
        amount=group['monthly_contribution'],
        due_date=due_date
    )
    
    # Create alert record
    alert = Alert(
        user_id=user['id'],
        group_id=group['id'],
        alert_type="payment_reminder",
        alert_message=f"Reminder: Your {group['group_name']} payment of R{group['monthly_contribution']:.2f} is due on {due_date}",
        action_url=f"/member/club/{group['id']}"
    )
    await db.alerts.insert_one(alert.dict())
    
    return {
        "message": f"Payment reminder sent to {user['full_name']}",
        "channel": notification_result.get('channel', 'whatsapp'),
        "mock": notification_result.get('mock', True),
        "success": notification_result.get('success', False)
    }


@api_router.post("/treasurer/send-late-alert/{member_id}")
async def send_late_payment_alert_endpoint(member_id: str):
    """Send late payment alert to a member via WhatsApp"""
    # Get member and user info
    member = await db.members.find_one({"id": member_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    user = await db.users.find_one({"id": member['user_id']})
    group = await db.groups.find_one({"id": member['group_id']})
    
    if not user or not group:
        raise HTTPException(status_code=404, detail="User or group not found")
    
    # Calculate days late
    now = datetime.utcnow()
    due_date = datetime(now.year, now.month, min(group['payment_due_date'], 28))
    days_late = max(0, (now - due_date).days)
    
    # Send WhatsApp alert
    notification_result = await send_late_payment_alert(
        phone=user['phone_number'],
        member_name=user['full_name'].split()[0],
        group_name=group['group_name'],
        amount=group['monthly_contribution'],
        days_late=days_late
    )
    
    return {
        "message": f"Late payment alert sent to {user['full_name']}",
        "days_late": days_late,
        "channel": notification_result.get('channel', 'whatsapp'),
        "mock": notification_result.get('mock', True),
        "success": notification_result.get('success', False)
    }

# ==================== BANK FEED ROUTES ====================

@api_router.get("/bank-feed/status")
async def get_bank_feed_service_status():
    """Get current bank feed service configuration status"""
    return await get_bank_feed_status()


@api_router.get("/bank-feed/accounts")
async def get_linked_bank_accounts():
    """Get all linked bank accounts"""
    return await bank_feed_service.get_linked_accounts()


@api_router.get("/bank-feed/accounts/{account_id}/balance")
async def get_account_balance_endpoint(account_id: str):
    """Get balance for a specific bank account"""
    result = await bank_feed_service.get_account_balance(account_id)
    if not result.get('success'):
        raise HTTPException(status_code=404, detail=result.get('error', 'Account not found'))
    return result


@api_router.get("/bank-feed/accounts/{account_id}/transactions")
async def get_account_transactions(account_id: str, days_back: int = 30):
    """Get transactions for a specific bank account"""
    return await bank_feed_service.get_transactions(account_id, days_back=days_back)


@api_router.post("/bank-feed/sync")
async def sync_all_bank_transactions(days_back: int = 30):
    """Sync transactions from all linked bank accounts"""
    return await bank_feed_service.sync_all_transactions(days_back=days_back)


class AutoMatchRequest(BaseModel):
    contributions: List[dict]
    account_id: Optional[str] = None


@api_router.post("/bank-feed/auto-match")
async def auto_match_payments(request: AutoMatchRequest):
    """
    Automatically match bank transactions to contributions
    
    Request body:
    {
        "contributions": [
            {"member_name": "Thabo Mokoena", "amount": 500.0, "due_date": "2026-04-10"},
            {"member_name": "Sipho Dlamini", "amount": 500.0, "due_date": "2026-04-10"}
        ],
        "account_id": "acc_001"  // Optional - if not provided, matches against all accounts
    }
    """
    # Parse due dates
    for contribution in request.contributions:
        if isinstance(contribution.get('due_date'), str):
            contribution['due_date'] = datetime.fromisoformat(contribution['due_date'].replace('Z', ''))
        elif not contribution.get('due_date'):
            contribution['due_date'] = datetime.utcnow()
    
    return await bank_feed_service.auto_match_contributions(
        request.contributions,
        account_id=request.account_id
    )


@api_router.post("/bank-feed/match-transaction")
async def match_single_transaction(
    transaction_id: str,
    member_name: str,
    expected_amount: float,
    due_date: str
):
    """Match a specific transaction to a contribution"""
    due_dt = datetime.fromisoformat(due_date.replace('Z', ''))
    return await bank_feed_service.match_payment(
        transaction_id,
        member_name,
        expected_amount,
        due_dt
    )

# ==================== SEED DATA ROUTE ====================

@api_router.post("/seed/demo-data")
async def seed_demo_data():
    """DISABLED - Demo data seeding is no longer available."""
    raise HTTPException(
        status_code=403,
        detail="Demo data seeding is disabled in production."
    )
    
    # Block this endpoint in production
    production_mode = os.environ.get('PRODUCTION_MODE', 'false').lower() == 'true'
    if production_mode:
        raise HTTPException(
            status_code=403, 
            detail="This endpoint is disabled in production mode"
        )
    
    # Clear existing data
    await db.users.delete_many({})
    await db.groups.delete_many({})
    await db.members.delete_many({})
    await db.contributions.delete_many({})
    await db.claims.delete_many({})
    await db.alerts.delete_many({})
    await db.trust_scores.delete_many({})
    
    # Create demo users
    member1 = User(
        id="member1",
        full_name="Thabo Mokoena",
        phone_number="0821234567",
        password_hash=hash_password("Pass&Word76"),
        otp_verified=True
    )
    
    member2 = User(
        id="member2",
        full_name="Lerato Nkosi",
        phone_number="0827654321",
        password_hash=hash_password("Pass&Word76"),
        otp_verified=True
    )
    
    treasurer1 = User(
        id="treasurer1",
        full_name="Sipho Dlamini",
        phone_number="0829876543",
        password_hash=hash_password("Pass&Word76"),
        otp_verified=True
    )
    
    await db.users.insert_many([
        person_document(member1), person_document(member2), person_document(treasurer1)
    ])
    
    # Create trust scores
    trust1 = TrustScore(user_id="member1", overall_score=87)
    trust2 = TrustScore(user_id="member2", overall_score=72)
    trust3 = TrustScore(user_id="treasurer1", overall_score=95)
    await db.trust_scores.insert_many([trust1.dict(), trust2.dict(), trust3.dict()])
    
    # Create demo group (bank account numbers encrypted at rest)
    group1 = Group(
        id="group1",
        group_name="Phala tja Pele",
        group_type="savings",
        monthly_contribution=500.0,
        payment_due_date=5,
        bank_name="FNB",
        bank_account_number=encrypt_sensitive_field("62812345678"),  # Encrypted at rest
        bank_account_holder="Sipho Dlamini",
        payment_reference_prefix="SSH",
        start_date=datetime(2024, 1, 1),
        treasurer_user_id="treasurer1",
        description="Monthly savings group for the community"
    )
    
    group2 = Group(
        id="group2",
        group_name="Club89",
        group_type="burial society",
        monthly_contribution=300.0,
        payment_due_date=15,
        bank_name="Standard Bank",
        bank_account_number=encrypt_sensitive_field("123456789"),  # Encrypted at rest
        bank_account_holder="Sipho Dlamini",
        payment_reference_prefix="MBS",
        start_date=datetime(2023, 6, 1),
        treasurer_user_id="treasurer1"
    )
    
    await db.groups.insert_many([group1.dict(), group2.dict()])
    
    # Create memberships
    membership1 = Member(
        id="membership1",
        user_id="member1",
        group_id="group1",
        unique_reference_code="SSH001",
        payout_position=1
    )
    
    membership2 = Member(
        id="membership2",
        user_id="member1",
        group_id="group2",
        unique_reference_code="MBS001",
        payout_position=2
    )
    
    membership3 = Member(
        id="membership3",
        user_id="member2",
        group_id="group1",
        unique_reference_code="SSH002",
        payout_position=2
    )

    admin_membership1 = Member(
        id="admin-membership1",
        user_id="treasurer1",
        group_id="group1",
        unique_reference_code="SSH003",
        role_in_group="admin",
        payout_position=3
    )

    admin_membership2 = Member(
        id="admin-membership2",
        user_id="treasurer1",
        group_id="group2",
        unique_reference_code="MBS002",
        role_in_group="admin",
        payout_position=2
    )
    
    await db.members.insert_many([
        membership1.dict(), membership2.dict(), membership3.dict(),
        admin_membership1.dict(), admin_membership2.dict()
    ])
    
    # Create some contributions
    now = datetime.utcnow()
    
    # Current month - Thabo paid group1, pending group2
    contrib1 = Contribution(
        id="contrib1",
        member_id="membership1",
        group_id="group1",
        month=now.month,
        year=now.year,
        amount_due=500.0,
        amount_paid=500.0,
        payment_date=datetime(now.year, now.month, 3),
        reference_number="SSH001",
        contribution_status="confirmed",
        confirmed_by_treasurer_id="treasurer1"
    )
    
    contrib2 = Contribution(
        id="contrib2",
        member_id="membership2",
        group_id="group2",
        month=now.month,
        year=now.year,
        amount_due=300.0,
        contribution_status="pending"
    )
    
    # Lerato - late on group1
    contrib3 = Contribution(
        id="contrib3",
        member_id="membership3",
        group_id="group1",
        month=now.month,
        year=now.year,
        amount_due=500.0,
        contribution_status="late"
    )
    
    await db.contributions.insert_many([contrib1.dict(), contrib2.dict(), contrib3.dict()])
    
    # Create some claims
    claim1 = Claim(
        id="claim1",
        member_id="membership1",
        group_id="group1",
        claim_amount=5000.0,
        scheduled_claim_date=datetime(now.year, now.month + 1, 20),
        claim_status="upcoming"
    )
    
    await db.claims.insert_one(claim1.dict())
    
    # Create some alerts
    alert1 = Alert(
        user_id="member1",
        group_id="group2",
        alert_type="payment_due",
        alert_message="Your Club89 payment of R300 is due in 3 days."
    )
    
    await db.alerts.insert_one(alert1.dict())
    
    return {
        "message": "Demo data seeded successfully",
        "demo_accounts": [
            {"phone": "0821234567", "password": "Pass&Word76", "name": "Thabo Mokoena"},
            {"phone": "0827654321", "password": "Pass&Word76", "name": "Lerato Nkosi"},
            {"phone": "0829876543", "password": "Pass&Word76", "name": "Sipho Dlamini"}
        ]
    }

# ==================== INCLUDE ROUTER ====================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== PUBLIC PAGES (HTML) ====================

@app.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_policy():
    """Public privacy policy page for Google Play Store compliance"""
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - Clubvel</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1 { color: #0E2318; }
            h2 { color: #1A4D2E; margin-top: 30px; }
            .updated { color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <h1>Clubvel Privacy Policy</h1>
        <p class="updated">Last updated: April 2025</p>
        
        <h2>1. Introduction</h2>
        <p>Clubvel ("we", "our", or "us") is committed to protecting your personal information in compliance with the Protection of Personal Information Act (POPIA) of South Africa. This policy explains how we collect, use, and protect your data.</p>
        
        <h2>2. Information We Collect</h2>
        <p>We collect the following information to provide our stokvel management services:</p>
        <ul>
            <li><strong>Account Information:</strong> Full name, phone number, email address</li>
            <li><strong>Financial Information:</strong> Bank account details (encrypted), payment records, contribution history</li>
            <li><strong>Device Information:</strong> Camera access (for uploading payment proofs)</li>
            <li><strong>Usage Data:</strong> App interaction data to improve our services</li>
        </ul>
        
        <h2>3. How We Use Your Information</h2>
        <ul>
            <li>To manage your stokvel group memberships and contributions</li>
            <li>To process and verify payments</li>
            <li>To send notifications about payment reminders and group activities</li>
            <li>To generate financial reports for your stokvel groups</li>
        </ul>
        
        <h2>4. Data Security</h2>
        <p>We implement industry-standard security measures including:</p>
        <ul>
            <li>Encryption of sensitive data (bank account numbers)</li>
            <li>Secure HTTPS connections</li>
            <li>Password hashing using bcrypt</li>
            <li>Session timeouts for inactive users</li>
        </ul>
        
        <h2>5. Data Sharing</h2>
        <p>We do not sell your personal information. We only share data with:</p>
        <ul>
            <li>Your stokvel group treasurer (contribution and payment data)</li>
            <li>Service providers necessary to operate the app (hosting, notifications)</li>
            <li>Legal authorities when required by South African law</li>
        </ul>
        
        <h2>6. Your Rights (POPIA)</h2>
        <p>Under POPIA, you have the right to:</p>
        <ul>
            <li>Access your personal information</li>
            <li>Correct inaccurate information</li>
            <li>Request deletion of your account and data</li>
            <li>Object to processing of your information</li>
        </ul>
        
        <h2>7. Data Retention</h2>
        <p>We retain your data for as long as your account is active. Financial records may be retained for up to 5 years for legal compliance. Upon account deletion, personal data is anonymized.</p>
        
        <h2>8. Contact Us</h2>
        <p>For privacy inquiries or to exercise your rights, contact us at:</p>
        <p>Email: privacy@clubvel.co.za</p>
        
        <h2>9. Changes to This Policy</h2>
        <p>We may update this policy periodically. Significant changes will be communicated through the app.</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/delete-account", response_class=HTMLResponse)
async def delete_account_info():
    """Public page explaining how to delete account - required by Google Play"""
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Delete Your Account - Clubvel</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
            h1 { color: #0E2318; }
            h2 { color: #1A4D2E; margin-top: 30px; }
            .steps { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .step { margin-bottom: 15px; }
            .step-number { background: #1A4D2E; color: white; padding: 5px 12px; border-radius: 50%; margin-right: 10px; }
            .warning { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>Delete Your Clubvel Account</h1>
        <p>We're sorry to see you go. This page explains how to delete your Clubvel account and what happens to your data.</p>
        
        <h2>How to Delete Your Account</h2>
        <div class="steps">
            <div class="step"><span class="step-number">1</span> Open the Clubvel app on your phone</div>
            <div class="step"><span class="step-number">2</span> Go to <strong>Settings</strong> (gear icon in the bottom menu)</div>
            <div class="step"><span class="step-number">3</span> Scroll down and tap <strong>"Delete My Account"</strong></div>
            <div class="step"><span class="step-number">4</span> Read the confirmation message</div>
            <div class="step"><span class="step-number">5</span> Type "DELETE" to confirm</div>
            <div class="step"><span class="step-number">6</span> Tap <strong>"Delete Account"</strong> button</div>
        </div>
        
        <div class="warning">
            <strong>⚠️ Important:</strong> Account deletion is permanent and cannot be undone.
        </div>
        
        <h2>What Gets Deleted</h2>
        <ul>
            <li>Your personal profile information (name, phone number, email)</li>
            <li>Your profile photo</li>
            <li>Your login credentials</li>
            <li>Your notification preferences</li>
        </ul>
        
        <h2>What Gets Retained</h2>
        <p>For legal and financial record-keeping purposes (POPIA compliance), we retain:</p>
        <ul>
            <li>Anonymized contribution records (your name is replaced with "Deleted User")</li>
            <li>Payment history (anonymized)</li>
            <li>Financial transaction records for up to 5 years</li>
        </ul>
        <p>This data cannot be used to identify you after deletion.</p>
        
        <h2>Processing Time</h2>
        <p>Account deletion is processed <strong>immediately</strong> upon confirmation.</p>
        
        <h2>Need Help?</h2>
        <p>If you're unable to delete your account through the app, contact us:</p>
        <p>Email: support@clubvel.co.za</p>
        
        <h2>Alternative: Contact Support</h2>
        <p>You can also request account deletion by emailing us at <strong>support@clubvel.co.za</strong> with the subject line "Account Deletion Request" and your registered phone number.</p>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/get-app", response_class=HTMLResponse)
async def get_app_page():
    """Landing page for app download - detects device and shows appropriate option"""
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Get Clubvel - Stokvel Management App</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                color: #ffffff;
            }
            
            .container {
                max-width: 420px;
                width: 100%;
                text-align: center;
            }
            
            .app-icon {
                width: 120px;
                height: 120px;
                background: linear-gradient(135deg, #D4A528 0%, #B8941F 100%);
                border-radius: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
                box-shadow: 0 8px 32px rgba(212, 165, 40, 0.3);
            }
            
            .app-icon span {
                font-size: 48px;
                font-weight: 700;
                color: white;
                letter-spacing: -2px;
            }
            
            h1 {
                font-size: 32px;
                font-weight: 700;
                margin-bottom: 8px;
                background: linear-gradient(135deg, #D4A528 0%, #F5D77A 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }
            
            .tagline {
                font-size: 16px;
                color: #a0aec0;
                margin-bottom: 32px;
            }
            
            .features {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 16px;
                padding: 24px;
                margin-bottom: 32px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .feature {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
                text-align: left;
            }
            
            .feature:last-child {
                margin-bottom: 0;
            }
            
            .feature-icon {
                width: 40px;
                height: 40px;
                background: rgba(212, 165, 40, 0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                flex-shrink: 0;
            }
            
            .feature-text {
                font-size: 14px;
                color: #e2e8f0;
            }
            
            .download-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                width: 100%;
                padding: 18px 32px;
                font-size: 18px;
                font-weight: 600;
                color: #1a1a2e;
                background: linear-gradient(135deg, #D4A528 0%, #F5D77A 100%);
                border: none;
                border-radius: 14px;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.3s ease;
                box-shadow: 0 4px 20px rgba(212, 165, 40, 0.4);
            }
            
            .download-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 28px rgba(212, 165, 40, 0.5);
            }
            
            .download-btn:active {
                transform: translateY(0);
            }
            
            .download-btn svg {
                width: 24px;
                height: 24px;
            }
            
            .platform-note {
                margin-top: 16px;
                font-size: 13px;
                color: #718096;
            }
            
            /* Modal Styles */
            .modal-overlay {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                z-index: 1000;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .modal-overlay.active {
                display: flex;
            }
            
            .modal {
                background: #1e2a3a;
                border-radius: 20px;
                max-width: 380px;
                width: 100%;
                padding: 32px 24px;
                position: relative;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            .modal-close {
                position: absolute;
                top: 16px;
                right: 16px;
                width: 32px;
                height: 32px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 50%;
                color: #a0aec0;
                font-size: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .modal-close:hover {
                background: rgba(255, 255, 255, 0.2);
                color: #fff;
            }
            
            .modal h2 {
                font-size: 22px;
                margin-bottom: 8px;
                color: #fff;
            }
            
            .modal-subtitle {
                color: #a0aec0;
                font-size: 14px;
                margin-bottom: 24px;
            }
            
            .step {
                display: flex;
                gap: 16px;
                margin-bottom: 20px;
                text-align: left;
            }
            
            .step-number {
                width: 32px;
                height: 32px;
                background: linear-gradient(135deg, #D4A528 0%, #B8941F 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 14px;
                color: #1a1a2e;
                flex-shrink: 0;
            }
            
            .step-content h3 {
                font-size: 15px;
                font-weight: 600;
                color: #fff;
                margin-bottom: 4px;
            }
            
            .step-content p {
                font-size: 13px;
                color: #a0aec0;
                line-height: 1.5;
            }
            
            .step-icon {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                background: rgba(255, 255, 255, 0.1);
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
            }
            
            .modal-footer {
                margin-top: 24px;
                padding-top: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                text-align: center;
            }
            
            .modal-footer p {
                font-size: 13px;
                color: #718096;
            }
            
            /* Hide elements based on platform */
            .android-only, .ios-only {
                display: none;
            }
            
            body.is-android .android-only {
                display: block;
            }
            
            body.is-ios .ios-only {
                display: block;
            }
            
            body.is-android .download-btn.android-only,
            body.is-ios .download-btn.ios-only {
                display: inline-flex;
            }
            
            /* Desktop fallback */
            .desktop-message {
                display: none;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                padding: 20px;
                margin-top: 24px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            
            body.is-desktop .desktop-message {
                display: block;
            }
            
            body.is-desktop .download-btn {
                display: none;
            }
            
            .qr-placeholder {
                width: 150px;
                height: 150px;
                background: #fff;
                border-radius: 12px;
                margin: 16px auto;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #1a1a2e;
                font-size: 12px;
                padding: 10px;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- App Icon -->
            <div class="app-icon">
                <span>CV</span>
            </div>
            
            <h1>Clubvel</h1>
            <p class="tagline">Manage your Stokvel with ease</p>
            
            <!-- Features -->
            <div class="features">
                <div class="feature">
                    <div class="feature-icon">💰</div>
                    <div class="feature-text">Track contributions and payments in real-time</div>
                </div>
                <div class="feature">
                    <div class="feature-icon">📱</div>
                    <div class="feature-text">Upload proof of payment instantly</div>
                </div>
                <div class="feature">
                    <div class="feature-icon">🔔</div>
                    <div class="feature-text">Get reminders for upcoming payments</div>
                </div>
                <div class="feature">
                    <div class="feature-icon">🔒</div>
                    <div class="feature-text">POPIA compliant & secure</div>
                </div>
            </div>
            
            <!-- Android Download Button -->
            <a href="https://github.com/Clubvel/Clubvel/releases/download/v1.0.0/application-30489d82-7342-497c-baff-d5e9ff52d6c3.1.apk" 
               class="download-btn android-only" 
               download="clubvel.apk">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.523 2.727l1.485-1.486a.707.707 0 10-1-1L16.4 1.848a6.869 6.869 0 00-8.8 0L6 .241a.707.707 0 10-1 1L6.48 2.727A6.869 6.869 0 004 8.182V9h16v-.818a6.869 6.869 0 00-2.477-5.455zM7 6a1 1 0 111-1 1 1 0 01-1 1zm10 0a1 1 0 111-1 1 1 0 01-1 1zM4 10v9a2 2 0 002 2h12a2 2 0 002-2v-9zm7 7H6v-5h5zm7 0h-5v-5h5z"/>
                </svg>
                Download for Android
            </a>
            
            <!-- iOS Install Button -->
            <button class="download-btn ios-only" onclick="openIOSModal()">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Install on iPhone
            </button>
            
            <p class="platform-note android-only">After download, tap the file to install</p>
            <p class="platform-note ios-only">Add Clubvel to your home screen</p>
            
            <!-- Desktop Message -->
            <div class="desktop-message">
                <p style="color: #e2e8f0; margin-bottom: 12px;">📱 Open this page on your phone to download</p>
                <p style="font-size: 12px; color: #718096;">Scan this page's URL or visit:</p>
                <p style="font-size: 14px; color: #D4A528; margin-top: 8px; word-break: break-all;">clubvel-production.up.railway.app/get-app</p>
            </div>
        </div>
        
        <!-- iOS Instructions Modal -->
        <div class="modal-overlay" id="iosModal">
            <div class="modal">
                <button class="modal-close" onclick="closeIOSModal()">×</button>
                
                <h2>Add to Home Screen</h2>
                <p class="modal-subtitle">Follow these steps to install Clubvel on your iPhone</p>
                
                <div class="step">
                    <div class="step-number">1</div>
                    <div class="step-content">
                        <h3>Tap the Share button</h3>
                        <p>Look for the <span class="step-icon">⬆️ Share</span> icon at the bottom of Safari</p>
                    </div>
                </div>
                
                <div class="step">
                    <div class="step-number">2</div>
                    <div class="step-content">
                        <h3>Scroll down and tap</h3>
                        <p>Find and tap <span class="step-icon">➕ Add to Home Screen</span></p>
                    </div>
                </div>
                
                <div class="step">
                    <div class="step-number">3</div>
                    <div class="step-content">
                        <h3>Tap "Add"</h3>
                        <p>Confirm by tapping <span class="step-icon">Add</span> in the top right corner</p>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <p>Clubvel will appear on your home screen like a regular app!</p>
                </div>
            </div>
        </div>
        
        <script>
            // Detect platform
            function detectPlatform() {
                const userAgent = navigator.userAgent || navigator.vendor || window.opera;
                
                // iOS detection
                if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                    document.body.classList.add('is-ios');
                    return 'ios';
                }
                
                // Android detection
                if (/android/i.test(userAgent)) {
                    document.body.classList.add('is-android');
                    return 'android';
                }
                
                // Desktop fallback
                document.body.classList.add('is-desktop');
                return 'desktop';
            }
            
            // Modal functions
            function openIOSModal() {
                document.getElementById('iosModal').classList.add('active');
            }
            
            function closeIOSModal() {
                document.getElementById('iosModal').classList.remove('active');
            }
            
            // Close modal on overlay click
            document.getElementById('iosModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeIOSModal();
                }
            });
            
            // Close modal on Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeIOSModal();
                }
            });
            
            // Initialize
            detectPlatform();
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/", response_class=HTMLResponse)
async def clubvel_website():
    """Serve the current Clubvel landing page from the canonical website file."""
    website_path = ROOT_DIR.parent / "clubvel-website" / "index.html"
    if not website_path.exists():
        raise HTTPException(status_code=503, detail="Clubvel website is unavailable")
    return HTMLResponse(content=website_path.read_text(encoding="utf-8"))

# Catch-all route to prevent 404 errors - redirects to main website
@app.get("/{path:path}", response_class=HTMLResponse)
async def catch_all(path: str, request: Request):
    """Catch-all route for any unmatched paths - serves the main website"""
    # Skip API routes - they should return proper 404
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    # For all other paths, redirect to main website
    return await clubvel_website()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
