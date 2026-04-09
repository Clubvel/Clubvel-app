"""
Notification Service for Clubvel App
Handles OTP verification and notifications via WhatsApp (primary) and SMS (fallback)
Uses Twilio API for both channels
"""

import os
import random
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Configuration
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')  # For SMS
TWILIO_WHATSAPP_NUMBER = os.environ.get('TWILIO_WHATSAPP_NUMBER', 'whatsapp:+14155238886')  # Twilio sandbox default

# Feature flags
ENABLE_REAL_NOTIFICATIONS = os.environ.get('ENABLE_REAL_NOTIFICATIONS', 'false').lower() == 'true'
OTP_EXPIRY_MINUTES = 10

# In-memory OTP storage (in production, use Redis or database)
otp_storage: Dict[str, Dict[str, Any]] = {}


def is_twilio_configured() -> bool:
    """Check if Twilio credentials are configured"""
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER)


def format_phone_number(phone: str) -> str:
    """
    Convert South African phone format to international E.164 format
    0821234567 -> +27821234567
    """
    phone = phone.strip().replace(' ', '').replace('-', '')
    
    # Already in international format
    if phone.startswith('+'):
        return phone
    
    # South African format starting with 0
    if phone.startswith('0') and len(phone) == 10:
        return '+27' + phone[1:]
    
    # Assume South African if no prefix
    if len(phone) == 9:
        return '+27' + phone
    
    # Default: add +27
    return '+27' + phone.lstrip('0')


def generate_otp() -> str:
    """Generate a 4-digit OTP"""
    return str(random.randint(1000, 9999))


def store_otp(phone: str, otp: str, channel: str = 'whatsapp') -> None:
    """Store OTP with expiry time"""
    otp_storage[phone] = {
        'otp': otp,
        'channel': channel,
        'created_at': datetime.utcnow(),
        'expires_at': datetime.utcnow() + timedelta(minutes=OTP_EXPIRY_MINUTES),
        'verified': False,
        'attempts': 0
    }
    logger.info(f"OTP stored for {phone[-4:]}**** via {channel}")


def verify_stored_otp(phone: str, otp: str) -> Dict[str, Any]:
    """Verify OTP against stored value"""
    formatted_phone = format_phone_number(phone)
    
    # Check both formatted and original phone
    stored = otp_storage.get(formatted_phone) or otp_storage.get(phone)
    
    if not stored:
        return {'valid': False, 'error': 'No OTP found. Please request a new one.'}
    
    # Check expiry
    if datetime.utcnow() > stored['expires_at']:
        return {'valid': False, 'error': 'OTP has expired. Please request a new one.'}
    
    # Check attempts (max 3)
    if stored['attempts'] >= 3:
        return {'valid': False, 'error': 'Too many attempts. Please request a new OTP.'}
    
    # Increment attempts
    stored['attempts'] += 1
    
    # Verify OTP
    if stored['otp'] == otp:
        stored['verified'] = True
        return {'valid': True, 'channel': stored['channel']}
    
    remaining = 3 - stored['attempts']
    return {'valid': False, 'error': f'Invalid OTP. {remaining} attempts remaining.'}


async def send_whatsapp_otp(phone: str, otp: str) -> Dict[str, Any]:
    """
    Send OTP via WhatsApp using Twilio
    """
    if not ENABLE_REAL_NOTIFICATIONS or not is_twilio_configured():
        # Mock mode - just log and return success
        logger.info(f"[MOCK] WhatsApp OTP to {phone}: {otp}")
        store_otp(phone, otp, 'whatsapp')
        return {
            'success': True,
            'channel': 'whatsapp',
            'mock': True,
            'message': f'Mock OTP sent. Use: {otp}'
        }
    
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        formatted_phone = format_phone_number(phone)
        
        message = client.messages.create(
            from_=TWILIO_WHATSAPP_NUMBER,
            to=f'whatsapp:{formatted_phone}',
            body=f'🔐 Your Clubvel verification code is: *{otp}*\n\nThis code expires in {OTP_EXPIRY_MINUTES} minutes.\n\nDo not share this code with anyone.'
        )
        
        store_otp(formatted_phone, otp, 'whatsapp')
        
        logger.info(f"WhatsApp OTP sent to {phone[-4:]}****, SID: {message.sid}")
        return {
            'success': True,
            'channel': 'whatsapp',
            'message_sid': message.sid,
            'mock': False
        }
        
    except Exception as e:
        logger.error(f"WhatsApp OTP failed for {phone}: {str(e)}")
        return {
            'success': False,
            'channel': 'whatsapp',
            'error': str(e)
        }


