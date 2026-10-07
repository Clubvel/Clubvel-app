"""Version 1 aggregate response contract. Money is integer cents or unavailable."""
from typing import Literal

from typing_extensions import TypedDict


class Club(TypedDict):
    id: str
    name: str


class Period(TypedDict):
    year: int
    month: int
    timezone: Literal['Africa/Johannesburg']


class Membership(TypedDict):
    active_memberships: int | None


class Contributions(TypedDict):
    recorded_expected_cents: int | None
    confirmed_cents: int | None
    outstanding_cents: int | None
    awaiting_review_count: int | None
    awaiting_review_cents: int | None


class Claims(TypedDict):
    submitted_count: int | None
    submitted_amount_cents: int | None
    approved_count: int | None
    approved_amount_cents: int | None


class Payouts(TypedDict):
    recorded_in_period_cents: int | None
    current_approved_remaining_cents: int | None


class Reason(TypedDict):
    code: str


class Availability(TypedDict):
    status: Literal['AVAILABLE', 'UNAVAILABLE']
    reasons: list[Reason]


class Warning(TypedDict):
    code: str
    fields: list[str]


class Basis(TypedDict):
    version: str
    definitions: dict[str, dict]
    awaiting_review_overlaps_outstanding: Literal[True]
    liability_state: Literal['current_not_historical_month_end']
    verified_bank_balance: Literal[False]
    bank_receipt_timing_used_for_period: Literal[False]


class SummaryContext(TypedDict):
    schema_version: str
    club: Club
    period: Period
    scope: Literal['club_admin']
    membership: Membership
    contributions: Contributions
    claims: Claims
    payouts: Payouts
    warnings: list[Warning]
    basis: Basis
    availability: dict[str, Availability]
