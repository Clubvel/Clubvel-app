"""Aggregate Monthly Reports facts without identities or database access.

Reports remains authoritative for calculations. This adapter adds stricter per-field
reliability: unallocated events and incomplete payout history are never reported as zero.
"""
from services.intelligence.schemas import SummaryContext
from services.monthly_reports import cents, event_date, monthly_report

CONTRIBUTION_FIELDS = (
    'contributions.recorded_expected_cents', 'contributions.confirmed_cents',
    'contributions.outstanding_cents', 'contributions.awaiting_review_count',
    'contributions.awaiting_review_cents',
)
SUBMITTED_FIELDS = ('claims.submitted_count', 'claims.submitted_amount_cents')
APPROVED_FIELDS = ('claims.approved_count', 'claims.approved_amount_cents')
PAYOUT_FIELD = 'payouts.recorded_in_period_cents'
REMAINING_FIELD = 'payouts.current_approved_remaining_cents'
CLAIM_FIELDS = (*SUBMITTED_FIELDS, *APPROVED_FIELDS, PAYOUT_FIELD, REMAINING_FIELD)

# Financial rules stay in Reports; only dependency-specific reliability differs.
REPORT_WARNINGS = {
    'confirmation_date_unavailable': ('CONFIRMATION_DATE_UNAVAILABLE', ('contributions.confirmed_cents',), False),
    'settled_amount_mismatch': ('SETTLED_AMOUNT_MISMATCH', ('contributions.confirmed_cents', 'contributions.outstanding_cents'), False),
    'submission_date_unavailable': ('SUBMISSION_DATE_UNAVAILABLE', SUBMITTED_FIELDS, True),
    'approval_date_unavailable': ('APPROVAL_DATE_UNAVAILABLE', APPROVED_FIELDS, True),
    'scheduled_date_invalid': ('SCHEDULED_DATE_INVALID', (REMAINING_FIELD,), False),
    'claim_payment_state_mismatch': ('CLAIM_PAYMENT_STATE_MISMATCH', (REMAINING_FIELD,), True),
    'payout_date_unavailable': ('PAYOUT_DATE_UNAVAILABLE', (PAYOUT_FIELD,), True),
    'payout_history_incomplete': ('INCOMPLETE_PAYOUT_HISTORY', (PAYOUT_FIELD,), True),
}


def metric_basis():
    """Machine-readable selection, units and source rules; not a bank balance."""
    definitions = {
        'membership.active_memberships': {'source': 'members', 'aggregation': 'count_records', 'status': ['active'], 'distinct_people': False, 'unit': 'count'},
        'contributions.recorded_expected_cents': {'source': 'contributions', 'aggregation': 'sum_recorded_amount_due', 'exclude_status': ['excused']},
        'contributions.confirmed_cents': {'source': 'contributions', 'aggregation': 'sum_recorded_amount_paid', 'status': ['confirmed', 'paid'], 'confirmation_timestamp_required': False, 'confirmation_warning_detection': 'absent_or_falsy_only'},
        'contributions.outstanding_cents': {'source': 'contributions', 'calculation': 'contribution_outstanding', 'settled_status': ['confirmed', 'paid', 'excused'], 'settled_result_cents': 0, 'unsettled_rule': 'round(max(0, amount_due - amount_paid), 2)'},
        'contributions.awaiting_review_count': {'source': 'contributions', 'aggregation': 'count_records', 'status': ['proof_uploaded'], 'proof_review_status': [None, 'pending'], 'requires_positive_outstanding': True, 'unit': 'count'},
        'contributions.awaiting_review_cents': {'source': 'contributions', 'aggregation': 'sum_outstanding_of_awaiting_review_records', 'predicate_same_as': 'contributions.awaiting_review_count'},
        'claims.submitted_count': {'source': 'claims', 'event': 'submitted_at', 'aggregation': 'count_records', 'unit': 'count'},
        'claims.submitted_amount_cents': {'source': 'claims', 'event': 'submitted_at', 'aggregation': 'sum_claim_amount'},
        'claims.approved_count': {'source': 'claims', 'event': 'reviewed_at', 'status': ['approved', 'paid'], 'aggregation': 'count_records', 'unit': 'count'},
        'claims.approved_amount_cents': {'source': 'claims', 'event': 'reviewed_at', 'status': ['approved', 'paid'], 'aggregation': 'sum_claim_amount'},
        PAYOUT_FIELD: {'source': 'claims.payout_payments', 'event': 'actual_payment_date', 'date_kind': 'calendar_date', 'aggregation': 'sum_individual_payment_amount', 'requires_complete_history': True},
        REMAINING_FIELD: {'source': 'claims', 'status': ['approved'], 'calculation': 'monthly_reports.current_commitments', 'selection': 'current_positive_remaining_not_selected_month'},
    }
    for field, definition in definitions.items():
        definition.setdefault('unit', 'integer_cents')
        definition['club_selection'] = 'authorized_active_group_id'
        if field != 'membership.active_memberships':
            definition['record_membership_status_filter'] = 'none_includes_former_members'
        if field.startswith('contributions.'):
            definition['selection'] = 'recorded_obligation_year_month'
            definition['confirmation_state'] = 'current_recorded_not_historical_month_end'
        elif field.startswith('claims.'):
            definition.update(selection='event_year_month', timezone='Africa/Johannesburg', naive_timestamp_timezone='UTC')
    definitions[PAYOUT_FIELD]['selection'] = 'actual_payment_calendar_year_month'
    definitions[REMAINING_FIELD]['absent_actual_amount_paid'] = 'zero_as_in_monthly_reports'
    return {'version': '1', 'definitions': definitions,
            'awaiting_review_overlaps_outstanding': True,
            'liability_state': 'current_not_historical_month_end', 'verified_bank_balance': False, 'bank_receipt_timing_used_for_period': False}


