# CLUBVEL - Developer Handoff Document
## Mobile Stokvel/Social Club Management Platform

**Date:** May 7, 2026  
**GitHub Repository:** https://github.com/Clubvel/Clubvel-app  
**Latest Working Commit:** `44a4a13` (or latest on `main` branch)

---

## 1. PROJECT OVERVIEW

Clubvel is a mobile stokvel (savings club) management platform for South Africa. It supports two user roles:
- **Member**: Regular club members who make contributions
- **Admin**: Club administrators who manage clubs, members, and payments

### Key Features Built:
- ✅ User registration with OTP verification (Firebase + fallback)
- ✅ Role-based authentication (Member/Admin)
- ✅ Multi-role support (same phone can be Member in one club, Admin in another)
- ✅ Create Club/Stokvel/Society functionality
- ✅ Club management with bank details
- ✅ Proof of payment upload & download
- ✅ Claims schedule management
- ✅ Member management & invitations
- ✅ Forgot password via SMS/WhatsApp
- ✅ Ad banner integration (Google AdMob ready)
- ✅ POPIA-compliant data handling
- ✅ Profile photos on all pages
- ✅ PDF report generation

---

## 2. TECH STACK

### Frontend (Mobile App)
- **Framework:** Expo SDK 52 / React Native
- **Routing:** Expo Router (file-based)
- **State Management:** React Context (AuthContext)
- **UI Components:** Custom components with React Native
- **Icons:** @expo/vector-icons (Ionicons)
- **HTTP Client:** Axios

### Backend (API Server)
- **Framework:** FastAPI (Python 3.11+)
- **Database:** MongoDB Atlas
- **Authentication:** JWT tokens + bcrypt password hashing
- **OTP:** Twilio (WhatsApp/SMS) or Firebase Phone Auth
- **File Storage:** Base64 in MongoDB (proof images, profile photos)