async def send_sms_otp(phone: str, otp: str) -> Dict[str, Any]:
    """
    Send OTP via SMS using Twilio (fallback)
    """
    if not ENABLE_REAL_NOTIFICATIONS or not is_twilio_configured():
        # Mock mode
        logger.info(f"[MOCK] SMS OTP to {phone}: {otp}")
        store_otp(phone, otp, 'sms')
        return {
            'success': True,
            'channel': 'sms',
            'mock': True,
            'message': f'Mock SMS OTP sent. Use: {otp}'
        }
    
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        formatted_phone = format_phone_number(phone)
        
        message = client.messages.create(
            from_=TWILIO_PHONE_NUMBER,
            to=formatted_phone,
            body=f'Clubvel: Your verification code is {otp}. Expires in {OTP_EXPIRY_MINUTES} min. Do not share.'
        )
        
        store_otp(formatted_phone, otp, 'sms')
        
        logger.info(f"SMS OTP sent to {phone[-4:]}****, SID: {message.sid}")
        return {
            'success': True,
            'channel': 'sms',
            'message_sid': message.sid,
            'mock': False
        }
        
    except Exception as e:
        logger.error(f"SMS OTP failed for {phone}: {str(e)}")
        return {
            'success': False,
            'channel': 'sms',
            'error': str(e)
        }


async def send_otp(phone: str, preferred_channel: str = 'whatsapp') -> Dict[str, Any]:
    """
    Send OTP via preferred channel with fallback
    
    Args:
        phone: Phone number in any format
        preferred_channel: 'whatsapp' or 'sms'
    
    Returns:
        Dict with success status, channel used, and mock flag
    """
    otp = generate_otp()
    
    # In mock mode, always use 1234 for testing
    if not ENABLE_REAL_NOTIFICATIONS:
        otp = "1234"
    
    if preferred_channel == 'whatsapp':
        # Try WhatsApp first
        result = await send_whatsapp_otp(phone, otp)
        if result['success']:
            return result
        
        # Fallback to SMS
        logger.info(f"WhatsApp failed, falling back to SMS for {phone}")
        return await send_sms_otp(phone, otp)
    else:
        # Try SMS first
        result = await send_sms_otp(phone, otp)
        if result['success']:
            return result
        
        # Fallback to WhatsApp
        logger.info(f"SMS failed, falling back to WhatsApp for {phone}")
        return await send_whatsapp_otp(phone, otp)


async def send_payment_reminder(phone: str, member_name: str, group_name: str, amount: float, due_date: str) -> Dict[str, Any]:
    """
    Send payment reminder via WhatsApp
    """
    if not ENABLE_REAL_NOTIFICATIONS or not is_twilio_configured():
        logger.info(f"[MOCK] Payment reminder to {phone}: {group_name} - R{amount}")
        return {'success': True, 'mock': True, 'channel': 'whatsapp'}
    
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        formatted_phone = format_phone_number(phone)
        
        message = client.messages.create(
            from_=TWILIO_WHATSAPP_NUMBER,
            to=f'whatsapp:{formatted_phone}',
            body=f'''📢 *Payment Reminder*

Hi {member_name},

Your *{group_name}* contribution of *R{amount:.2f}* is due on *{due_date}*.

Please make your payment and upload proof in the Clubvel app.

Thank you for being a reliable member! 💚'''
        )
        
        logger.info(f"Payment reminder sent to {phone[-4:]}****, SID: {message.sid}")
        return {
            'success': True,
            'channel': 'whatsapp',
            'message_sid': message.sid,
            'mock': False
        }
        
    except Exception as e:
        logger.error(f"Payment reminder failed for {phone}: {str(e)}")
        return {'success': False, 'error': str(e)}


