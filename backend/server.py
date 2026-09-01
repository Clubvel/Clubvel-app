@
-app.include_router(api_router)
+@
+# ------------------- AUTH-PROTECTED WRAPPERS (SAFE ROLLOUT) -------------------
+# These wrappers require an authenticated user (get_current_user) and call the
+# existing implementations that still accept user_id. This provides a non-breaking
+# migration path: new clients should call the /me endpoints while old endpoints
+# remain available for a release window.
+
+
+@api_router.get("/member/dashboard/me")
+async def get_member_dashboard_me(current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper for member dashboard"""
+    return await get_member_dashboard(current_user['id'])
+
+
+@api_router.get("/member/clubs/me")
+async def get_member_clubs_me(current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper to list clubs for the current member"""
+    return await get_member_clubs(current_user['id'])
+
+
+@api_router.get("/member/payout-schedule/me")
+async def get_member_payout_schedule_me(current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper to get payout schedule for the current member"""
+    return await get_member_payout_schedule(current_user['id'])
+
+
+@api_router.get("/member/club/{group_id}/me")
+async def get_member_club_details_me(group_id: str, current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper to get a member's club details"""
+    return await get_member_club_details(group_id, current_user['id'])
+
+
+@api_router.post("/contributions/upload-proof/me")
+async def upload_proof_of_payment_me(proof_data: ProofUpload, current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper that forces the uploader to be the authenticated user"""
+    # overwrite the user_id with the authenticated user's id to avoid impersonation
+    proof_data.user_id = current_user['id']
+    return await upload_proof_of_payment(proof_data)
+
+
+@api_router.get("/treasurer/dashboard/me")
+async def get_treasurer_dashboard_me(current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper for treasurer dashboard"""
+    return await get_treasurer_dashboard(current_user['id'])
+
+
+@api_router.post("/treasurer/confirm-payment/me")
+async def confirm_payment_me(confirm_data: ConfirmPayment, current_user: dict = Depends(get_current_user)):
+    """Authenticated treasurer confirm payment wrapper.
+    This ignores the caller-supplied treasurer_id and uses the authenticated user.
+    """
+    confirm_data.treasurer_id = current_user['id']
+    return await confirm_payment(confirm_data)
+
+
+@api_router.post("/treasurer/invite-member/me")
+async def invite_member_me(request: InviteMemberRequest, current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper for inviting members: ensures caller is the treasurer."""
+    # Ensure the invited_by is set to the authenticated user
+    request.invited_by = current_user['id']
+    return await invite_member(request)
+
+
+@api_router.get("/groups/{group_id}/me")
+async def get_group_details_me(group_id: str, current_user: dict = Depends(get_current_user)):
+    """Authenticated wrapper for group details that returns sensitive fields only to admins/treasurers."""
+    # Reuse existing get_group_details but force user_id to the authenticated user.
+    return await get_group_details(group_id, current_user['id'])
+
+
+# Small protected test endpoint to validate auth behavior (useful for CI/smoke tests)
+@api_router.get("/auth/test-protected")
+async def auth_test_protected(current_user: dict = Depends(get_current_user)):
+    return {"user_id": current_user['id'], "message": "auth ok"}
+
+
+app.include_router(api_router)
