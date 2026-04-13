# Clubvel Backend

FastAPI backend for Clubvel - South African Stokvel Management Platform

## Deploy to Railway

1. Fork this repository or push to GitHub
2. Go to [Railway](https://railway.app)
3. Create new project → Deploy from GitHub repo
4. Select the `/backend` folder
5. Add these environment variables in Railway:

```
MONGO_URL=mongodb+srv://kennchabeleng_db_user:AQD98gTS%26%26@cluster0.c7nzonq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
DB_NAME=clubvel
JWT_SECRET_KEY=1fqX0_JthkMeamm5gL98dOq9Gu85CNY3zBxBFnR9ITd-TYBHmKBZZKvzSwzQs3r6kgUKXGuNUDn3Q1shtI8v-Q
FIELD_ENCRYPTION_KEY=_yWsZpdfBasaMbjxBIJ4eAQLRlWaQjw6RDxL4vsdZDw
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
