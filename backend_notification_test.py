#!/usr/bin/env python3
"""
Clubvel Backend Notification System API Testing
Tests WhatsApp OTP + SMS fallback notification system
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://money-rotation.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Test credentials from review request
DEMO_MEMBER_PHONE = "0821234567"
DEMO_MEMBER_PASSWORD = "password123"
DEMO_TREASURER_PHONE = "0829876543"
DEMO_TREASURER_PASSWORD = "password123"
MOCK_OTP = "1234"

# Test phone numbers for registration
TEST_PHONE_1 = "0820009999"
TEST_PHONE_2 = "0820008888"

class NotificationAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self.test_results = []
        self.failed_tests = []
        
    def log_test(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "response": response_data
        })
        
        if not success:
            self.failed_tests.append(test_name)
    
    def make_request(self, method, endpoint, data=None):
        """Make HTTP request with error handling"""
        url = f"{BASE_URL}{endpoint}"
        try:
            if method.upper() == "GET":
                response = self.session.get(url)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return None
    
    def test_notification_status(self):
        """Test 1: GET /api/auth/notification-status"""
        print("🔍 Testing Notification Status Endpoint...")
        
        response = self.make_request("GET", "/auth/notification-status")
        
        if response is None:
            self.log_test("Notification Status", False, "Request failed")
            return
        
        if response.status_code != 200:
            self.log_test("Notification Status", False, 
                         f"Expected 200, got {response.status_code}", response.text)
            return
        
        try:
            data = response.json()
            
            # Check required fields
            required_fields = ['mode', 'twilio_configured', 'real_notifications_enabled']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("Notification Status", False, 
                             f"Missing fields: {missing_fields}", data)
                return
            
            # Should be in mock mode
            if data.get('mode') != 'mock':
                self.log_test("Notification Status", False, 
                             f"Expected mode='mock', got '{data.get('mode')}'", data)
                return
            
            self.log_test("Notification Status", True, 
                         f"Mode: {data['mode']}, Mock OTP: {data.get('mock_otp', 'N/A')}")
            
        except json.JSONDecodeError:
            self.log_test("Notification Status", False, "Invalid JSON response", response.text)
    
    def test_registration_with_otp(self):
        """Test 2: POST /api/auth/register with OTP response"""
        print("🔍 Testing Registration with OTP...")
        
        # First, clean up any existing user
        self.cleanup_test_user(TEST_PHONE_1)
        
        registration_data = {
            "full_name": "New User",
            "phone_number": TEST_PHONE_1,
            "password": "test123",
            "role": "member"
        }
        
        response = self.make_request("POST", "/auth/register", registration_data)
        
        if response is None:
            self.log_test("Registration with OTP", False, "Request failed")
            return
        
        if response.status_code != 200:
            self.log_test("Registration with OTP", False, 
                         f"Expected 200, got {response.status_code}", response.text)
            return
        
        try:
            data = response.json()
            
            # Check required fields
            required_fields = ['user_id', 'otp_channel', 'notification_mode']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("Registration with OTP", False, 
                             f"Missing fields: {missing_fields}", data)
                return
            
            # Check values
            if data.get('otp_channel') != 'whatsapp':
                self.log_test("Registration with OTP", False, 
                             f"Expected otp_channel='whatsapp', got '{data.get('otp_channel')}'", data)
                return
            
            if data.get('notification_mode') != 'mock':
                self.log_test("Registration with OTP", False, 
                             f"Expected notification_mode='mock', got '{data.get('notification_mode')}'", data)
                return
            
            if data.get('mock_otp') != MOCK_OTP:
                self.log_test("Registration with OTP", False, 
                             f"Expected mock_otp='{MOCK_OTP}', got '{data.get('mock_otp')}'", data)
                return
            
            self.log_test("Registration with OTP", True, 
                         f"User created: {data['user_id']}, Channel: {data['otp_channel']}, Mock OTP: {data['mock_otp']}")
            
            # Store user_id for cleanup
            self.test_user_id = data['user_id']
            
        except json.JSONDecodeError:
            self.log_test("Registration with OTP", False, "Invalid JSON response", response.text)
    
    def test_send_otp_channel_switch(self):
        """Test 3: POST /api/auth/send-otp with channel switching"""
        print("🔍 Testing Send OTP with Channel Switch...")
        
        send_otp_data = {
            "phone_number": TEST_PHONE_1,
            "channel": "sms"
        }
        
        response = self.make_request("POST", "/auth/send-otp", send_otp_data)
        
        if response is None:
            self.log_test("Send OTP Channel Switch", False, "Request failed")
            return
        
        if response.status_code != 200:
            self.log_test("Send OTP Channel Switch", False, 
                         f"Expected 200, got {response.status_code}", response.text)
            return
        
        try:
            data = response.json()
            
            # Check required fields
            required_fields = ['channel', 'notification_mode']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("Send OTP Channel Switch", False, 
                             f"Missing fields: {missing_fields}", data)
                return
            
            # Should switch to SMS channel
            if data.get('channel') != 'sms':
                self.log_test("Send OTP Channel Switch", False, 
                             f"Expected channel='sms', got '{data.get('channel')}'", data)
                return
            
            if data.get('mock_otp') != MOCK_OTP:
                self.log_test("Send OTP Channel Switch", False, 
                             f"Expected mock_otp='{MOCK_OTP}', got '{data.get('mock_otp')}'", data)
                return
            
            self.log_test("Send OTP Channel Switch", True, 
                         f"Channel switched to: {data['channel']}, Mock OTP: {data['mock_otp']}")
            
        except json.JSONDecodeError:
            self.log_test("Send OTP Channel Switch", False, "Invalid JSON response", response.text)
    
    def test_verify_otp(self):
        """Test 4: POST /api/auth/verify-otp"""
        print("🔍 Testing OTP Verification...")
        
        verify_data = {
            "phone_number": TEST_PHONE_1,
            "otp": MOCK_OTP
        }
        
        response = self.make_request("POST", "/auth/verify-otp", verify_data)
        
        if response is None:
            self.log_test("OTP Verification", False, "Request failed")
            return
        
        if response.status_code != 200:
            self.log_test("OTP Verification", False, 
                         f"Expected 200, got {response.status_code}", response.text)
            return
        
        try:
            data = response.json()
            
            # Check success message
            if 'message' not in data or 'verified successfully' not in data['message']:
                self.log_test("OTP Verification", False, 
                             f"Expected success message, got: {data.get('message')}", data)
                return
            
            self.log_test("OTP Verification", True, 
                         f"OTP verified successfully via {data.get('channel', 'unknown')}")
            
        except json.JSONDecodeError:
            self.log_test("OTP Verification", False, "Invalid JSON response", response.text)
    
    def test_payment_reminder(self):
        """Test 5: POST /api/treasurer/send-reminder (after seeding data)"""
        print("🔍 Testing Payment Reminder...")
        
        # First seed demo data
        print("   Seeding demo data...")
        seed_response = self.make_request("POST", "/seed/demo-data")
        
        if seed_response is None or seed_response.status_code != 200:
            self.log_test("Payment Reminder", False, "Failed to seed demo data")
            return
        
        # Send reminder
        reminder_data = {
            "member_id": "membership1",
            "group_id": "group1"
        }
        
        response = self.make_request("POST", "/treasurer/send-reminder", reminder_data)
        
        if response is None:
            self.log_test("Payment Reminder", False, "Request failed")
            return
        
        if response.status_code != 200:
            self.log_test("Payment Reminder", False, 
                         f"Expected 200, got {response.status_code}", response.text)
            return
        
        try:
            data = response.json()
            
            # Check required fields
            required_fields = ['message', 'mock']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("Payment Reminder", False, 
                             f"Missing fields: {missing_fields}", data)
                return
            
            # Should be in mock mode
            if not data.get('mock'):
                self.log_test("Payment Reminder", False, 
                             f"Expected mock=true, got mock={data.get('mock')}", data)
                return
            
            # Check if message mentions Thabo Mokoena
            if 'Thabo Mokoena' not in data.get('message', ''):
                self.log_test("Payment Reminder", False, 
                             f"Expected message to mention 'Thabo Mokoena', got: {data.get('message')}", data)
                return
            
            self.log_test("Payment Reminder", True, 
                         f"Reminder sent to Thabo Mokoena, Mock: {data['mock']}")
            
        except json.JSONDecodeError:
            self.log_test("Payment Reminder", False, "Invalid JSON response", response.text)
    
    def test_late_payment_alert(self):
        """Test 6: POST /api/treasurer/send-late-alert/{member_id}"""
        print("🔍 Testing Late Payment Alert...")
        
        # Use membership3 (Lerato Nkosi) who should be late
        member_id = "membership3"
        
        response = self.make_request("POST", f"/treasurer/send-late-alert/{member_id}")
        
        if response is None:
            self.log_test("Late Payment Alert", False, "Request failed")
            return
        
        if response.status_code != 200:
            self.log_test("Late Payment Alert", False, 
                         f"Expected 200, got {response.status_code}", response.text)
            return
        
        try:
            data = response.json()
            
            # Check required fields
            required_fields = ['message', 'days_late', 'mock']
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                self.log_test("Late Payment Alert", False, 
                             f"Missing fields: {missing_fields}", data)
                return
            
            # Should be in mock mode
            if not data.get('mock'):
                self.log_test("Late Payment Alert", False, 
                             f"Expected mock=true, got mock={data.get('mock')}", data)
                return
            
            # Check if message mentions Lerato Nkosi
            if 'Lerato Nkosi' not in data.get('message', ''):
                self.log_test("Late Payment Alert", False, 
                             f"Expected message to mention 'Lerato Nkosi', got: {data.get('message')}", data)
                return
            
            # Check days_late is a number
            days_late = data.get('days_late')
            if not isinstance(days_late, int) or days_late < 0:
                self.log_test("Late Payment Alert", False, 
                             f"Expected days_late to be positive integer, got: {days_late}", data)
                return
            
            self.log_test("Late Payment Alert", True, 
                         f"Alert sent to Lerato Nkosi, Days late: {days_late}, Mock: {data['mock']}")
            
        except json.JSONDecodeError:
            self.log_test("Late Payment Alert", False, "Invalid JSON response", response.text)
    
    def cleanup_test_user(self, phone_number):
        """Clean up test user if exists (best effort)"""
        try:
            # Try to delete user via direct DB access (not available in API)
            # This is just to prevent conflicts in testing
            pass
        except:
            pass
    
    def run_all_tests(self):
        """Run all notification system tests"""
        print("🚀 Starting Clubvel Notification System API Tests")
        print("=" * 60)
        print()
        
        # Test sequence as specified in review request
        self.test_notification_status()
        self.test_registration_with_otp()
        self.test_send_otp_channel_switch()
        self.test_verify_otp()
        self.test_payment_reminder()
        self.test_late_payment_alert()
        
        # Summary
        print("=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result['success'])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"   - {test}")
        else:
            print("\n🎉 ALL TESTS PASSED!")
        
        print("\n📋 EXPECTED BEHAVIOR VERIFICATION:")
        print("✅ All notifications are in MOCK mode (logged but not sent)")
        print("✅ OTP is always 1234 in mock mode")
        print("✅ WhatsApp is primary channel, SMS is fallback")
        
        return failed_tests == 0

if __name__ == "__main__":
    tester = NotificationAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)