def summary_context(group, contributions, claims, active_memberships, year, month, outstanding) -> SummaryContext:
    """Uncapped authorized reads in; aggregate facts out. No I/O or persisted changes."""
    if isinstance(year, bool) or isinstance(month, bool) or not 1 <= year <= 9999 or not 1 <= month <= 12:
        raise ValueError('Invalid summary period')
    values = {field: 0 for field in ('membership.active_memberships', *CONTRIBUTION_FIELDS, *CLAIM_FIELDS)}
    availability = {field: {'status': 'AVAILABLE', 'reasons': []} for field in values}
    warnings = []

    def warn(code, fields, unavailable=False):
        fields = list(fields)
        if not fields:
            return
        warning = {'code': code, 'fields': fields}
        if warning not in warnings:
            warnings.append(warning)
        if unavailable:
            for field in fields:
                availability[field]['status'] = 'UNAVAILABLE'
                reason = {'code': code}
                if reason not in availability[field]['reasons']:
                    availability[field]['reasons'].append(reason)

    def money(value, fields, contribution=False):
        # This boundary handles only demonstrably monetary failures. Reports errors
        # outside this validator propagate; they are never labelled INVALID_AMOUNT.
        try:
            if contribution and (isinstance(value, bool) or not isinstance(value, (int, float))):
                raise ValueError('Invalid contribution amount type')
            integer = cents(value)
            if cents(integer / 100) != integer:
                raise ValueError('Amount loses cents at the Reports float boundary')
        except (ValueError, TypeError, OverflowError):
            warn('INVALID_AMOUNT', fields, True)
            return None
        return integer

    def identified(record, seen, fields):
        identity = record.get('id')
        if not isinstance(identity, str) or not identity:
            warn('MISSING_REQUIRED_FIELD', fields, True)
            return False
        if identity in seen:
            warn('DUPLICATE_RECORD', fields, True)
            return False
        seen.add(identity)
        return True

    def in_period(day):
        return day is not None and (day.year, day.month) == (year, month)

    def report(records, claim_records):
        return monthly_report(group, records, claim_records, [], [], year, month, outstanding)

    values['membership.active_memberships'] = sum(
        m.get('group_id') == group['id'] and m.get('status') == 'active' for m in active_memberships)
    expected, confirmed, balance, review_count, review_amount = CONTRIBUTION_FIELDS
    seen = set()
    for record in contributions:
        if record.get('group_id') != group['id'] or (record.get('year'), record.get('month')) != (year, month):
            continue
        if not identified(record, seen, CONTRIBUTION_FIELDS):
            continue
        status = record.get('contribution_status')
        if not isinstance(status, str) or status not in {'pending', 'due', 'late', 'proof_uploaded', 'confirmed', 'paid', 'excused'}:
            warn('UNSUPPORTED_RECORD_STATUS', CONTRIBUTION_FIELDS, True)
            continue
        settled = status in {'confirmed', 'paid'}
        review_candidate = status == 'proof_uploaded' and record.get('proof_review_status') in (None, 'pending')
        review_dependencies = (review_count, review_amount) if review_candidate else ()
        due_fields = ((expected,) if status != 'excused' else ()) + (balance,) + review_dependencies
        paid_fields = ((confirmed,) if settled else ()) + (balance,) + review_dependencies
        due = money(record.get('amount_due'), due_fields, contribution=True)
        paid = money(record.get('amount_paid'), paid_fields, contribution=True)
        # Local copies isolate unrelated invalid dependencies. Placeholder money is
        # never published for a metric marked unavailable above; storage is untouched.
        safe = {**record, 'amount_due': record['amount_due'] if due is not None else 0,
                'amount_paid': record['amount_paid'] if paid is not None else 0}
        result = report([safe], [])
        row = result['contributions'][0]
        for field, key in ((expected, 'expected'), (confirmed, 'confirmed'), (balance, 'outstanding'), (review_amount, 'awaiting_review')):
            values[field] += cents(row[key])
        values[review_count] += int(row['awaiting_review'] > 0)
        for warning in result['warnings']:
            code = warning['code']
            if code == 'unconfirmed_recorded_payment':
                warn('UNCONFIRMED_RECORDED_PAYMENT', (confirmed, balance) + review_dependencies)
            elif code == 'settled_amount_mismatch':
                if due is not None and paid is not None:
                    warn(*REPORT_WARNINGS[code])
            elif code == 'confirmation_date_unavailable':
                # Provenance only: absent/falsy timestamp, never month selection.
                warn(*REPORT_WARNINGS[code])
            # Bank receipt timing and identity are not record-level AI-0 defects.

    seen = set()
    for claim in claims:
        if claim.get('group_id') != group['id']:
            continue
        if not identified(claim, seen, CLAIM_FIELDS):
            continue
        status = claim.get('claim_status')
        supported = isinstance(status, str) and status in {'upcoming', 'pending_review', 'approved', 'rejected', 'paid'}
        if not supported:
            warn('UNSUPPORTED_RECORD_STATUS', (*APPROVED_FIELDS, REMAINING_FIELD), True)
        submission = event_date(claim.get('submitted_at'))
        review = event_date(claim.get('reviewed_at'))
        # Counts depend on identity/events, amounts additionally depend on money.
        amount_fields = []
        if submission is None or in_period(submission):
            amount_fields.append(SUBMITTED_FIELDS[1])
        if supported and status in {'approved', 'paid'} and (review is None or in_period(review)):
            amount_fields.append(APPROVED_FIELDS[1])
        liability_dependency = not supported or status in {'approved', 'paid'}
        if liability_dependency:
            amount_fields.append(REMAINING_FIELD)
        amount = money(claim.get('claim_amount'), amount_fields)
        cumulative = money(0 if claim.get('actual_amount_paid') is None else claim['actual_amount_paid'],
                           (PAYOUT_FIELD,) + ((REMAINING_FIELD,) if liability_dependency else ()))

        entries = claim.get('payout_payments')
        ledger_valid = True
        if entries is not None and (not isinstance(entries, list) or any(not isinstance(e, dict) for e in entries)):
            warn('INVALID_PAYOUT_HISTORY', (PAYOUT_FIELD,), True)
            ledger_valid = False
        if ledger_valid:
            payment_ids = set()
            for entry in entries or []:
                if not identified(entry, payment_ids, (PAYOUT_FIELD,)):
                    ledger_valid = False
                if money(entry.get('amount'), (PAYOUT_FIELD,)) is None:
                    ledger_valid = False

        safe = {**claim, 'claim_status': status if supported else 'pending_review',
                'claim_amount': claim['claim_amount'] if amount is not None else 0,
                'actual_amount_paid': cumulative / 100 if cumulative is not None else 0,
                'payout_payments': entries if ledger_valid else []}
        result = report([], [safe])
        for event, count_field, amount_field in (
            ('submitted', SUBMITTED_FIELDS[0], SUBMITTED_FIELDS[1]),
            ('approved', APPROVED_FIELDS[0], APPROVED_FIELDS[1]),
        ):
            rows = result['claim_activity'][event]
            values[count_field] += len(rows)
            values[amount_field] += sum(cents(row['claim_amount']) for row in rows)
        values[PAYOUT_FIELD] += sum(cents(row['amount']) for row in result['payout_payments'])
        values[REMAINING_FIELD] += sum(cents(row['remaining']) for row in result['current_commitments'])
        for warning in result['warnings']:
            code = warning['code']
            if code in {'submission_date_unavailable', 'approval_date_unavailable'}:
                warn(*REPORT_WARNINGS[code])
            elif code in {'scheduled_date_invalid', 'claim_payment_state_mismatch'}:
                if supported and amount is not None and cumulative is not None:
                    warn(*REPORT_WARNINGS[code])
            elif ledger_valid and (code == 'payout_date_unavailable' or
                                   (code == 'payout_history_incomplete' and cumulative is not None)):
                warn(*REPORT_WARNINGS[code])
        # An empty Paid legacy history proves zero only for a valid zero claim.
        # Unknown claim money cannot establish that exception either.
        if supported and status == 'paid' and ledger_valid and not entries and (amount is None or amount > 0):
            warn('INCOMPLETE_PAYOUT_HISTORY', (PAYOUT_FIELD,), True)

    for field, state in availability.items():
        if state['status'] == 'UNAVAILABLE':
            values[field] = None

    def section(name):
        return {field.split('.')[1]: value for field, value in values.items() if field.startswith(name + '.')}

    return {'schema_version': '1', 'club': {'id': group['id'], 'name': group['group_name']},
            'period': {'year': year, 'month': month, 'timezone': 'Africa/Johannesburg'},
            'scope': 'club_admin', 'membership': section('membership'), 'contributions': section('contributions'),
            'claims': section('claims'), 'payouts': section('payouts'), 'warnings': warnings,
            'basis': metric_basis(), 'availability': availability}
