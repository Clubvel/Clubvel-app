# Environment variables required by the backend

This file lists the environment variables the backend expects and explains them briefly.

Required (production)
- JWT_SECRET_KEY -- strong secret used to sign JWT tokens. Must be unique and kept secret.
- FIELD_ENCRYPTION_KEY -- master key for field-level encryption (used to encrypt bank account numbers). Use a strong random key or a KMS-managed key.
- MONGO_URL -- MongoDB connection string (e.g., mongodb+srv://user:pass@cluster.mongodb.net)
- DB_NAME -- database name (defaults to 'clubvel' if not set)
- ALLOWED_ORIGINS -- comma-separated list of allowed origins for CORS (e.g., https://app.clubvel.co.za,http://localhost:19006)
- PRODUCTION_MODE -- "true" or "false". When true, the app enforces stricter checks (no mock OTPs, requires secrets)
- NOTIFICATION_MODE -- "mock" or "real". When in production, this MUST NOT be 'mock'.

Local development
- You can run locally with PRODUCTION_MODE=false and omit some vars for convenience, but avoid committing real credentials to the repo.

Operational notes
- Store secrets in a secure secret manager (Railway/GCP Secret Manager/AWS Secrets Manager/Vault). Do not check them into source control.
- For production, set ALLOWED_ORIGINS explicitly. The app will fail to start if PRODUCTION_MODE=true and ALLOWED_ORIGINS is empty.
