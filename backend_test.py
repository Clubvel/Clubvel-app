#!/usr/bin/env python3
"""
Clubvel Backend API Testing Suite
Tests all backend endpoints for the stokvel app
"""

import requests
import json
import base64
from datetime import datetime
import sys

# Configuration
BASE_URL = "https://money-rotation.preview.emergentagent.com/api"

# Test credentials from /app/memory/test_credentials.md
TEST_CREDENTIALS = {
    "member1": {"phone": "0821234567", "password": "password123", "name": "Thabo Mokoena"},
    "member2": {"phone": "0827654321", "password": "password123", "name": "Lerato Nkosi"},
    "treasurer": {"phone": "0829876543", "password": "password123", "name": "Sipho Dlamini"},
    "new_user": {"phone": "0820000001", "password": "password123", "name": "Test User"}
}

MOCK_OTP = "1234"

class ClubvelAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.tokens = {}
        self.test_results = []
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
    
    def test_seed_demo_data(self):
        """Test seeding demo data"""
        try:
            response = self.session.post(f"{BASE_URL}/seed/demo-data")
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("Seed Demo Data", True, f"Created {len(data['demo_accounts'])} demo accounts")
                return True
            else:
                self.log_test("Seed Demo Data", False, f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Seed Demo Data", False, f"Exception: {str(e)}")
            return False
    
    def test_user_registration(self):
        """Test user registration with OTP verification"""
        try:
            # Test registration
            user_data = {
                "full_name": TEST_CREDENTIALS["new_user"]["name"],
                "phone_number": TEST_CREDENTIALS["new_user"]["phone"],
                "password": TEST_CREDENTIALS["new_user"]["password"],
                "role": "member"
            }
            
            response = self.session.post(f"{BASE_URL}/auth/register", json=user_data)
            
            if response.status_code == 200:
                data = response.json()
                user_id = data.get("user_id")
                mock_otp = data.get("mock_otp")
                
                if user_id and mock_otp == MOCK_OTP:
                    self.log_test("User Registration", True, f"User ID: {user_id}, Mock OTP: {mock_otp}")
                    return user_id
                else:
                    self.log_test("User Registration", False, "Missing user_id or incorrect mock_otp", data)
                    return None
            else:
                self.log_test("User Registration", False, f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test("User Registration", False, f"Exception: {str(e)}")
            return None
    
    def test_otp_verification(self, phone_number):
        """Test OTP verification"""
        try:
            otp_data = {
                "phone_number": phone_number,
                "otp": MOCK_OTP
            }
            
            response = self.session.post(f"{BASE_URL}/auth/verify-otp", json=otp_data)
            
            if response.status_code == 200:
                data = response.json()
                self.log_test("OTP Verification", True, data.get("message", ""))
                return True
            else:
                self.log_test("OTP Verification", False, f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("OTP Verification", False, f"Exception: {str(e)}")
            return False
    
    def test_user_login(self, phone, password, expected_role):
        """Test user login and return token"""
        try:
            login_data = {
                "phone_number": phone,
                "password": password
            }
            
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                token = data.get("access_token")
                user = data.get("user", {})
                
                if token and user.get("role") == expected_role:
                    self.tokens[expected_role] = token
                    self.log_test(f"User Login ({expected_role})", True, f"User: {user.get('full_name')}, Role: {user.get('role')}")
                    return token, user
                else:
                    self.log_test(f"User Login ({expected_role})", False, "Missing token or incorrect role", data)
                    return None, None
            else:
                self.log_test(f"User Login ({expected_role})", False, f"Status: {response.status_code}", response.text)
                return None, None
                
        except Exception as e:
            self.log_test(f"User Login ({expected_role})", False, f"Exception: {str(e)}")
            return None, None
    
    def test_member_dashboard(self, user_id="member1"):
        """Test member dashboard endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/member/dashboard/{user_id}")
            
            if response.status_code == 200:
                data = response.json()
                user = data.get("user", {})
                summary = data.get("summary", {})
                clubs = data.get("clubs", [])
                
                if user.get("id") and "total_saved" in summary and isinstance(clubs, list):
                    self.log_test("Member Dashboard", True, 
                                f"User: {user.get('full_name')}, Clubs: {len(clubs)}, Total Saved: R{summary.get('total_saved', 0)}")
                    return data
                else:
                    self.log_test("Member Dashboard", False, "Missing required fields", data)
                    return None
            else:
                self.log_test("Member Dashboard", False, f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test("Member Dashboard", False, f"Exception: {str(e)}")
            return None
    
    def test_member_club_details(self, group_id="group1", user_id="member1"):
        """Test member club details endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/member/club/{group_id}/user/{user_id}")
            
            if response.status_code == 200:
                data = response.json()
                group = data.get("group", {})
                current_contribution = data.get("current_contribution", {})
                payment_reference = data.get("payment_reference", {})
                
                if group.get("id") and current_contribution.get("id") and payment_reference.get("reference_code"):
                    self.log_test("Member Club Details", True, 
                                f"Group: {group.get('name')}, Status: {current_contribution.get('status')}")
                    return data
                else:
                    self.log_test("Member Club Details", False, "Missing required fields", data)
                    return None
            else:
                self.log_test("Member Club Details", False, f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test("Member Club Details", False, f"Exception: {str(e)}")
            return None
    
    def test_treasurer_dashboard(self, user_id="treasurer1"):
        """Test treasurer dashboard endpoint"""
        try:
            response = self.session.get(f"{BASE_URL}/treasurer/dashboard/{user_id}")
            
            if response.status_code == 200:
                data = response.json()
                summary = data.get("summary", {})
                clubs = data.get("clubs", [])
                urgent_alerts = data.get("urgent_alerts", [])
                
                if "total_clubs" in summary and isinstance(clubs, list):
                    self.log_test("Treasurer Dashboard", True, 
                                f"Clubs: {summary.get('total_clubs')}, Members: {summary.get('total_members')}, Late: {len(urgent_alerts)}")
                    return data
                else:
                    self.log_test("Treasurer Dashboard", False, "Missing required fields", data)
                    return None
            else:
                self.log_test("Treasurer Dashboard", False, f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test("Treasurer Dashboard", False, f"Exception: {str(e)}")
            return None
    
    def test_treasurer_contributions(self, group_id="group1", month=4, year=2026):
        """Test treasurer contributions view"""
        try:
            response = self.session.get(f"{BASE_URL}/treasurer/contributions/{group_id}/month/{month}/year/{year}")
            
            if response.status_code == 200:
                data = response.json()
                group = data.get("group", {})
                summary = data.get("summary", {})
                contributions = data.get("contributions", [])
                
                if group.get("id") and "collected" in summary and isinstance(contributions, list):
                    self.log_test("Treasurer Contributions", True, 
                                f"Group: {group.get('name')}, Contributions: {len(contributions)}, Collected: R{summary.get('collected', 0)}")
                    return data
                else:
                    self.log_test("Treasurer Contributions", False, "Missing required fields", data)
                    return None
            else:
                self.log_test("Treasurer Contributions", False, f"Status: {response.status_code}", response.text)
                return None
                
        except Exception as e:
            self.log_test("Treasurer Contributions", False, f"Exception: {str(e)}")
            return None
    
    def test_upload_proof_of_payment(self, contribution_id):
        """Test proof of payment upload"""
        try:
            # Create a simple base64 image (1x1 pixel PNG)
            base64_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
            
            proof_data = {
                "contribution_id": contribution_id,
                "proof_image": base64_image,
                "reference_number": "TEST123456"
            }
            
            response = self.session.post(f"{BASE_URL}/contributions/upload-proof", json=proof_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("status") == "proof_uploaded":
                    self.log_test("Upload Proof of Payment", True, data.get("message", ""))
                    return True
                else:
                    self.log_test("Upload Proof of Payment", False, "Incorrect status", data)
                    return False
            else:
                self.log_test("Upload Proof of Payment", False, f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Upload Proof of Payment", False, f"Exception: {str(e)}")
            return False
    
    def test_confirm_payment(self, contribution_id):
        """Test treasurer payment confirmation"""
        try:
            confirm_data = {
                "contribution_id": contribution_id,
                "notes": "Payment confirmed via test"
            }
            
            response = self.session.post(f"{BASE_URL}/treasurer/confirm-payment", json=confirm_data)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("member_notified"):
                    self.log_test("Confirm Payment", True, data.get("message", ""))
                    return True
                else:
                    self.log_test("Confirm Payment", False, "Member not notified", data)
                    return False
            else:
                self.log_test("Confirm Payment", False, f"Status: {response.status_code}", response.text)
                return False
                
        except Exception as e:
            self.log_test("Confirm Payment", False, f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print("🚀 Starting Clubvel Backend API Tests")
        print("=" * 50)
        
        # 1. Seed demo data first
        if not self.test_seed_demo_data():
            print("❌ Failed to seed demo data. Stopping tests.")
            return False
        
        # 2. Test user registration and OTP
        new_user_id = self.test_user_registration()
        if new_user_id:
            self.test_otp_verification(TEST_CREDENTIALS["new_user"]["phone"])
        
        # 3. Test login for different roles
        member_token, member_user = self.test_user_login(
            TEST_CREDENTIALS["member1"]["phone"], 
            TEST_CREDENTIALS["member1"]["password"], 
            "member"
        )
        
        treasurer_token, treasurer_user = self.test_user_login(
            TEST_CREDENTIALS["treasurer"]["phone"], 
            TEST_CREDENTIALS["treasurer"]["password"], 
            "treasurer"
        )
        
        # 4. Test member endpoints
        member_dashboard = self.test_member_dashboard("member1")
        club_details = self.test_member_club_details("group1", "member1")
        
        # 5. Test treasurer endpoints
        treasurer_dashboard = self.test_treasurer_dashboard("treasurer1")
        contributions_data = self.test_treasurer_contributions("group1", 4, 2026)
        
        # 6. Test proof upload and payment confirmation flow
        if contributions_data and contributions_data.get("contributions"):
            # Find a contribution that can be tested
            test_contribution = None
            for contrib in contributions_data["contributions"]:
                if contrib.get("id") and contrib.get("status") in ["pending", "late"]:
                    test_contribution = contrib
                    break
            
            if test_contribution:
                contribution_id = test_contribution["id"]
                
                # Test proof upload
                if self.test_upload_proof_of_payment(contribution_id):
                    # Test payment confirmation
                    self.test_confirm_payment(contribution_id)
            else:
                self.log_test("Upload Proof of Payment", False, "No suitable contribution found for testing")
                self.log_test("Confirm Payment", False, "No contribution to confirm")
        
        # Print summary
        print("=" * 50)
        print("📊 TEST SUMMARY")
        print("=" * 50)
        
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
        
        return passed == total

if __name__ == "__main__":
    tester = ClubvelAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)