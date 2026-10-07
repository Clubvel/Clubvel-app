"""Read-only monthly reporting. No bank balances or reconstructed month-end liabilities."""
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from zoneinfo import ZoneInfo

REPORT_TIMEZONE = ZoneInfo('Africa/Johannesburg')


def cents(value):
    if isinstance(value, bool):
        raise ValueError('Invalid financial amount')  # noqa: TRY004 - Report validation uses one fail-closed error boundary.
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number < 0:
            raise ValueError('Invalid financial amount')
        return int((number * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except (InvalidOperation, TypeError, OverflowError) as error:
        raise ValueError('Invalid financial amount') from error


def calendar_date(value):
    # Payout and scheduled dates are calendar dates, not UTC event timestamps.
    try:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return None


def event_date(value):
    try:
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=UTC)  # Existing submitted/reviewed timestamps are naive UTC.
        return moment.astimezone(REPORT_TIMEZONE).date()
    except (ValueError, TypeError, OverflowError):
        return None


def event_timestamp(value):
    if value is None:
        return None
    try:
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return (moment.replace(tzinfo=UTC) if moment.tzinfo is None else moment.astimezone(UTC)).isoformat()
    except (ValueError, TypeError):
        return None


def monthly_report(group, contributions, claims, memberships, users, year, month, outstanding, now=None):
    """All summaries derive from returned rows. Caller supplies existing outstanding rules."""
    if not 1 <= year <= 9999 or not 1 <= month <= 12:
        raise ValueError('Invalid report period')
    group_id = group['id']
    warnings = []
    members = {m['id']: m for m in memberships if m.get('group_id') == group_id}
    people = {u['id']: u for u in users}

    def warn(code, record_id, message):
        warning = {'code': code, 'record_id': record_id, 'message': message}
        if warning not in warnings:
            warnings.append(warning)

    def identity(record):
        member = members.get(record.get('member_id'))
        person = people.get(member.get('user_id')) if member else None
        name = (person or {}).get('full_name') or (member or {}).get('anonymized_name')
        if not name:
            warn('historical_identity_unavailable', record.get('id'), 'Historical member identity unavailable; the financial record is retained.')
        return {'member_id': record.get('member_id'), 'member_name': name or 'Former / unknown member'}

    def in_period(day):
        return day is not None and (day.year, day.month) == (year, month)

    rows = []
    seen = set()
    for record in contributions:
        if record.get('group_id') != group_id or (record.get('year'), record.get('month')) != (year, month):
            continue
        record_id = record.get('id')
        if not record_id or record_id in seen:
            raise ValueError('Contribution identifiers are missing or duplicated; totals cannot be reported safely')
        seen.add(record_id)
        due, paid = cents(record.get('amount_due')), cents(record.get('amount_paid', 0))
        balance = outstanding(record)
        if balance is None:
            raise ValueError('Contribution balance cannot be reported safely')
        remaining = cents(balance)
        status = record.get('contribution_status')
        if status not in {'pending', 'due', 'late', 'proof_uploaded', 'confirmed', 'paid', 'excused'}:
            raise ValueError('Contribution status cannot be reported safely')
        confirmed = paid if status in {'confirmed', 'paid'} else 0
        pending = status == 'proof_uploaded' and record.get('proof_review_status') in (None, 'pending') and remaining > 0
        if confirmed and not record.get('confirmation_date'):
            warn('confirmation_date_unavailable', record_id, 'Contribution confirmation date unavailable; confirmed obligation remains included.')
        if confirmed:
            warn('receipt_date_unavailable', record_id, 'Contribution upload/payment metadata does not establish an actual bank receipt date. This is an obligation report, not a cash report.')
        if paid and status not in {'confirmed', 'paid', 'excused'}:
            warn('unconfirmed_recorded_payment', record_id, 'Recorded amount paid affects the existing outstanding rule but is not counted as confirmed.')
        if status in {'confirmed', 'paid'} and paid < due:
            warn('settled_amount_mismatch', record_id, 'Settled status has less recorded payment than the obligation; existing settled-status rules are preserved.')
        rows.append({'id': record_id, **identity(record), 'amount_due': due / 100,
                     'expected': 0 if status == 'excused' else due / 100,
                     'confirmed': confirmed / 100, 'outstanding': remaining / 100,
                     'awaiting_review': remaining / 100 if pending else 0, 'status': status,
                     'proof_review_status': record.get('proof_review_status'),
                     'confirmation_date': event_timestamp(record.get('confirmation_date'))})

    submitted, approved, payouts, commitments, undated = [], [], [], [], []
    claim_ids = set()
    for claim in claims:
        if claim.get('group_id') != group_id:
            continue
        claim_id = claim.get('id')
        if not claim_id or claim_id in claim_ids:
            raise ValueError('Claim identifiers are missing or duplicated; totals cannot be reported safely')
        claim_ids.add(claim_id)
        amount = cents(claim.get('claim_amount'))
        paid = cents(0 if claim.get('actual_amount_paid') is None else claim['actual_amount_paid'])
        who = identity(claim)
        base = {'claim_id': claim_id, **who, 'claim_amount': amount / 100, 'status': claim.get('claim_status')}
        submission = event_date(claim.get('submitted_at'))
        review = event_date(claim.get('reviewed_at'))
        if in_period(submission):
            submitted.append({**base, 'submitted_at': event_timestamp(claim['submitted_at'])})
        elif submission is None:
            warn('submission_date_unavailable', claim_id, 'Claim submission date unavailable; it cannot be assigned to a month.')
            undated.append({**base, 'activity': 'submission'})
        if claim.get('claim_status') in {'approved', 'paid'}:
            if in_period(review):
                approved.append({**base, 'reviewed_at': event_timestamp(claim['reviewed_at'])})
            elif review is None:
                warn('approval_date_unavailable', claim_id, 'Approval date unavailable; current approved/paid state is not allocated to a historical month.')
                undated.append({**base, 'activity': 'approval'})
        if claim.get('claim_status') == 'approved' and amount > paid:
            scheduled = calendar_date(claim.get('scheduled_claim_date'))
            if claim.get('scheduled_claim_date') and scheduled is None:
                warn('scheduled_date_invalid', claim_id, 'Scheduled payout date is invalid.')
            commitments.append({**base, 'scheduled_claim_date': scheduled.isoformat() if scheduled else None,
                                'actual_amount_paid': paid / 100, 'remaining': (amount - paid) / 100})
        if paid > amount or (claim.get('claim_status') == 'paid' and paid < amount):
            warn('claim_payment_state_mismatch', claim_id, 'Claim payment totals and current state are inconsistent; no historical liability is inferred.')
        ledger_total, payment_ids = 0, set()
        for entry in claim.get('payout_payments') or []:
            entry_id = entry.get('id')
            if not entry_id or entry_id in payment_ids:
                raise ValueError('Payout payment identifiers are missing or duplicated; totals cannot be reported safely')
            payment_ids.add(entry_id)
            incremental = cents(entry.get('amount'))
            ledger_total += incremental
            day = calendar_date(entry.get('actual_payment_date'))
            row = {'id': entry_id, **base, 'amount': incremental / 100,
                   'actual_payment_date': day.isoformat() if day else None,
                   'recorded_at': event_timestamp(entry.get('recorded_at'))}
            if in_period(day):
                payouts.append(row)
            elif day is None:
                warn('payout_date_unavailable', claim_id, 'A recorded payout has no valid actual payment date; its amount is retained as unallocated activity.')
                undated.append({**row, 'activity': 'payout'})
        if ledger_total != paid:
            warn('payout_history_incomplete', claim_id, 'Cumulative paid amount differs from the available payment history. Missing events cannot be allocated to a month.')

    def total(records, key):
        return sum(cents(row[key]) for row in records) / 100

    return {
        'schema_version': 1, 'club': {'id': group_id, 'name': group['group_name']},
        'period': {'year': year, 'month': month, 'timezone': REPORT_TIMEZONE.key},
        'generated_at': (now or datetime.now(UTC)).isoformat(),
        'basis': 'Recorded obligation month; claim events in Africa/Johannesburg; payouts by actual calendar payment date. Confirmation and commitments reflect current recorded state, not historical month-end cash or liability.',
        'summary': {'expected': total(rows, 'expected'), 'confirmed': total(rows, 'confirmed'),
                    'outstanding': total(rows, 'outstanding'), 'awaiting_review': total(rows, 'awaiting_review'),
                    'claims_submitted_count': len(submitted), 'claims_submitted_amount': total(submitted, 'claim_amount'),
                    'claims_approved_count': len(approved), 'claims_approved_amount': total(approved, 'claim_amount'),
                    'actual_payouts': total(payouts, 'amount'), 'current_commitments': total(commitments, 'remaining')},
        'contributions': rows, 'claim_activity': {'submitted': submitted, 'approved': approved},
        'payout_payments': payouts, 'current_commitments': commitments,
        'unallocated_activity': undated, 'warnings': warnings,
        'empty_period': not (rows or submitted or approved or payouts),
    }