async def send_payment_confirmation(phone: str, member_name: str, group_name: str, amount: float) -> Dict[str, Any]:
    """
    Send payment confirmation notification via WhatsApp
    """
    if not ENABLE_REAL_NOTIFICATIONS or not is_twilio_configured():
        logger.info(f"[MOCK] Payment confirmation to {phone}: {group_name} - R{amount}")
        return {'success': True, 'mock': True, 'channel': 'whatsapp'}
    
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        formatted_phone = format_phone_number(phone)
        
        message = client.messages.create(
            from_=TWILIO_WHATSAPP_NUMBER,
            to=f'whatsapp:{formatted_phone}',
            body=f'''✅ *Payment Confirmed*

Hi {member_name},

Your payment of *R{amount:.2f}* for *{group_name}* has been confirmed by your treasurer.

Thank you for your contribution! 🎉

Your trust score has increased. Keep up the great work!'''
        )
        
        logger.info(f"Payment confirmation sent to {phone[-4:]}****, SID: {message.sid}")
        return {
            'success': True,
            'channel': 'whatsapp',
            'message_sid': message.sid,
            'mock': False
        }
        
    except Exception as e:
        logger.error(f"Payment confirmation failed for {phone}: {str(e)}")
        return {'success': False, 'error': str(e)}


async def send_late_payment_alert(phone: str, member_name: str, group_name: str, amount: float, days_late: int) -> Dict[str, Any]:
    """
    Send late payment alert via WhatsApp
    """
    if not ENABLE_REAL_NOTIFICATIONS or not is_twilio_configured():
        logger.info(f"[MOCK] Late payment alert to {phone}: {group_name} - R{amount} ({days_late} days late)")
        return {'success': True, 'mock': True, 'channel': 'whatsapp'}
    
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        formatted_phone = format_phone_number(phone)
        
        message = client.messages.create(
            from_=TWILIO_WHATSAPP_NUMBER,
            to=f'whatsapp:{formatted_phone}',
            body=f'''⚠️ *Urgent: Payment Overdue*

Hi {member_name},

Your *{group_name}* contribution of *R{amount:.2f}* is now *{days_late} days overdue*.

Please make your payment as soon as possible to avoid affecting your trust score.

Need help? Contact your treasurer through the Clubvel app.'''
        )
        
        logger.info(f"Late payment alert sent to {phone[-4:]}****, SID: {message.sid}")
        return {
            'success': True,
            'channel': 'whatsapp',
            'message_sid': message.sid,
            'mock': False
        }
        
    except Exception as e:
        logger.error(f"Late payment alert failed for {phone}: {str(e)}")
        return {'success': False, 'error': str(e)}


def get_notification_status() -> Dict[str, Any]:
    """Get current notification service status"""
    return {
        'twilio_configured': is_twilio_configured(),
        'real_notifications_enabled': ENABLE_REAL_NOTIFICATIONS,
        'whatsapp_number': TWILIO_WHATSAPP_NUMBER if is_twilio_configured() else None,
        'sms_number': TWILIO_PHONE_NUMBER if is_twilio_configured() else None,
        'mode': 'live' if ENABLE_REAL_NOTIFICATIONS and is_twilio_configured() else 'mock',
        'mock_otp': '1234' if not ENABLE_REAL_NOTIFICATIONS else None
    }
