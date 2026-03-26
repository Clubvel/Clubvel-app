#!/usr/bin/env python3
"""
Simple test for error cases
"""

import requests
import json
import time

BASE_URL = "https://money-rotation.preview.emergentagent.com/api"

def test_error_cases():
    """Test error cases individually"""
    print("Testing Error Cases...")
    
    # Test 1: Duplicate phone registration
    print("\n1. Testing duplicate phone registration...")
    data = {
        "full_name": "Test User",
        "phone_number": "0821234567",  # Already exists
        "password": "test123",
        "role": "member"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json=data, timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        if response.status_code == 400:
            print("   ✅ PASS: Correctly rejected duplicate phone")
        else:
            print("   ❌ FAIL: Should return 400")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    time.sleep(1)  # Small delay
    
    # Test 2: Invalid login
    print("\n2. Testing invalid login...")
    data = {
        "phone_number": "0821234567",
        "password": "wrongpassword"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json=data, timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        if response.status_code == 401:
            print("   ✅ PASS: Correctly rejected invalid credentials")
        else:
            print("   ❌ FAIL: Should return 401")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    time.sleep(1)  # Small delay
    
    # Test 3: Invalid OTP
    print("\n3. Testing invalid OTP...")
    data = {
        "phone_number": "0821234567",
        "otp": "9999"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/auth/verify-otp", json=data, timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        if response.status_code == 400:
            print("   ✅ PASS: Correctly rejected invalid OTP")
        else:
            print("   ❌ FAIL: Should return 400")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")

if __name__ == "__main__":
    test_error_cases()