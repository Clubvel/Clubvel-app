# MongoDB Atlas Setup Guide for Clubvel

## Overview
This guide helps you set up MongoDB Atlas for production deployment of the Clubvel app.

## Step 1: Create MongoDB Atlas Account

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Click "Try Free" and create an account
3. Verify your email address

## Step 2: Create a Cluster

1. After logging in, click "Build a Database"
2. Choose a tier:
   - **FREE (M0)** - Good for testing (512MB storage)
   - **M10 (~$57/month)** - Recommended for production
3. Choose a cloud provider (AWS, Google Cloud, or Azure)
4. Select a region close to South Africa:
   - AWS: `eu-west-1` (Ireland) or `af-south-1` (Cape Town if available)
   - Google Cloud: `europe-west1` (Belgium)
5. Name your cluster: `clubvel-production`
6. Click "Create Cluster" (takes 1-3 minutes)

## Step 3: Set Up Database Access

1. Go to "Database Access" in the left menu
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Create credentials:
   - Username: `clubvel_admin`
   - Password: Generate a strong password (save this!)
5. Set privileges: "Read and write to any database"
6. Click "Add User"

## Step 4: Set Up Network Access

1. Go to "Network Access" in the left menu
2. Click "Add IP Address"
3. For development: Click "Allow Access from Anywhere" (0.0.0.0/0)
4. For production: Add your server's specific IP address
5. Click "Confirm"

## Step 5: Get Your Connection String

1. Go to "Database" → "Connect"
2. Choose "Connect your application"
3. Select "Python" and version "3.6 or later"
4. Copy the connection string, it looks like:
   ```
   mongodb+srv://clubvel_admin:<password>@clubvel-production.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password

## Step 6: Update Clubvel Backend

Update your `/app/backend/.env` file:

```env
# Replace the local MongoDB URL with Atlas URL
MONGO_URL="mongodb+srv://clubvel_admin:YOUR_PASSWORD@clubvel-production.xxxxx.mongodb.net/?retryWrites=true&w=majority"
DB_NAME="clubvel_production"
```

## Step 7: Migrate Existing Data (Optional)

If you have existing data in local MongoDB, you can export and import:

```bash
# Export from local
mongodump --uri="mongodb://localhost:27017" --db=test_database --out=./backup

# Import to Atlas
mongorestore --uri="mongodb+srv://clubvel_admin:PASSWORD@cluster.mongodb.net" --db=clubvel_production ./backup/test_database
```

## Step 8: Verify Connection

Test the connection:

```bash
cd /app/backend
python -c "from motor.motor_asyncio import AsyncIOMotorClient; import os; from dotenv import load_dotenv; load_dotenv(); client = AsyncIOMotorClient(os.environ['MONGO_URL']); print('Connected successfully!')"
```

## Security Best Practices

1. **Never commit credentials** - Keep MONGO_URL in .env file only
2. **Use specific IP whitelist** in production (not 0.0.0.0/0)
3. **Enable MongoDB Atlas alerts** for unusual activity
4. **Regular backups** - Atlas provides automated backups on paid tiers
5. **Use TLS/SSL** - Atlas connections are encrypted by default

## Cost Estimation

| Tier | Storage | RAM | Cost |
|------|---------|-----|------|
| M0 (Free) | 512MB | Shared | Free |
| M2 | 2GB | Shared | ~$9/month |
| M5 | 5GB | Shared | ~$25/month |
| M10 | 10GB | 2GB | ~$57/month |

For a stokvel app with ~1000 users, the M2 tier should be sufficient to start.

## Support

If you need help with MongoDB Atlas setup:
- MongoDB Documentation: https://docs.atlas.mongodb.com/
- MongoDB Community: https://community.mongodb.com/
- Clubvel Support: support@clubvel.co.za
