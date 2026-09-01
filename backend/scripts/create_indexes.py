"""
Simple index migration script to create recommended MongoDB indexes for performance.
Run this once against your production or staging database after deploying the hardening changes.

Usage:
  python backend/scripts/create_indexes.py

Make sure MONGO_URL and DB_NAME environment variables are set in the environment where you run this.
"""
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
import os

async def create_indexes():
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'clubvel')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("Creating indexes...")
    await db.users.create_index([('phone_number', 1)], unique=True)
    await db.users.create_index([('id', 1)], unique=True)
    await db.members.create_index([('group_id', 1)])
    await db.members.create_index([('user_id', 1)])
    await db.contributions.create_index([('member_id', 1)])
    await db.contributions.create_index([('group_id', 1)])
    await db.groups.create_index([('treasurer_user_id', 1)])

    print("Indexes created")
    client.close()

if __name__ == '__main__':
    asyncio.run(create_indexes())
