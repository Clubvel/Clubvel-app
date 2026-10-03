"""Security and workflow tests for member Claims."""
import ast
import math
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace as Obj
from typing import Optional


SOURCE = Path(__file__).resolve().parents[1] / "backend/server.py"


class HTTPError(Exception):
    def __init__(self, status_code, detail):
        self.status_code = status_code
        self.detail = detail


class Cursor:
    def __init__(self, records):
        self.records = list(records)

    async def to_list(self, _length):
        return list(self.records)


class UpdateResult:
    def __init__(self, modified_count):
        self.modified_count = modified_count


def matches(record, query):
    for key, expected in query.items():
        actual = record.get(key)

        if isinstance(expected, dict) and "$in" in expected:
            if actual not in expected["$in"]:
                return False
        elif actual != expected:
            return False

    return True


class Collection:
    def __init__(self, records=None):
        self.records = list(records or [])

    async def find_one(self, query):
        return next(
            (record for record in self.records if matches(record, query)),
            None
        )

    def find(self, query):
        return Cursor(
            record for record in self.records if matches(record, query)
        )

    async def insert_one(self, record):
        self.records.append(dict(record))
        return Obj(inserted_id=record.get("id"))

    async def update_one(self, query, update):
        for record in self.records:
            if matches(record, query):
                record.update(update.get("$set", {}))
                return UpdateResult(1)

        return UpdateResult(0)


class Claim:
    def __init__(
        self,
        member_id,
        group_id,
        claim_amount,
        claim_status="upcoming",
        reason=None,
        submitted_at=None,
        **kwargs
    ):
        self.id = "new-claim"
        self.member_id = member_id
        self.group_id = group_id
        self.claim_amount = claim_amount
        self.claim_status = claim_status
        self.reason = reason
        self.submitted_at = submitted_at

    def dict(self):
        return {
            "id": self.id,
            "member_id": self.member_id,
            "group_id": self.group_id,
            "claim_amount": self.claim_amount,
            "claim_status": self.claim_status,
            "reason": self.reason,
            "submitted_at": self.submitted_at,
            "scheduled_claim_date": None,
            "actual_amount_paid": None,
            "rejection_reason": None,
        }


def environment():
    tree = ast.parse(SOURCE.read_text(encoding="utf-8-sig"))

    names = {
        "submit_member_claim",
        "get_member_claims",
        "get_group_claims",
        "review_group_claim",
    }

    functions = [
        node for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in names
    ]

    for node in functions:
        node.decorator_list = []

    ns = {
        "Optional": Optional,
        "Header": lambda default: default,
        "HTTPException": HTTPError,
        "ClaimSubmission": Obj,
        "ClaimReview": Obj,
        "Claim": Claim,
        "datetime": datetime,
        "math": math,
    }

    exec(
        compile(ast.Module(body=functions, type_ignores=[]), "claim-routes", "exec"),
        ns
    )

    return ns


def make_db():
    return Obj(
        users=Collection([
            {"id": "member-user", "full_name": "Member One"},
            {"id": "admin-user", "full_name": "Admin One"},
            {"id": "outsider", "full_name": "Outsider"},
        ]),
        groups=Collection([
            {
                "id": "group-a",
                "group_name": "Group A",
                "status": "active",
            },
            {
                "id": "group-b",
                "group_name": "Group B",
                "status": "active",
            },
        ]),
        members=Collection([
            {
                "id": "membership-a",
                "user_id": "member-user",
                "group_id": "group-a",
                "status": "active",
                "role_in_group": "member",
            },
            {
                "id": "admin-membership-a",
                "user_id": "admin-user",
                "group_id": "group-a",
                "status": "active",
                "role_in_group": "treasurer",
            },
        ]),
        claims=Collection(),
    )


