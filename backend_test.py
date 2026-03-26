#!/usr/bin/env python3
"""
Clubvel Backend API Testing Suite
Tests all backend endpoints with demo data
"""

import requests
import json
import base64
from datetime import datetime
import sys

# Backend URL from frontend .env
BASE_URL = "https://money-rotation.preview.emergentagent.com/api"

# Demo accounts from seeded data
DEMO_ACCOUNTS = {
    "member1": {"phone": "0821234567", "password": "password123", "user_id": "member1"},
    "member2": {"phone": "0827654321", "password": "password123", "user_id": "member2"},
    "treasurer1": {"phone": "0829876543", "password": "password123", "user_id": "treasurer1"}
}

# Test results tracking
test_results = []
auth_tokens = {}

def log_test(test_name, success, details="", response_data=None):
    """Log test results"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   {details}")
    if response_data and not success:
        print(f"   Response: {response_data}")
    
    test_results.append({
        "test": test_name,
        "success": success,
        "details": details,
        "response": response_data if not success else None
    })

def make_request(method, endpoint, data=None, headers=None, auth_token=None):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    
    if headers is None:
        headers = {"Content-Type": "application/json"}
    
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        return response
    except requests.exceptions.Timeout:
        print(f"   TIMEOUT: Request to {url} timed out")
        return None
    except requests.exceptions.ConnectionError as e:
        print(f"   CONNECTION ERROR: {e}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"   REQUEST ERROR: {e}")
        return None

def test_seed_demo_data():
    """Test seeding demo data"""
    print("\n🌱 Testing Demo Data Seeding...")
    
    response = make_request("POST", "/seed/demo-data")
    
    if response is None:
        log_test("POST /api/seed/demo-data", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "demo_accounts" in data and len(data["demo_accounts"]) == 3:
            log_test("POST /api/seed/demo-data", True, "Demo data seeded successfully")
            return True
        else:
            log_test("POST /api/seed/demo-data", False, "Invalid response structure", data)
            return False
    else:
        log_test("POST /api/seed/demo-data", False, f"HTTP {response.status_code}", response.text)
        return False

def test_user_registration():
    """Test user registration endpoint"""
    print("\n👤 Testing User Registration...")
    
    # Test new user registration
    new_user_data = {
        "full_name": "Nomsa Mthembu",
        "phone_number": "0823456789",
        "email": "nomsa@example.com",
        "password": "testpass123",
        "role": "member"
    }
    
    response = make_request("POST", "/auth/register", new_user_data)
    
    if response is None:
        log_test("POST /api/auth/register", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "user_id" in data and "mock_otp" in data and data["mock_otp"] == "1234":
            log_test("POST /api/auth/register", True, "User registered successfully with mock OTP")
            return data["user_id"]
        else:
            log_test("POST /api/auth/register", False, "Invalid response structure", data)
            return False
    else:
        log_test("POST /api/auth/register", False, f"HTTP {response.status_code}", response.text)
        return False

def test_otp_verification():
    """Test OTP verification endpoint"""
    print("\n🔐 Testing OTP Verification...")
    
    # Test with correct OTP
    otp_data = {
        "phone_number": "0823456789",
        "otp": "1234"
    }
    
    response = make_request("POST", "/auth/verify-otp", otp_data)
    
    if response is None:
        log_test("POST /api/auth/verify-otp", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "message" in data and "verified" in data["message"].lower():
            log_test("POST /api/auth/verify-otp", True, "OTP verified successfully")
            return True
        else:
            log_test("POST /api/auth/verify-otp", False, "Invalid response structure", data)
            return False
    else:
        log_test("POST /api/auth/verify-otp", False, f"HTTP {response.status_code}", response.text)
        return False

def test_user_login():
    """Test user login endpoint"""
    print("\n🔑 Testing User Login...")
    
    # Test login with demo member account
    login_data = {
        "phone_number": DEMO_ACCOUNTS["member1"]["phone"],
        "password": DEMO_ACCOUNTS["member1"]["password"]
    }
    
    response = make_request("POST", "/auth/login", login_data)
    
    if response is None:
        log_test("POST /api/auth/login", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "access_token" in data and "user" in data:
            auth_tokens["member1"] = data["access_token"]
            user_data = data["user"]
            if user_data["id"] == "member1" and user_data["role"] == "member":
                log_test("POST /api/auth/login", True, f"Login successful for {user_data['full_name']}")
                return True
            else:
                log_test("POST /api/auth/login", False, "Invalid user data in response", data)
                return False
        else:
            log_test("POST /api/auth/login", False, "Missing access_token or user in response", data)
            return False
    else:
        log_test("POST /api/auth/login", False, f"HTTP {response.status_code}", response.text)
        return False

def test_treasurer_login():
    """Test treasurer login"""
    print("\n👑 Testing Treasurer Login...")
    
    login_data = {
        "phone_number": DEMO_ACCOUNTS["treasurer1"]["phone"],
        "password": DEMO_ACCOUNTS["treasurer1"]["password"]
    }
    
    response = make_request("POST", "/auth/login", login_data)
    
    if response is None:
        log_test("Treasurer Login", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "access_token" in data:
            auth_tokens["treasurer1"] = data["access_token"]
            log_test("Treasurer Login", True, f"Treasurer login successful")
            return True
        else:
            log_test("Treasurer Login", False, "Missing access_token", data)
            return False
    else:
        log_test("Treasurer Login", False, f"HTTP {response.status_code}", response.text)
        return False

def test_member_dashboard():
    """Test member dashboard endpoint"""
    print("\n📊 Testing Member Dashboard...")
    
    response = make_request("GET", f"/member/dashboard/{DEMO_ACCOUNTS['member1']['user_id']}")
    
    if response is None:
        log_test("GET /api/member/dashboard/{user_id}", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        required_fields = ["user", "summary", "clubs"]
        if all(field in data for field in required_fields):
            user = data["user"]
            summary = data["summary"]
            clubs = data["clubs"]
            
            # Validate structure
            if (user["id"] == "member1" and 
                "total_saved" in summary and 
                isinstance(clubs, list)):
                log_test("GET /api/member/dashboard/{user_id}", True, 
                        f"Dashboard loaded: {len(clubs)} clubs, R{summary['total_saved']} saved")
                return True
            else:
                log_test("GET /api/member/dashboard/{user_id}", False, "Invalid data structure", data)
                return False
        else:
            log_test("GET /api/member/dashboard/{user_id}", False, "Missing required fields", data)
            return False
    else:
        log_test("GET /api/member/dashboard/{user_id}", False, f"HTTP {response.status_code}", response.text)
        return False

def test_club_details():
    """Test club details endpoint"""
    print("\n🏛️ Testing Club Details...")
    
    # Using group1 and member1 from demo data
    response = make_request("GET", f"/member/club/group1/user/{DEMO_ACCOUNTS['member1']['user_id']}")
    
    if response is None:
        log_test("GET /api/member/club/{group_id}/user/{user_id}", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        required_fields = ["group", "current_contribution", "payment_reference", "payment_history"]
        if all(field in data for field in required_fields):
            group = data["group"]
            contribution = data["current_contribution"]
            
            if (group["id"] == "group1" and 
                "amount_due" in contribution and 
                "status" in contribution):
                log_test("GET /api/member/club/{group_id}/user/{user_id}", True, 
                        f"Club details loaded: {group['name']}, status: {contribution['status']}")
                return contribution["id"]  # Return contribution ID for proof upload test
            else:
                log_test("GET /api/member/club/{group_id}/user/{user_id}", False, "Invalid data structure", data)
                return False
        else:
            log_test("GET /api/member/club/{group_id}/user/{user_id}", False, "Missing required fields", data)
            return False
    else:
        log_test("GET /api/member/club/{group_id}/user/{user_id}", False, f"HTTP {response.status_code}", response.text)
        return False

def test_proof_upload(contribution_id):
    """Test proof of payment upload"""
    print("\n📸 Testing Proof of Payment Upload...")
    
    if not contribution_id:
        log_test("POST /api/contributions/upload-proof", False, "No contribution ID available")
        return False
    
    # Create a simple base64 image (1x1 pixel PNG)
    base64_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    
    proof_data = {
        "contribution_id": contribution_id,
        "proof_image": base64_image,
        "reference_number": "SSH001TEST"
    }
    
    response = make_request("POST", "/contributions/upload-proof", proof_data)
    
    if response is None:
        log_test("POST /api/contributions/upload-proof", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "message" in data and "status" in data:
            if data["status"] == "proof_uploaded":
                log_test("POST /api/contributions/upload-proof", True, "Proof uploaded successfully")
                return True
            else:
                log_test("POST /api/contributions/upload-proof", False, f"Unexpected status: {data['status']}", data)
                return False
        else:
            log_test("POST /api/contributions/upload-proof", False, "Invalid response structure", data)
            return False
    else:
        log_test("POST /api/contributions/upload-proof", False, f"HTTP {response.status_code}", response.text)
        return False

def test_treasurer_dashboard():
    """Test treasurer dashboard endpoint"""
    print("\n👑 Testing Treasurer Dashboard...")
    
    response = make_request("GET", f"/treasurer/dashboard/{DEMO_ACCOUNTS['treasurer1']['user_id']}")
    
    if response is None:
        log_test("GET /api/treasurer/dashboard/{user_id}", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        required_fields = ["summary", "urgent_alerts", "clubs"]
        if all(field in data for field in required_fields):
            summary = data["summary"]
            clubs = data["clubs"]
            
            if ("total_clubs" in summary and 
                "total_members" in summary and 
                isinstance(clubs, list)):
                log_test("GET /api/treasurer/dashboard/{user_id}", True, 
                        f"Treasurer dashboard loaded: {summary['total_clubs']} clubs, {summary['total_members']} members")
                return True
            else:
                log_test("GET /api/treasurer/dashboard/{user_id}", False, "Invalid data structure", data)
                return False
        else:
            log_test("GET /api/treasurer/dashboard/{user_id}", False, "Missing required fields", data)
            return False
    else:
        log_test("GET /api/treasurer/dashboard/{user_id}", False, f"HTTP {response.status_code}", response.text)
        return False

def test_treasurer_contributions():
    """Test treasurer contributions view"""
    print("\n💰 Testing Treasurer Contributions View...")
    
    now = datetime.now()
    response = make_request("GET", f"/treasurer/contributions/group1/month/{now.month}/year/{now.year}")
    
    if response is None:
        log_test("GET /api/treasurer/contributions/{group_id}/month/{month}/year/{year}", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        required_fields = ["group", "month", "year", "summary", "contributions"]
        if all(field in data for field in required_fields):
            group = data["group"]
            summary = data["summary"]
            contributions = data["contributions"]
            
            if (group["id"] == "group1" and 
                "collected" in summary and 
                isinstance(contributions, list)):
                log_test("GET /api/treasurer/contributions/{group_id}/month/{month}/year/{year}", True, 
                        f"Contributions loaded: {len(contributions)} members, R{summary['collected']} collected")
                
                # Find a contribution with proof_uploaded status for confirmation test
                for contrib in contributions:
                    if contrib.get("proof_uploaded") and contrib.get("id"):
                        return contrib["id"]
                return True
            else:
                log_test("GET /api/treasurer/contributions/{group_id}/month/{month}/year/{year}", False, "Invalid data structure", data)
                return False
        else:
            log_test("GET /api/treasurer/contributions/{group_id}/month/{month}/year/{year}", False, "Missing required fields", data)
            return False
    else:
        log_test("GET /api/treasurer/contributions/{group_id}/month/{month}/year/{year}", False, f"HTTP {response.status_code}", response.text)
        return False

def test_payment_confirmation(contribution_id):
    """Test payment confirmation by treasurer"""
    print("\n✅ Testing Payment Confirmation...")
    
    if not contribution_id:
        log_test("POST /api/treasurer/confirm-payment", False, "No contribution ID available for confirmation")
        return False
    
    confirm_data = {
        "contribution_id": contribution_id,
        "notes": "Payment confirmed via bank statement verification"
    }
    
    response = make_request("POST", "/treasurer/confirm-payment", confirm_data)
    
    if response is None:
        log_test("POST /api/treasurer/confirm-payment", False, "Request failed - connection error")
        return False
    
    if response.status_code == 200:
        data = response.json()
        if "message" in data and "member_notified" in data:
            if data["member_notified"]:
                log_test("POST /api/treasurer/confirm-payment", True, "Payment confirmed and member notified")
                return True
            else:
                log_test("POST /api/treasurer/confirm-payment", False, "Payment confirmed but member not notified", data)
                return False
        else:
            log_test("POST /api/treasurer/confirm-payment", False, "Invalid response structure", data)
            return False
    else:
        log_test("POST /api/treasurer/confirm-payment", False, f"HTTP {response.status_code}", response.text)
        return False

def test_error_cases():
    """Test various error cases"""
    print("\n🚫 Testing Error Cases...")
    
    # Test invalid phone number registration
    invalid_user = {
        "full_name": "Test User",
        "phone_number": "0821234567",  # Already exists
        "password": "test123",
        "role": "member"
    }
    
    response = make_request("POST", "/auth/register", invalid_user)
    if response and response.status_code == 400:
        data = response.json()
        if "Phone number already registered" in data.get("detail", ""):
            log_test("Registration with existing phone", True, "Correctly rejected duplicate phone number")
        else:
            log_test("Registration with existing phone", False, f"Unexpected error message: {data}")
    else:
        log_test("Registration with existing phone", False, f"Expected HTTP 400, got {response.status_code if response else 'None'}")
    
    # Test invalid login
    invalid_login = {
        "phone_number": "0821234567",
        "password": "wrongpassword"
    }
    
    response = make_request("POST", "/auth/login", invalid_login)
    if response and response.status_code == 401:
        data = response.json()
        if "Invalid phone number or password" in data.get("detail", ""):
            log_test("Login with wrong password", True, "Correctly rejected invalid credentials")
        else:
            log_test("Login with wrong password", False, f"Unexpected error message: {data}")
    else:
        log_test("Login with wrong password", False, f"Expected HTTP 401, got {response.status_code if response else 'None'}")
    
    # Test invalid OTP
    invalid_otp = {
        "phone_number": "0821234567",
        "otp": "9999"
    }
    
    response = make_request("POST", "/auth/verify-otp", invalid_otp)
    if response and response.status_code == 400:
        data = response.json()
        if "Invalid OTP" in data.get("detail", ""):
            log_test("Invalid OTP verification", True, "Correctly rejected invalid OTP")
        else:
            log_test("Invalid OTP verification", False, f"Unexpected error message: {data}")
    else:
        log_test("Invalid OTP verification", False, f"Expected HTTP 400, got {response.status_code if response else 'None'}")

def test_jwt_token_structure():
    """Test JWT token generation and structure"""
    print("\n🎫 Testing JWT Token Structure...")
    
    if "member1" not in auth_tokens:
        log_test("JWT Token Structure", False, "No auth token available for testing")
        return False
    
    token = auth_tokens["member1"]
    
    # Basic JWT structure check (should have 3 parts separated by dots)
    parts = token.split('.')
    if len(parts) == 3:
        log_test("JWT Token Structure", True, "Token has correct 3-part structure")
        return True
    else:
        log_test("JWT Token Structure", False, f"Token has {len(parts)} parts, expected 3")
        return False

def run_all_tests():
    """Run all backend tests in sequence"""
    print("🚀 Starting Clubvel Backend API Tests")
    print("=" * 50)
    
    # Step 1: Seed demo data
    if not test_seed_demo_data():
        print("\n❌ Demo data seeding failed. Cannot continue with tests.")
        return False
    
    # Step 2: Test authentication flow
    new_user_id = test_user_registration()
    if new_user_id:
        test_otp_verification()
    
    # Step 3: Test login
    test_user_login()
    test_treasurer_login()
    
    # Step 4: Test member endpoints
    test_member_dashboard()
    contribution_id = test_club_details()
    
    # Step 5: Test proof upload
    if contribution_id:
        test_proof_upload(contribution_id)
    
    # Step 6: Test treasurer endpoints
    test_treasurer_dashboard()
    proof_contribution_id = test_treasurer_contributions()
    
    # Step 7: Test payment confirmation
    if proof_contribution_id and isinstance(proof_contribution_id, str):
        test_payment_confirmation(proof_contribution_id)
    
    # Step 8: Test error cases
    test_error_cases()
    
    # Step 9: Test JWT structure
    test_jwt_token_structure()
    
    # Print summary
    print("\n" + "=" * 50)
    print("📋 TEST SUMMARY")
    print("=" * 50)
    
    passed = sum(1 for result in test_results if result["success"])
    total = len(test_results)
    
    print(f"Total Tests: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {total - passed}")
    print(f"Success Rate: {(passed/total*100):.1f}%")
    
    # List failed tests
    failed_tests = [result for result in test_results if not result["success"]]
    if failed_tests:
        print("\n❌ FAILED TESTS:")
        for test in failed_tests:
            print(f"  • {test['test']}: {test['details']}")
    
    return passed == total

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)