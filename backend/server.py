from fastapi import FastAPI, APIRouter, HTTPException, status as http_status, Request
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

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

# Production / environment flags
PRODUCTION_MODE = os.environ.get('PRODUCTION_MODE', 'false').lower() == 'true'
NOTIFICATION_MODE = os.environ.get('NOTIFICATION_MODE', 'mock')

# Fail-fast checks for critical secrets in production
if PRODUCTION_MODE:
    if os.environ.get('JWT_SECRET_KEY') in (None, '', 'clubvel-secret-key-change-in-production'):
        raise RuntimeError("ERROR: JWT_SECRET_KEY is not set or is using the unsafe default. Set JWT_SECRET_KEY in environment.")
    if os.environ.get('FIELD_ENCRYPTION_KEY') in (None, '', 'clubvel-encryption-key-32bytes!'):
        raise RuntimeError("ERROR: FIELD_ENCRYPTION_KEY is not set or is using the unsafe default. Set FIELD_ENCRYPTION_KEY in environment.")
    if NOTIFICATION_MODE == 'mock':
        raise RuntimeError("ERROR: Production mode cannot run with NOTIFICATION_MODE=mock. Configure a real notification provider or set NOTIFICATION_MODE appropriately.")

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
    role: str = "member"  # member or treasurer

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

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str
    phone_number: str
    email: Optional[str] = None
    password_hash: str
    role: str  # member or treasurer (primary role)
    roles: List[str] = ["member"]  # All roles: ["member"], ["treasurer"], or ["member", "treasurer"]
    profile_photo: Optional[str] = None  # base64
    date_joined: datetime = Field(default_factory=datetime.utcnow)
    status: str = "active"  # active or inactive
    otp_verified: bool = False

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

class TrustScore(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    overall_score: int = 50  # out of 100
    payment_consistency_score: int = 50
    months_active_score: int = 50
    groups_joined_score: int = 50
    disputes_score: int = 50
    last_calculated: datetime = Field(default_factory=datetime.utcnow)


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


async def verify_user_is_group_member(user_id: str, group_id: str) -> dict:
    """Verify user is an active member of the specified group"""
    membership = await db.members.find_one({
        "user_id": user_id, 
        "group_id": group_id,
        "status": "active"
    })
    if not membership:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: You are not a member of this group"
        )
    return membership


async def verify_user_is_group_treasurer(user_id: str, group_id: str) -> dict:
    """Verify user is the treasurer of the specified group"""
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group.get('treasurer_user_id') != user_id:
        raise HTTPException(
            status_code=403, 
            detail="Access denied: You are not the treasurer of this group"
        )
    return group


async def verify_treasurer_owns_groups(user_id: str) -> list:
    """Get all groups where user is treasurer"""
    groups = await db.groups.find({
        "treasurer_user_id": user_id, 
        "status": "active"
    }).to_list(100)
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
    
    # Check if user is treasurer of the group
    group = await db.groups.find_one({"id": contribution['group_id']})
    if group and group.get('treasurer_user_id') == user_id:
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
    
    # Check if user is treasurer of the group
    group = await db.groups.find_one({"id": member['group_id']})
    if group and group.get('treasurer_user_id') == user_id:
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

