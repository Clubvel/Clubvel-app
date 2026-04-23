#!/usr/bin/env python3
"""
Clubvel Authentication Flow Testing Suite
Tests the complete registration and authentication flow as requested
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://money-rotation.preview.emergentagent.com/api"

class AuthFlowTester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.user_id = None
        self.access_token = None
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        elif response_data and success:
            print(f"   Response: {json.dumps(response_data, indent=2)}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def test_register_admin_user(self):
        """Test 1: Register a new Admin user"""
        try:
            user_data = {
                "full_name": "Test Admin",
                "phone_number": "+27665050721",  # Changed to avoid conflict
                "password": "Test123!",
                "role": "treasurer"
            }
            
            response = self.session.post(f"{BASE_URL}/auth/register", json=user_data)
            
            if response.status_code == 200:
                data = response.json()
                user_id = data.get("user_id")
                mock_otp = data.get("mock_otp")
                
                if user_id and mock_otp == "1234":
                    self.user_id = user_id
                    self.log_test("1. Register Admin User", True, 
                                f"User ID: {user_id}, Mock OTP: {mock_otp}", data)
                    return True
                else:
                    self.log_test("1. Register Admin User", False, 
                                "Missing user_id or incorrect mock_otp", data)
                    return False
            else:
                self.log_test("1. Register Admin User", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("1. Register Admin User", False, f"Exception: {str(e)}")
            return False
    
    def test_verify_otp(self):
        """Test 2: Verify OTP"""
        try:
            otp_data = {
                "phone_number": "+27665050721",
                "otp": "1234"
            }
            
            response = self.session.post(f"{BASE_URL}/auth/verify-otp", json=otp_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("2. Verify OTP", True, data.get("message", ""), data)
                return True
            else:
                self.log_test("2. Verify OTP", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("2. Verify OTP", False, f"Exception: {str(e)}")
            return False
    
    def test_login_new_account(self):
        """Test 3: Login with the new account"""
        try:
            login_data = {
                "phone_number": "+27665050721",
                "password": "Test123!"
            }
            
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                user = data.get("user", {})
                
                if token and user.get("role") == "treasurer":
                    self.access_token = token
                    self.log_test("3. Login New Account", True, 
                                f"Token received, Role: {user.get('role')}, Name: {user.get('full_name')}", data)
                    return True
                else:
                    self.log_test("3. Login New Account", False, 
                                "Missing token or incorrect role", data)
                    return False
            else:
                self.log_test("3. Login New Account", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("3. Login New Account", False, f"Exception: {str(e)}")
            return False
    
    def test_forgot_password_flow(self):
        """Test 4: Test Forgot Password flow"""
        try:
            # Step 4a: Forgot password request
            forgot_data = {"phone_number": "+27665050721"}
            response = self.session.post(f"{BASE_URL}/auth/forgot-password", json=forgot_data)
            
            if response.status_code != 200:
                self.log_test("4a. Forgot Password Request", False, 
                            f"Status: {response.status_code}", response.text)
                return False
            
            data = response.json()
            self.log_test("4a. Forgot Password Request", True, 
                        data.get("message", ""), data)
            
            # Step 4b: Verify reset OTP
            verify_data = {
                "phone_number": "+27665050721",
                "otp": "1234"
            }
            response = self.session.post(f"{BASE_URL}/auth/verify-reset-otp", json=verify_data)
            
            if response.status_code != 200:
                self.log_test("4b. Verify Reset OTP", False, 
                            f"Status: {response.status_code}", response.text)
                return False
            
            data = response.json()
            self.log_test("4b. Verify Reset OTP", True, 
                        data.get("message", ""), data)
            
            # Step 4c: Reset password
            reset_data = {
                "phone_number": "+27665050721",
                "otp": "1234",
                "new_password": "NewPass123!"
            }
            response = self.session.post(f"{BASE_URL}/auth/reset-password", json=reset_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("4c. Reset Password", True, 
                            data.get("message", ""), data)
                return True
            else:
                self.log_test("4c. Reset Password", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("4. Forgot Password Flow", False, f"Exception: {str(e)}")
            return False
    
    def test_login_new_password(self):
        """Test 5: Login with new password"""
        try:
            login_data = {
                "phone_number": "+27665050721",
                "password": "NewPass123!"
            }
            
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                user = data.get("user", {})
                
                if token and user.get("role") == "treasurer":
                    self.access_token = token
                    self.log_test("5. Login with New Password", True, 
                                f"Login successful with new password", data)
                    return True
                else:
                    self.log_test("5. Login with New Password", False, 
                                "Missing token or incorrect role", data)
                    return False
            else:
                self.log_test("5. Login with New Password", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("5. Login with New Password", False, f"Exception: {str(e)}")
            return False
    
    def test_create_club(self):
        """Test 6: Create a new club"""
        try:
            if not self.user_id:
                self.log_test("6. Create Club", False, "No user_id available")
                return False
            
            club_data = {
                "group_name": "Test Savings Club",
                "group_type": "savings",
                "monthly_contribution": 500.0,
                "payment_due_date": 25,
                "bank_name": "FNB",
                "bank_account_number": "1234567890",
                "bank_account_holder": "Test Admin",
                "admin_user_id": self.user_id,
                "payment_reference_prefix": "TSC",
                "description": "Test savings club for authentication flow testing"
            }
            
            response = self.session.post(f"{BASE_URL}/groups/create", json=club_data)
            
            if response.status_code == 200:
                data = response.json()
                group_id = data.get("group_id")
                
                if group_id:
                    self.log_test("6. Create Club", True, 
                                f"Club created with ID: {group_id}", data)
                    return group_id
                else:
                    self.log_test("6. Create Club", False, 
                                "Missing group_id in response", data)
                    return None
            else:
                self.log_test("6. Create Club", False, 
                            f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test("6. Create Club", False, f"Exception: {str(e)}")
            return None
    
    def test_user_stats(self):
        """Test 7: Get user stats"""
        try:
            if not self.user_id:
                self.log_test("7. Get User Stats", False, "No user_id available")
                return False
            
            response = self.session.get(f"{BASE_URL}/user/stats/{self.user_id}")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["clubs_count", "total_saved", "on_time_percentage", "trust_score"]
                
                if all(field in data for field in required_fields):
                    self.log_test("7. Get User Stats", True, 
                                f"Stats retrieved: {data}", data)
                    return True
                else:
                    self.log_test("7. Get User Stats", False, 
                                f"Missing required fields. Expected: {required_fields}", data)
                    return False
            else:
                self.log_test("7. Get User Stats", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("7. Get User Stats", False, f"Exception: {str(e)}")
            return False
    
    def test_admin_dashboard(self):
        """Test 8: Get admin dashboard"""
        try:
            if not self.user_id:
                self.log_test("8. Get Admin Dashboard", False, "No user_id available")
                return False
            
            response = self.session.get(f"{BASE_URL}/admin/dashboard/{self.user_id}")
            
            if response.status_code == 200:
                data = response.json()
                summary = data.get("summary", {})
                clubs = data.get("clubs", [])
                
                required_fields = ["total_clubs", "total_members"]
                if all(field in summary for field in required_fields) and isinstance(clubs, list):
                    self.log_test("8. Get Admin Dashboard", True, 
                                f"Dashboard retrieved: Total clubs: {summary.get('total_clubs')}, Total members: {summary.get('total_members')}", data)
                    return True
                else:
                    self.log_test("8. Get Admin Dashboard", False, 
                                f"Missing required fields or invalid structure", data)
                    return False
            else:
                self.log_test("8. Get Admin Dashboard", False, 
                            f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("8. Get Admin Dashboard", False, f"Exception: {str(e)}")
            return False
    
    def run_complete_flow(self):
        """Run the complete authentication flow test"""
        print("🚀 Starting Clubvel Authentication Flow Test")
        print("=" * 60)
        print(f"API Base URL: {BASE_URL}")
        print("=" * 60)
        
        # Run all tests in sequence
        tests = [
            self.test_register_admin_user,
            self.test_verify_otp,
            self.test_login_new_account,
            self.test_forgot_password_flow,
            self.test_login_new_password,
            self.test_create_club,
            self.test_user_stats,
            self.test_admin_dashboard
        ]
        
        for test in tests:
            if not test():
                print(f"❌ Test failed: {test.__name__}")
                break
        
        # Print summary
        print("=" * 60)
        print("📊 AUTHENTICATION FLOW TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if total - passed > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  - {result['test']}: {result['details']}")
        else:
            print("\n🎉 ALL TESTS PASSED!")
        
        return passed == total

if __name__ == "__main__":
    tester = AuthFlowTester()
    success = tester.run_complete_flow()
    sys.exit(0 if success else 1)