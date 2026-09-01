I will apply authentication enforcement notes and commands here.

Next steps to enforce get_current_user across routes:

1. Replace route signatures that accept user_id as a path or query parameter and which return user-specific data, with the dependency:

   Example change:

   Before:
   @api_router.get("/member/dashboard/{user_id}")
   async def get_member_dashboard(user_id: str):
       ...

   After:
   @api_router.get("/member/dashboard/me")
   async def get_member_dashboard_me(current_user: dict = Depends(get_current_user)):
       return await get_member_dashboard(current_user['id'])

2. For endpoints that accept user_id for authorization checks (e.g., admin actions), ensure the current_user has the expected role and/or id matches the target user. Use get_current_user and then verify roles.

3. Where refactoring helper functions (like get_member_dashboard) depend on user_id, keep their signature but add thin wrappers with Depends(get_current_user) to avoid breaking other code.

DB index recommendations (commands to run once connection is available):

# Ensure users are quickly found by phone_number and id
db.users.createIndex({ phone_number: 1 }, { unique: true })
db.users.createIndex({ id: 1 }, { unique: true })

# Members and contributions lookup
db.members.createIndex({ group_id: 1 })
db.members.createIndex({ user_id: 1 })
db.contributions.createIndex({ member_id: 1 })
db.contributions.createIndex({ group_id: 1 })

auto-migration: add these indexes via a small migration script in backend/scripts/create_indexes.py
