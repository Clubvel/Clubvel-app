from fastapi import FastAPI, APIRouter, HTTPException, status as http_status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT settings
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'clubvel-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 43200  # 30 days

# Create the main app
app = FastAPI(title="Clubvel API")
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
    role: str  # member or treasurer
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

class ProofUpload(BaseModel):
    contribution_id: str
    proof_image: str  # base64
    reference_number: str

class ConfirmPayment(BaseModel):
    contribution_id: str
    notes: Optional[str] = None

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

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
async def register(user_data: UserCreate):
    # Check if phone number already exists
    existing_user = await db.users.find_one({"phone_number": user_data.phone_number})
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Create user (unverified)
    user = User(
        full_name=user_data.full_name,
        phone_number=user_data.phone_number,
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        role=user_data.role,
        otp_verified=False
    )
    
    await db.users.insert_one(user.dict())
    
    # Create initial trust score
    trust_score = TrustScore(user_id=user.id)
    await db.trust_scores.insert_one(trust_score.dict())
    
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
async def send_otp_endpoint(request: SendOTPRequest):
    """Send or resend OTP to phone number"""
    # Check if user exists
    user = await db.users.find_one({"phone_number": request.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Please register first.")
    
    if user.get('otp_verified'):
        raise HTTPException(status_code=400, detail="Phone already verified. Please login.")
    
    # Send OTP
    otp_result = await send_otp(request.phone_number, preferred_channel=request.channel)
    
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
async def login(login_data: UserLogin):
    # Find user
    user = await db.users.find_one({"phone_number": login_data.phone_number})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    # Verify password
    if not verify_password(login_data.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    
    # Create access token
    access_token = create_access_token(
        data={"user_id": user['id'], "role": user['role'], "phone": user['phone_number']}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user['id'],
            "full_name": user['full_name'],
            "phone_number": user['phone_number'],
            "role": user['role'],
            "profile_photo": user.get('profile_photo')
        }
    }

# ==================== MEMBER ROUTES ====================

@api_router.get("/member/dashboard/{user_id}")
async def get_member_dashboard(user_id: str):
    # Get user
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all groups this user is a member of
    memberships = await db.members.find({"user_id": user_id, "status": "active"}).to_list(100)
    
    total_saved = 0.0
    clubs = []
    overdue_count = 0
    days_until_next_claim = None
    
    for membership in memberships:
        # Get group details
        group = await db.groups.find_one({"id": membership['group_id']})
        if not group:
            continue
        
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
            status = "pending"
        
        if status == "late":
            overdue_count += 1
        
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
            "status": status,
            "status_label": {
                "confirmed": "Paid",
                "pending": "Upcoming",
                "due": "Due Today",
                "late": "Late",
                "proof_uploaded": "Pending Confirmation"
            }.get(status, "Pending")
        })
    
    # Get next claim
    next_claim = await db.claims.find_one(
        {"member_id": {"$in": [m['id'] for m in memberships]}, "claim_status": "upcoming"},
        sort=[("scheduled_claim_date", 1)]
    )
    
    if next_claim:
        days_until_next_claim = (next_claim['scheduled_claim_date'] - datetime.utcnow()).days
    
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
            "bank_account_number": group['bank_account_number'],
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
            "account_number": group['bank_account_number'],
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
    # Get contribution
    contribution = await db.contributions.find_one({"id": proof_data.contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
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
    
    # Get member and group info
    member = await db.members.find_one({"id": contribution['member_id']})
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

# ==================== TREASURER ROUTES ====================

@api_router.get("/treasurer/dashboard/{user_id}")
async def get_treasurer_dashboard(user_id: str):
    # Get all groups where user is treasurer
    groups = await db.groups.find({"treasurer_user_id": user_id, "status": "active"}).to_list(100)
    
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
    next_claim = await db.claims.find_one(
        {"claim_status": "upcoming"},
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
async def get_group_contributions(group_id: str, month: int, year: int):
    # Get group
    group = await db.groups.find_one({"id": group_id})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
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

@api_router.post("/treasurer/confirm-payment")
async def confirm_payment(confirm_data: ConfirmPayment):
    # Get contribution
    contribution = await db.contributions.find_one({"id": confirm_data.contribution_id})
    if not contribution:
        raise HTTPException(status_code=404, detail="Contribution not found")
    
    # Update contribution
    await db.contributions.update_one(
        {"id": confirm_data.contribution_id},
        {"$set": {
            "contribution_status": "confirmed",
            "amount_paid": contribution['amount_due'],
            "confirmation_date": datetime.utcnow(),
            "notes": confirm_data.notes
        }}
    )
    
    # Get member and user info
    member = await db.members.find_one({"id": contribution['member_id']})
    user = await db.users.find_one({"id": member['user_id']})
    group = await db.groups.find_one({"id": contribution['group_id']})
    
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


class SendReminderRequest(BaseModel):
    member_id: str
    group_id: str


@api_router.post("/treasurer/send-reminder")
async def send_payment_reminder_endpoint(request: SendReminderRequest):
    """Send payment reminder to a member via WhatsApp"""
    # Get member and user info
    member = await db.members.find_one({"id": request.member_id})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    user = await db.users.find_one({"id": member['user_id']})
    group = await db.groups.find_one({"id": request.group_id})
    
    if not user or not group:
        raise HTTPException(status_code=404, detail="User or group not found")
    
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
    """Seed the database with demo data for testing"""
    
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
        password_hash=hash_password("password123"),
        role="member",
        otp_verified=True
    )
    
    member2 = User(
        id="member2",
        full_name="Lerato Nkosi",
        phone_number="0827654321",
        password_hash=hash_password("password123"),
        role="member",
        otp_verified=True
    )
    
    treasurer1 = User(
        id="treasurer1",
        full_name="Sipho Dlamini",
        phone_number="0829876543",
        password_hash=hash_password("password123"),
        role="treasurer",
        otp_verified=True
    )
    
    await db.users.insert_many([member1.dict(), member2.dict(), treasurer1.dict()])
    
    # Create trust scores
    trust1 = TrustScore(user_id="member1", overall_score=87)
    trust2 = TrustScore(user_id="member2", overall_score=72)
    trust3 = TrustScore(user_id="treasurer1", overall_score=95)
    await db.trust_scores.insert_many([trust1.dict(), trust2.dict(), trust3.dict()])
    
    # Create demo group
    group1 = Group(
        id="group1",
        group_name="Soshanguve Savings Club",
        group_type="savings",
        monthly_contribution=500.0,
        payment_due_date=5,
        bank_name="FNB",
        bank_account_number="62812345678",
        bank_account_holder="Sipho Dlamini",
        payment_reference_prefix="SSH",
        start_date=datetime(2024, 1, 1),
        treasurer_user_id="treasurer1",
        description="Monthly savings group for Soshanguve community"
    )
    
    group2 = Group(
        id="group2",
        group_name="Mamelodi Burial Society",
        group_type="burial society",
        monthly_contribution=300.0,
        payment_due_date=15,
        bank_name="Standard Bank",
        bank_account_number="123456789",
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
    
    await db.members.insert_many([membership1.dict(), membership2.dict(), membership3.dict()])
    
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
        alert_message="Your Mamelodi Burial Society payment of R300 is due in 3 days."
    )
    
    await db.alerts.insert_one(alert1.dict())
    
    return {
        "message": "Demo data seeded successfully",
        "demo_accounts": [
            {"phone": "0821234567", "password": "password123", "role": "member", "name": "Thabo Mokoena"},
            {"phone": "0827654321", "password": "password123", "role": "member", "name": "Lerato Nkosi"},
            {"phone": "0829876543", "password": "password123", "role": "treasurer", "name": "Sipho Dlamini"}
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