class ClaimsWorkflowTests(unittest.IsolatedAsyncioTestCase):

    def setup_env(self, signed_in="member-user"):
        ns = environment()
        ns["db"] = make_db()

        def authenticated_user_id(_authorization):
            if signed_in is None:
                raise HTTPError(401, "Authentication required")
            return signed_in

        def require_account_owner(user_id, _authorization):
            person = authenticated_user_id(_authorization)
            if person != user_id:
                raise HTTPError(403, "You can only access your own account")
            return person

        async def verify_user_is_group_treasurer(user_id, group_id):
            group = await ns["db"].groups.find_one({
                "id": group_id,
                "status": "active",
            })
            if not group:
                raise HTTPError(404, "Group not found")

            membership = await ns["db"].members.find_one({
                "user_id": user_id,
                "group_id": group_id,
                "status": "active",
                "role_in_group": "treasurer",
            })
            if not membership:
                raise HTTPError(403, "Treasurer access required")

            return group

        ns["authenticated_user_id"] = authenticated_user_id
        ns["require_account_owner"] = require_account_owner
        ns["verify_user_is_group_treasurer"] = verify_user_is_group_treasurer

        return ns

    async def test_unauthenticated_member_cannot_submit_claim(self):
        ns = self.setup_env(signed_in=None)

        with self.assertRaises(HTTPError) as error:
            await ns["submit_member_claim"](
                Obj(group_id="group-a", claim_amount=100, reason="Travel"),
                authorization=None,
            )

        self.assertEqual(error.exception.status_code, 401)
        self.assertEqual(ns["db"].claims.records, [])

    async def test_active_member_can_submit_pending_claim(self):
        ns = self.setup_env()

        result = await ns["submit_member_claim"](
            Obj(group_id="group-a", claim_amount=125.50, reason="Travel booking"),
            authorization="Bearer synthetic",
        )

        self.assertEqual(result["status"], "pending_review")
        self.assertEqual(len(ns["db"].claims.records), 1)

        claim = ns["db"].claims.records[0]
        self.assertEqual(claim["member_id"], "membership-a")
        self.assertEqual(claim["group_id"], "group-a")
        self.assertEqual(claim["claim_amount"], 125.50)
        self.assertEqual(claim["reason"], "Travel booking")
        self.assertEqual(claim["claim_status"], "pending_review")

    async def test_member_cannot_submit_claim_to_other_group(self):
        ns = self.setup_env()

        with self.assertRaises(HTTPError) as error:
            await ns["submit_member_claim"](
                Obj(group_id="group-b", claim_amount=100, reason="Other group"),
                authorization="Bearer synthetic",
            )

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(ns["db"].claims.records, [])

    async def test_invalid_amounts_are_rejected(self):
        for amount in (0, -1, float("nan"), float("inf")):
            with self.subTest(amount=amount):
                ns = self.setup_env()

                with self.assertRaises(HTTPError) as error:
                    await ns["submit_member_claim"](
                        Obj(
                            group_id="group-a",
                            claim_amount=amount,
                            reason="Invalid amount",
                        ),
                        authorization="Bearer synthetic",
                    )

                self.assertEqual(error.exception.status_code, 422)
                self.assertEqual(ns["db"].claims.records, [])

    async def test_empty_and_overlong_reasons_are_rejected(self):
        for reason in ("   ", "x" * 1001):
            with self.subTest(reason_length=len(reason)):
                ns = self.setup_env()

                with self.assertRaises(HTTPError) as error:
                    await ns["submit_member_claim"](
                        Obj(
                            group_id="group-a",
                            claim_amount=100,
                            reason=reason,
                        ),
                        authorization="Bearer synthetic",
                    )

                self.assertEqual(error.exception.status_code, 422)
                self.assertEqual(ns["db"].claims.records, [])

    async def test_member_can_only_read_own_claims(self):
        ns = self.setup_env()

        ns["db"].claims.records = [{
            "id": "claim-a",
            "member_id": "membership-a",
            "group_id": "group-a",
            "claim_amount": 250,
            "reason": "Own claim",
            "claim_status": "pending_review",
            "submitted_at": datetime(2026, 10, 1, 10, 0),
            "scheduled_claim_date": None,
            "actual_amount_paid": None,
            "rejection_reason": None,
        }]

        result = await ns["get_member_claims"](
            "member-user",
            authorization="Bearer synthetic",
        )

        self.assertEqual(len(result["claims"]), 1)
        self.assertEqual(result["claims"][0]["claim_id"], "claim-a")

        ns = self.setup_env(signed_in="outsider")

        with self.assertRaises(HTTPError) as error:
            await ns["get_member_claims"](
                "member-user",
                authorization="Bearer synthetic",
            )

        self.assertEqual(error.exception.status_code, 403)

    async def test_non_treasurer_cannot_view_group_claims(self):
        ns = self.setup_env(signed_in="member-user")

        with self.assertRaises(HTTPError) as error:
            await ns["get_group_claims"](
                "group-a",
                authorization="Bearer synthetic",
            )

        self.assertEqual(error.exception.status_code, 403)

    async def test_treasurer_cannot_review_claim_from_other_group(self):
        ns = self.setup_env(signed_in="admin-user")

        ns["db"].claims.records = [{
            "id": "claim-b",
            "member_id": "membership-b",
            "group_id": "group-b",
            "claim_amount": 100,
            "claim_status": "pending_review",
        }]

        with self.assertRaises(HTTPError) as error:
            await ns["review_group_claim"](
                "group-b",
                "claim-b",
                Obj(action="approve", rejection_reason=None),
                authorization="Bearer synthetic",
            )

        self.assertEqual(error.exception.status_code, 403)

    async def test_rejection_requires_reason(self):
        ns = self.setup_env(signed_in="admin-user")

        ns["db"].claims.records = [{
            "id": "claim-a",
            "member_id": "membership-a",
            "group_id": "group-a",
            "claim_amount": 100,
            "claim_status": "pending_review",
        }]

        with self.assertRaises(HTTPError) as error:
            await ns["review_group_claim"](
                "group-a",
                "claim-a",
                Obj(action="reject", rejection_reason="   "),
                authorization="Bearer synthetic",
            )

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(
            ns["db"].claims.records[0]["claim_status"],
            "pending_review",
        )

    async def test_approval_does_not_mark_claim_paid(self):
        ns = self.setup_env(signed_in="admin-user")

        ns["db"].claims.records = [{
            "id": "claim-a",
            "member_id": "membership-a",
            "group_id": "group-a",
            "claim_amount": 100,
            "claim_status": "pending_review",
        }]

        result = await ns["review_group_claim"](
            "group-a",
            "claim-a",
            Obj(action="approve", rejection_reason=None),
            authorization="Bearer synthetic",
        )

        self.assertEqual(result["status"], "approved")
        self.assertEqual(
            ns["db"].claims.records[0]["claim_status"],
            "approved",
        )
        self.assertNotEqual(
            ns["db"].claims.records[0]["claim_status"],
            "paid",
        )

    async def test_claim_cannot_be_reviewed_twice(self):
        ns = self.setup_env(signed_in="admin-user")

        ns["db"].claims.records = [{
            "id": "claim-a",
            "member_id": "membership-a",
            "group_id": "group-a",
            "claim_amount": 100,
            "claim_status": "pending_review",
        }]

        await ns["review_group_claim"](
            "group-a",
            "claim-a",
            Obj(action="approve", rejection_reason=None),
            authorization="Bearer synthetic",
        )

        with self.assertRaises(HTTPError) as error:
            await ns["review_group_claim"](
                "group-a",
                "claim-a",
                Obj(action="reject", rejection_reason="Changed mind"),
                authorization="Bearer synthetic",
            )

        self.assertEqual(error.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