# Simple auth dependency for routes
oauth2_scheme = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme)):
    """
    FastAPI dependency to get the currently authenticated user.
    Use it in routes as: current_user: dict = Depends(get_current_user)
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = credentials.credentials
    payload = verify_token(token)

    user = await db.users.find_one({"id": payload.get("user_id")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


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
        # Phone exists - check if they're trying to add a different role
        existing_roles = existing_user.get('roles', [existing_user.get('role', 'member')])
        requested_role = 'treasurer' if user_data.role == 'treasurer' else 'member'
        
        if requested_role in existing_roles:
            # Already has this role - return success instead of error
            return {
                "message": f"This phone number is already registered with {requested_role} role. Please login.",
                "user_id": existing_user['id'],
                "roles": existing_roles,
                "already_registered": True
            }
        else:
            # Add the new role to existing user
            new_roles = list(set(existing_roles + [requested_role]))
            await db.users.update_one(
                {"phone_number": user_data.phone_number},
                {"$set": {"roles": new_roles}}
            )
            
            return {
                "message": f"Role '{requested_role}' added to your account. Please login.",
                "user_id": existing_user['id'],
                "roles": new_roles,
                "already_registered": True
            }
    
    # Create new user
    initial_role = 'treasurer' if user_data.role == 'treasurer' else 'member'
    user = User(
        full_name=user_data.full_name,
        phone_number=user_data.phone_number,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        role=initial_role,
        roles=[initial_role],
        otp_verified=False
    )
    
    await db.users.insert_one(user.dict())
    
    # Create initial trust score
    trust_score = TrustScore(user_id=user.id)
    await db.trust_scores.insert_one(trust_score.dict())
    
    # Check for pending invitations and auto-add to clubs
    pending_invitations = await db.invitations.find({
        "phone_number": user_data.phone_number,
        "status": "pending",
        "expires_at": {"$gt": datetime.utcnow()}
    }).to_list(10)
    
    groups_joined = []
    for invitation in pending_invitations:
        # Create member record
        member = Member(
            user_id=user.id,
            group_id=invitation['group_id'],
            membership_status="active"
        )
        await db.members.insert_one(member.dict())
        
        # Update invitation status
        await db.invitations.update_one(
            {"id": invitation['id']},
            {"$set": {"status": "accepted", "accepted_at": datetime.utcnow()}}
        )
        
        groups_joined.append(invitation['group_name'])
    
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
    
    # Include groups joined via invitation
    if groups_joined:
        response["groups_joined"] = groups_joined
        response["invitation_note"] = f"You've been automatically added to: {', '.join(groups_joined)}"
    
    # Include mock OTP in response only if running in mock mode and NOT production
    if notif_status['mode'] == 'mock' and not PRODUCTION_MODE:
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
    
    if notif_status['mode'] == 'mock' and not PRODUCTION_MODE:
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
    
    # Get user's roles - check both old 'role' field and new 'roles' array
    user_roles = user.get('roles', [user.get('role', 'member')])
    primary_role = user.get('role', user_roles[0] if user_roles else 'member')
    
    # Check if user has both member and admin roles based on their group memberships
    memberships = await db.members.find({"user_id": user['id'], "status": "active"}).to_list(100)
    has_admin_membership = any(m.get('role_in_group') == 'admin' or m.get('role_in_group') == 'treasurer' for m in memberships)
    # Admins are also members - they can view as member too
    has_member_membership = len(memberships) > 0  # Any membership counts as being a member
    
    # Also check if user is admin of any groups
    admin_groups = await db.groups.find({
        "$or": [
            {"treasurer_user_id": user['id']},
            {"admin_user_ids": user['id']}
        ],
        "status": "active"
    }).to_list(100)
    
    if admin_groups:
        has_admin_membership = True
        has_member_membership = True  # Admins can also act as members
    
    # Update roles based on actual memberships
    actual_roles = []
    if has_member_membership:
        actual_roles.append('member')
    if has_admin_membership or 'treasurer' in user_roles or primary_role == 'treasurer':
        actual_roles.append('treasurer')
    
    if not actual_roles:
        actual_roles = [primary_role]
    
    # Create access token
    access_token = create_access_token(
        data={"user_id": user['id'], "role": primary_role, "roles": actual_roles, "phone": user['phone_number']}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user['id'],
            "full_name": user['full_name'],
            "phone_number": user['phone_number'],
            "role": primary_role,
            "roles": actual_roles,
            "has_multiple_roles": len(actual_roles) > 1,
            "profile_photo": user.get('profile_photo')
        }
    }

# ... rest of the original file remains unchanged until CORS middleware insertion point ...
