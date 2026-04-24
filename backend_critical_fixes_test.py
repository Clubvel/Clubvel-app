#!/usr/bin/env python3
"""
Critical Fixes Test for Clubvel App
Tests the three specific fixes requested:
1. Forgot Password Flow
2. Same phone number registering as member when already admin
3. Login returns multiple roles
"""

import requests
import json
import sys

# API Base URL from frontend/.env
API_BASE_URL = "https://money-rotation.preview.emergentagent.com/api"

def test_forgot_password_flow():
    """Test 1: Forgot Password Flow"""
    print("\n🔍 TEST 1: Forgot Password Flow")
    print("=" * 50)
    
    # Use the test phone number from test_credentials.md
    phone_number = "+27111333444"
    
    try:
        # Test forgot password endpoint
        response = requests.post(
            f"{API_BASE_URL}/auth/forgot-password",
            json={"phone_number": phone_number},
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📞 Phone Number: {phone_number}")
        print(f"🌐 URL: {API_BASE_URL}/auth/forgot-password")
        print(f"📊 Status Code: {response.status_code}")
        print(f"📝 Response: {response.text}")
        
        if response.status_code == 200:
            response_data = response.json()
            print("✅ PASS: Forgot password endpoint working")
            return True, response_data
        else:
            print("❌ FAIL: Forgot password endpoint failed")
            return False, response.text
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False, str(e)

def test_same_phone_member_registration():
    """Test 2: Same phone number registering as member when already admin"""
    print("\n🔍 TEST 2: Same Phone Number Member Registration")
    print("=" * 50)
    
    # Use the test phone number that already has admin role
    phone_number = "+27111333444"
    
    try:
        # Try to register as member with existing admin phone
        response = requests.post(
            f"{API_BASE_URL}/auth/register",
            json={
                "full_name": "Test",
                "phone_number": phone_number,
                "password": "Test123!",
                "role": "member"
            },
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📞 Phone Number: {phone_number}")
        print(f"👤 Role: member (already has treasurer role)")
        print(f"🌐 URL: {API_BASE_URL}/auth/register")
        print(f"📊 Status Code: {response.status_code}")
        print(f"📝 Response: {response.text}")
        
        if response.status_code in [200, 201]:
            response_data = response.json()
            print("✅ PASS: Registration with existing phone number handled correctly")
            return True, response_data
        else:
            print("❌ FAIL: Registration threw error for existing phone")
            return False, response.text
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False, str(e)

def test_login_multiple_roles():
    """Test 3: Login returns multiple roles"""
    print("\n🔍 TEST 3: Login Returns Multiple Roles")
    print("=" * 50)
    
    # Use the test credentials from test_credentials.md
    phone_number = "+27111333444"
    password = "Test123!"
    
    try:
        # Test login endpoint
        response = requests.post(
            f"{API_BASE_URL}/auth/login",
            json={
                "phone_number": phone_number,
                "password": password
            },
            headers={"Content-Type": "application/json"}
        )
        
        print(f"📞 Phone Number: {phone_number}")
        print(f"🔑 Password: {password}")
        print(f"🌐 URL: {API_BASE_URL}/auth/login")
        print(f"📊 Status Code: {response.status_code}")
        print(f"📝 Response: {response.text}")
        
        if response.status_code == 200:
            response_data = response.json()
            
            # Check if roles array exists and has multiple roles
            if "user" in response_data and "roles" in response_data["user"]:
                roles = response_data["user"]["roles"]
                print(f"🎭 Roles Found: {roles}")
                
                if isinstance(roles, list) and len(roles) >= 2:
                    if "member" in roles and "treasurer" in roles:
                        print("✅ PASS: Login returns multiple roles (member and treasurer)")
                        return True, response_data
                    else:
                        print("❌ FAIL: Expected both 'member' and 'treasurer' roles")
                        return False, f"Roles found: {roles}"
                else:
                    print("❌ FAIL: Roles array doesn't contain multiple roles")
                    return False, f"Roles: {roles}"
            else:
                print("❌ FAIL: No roles array found in response")
                return False, "Missing roles in response"
        else:
            print("❌ FAIL: Login failed")
            return False, response.text
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        return False, str(e)

def main():
    """Run all critical fix tests"""
    print("🚀 CLUBVEL CRITICAL FIXES TEST")
    print("=" * 50)
    print(f"🌐 API Base URL: {API_BASE_URL}")
    
    results = []
    
    # Test 1: Forgot Password Flow
    test1_pass, test1_response = test_forgot_password_flow()
    results.append(("Forgot Password Flow", test1_pass, test1_response))
    
    # Test 2: Same phone member registration
    test2_pass, test2_response = test_same_phone_member_registration()
    results.append(("Same Phone Member Registration", test2_pass, test2_response))
    
    # Test 3: Login multiple roles
    test3_pass, test3_response = test_login_multiple_roles()
    results.append(("Login Multiple Roles", test3_pass, test3_response))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 TEST SUMMARY")
    print("=" * 50)
    
    passed = 0
    total = len(results)
    
    for test_name, passed_test, response in results:
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"{status}: {test_name}")
        if passed_test:
            passed += 1
    
    print(f"\n🎯 OVERALL RESULT: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL CRITICAL FIXES WORKING CORRECTLY!")
        return True
    else:
        print("⚠️  SOME CRITICAL FIXES NEED ATTENTION")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)