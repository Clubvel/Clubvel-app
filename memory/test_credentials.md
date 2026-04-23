# Clubvel Test Credentials

## Test User - Multi-Role (Member + Admin)
- Phone: +27111333444
- Password: Test123!
- Roles: member, treasurer
- Has created club: "Test Multi Role Club"

## Original User Phone (for deletion testing)
- Phone: +27665050720 (DELETED from database)
- Can be used for fresh registration

## Mock OTP
- All environments use mock OTP: **1234**
- Real SMS/WhatsApp OTP is enabled on production (Railway deployment)

## Notes
- Same phone number can have both member and admin roles
- User can be admin in one club and member in another
- Login returns `has_multiple_roles: true` when user has both roles
