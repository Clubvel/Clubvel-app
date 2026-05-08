# Code to Add to Your GitHub backend/server.py

## STEP 1: Add these MODELS (Pydantic classes)

Find this section in your server.py (after other class definitions, around line 200-400):
Add these classes:

```python
class ForgotPasswordRequest(BaseModel):
    phone_number: str

class VerifyResetOTPRequest(BaseModel):
    phone_number: str
    otp: str

class ResetPasswordRequest(BaseModel):
    phone_number: str
    otp: str
    new_password: str

class CreateGroupRequest(BaseModel):
    group_name: str
    group_type: str = "savings"
    monthly_contribution: float
    payment_due_date: int = 25
    bank_name: str
    bank_account_number: str
    bank_account_holder: str
    admin_user_id: str
    payment_reference_prefix: str = "CLB"
    start_date: Optional[str] = None
    description: Optional[str] = None
```

---

## STEP 2: Add FORGOT PASSWORD endpoints

Add these endpoints (after the login/register endpoints):

```python
@api_router.post("/auth/forgot-password")
async def forgot_password(request: Request, data: ForgotPasswordRequest):
    """Send password reset OTP to user's phone"""
    user = await db.users.find_one({"phone_number": data.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this phone number")
    
    # For demo mode, just return mock OTP
    return {
        "message": "Reset code sent via WhatsApp",
        "channel": "whatsapp",
        "mock_otp": "1234",
        "note": "Demo mode - use OTP 1234"
    }

@api_router.post("/auth/verify-reset-otp")
async def verify_reset_otp(data: VerifyResetOTPRequest):
    """Verify reset OTP before allowing password change"""
    user = await db.users.find_one({"phone_number": data.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # For demo mode, accept 1234
    if data.otp != "1234":
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    return {"message": "OTP verified successfully", "can_reset": True}

@api_router.post("/auth/reset-password")
async def reset_password(data: ResetPasswordRequest):
    """Reset user password after OTP verification"""
    user = await db.users.find_one({"phone_number": data.phone_number})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # For demo, accept 1234
    if data.otp != "1234":
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    
    # Update password
    import bcrypt
    new_hash = bcrypt.hashpw(data.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    await db.users.update_one(
        {"phone_number": data.phone_number},
        {"$set": {"password_hash": new_hash}}
    )
    
    return {"message": "Password reset successful"}
```

---

## STEP 3: Add CREATE GROUP endpoint

Add this endpoint (after other group endpoints):

```python
@api_router.post("/groups/create")
async def create_group(data: CreateGroupRequest):
    """Create a new club/group"""
    import uuid
    from datetime import datetime
    
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
        "bank_name": data.bank_name,
        "bank_account_number": data.bank_account_number,
        "bank_account_holder": data.bank_account_holder,
        "payment_reference_prefix": data.payment_reference_prefix,
        "start_date": start_date,
        "status": "active",
        "treasurer_user_id": data.admin_user_id,
        "admin_user_ids": [data.admin_user_id],
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
    
    return {
        "message": "Club created successfully",
        "group_id": group_id,
        "group_name": data.group_name
    }
```

---

## AFTER ADDING THE CODE:

1. Commit the changes on GitHub
2. Railway will auto-deploy
3. Wait 2-3 minutes
4. Test the app again - it should work!
