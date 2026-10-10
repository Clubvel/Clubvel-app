"""Read-only contribution presentation; never creates obligations or settles payments."""
from services.monthly_reports import cents


def financial_details(record, outstanding):
    if record is None:
        return {'payment_state': 'missing_record', 'expected_amount': None,
                'confirmed_amount': None, 'recorded_unconfirmed_amount': None,
                'outstanding_amount': None, 'awaiting_confirmation_amount': None,
                'financial_warnings': []}
    warnings = []
    try:
        due, paid = cents(record.get('amount_due')), cents(record.get('amount_paid'))
        remaining = outstanding(record)
        if remaining is None:
            raise ValueError('Invalid balance')
        balance = cents(remaining)
        status = record.get('contribution_status')
        if status not in {'pending', 'due', 'late', 'proof_uploaded', 'confirmed', 'paid', 'excused'}:
            raise ValueError('Invalid status')
    except (ValueError, TypeError, OverflowError):
        return {**financial_details(None, outstanding), 'payment_state': 'invalid_amount',
                'financial_warnings': ['INVALID_FINANCIAL_RECORD']}
    settled = status in {'confirmed', 'paid'}
    declined = record.get('proof_review_status') == 'declined'
    reviewing = not settled and not declined and status == 'proof_uploaded' and record.get('proof_review_status') in (None, 'pending')
    state = ('excused' if status == 'excused' else 'confirmed' if settled else
             'proof_declined' if declined else 'awaiting_confirmation' if reviewing else 'awaiting_payment')
    if paid and not settled and status != 'excused':
        warnings.append('UNCONFIRMED_RECORDED_PAYMENT')
    if settled and paid < due:
        warnings.append('SETTLED_AMOUNT_MISMATCH')
    return {'financial_record_id': record.get('id'), 'payment_state': state, 'expected_amount': 0 if status == 'excused' else due / 100,
            'confirmed_amount': paid / 100 if settled else 0,
            'recorded_unconfirmed_amount': paid / 100 if not settled and status != 'excused' else 0,
            'outstanding_amount': balance / 100,
            'awaiting_confirmation_amount': balance / 100 if reviewing else 0,
            'financial_warnings': warnings}


def financial_totals(rows):
    fields = {'total_expected': 'expected_amount', 'collected': 'confirmed_amount',
              'outstanding': 'outstanding_amount', 'awaiting_confirmation': 'awaiting_confirmation_amount'}
    identifiers = [row.get('financial_record_id') for row in rows]
    invalid_identity = any(not value for value in identifiers) or len(set(identifiers)) != len(identifiers)
    totals = {name: None if invalid_identity or any(row[field] is None for row in rows) else
              sum(cents(row[field]) for row in rows) / 100 for name, field in fields.items()}
    expected, collected = totals['total_expected'], totals['collected']
    totals['collection_rate'] = None if expected is None or collected is None else round(collected / expected * 100, 1) if expected else 0
    return totals
