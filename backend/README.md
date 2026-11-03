# Clubvel Backend

FastAPI backend for Clubvel - South African Stokvel Management Platform

## Deployment reference

For the recovery/staging review, follow [STAGING_AUTH_PREFLIGHT.md](STAGING_AUTH_PREFLIGHT.md) first. Do not create a new project, push, deploy or run these examples until staging isolation and the existing keys have been verified.

### Existing generic deployment instructions

1. Fork this repository or push to GitHub
2. Go to [Railway](https://railway.app)
3. Create new project → Deploy from GitHub repo
4. Select the `/backend` folder
5. Add these environment variables in Railway:

```
MONGO_URL=mongodb+srv://<database-user>:<database-password>@<verified-staging-host>/<staging-database>
DB_NAME=clubvel
JWT_SECRET_KEY=<existing-private-staging-signing-key>
FIELD_ENCRYPTION_KEY=<existing-private-staging-encryption-key-do-not-rotate-blindly>
PRODUCTION_MODE=true
ENABLE_REAL_NOTIFICATIONS=false
ENABLE_BANK_FEED=false
```

6. Railway will auto-detect Python and deploy!

## API Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/member/dashboard/{user_id}` - Member dashboard
- `GET /api/treasurer/dashboard/{user_id}` - Treasurer dashboard
- `POST /api/contributions/upload-proof` - Upload payment proof
- `POST /api/treasurer/confirm-payment` - Confirm payment

## Local Development

```bash
pip install -r requirements.txt
uvicorn server:app --reload --port 8001
```