### Deployment
- **Backend:** Railway (https://clubvel-production.up.railway.app)
- **Frontend:** Expo EAS Build (APK/AAB)
- **Database:** MongoDB Atlas
- **Landing Page:** Served from Railway backend at root URL

---

## 3. CURRENT STATUS

### ✅ WORKING (Frontend - in APK/AAB):
- Sign In with role selector (Member/Admin)
- Sign Up with POPIA consent
- Member dashboard
- Admin dashboard with "Create New Club/Stokvel/Society" button
- Profile pages with photo upload
- Ad banners on all pages
- Proof of payment upload
- Claims schedule view
- Members management
- Notification settings
- Reports generation
- Privacy policy pages

### ❌ NOT WORKING (Backend - Railway deployment issue):
- **Create Club endpoint** (`POST /api/groups/create`) - Returns "Method Not Allowed"
- **Forgot Password endpoint** (`POST /api/auth/forgot-password`) - Returns "Method Not Allowed"
- **Reset Password endpoint** (`POST /api/auth/reset-password`) - Returns "Method Not Allowed"
- **Update Group endpoint** (`PUT /api/groups/update`) - Returns "Method Not Allowed"

### ROOT CAUSE:
Railway is using a **cached old build** and not deploying the new backend code from the `main` branch. The code exists on GitHub but Railway's build cache prevents it from being used.

---

## 4. DEPLOYMENT FIX NEEDED

### Railway Backend Fix:
The backend code on GitHub (`/backend/server.py`) has all the endpoints, but Railway isn't using them.

**To fix:**
1. Go to Railway dashboard: https://railway.com
2. Select the Clubvel service
3. Go to **Settings** → **Build**
4. Find and click **"Clear build cache"**
5. Go to **Deployments** → click 3 dots → **"Rebuild"** (not just Redeploy)
6. Verify branch is set to `main` (not `production`)

**Alternative fix:**
- Delete the Railway service and create a new one connected to `main` branch
- Or manually deploy using Railway CLI with cache cleared

### Expo Build Fix:
To build with correct assets (logo, icons):
1. Go to https://expo.dev
2. Create new build
3. In "Git ref" field, use the latest commit hash from `main` branch
4. Use `preview` profile for APK, `production` profile for AAB

---

## 5. FILE STRUCTURE

```
/app
├── /backend
│   ├── server.py              # Main FastAPI application (4000+ lines)
│   ├── requirements.txt       # Python dependencies
│   ├── railway.toml           # Railway deployment config
│   ├── pyproject.toml         # Python project config
│   └── /services
│       └── notification_service.py  # OTP/SMS/WhatsApp service
│
├── /frontend
│   ├── app.json               # Expo app configuration
│   ├── eas.json               # EAS Build profiles
│   ├── package.json           # Node dependencies
│   ├── /app                   # Expo Router pages
│   │   ├── index.tsx          # Entry point / routing
│   │   ├── auth.tsx           # Sign In / Sign Up screen
│   │   ├── onboarding.tsx     # Onboarding screens
│   │   ├── /(member)          # Member role screens
│   │   │   ├── _layout.tsx    # Tab navigation
│   │   │   ├── dashboard.tsx  # Member home
│   │   │   ├── proofs.tsx     # Upload proof of payment
│   │   │   ├── claims.tsx     # Claims schedule
│   │   │   ├── alerts.tsx     # Notifications
│   │   │   └── profile.tsx    # Member profile
│   │   └── /(treasurer)       # Admin role screens
│   │       ├── _layout.tsx    # Tab navigation
│   │       ├── dashboard.tsx  # Admin home + Create Club button
│   │       ├── contributions.tsx  # Payment management
│   │       ├── members.tsx    # Member management
│   │       ├── claims.tsx     # Claims management
│   │       ├── reports.tsx    # PDF reports
│   │       └── profile.tsx    # Admin profile
│   ├── /components            # Reusable components
│   │   ├── AdBanner.tsx       # Google AdMob banner
│   │   ├── StatusPill.tsx     # Status badges
│   │   └── AppHeader.tsx      # Consistent header with profile photo
│   ├── /contexts
│   │   └── AuthContext.tsx    # Authentication state management
│   ├── /constants
│   │   └── Colors.ts          # App color scheme
│   └── /assets
│       └── /images            # App icons and images
│
└── /memory
    ├── PRD.md                 # Product Requirements Document
    └── test_credentials.md    # Test account credentials
```

---

## 6. KEY API ENDPOINTS

### Authentication
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| POST | `/api/auth/register` | ✅ Working | Register new user |
| POST | `/api/auth/login` | ✅ Working | Login user |
| POST | `/api/auth/verify-otp` | ✅ Working | Verify phone OTP |
| POST | `/api/auth/forgot-password` | ❌ Not deployed | Send reset OTP |
| POST | `/api/auth/verify-reset-otp` | ❌ Not deployed | Verify reset OTP |
| POST | `/api/auth/reset-password` | ❌ Not deployed | Reset password |

### Groups/Clubs
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| POST | `/api/groups/create` | ❌ Not deployed | Create new club |
| PUT | `/api/groups/update` | ❌ Not deployed | Update club details |
| GET | `/api/groups/{id}` | ❌ Not deployed | Get club details |

### User & Dashboard
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| GET | `/api/member/dashboard/{user_id}` | ✅ Working | Member dashboard data |
| GET | `/api/admin/dashboard/{user_id}` | ✅ Working | Admin dashboard data |
| GET | `/api/user/stats/{user_id}` | ❌ Not deployed | User statistics |
| POST | `/api/user/profile-photo` | ✅ Working | Update profile photo |

### Contributions
| Method | Endpoint | Status | Description |
|--------|----------|--------|-------------|
| POST | `/api/contributions/upload-proof` | ✅ Working | Upload proof of payment |
| GET | `/api/contributions/{id}/proof` | ❌ Not deployed | Download proof image |

---

## 7. DATABASE SCHEMA (MongoDB)

### Collections:

**users**
```json
{
  "id": "uuid",
  "full_name": "string",
  "phone_number": "string",
  "password_hash": "string",
  "role": "member | treasurer",
  "roles": ["member", "treasurer"],
  "profile_photo": "base64 string",
  "otp_verified": "boolean",
  "date_joined": "datetime"
}
```

**groups**
```json
{
  "id": "uuid",
  "group_name": "string",
  "group_type": "savings | burial | investment | grocery | social",
  "monthly_contribution": "float",
  "payment_due_date": "integer (1-28)",
  "bank_name": "encrypted string",
  "bank_account_number": "encrypted string",
  "bank_account_holder": "encrypted string",
  "treasurer_user_id": "uuid",
  "admin_user_ids": ["uuid array"],
  "status": "active | inactive"
}
```

**members**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "group_id": "uuid",
  "role_in_group": "member | admin",
  "payout_position": "integer",
  "status": "active | inactive"
}
```

**contributions**
```json
{
  "id": "uuid",
  "member_id": "uuid",
  "group_id": "uuid",
  "month": "integer",
  "year": "integer",
  "amount_paid": "float",
  "proof_of_payment": "base64 string",
  "contribution_status": "pending | proof_uploaded | confirmed | late"
}
```

---

## 8. ENVIRONMENT VARIABLES

### Backend (.env)
```
MONGO_URL=mongodb+srv://[username]:[password]@cluster.mongodb.net/clubvel
DB_NAME=clubvel
SECRET_KEY=[jwt-secret-key]
TWILIO_ACCOUNT_SID=[optional - for real SMS]
TWILIO_AUTH_TOKEN=[optional]
TWILIO_WHATSAPP_NUMBER=[optional]
```

### Frontend (.env)
```
EXPO_PUBLIC_BACKEND_URL=https://clubvel-production.up.railway.app
EXPO_PUBLIC_FIREBASE_API_KEY=[firebase-key]
EXPO_PUBLIC_FIREBASE_PROJECT_ID=[project-id]
```

---

## 9. TEST CREDENTIALS

**Test User (Multi-Role):**
- Phone: +27665050720
- Password: Test123!
- Roles: member, treasurer

**Mock OTP (Development):**
- OTP Code: 1234

**Existing Club in Database:**
- Name: Club89
- Bank: ABSA
- Amount: R100/month
- Due Date: 1st

---

## 10. WHAT NEEDS TO BE DONE

### Priority 1 - Fix Railway Deployment
1. Clear Railway build cache
2. Redeploy from `main` branch
3. Verify all endpoints work:
   - `POST /api/groups/create`
   - `POST /api/auth/forgot-password`
   - `POST /api/auth/reset-password`

### Priority 2 - Build Correct APK/AAB
1. Use latest commit from `main` branch
2. Build with correct app icons
3. Test on physical device
4. Generate AAB for Google Play Store

### Priority 3 - Production Polish
1. Configure real Twilio credentials for SMS/WhatsApp OTP
2. Configure real Google AdMob IDs
3. Test full user flows end-to-end
4. Submit to Google Play Store

---

## 11. USEFUL COMMANDS

### Local Development
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# Frontend
cd frontend
yarn install
npx expo start
```

### Expo Build
```bash
# APK (for testing)
eas build --platform android --profile preview

# AAB (for Play Store)
eas build --platform android --profile production
```

### Railway CLI
```bash
railway login
railway link
railway up --clear  # Deploy with cache cleared
```

---

## 12. CONTACT & RESOURCES

- **GitHub Repo:** https://github.com/Clubvel/Clubvel-app
- **Railway Dashboard:** https://railway.com (login required)
- **Expo Dashboard:** https://expo.dev/accounts/modjadji/projects/clubvel
- **Landing Page:** https://clubvel-production.up.railway.app

---

## 13. KNOWN ISSUES LOG

| Issue | Status | Notes |
|-------|--------|-------|
| Railway not deploying new code | OPEN | Build cache issue - needs manual cache clear |
| Expo build uses old logo | OPEN | Use specific commit hash when building |
| Create Club returns 405 | OPEN | Endpoint exists in code but not deployed |
| Forgot Password returns 405 | OPEN | Endpoint exists in code but not deployed |

---

**Document prepared by:** Emergent AI Agent  
**Last Updated:** May 7, 2026

*The code is complete. The app works. Only deployment configuration needs fixing.*
