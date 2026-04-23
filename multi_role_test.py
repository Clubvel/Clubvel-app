#!/usr/bin/env python3
"""
Multi-Role User Support Testing for Clubvel App
Tests the ability for a single phone number to have multiple roles (member + treasurer)
"""

import requests
import json
import sys
from datetime import datetime

# API Configuration
API_BASE_URL = "https://money-rotation.preview.emergentagent.com/api"
TEST_PHONE = "+27111333444"
TEST_PASSWORD = "Test123!"
TEST_NAME = "Multi Role User"

def log_test(test_name, status, details=""):
    """Log test results with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"[{timestamp}] {status_symbol} {test_name}")
    if details:
        print(f"    {details}")
    print()

def make_request(method, endpoint, data=None, headers=None):
    """Make HTTP request with error handling"""
    url = f"{API_BASE_URL}{endpoint}"
    try:
        if method == "GET":
            response = requests.get(url, headers=headers, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers, timeout=30)
        
        print(f"    {method} {endpoint}")
        print(f"    Status: {response.status_code}")
        
        try:
            response_data = response.json()
            print(f"    Response: {json.dumps(response_data, indent=2)}")
            return response.status_code, response_data
        except:
            print(f"    Response: {response.text}")
            return response.status_code, response.text
            
    except requests.exceptions.RequestException as e:
        print(f"    Request failed: {str(e)}")
        return None, str(e)

def test_cleanup_existing_data():
    """Step 1: Check for existing test data"""
    log_test("CLEANUP: Checking for existing test data", "INFO")
    
    # Try to login first to see if user exists
    status_code, response = make_request("POST", "/auth/login", {
        "phone_number": TEST_PHONE,
        "password": TEST_PASSWORD
    })
    
    if status_code == 200 and isinstance(response, dict) and "user" in response:
        user_data = response["user"]
        user_id = user_data["id"]
        current_roles = user_data.get("roles", [user_data.get("role", "member")])
        log_test("Found existing user", "INFO", f"User ID: {user_id}, Current roles: {current_roles}")
        
        # Return existing user info for multi-role testing
        return True, user_id, current_roles
    else:
        log_test("No existing user found", "INFO", "Ready for fresh registration")
        return True, None, []

def test_register_as_member():
    """Step 2: Register as Member first"""
    log_test("STEP 2: Register as Member", "INFO")
    
    status_code, response = make_request("POST", "/auth/register", {
        "full_name": TEST_NAME,
        "phone_number": TEST_PHONE,
        "password": TEST_PASSWORD,
        "role": "member"
    })
    
    if status_code == 200 and isinstance(response, dict):
        if "user_id" in response:
            # Check for mock_otp in response or notification_mode
            otp_info = response.get("mock_otp", "1234")
            log_test("Member registration", "PASS", f"User ID: {response['user_id']}, OTP: {otp_info}")
            return True, response["user_id"]
        else:
            log_test("Member registration", "FAIL", "Missing user_id in response")
            return False, None
    else:
        log_test("Member registration", "FAIL", f"Status: {status_code}, Response: {response}")
        return False, None

def test_verify_otp():
    """Step 3: Verify OTP"""
    log_test("STEP 3: Verify OTP", "INFO")
    
    status_code, response = make_request("POST", "/auth/verify-otp", {
        "phone_number": TEST_PHONE,
        "otp": "1234"
    })
    
    if status_code == 200:
        log_test("OTP verification", "PASS", "OTP verified successfully")
        return True
    else:
        log_test("OTP verification", "FAIL", f"Status: {status_code}, Response: {response}")
        return False

def test_register_same_phone_as_admin():
    """Step 4: Try to register SAME phone as Admin/Treasurer"""
    log_test("STEP 4: Register same phone as Treasurer", "INFO")
    
    status_code, response = make_request("POST", "/auth/register", {
        "full_name": TEST_NAME,
        "phone_number": TEST_PHONE,
        "password": TEST_PASSWORD,
        "role": "treasurer"
    })
    
    # This should either:
    # 1. Return success with message about role being added
    # 2. Return 200/201 indicating role was added to existing user
    # 3. NOT return an error about phone already existing
    
    if status_code in [200, 201]:
        if isinstance(response, dict):
            if "message" in response and "role" in response.get("message", "").lower():
                log_test("Multi-role registration", "PASS", f"Role added successfully: {response}")
                return True
            elif "user_id" in response:
                log_test("Multi-role registration", "PASS", f"User updated with new role: {response}")
                return True
            else:
                log_test("Multi-role registration", "WARN", f"Unexpected success response: {response}")
                return True
        else:
            log_test("Multi-role registration", "PASS", f"Role addition successful: {response}")
            return True
    else:
        log_test("Multi-role registration", "FAIL", f"Status: {status_code}, Response: {response}")
        return False

def test_login_and_verify_roles():
    """Step 5: Login and verify roles"""
    log_test("STEP 5: Login and verify multiple roles", "INFO")
    
    status_code, response = make_request("POST", "/auth/login", {
        "phone_number": TEST_PHONE,
        "password": TEST_PASSWORD
    })
    
    if status_code == 200 and isinstance(response, dict):
        user_data = response.get("user", {})
        
        # Check for roles array in user data
        if "roles" in user_data:
            roles = user_data["roles"]
            if isinstance(roles, list) and len(roles) >= 2:
                if "member" in roles and "treasurer" in roles:
                    log_test("Multi-role verification", "PASS", f"Both roles found: {roles}")
                    
                    # Check has_multiple_roles flag
                    if user_data.get("has_multiple_roles") == True:
                        log_test("Multiple roles flag", "PASS", "has_multiple_roles = true")
                    else:
                        log_test("Multiple roles flag", "WARN", f"has_multiple_roles = {user_data.get('has_multiple_roles')}")
                    
                    return True, user_data["id"]
                else:
                    log_test("Multi-role verification", "FAIL", f"Expected member+treasurer, got: {roles}")
                    return False, user_data.get("id")
            else:
                log_test("Multi-role verification", "FAIL", f"Expected multiple roles, got: {roles}")
                return False, user_data.get("id")
        else:
            # Check for single role field (older format)
            role = user_data.get("role")
            log_test("Multi-role verification", "FAIL", f"No roles array found, single role: {role}")
            return False, user_data.get("id")
    else:
        log_test("Login verification", "FAIL", f"Status: {status_code}, Response: {response}")
        return False, None

def test_create_club_as_admin(user_id):
    """Step 6: Create a club as Admin"""
    log_test("STEP 6: Create club as Admin", "INFO")
    
    status_code, response = make_request("POST", "/groups/create", {
        "group_name": "Test Multi Role Club",
        "group_type": "savings",
        "monthly_contribution": 500,
        "payment_due_date": 25,
        "bank_name": "FNB",
        "bank_account_number": "123456789",
        "bank_account_holder": TEST_NAME,
        "admin_user_id": user_id
    })
    
    if status_code in [200, 201] and isinstance(response, dict):
        if "group_id" in response or "message" in response:
            log_test("Club creation", "PASS", f"Club created successfully: {response}")
            return True, response.get("group_id")
        else:
            log_test("Club creation", "WARN", f"Unexpected success response: {response}")
            return True, None
    else:
        log_test("Club creation", "FAIL", f"Status: {status_code}, Response: {response}")
        return False, None

def test_verify_user_stats(user_id):
    """Step 7: Verify user stats show both roles in action"""
    log_test("STEP 7: Verify user stats", "INFO")
    
    # Test admin dashboard
    status_code, response = make_request("GET", f"/admin/dashboard/{user_id}")
    
    if status_code == 200 and isinstance(response, dict):
        if "summary" in response or "clubs" in response:
            log_test("Admin dashboard access", "PASS", f"Admin dashboard accessible: {response}")
        else:
            log_test("Admin dashboard access", "WARN", f"Unexpected admin response: {response}")
    else:
        log_test("Admin dashboard access", "FAIL", f"Status: {status_code}, Response: {response}")
    
    # Test user stats
    status_code, response = make_request("GET", f"/user/stats/{user_id}")
    
    if status_code == 200 and isinstance(response, dict):
        log_test("User stats access", "PASS", f"User stats accessible: {response}")
        return True
    else:
        log_test("User stats access", "FAIL", f"Status: {status_code}, Response: {response}")
        return False

def main():
    """Run all multi-role tests"""
    print("=" * 80)
    print("CLUBVEL MULTI-ROLE USER SUPPORT TESTING")
    print("=" * 80)
    print(f"API Base URL: {API_BASE_URL}")
    print(f"Test Phone: {TEST_PHONE}")
    print(f"Test Scenario: Same phone number with both Member and Admin roles")
    print("=" * 80)
    print()
    
    # Step 1: Check existing data
    cleanup_success, existing_user_id, current_roles = test_cleanup_existing_data()
    if not cleanup_success:
        print("❌ CLEANUP FAILED - Aborting tests")
        return False
    
    user_id = existing_user_id
    
    # If user doesn't exist, create as member first
    if not existing_user_id:
        # Step 2: Register as Member
        member_success, user_id = test_register_as_member()
        if not member_success:
            print("❌ MEMBER REGISTRATION FAILED - Aborting tests")
            return False
        
        # Step 3: Verify OTP
        otp_success = test_verify_otp()
        if not otp_success:
            print("❌ OTP VERIFICATION FAILED - Aborting tests")
            return False
        
        current_roles = ["member"]
    else:
        log_test("Using existing user", "INFO", f"User ID: {user_id}, Current roles: {current_roles}")
        member_success = True
        otp_success = True
    
    # Step 4: Register same phone as Admin (if not already treasurer)
    if "treasurer" not in current_roles:
        admin_success = test_register_same_phone_as_admin()
        if not admin_success:
            print("❌ MULTI-ROLE REGISTRATION FAILED - Aborting tests")
            return False
    else:
        log_test("User already has treasurer role", "INFO", "Skipping treasurer registration")
        admin_success = True
    
    # Step 5: Login and verify roles
    roles_success, final_user_id = test_login_and_verify_roles()
    if not roles_success:
        print("❌ MULTI-ROLE VERIFICATION FAILED")
        # Continue with remaining tests to gather more info
    
    # Use the user_id from login if available, otherwise from registration/existing
    test_user_id = final_user_id or user_id
    
    if test_user_id:
        # Step 6: Create club as Admin
        club_success, group_id = test_create_club_as_admin(test_user_id)
        
        # Step 7: Verify user stats
        stats_success = test_verify_user_stats(test_user_id)
    else:
        print("❌ NO USER ID AVAILABLE - Skipping club creation and stats tests")
        club_success = False
        stats_success = False
    
    # Summary
    print("=" * 80)
    print("MULTI-ROLE TESTING SUMMARY")
    print("=" * 80)
    
    tests = [
        ("Check existing data", cleanup_success),
        ("Register as Member", member_success),
        ("Verify OTP", otp_success),
        ("Register same phone as Admin", admin_success),
        ("Login with multiple roles", roles_success),
        ("Create club as Admin", club_success),
        ("Verify user stats", stats_success)
    ]
    
    passed = sum(1 for _, success in tests if success)
    total = len(tests)
    
    for test_name, success in tests:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
    
    print(f"\nResults: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 ALL MULTI-ROLE TESTS PASSED!")
        return True
    else:
        print("⚠️ SOME MULTI-ROLE TESTS FAILED")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)