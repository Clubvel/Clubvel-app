"""Offline AI-0 facts and actual route guards; database writes fail immediately."""
import ast
import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path

from test_account_authorization import bearer
from test_account_authorization import environment as jwt_environment
from test_monthly_reports import claim, contribution, report
from test_payment_proof_review import Collection, HTTPError
from test_payment_proof_review import environment as proof_environment

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from services.intelligence.context import (
    APPROVED_FIELDS,
    CLAIM_FIELDS,
    CONTRIBUTION_FIELDS,
    PAYOUT_FIELD,
    REMAINING_FIELD,
    SUBMITTED_FIELDS,
    summary_context,
)
from services.monthly_reports import cents


def context(records=(), claims=(), year=2026, month=10, members=None):
    ns = proof_environment()
    return summary_context(ns['db'].groups.records[0], records, claims,
                           ns['db'].members.records if members is None else members,
                           year, month, ns['contribution_outstanding'])


class ContextTests(unittest.TestCase):
    def test_zero_available_complete_empty_club(self):
        result = context(members=[])
        for section in ('membership', 'contributions', 'claims', 'payouts'):
            self.assertTrue(all(value == 0 for value in result[section].values()))
        self.assertTrue(all(a == {'status': 'AVAILABLE', 'reasons': []} for a in result['availability'].values()))
        self.assertEqual(result['warnings'], [])

    def test_membership_records_not_distinct_people(self):
        result = context(members=[{'group_id': 'group-a', 'status': 'active', 'user_id': 'same'}] * 2 +
                         [{'group_id': 'group-a', 'status': 'inactive'}, {'group_id': 'group-b', 'status': 'active'}])
        self.assertEqual(result['membership']['active_memberships'], 2)

    def test_period_and_cross_club_filter(self):
        result = context([contribution(), {**contribution('old'), 'month': 9},
                          {**contribution('year'), 'year': 2025}, {**contribution('foreign'), 'group_id': 'group-b'}],
                         [claim(group_id='group-b')])
        self.assertEqual(result['contributions']['recorded_expected_cents'], 10000)
        self.assertEqual(result['claims']['submitted_count'], 0)
        self.assertEqual(result['period'], {'year': 2026, 'month': 10, 'timezone': 'Africa/Johannesburg'})

    def test_invalid_period(self):
        for year, month in [(2026, 0), (2026, 13), (0, 10), (10000, 10), (True, 1)]:
            with self.subTest(year=year, month=month), self.assertRaises(ValueError):
                context(year=year, month=month)

    def test_multiple_same_member_records_and_former_members_retained(self):
        result = context([contribution(), contribution('second'), {**contribution('former'), 'member_id': 'removed'}], members=[])
        self.assertEqual(result['contributions']['recorded_expected_cents'], 30000)
        self.assertEqual(result['membership']['active_memberships'], 0)

    def test_contribution_rules_match_monthly_reports(self):
        records = [{**contribution(str(i)), 'contribution_status': status, 'amount_paid': paid}
                   for i, (status, paid) in enumerate([('confirmed', 100), ('paid', 80), ('excused', 0), ('pending', 25), ('late', 0), ('due', 0)])]
        result, expected = context(records), report(records)
        for field, source in [('recorded_expected_cents', 'expected'), ('confirmed_cents', 'confirmed'), ('outstanding_cents', 'outstanding')]:
            self.assertEqual(result['contributions'][field], cents(expected['summary'][source]))
        self.assertIn('SETTLED_AMOUNT_MISMATCH', [w['code'] for w in result['warnings']])

    def test_awaiting_review_overlaps_outstanding_not_confirmed(self):
        records = [{**contribution('pending'), 'contribution_status': 'proof_uploaded', 'proof_review_status': 'pending'},
                   {**contribution('legacy'), 'contribution_status': 'proof_uploaded'},
                   {**contribution('declined'), 'contribution_status': 'proof_uploaded', 'proof_review_status': 'declined'},
                   {**contribution('zero'), 'contribution_status': 'proof_uploaded', 'amount_paid': 100}]
        result = context(records)
        self.assertEqual(result['contributions'], {'recorded_expected_cents': 40000, 'confirmed_cents': 0, 'outstanding_cents': 30000,
                                                  'awaiting_review_count': 2, 'awaiting_review_cents': 20000})
        self.assertTrue(result['basis']['awaiting_review_overlaps_outstanding'])

    def test_invalid_contribution_amounts_fail_closed(self):
        for field in ('amount_due', 'amount_paid'):
            for value in (None, True, -1, float('nan'), float('inf'), 'bad'):
                with self.subTest(field=field, value=value):
                    result = context([{**contribution(), field: value}])
                    affected = [CONTRIBUTION_FIELDS[0], CONTRIBUTION_FIELDS[2]] if field == 'amount_due' else [CONTRIBUTION_FIELDS[2]]
                    for metric in affected:
                        section, key = metric.split('.')
                        self.assertIsNone(result[section][key])
                        self.assertEqual(result['availability'][metric],
                                         {'status': 'UNAVAILABLE', 'reasons': [{'code': 'INVALID_AMOUNT'}]})
                    self.assertEqual(result['contributions']['confirmed_cents'], 0)
                    self.assertEqual(result['contributions']['awaiting_review_count'], 0)
                    self.assertEqual(result['claims']['submitted_count'], 0)

    def test_missing_and_duplicate_identifiers_not_silently_counted(self):
        for records in ([{**contribution(), 'id': None}], [contribution(), contribution()]):
            result = context(records)
            self.assertIsNone(result['contributions']['recorded_expected_cents'])
            self.assertIn(result['warnings'][0]['code'], ('MISSING_REQUIRED_FIELD', 'DUPLICATE_RECORD'))
        result = context(claims=[claim(), claim()])
        self.assertIsNone(result['claims']['submitted_count'])

    def test_unsupported_status_fails_closed(self):
        for result in (context([{**contribution(), 'contribution_status': 'unknown'}]), context(claims=[claim(claim_status='unknown')]), context(claims=[claim(claim_status={})])):
            self.assertIn('UNSUPPORTED_RECORD_STATUS', [w['code'] for w in result['warnings']])

    def test_claim_submission_and_review_johannesburg_boundary(self):
        result = context(claims=[claim(submitted_at='2026-09-30T22:00:00Z', reviewed_at='2026-10-31T22:00:00Z')])
        self.assertEqual(result['claims']['submitted_count'], 1)
        self.assertEqual(result['claims']['approved_count'], 0)
        next_month = context(claims=[claim(submitted_at='2026-09-30T22:00:00Z', reviewed_at='2026-10-31T22:00:00Z')], month=11)
        self.assertEqual(next_month['claims']['approved_count'], 1)
        self.assertEqual(next_month['claims']['submitted_count'], 0)

    def test_claim_states_match_reports_event_semantics(self):
        for state in ('pending_review', 'upcoming', 'rejected', 'approved', 'paid'):
            with self.subTest(state=state):
                row = claim(claim_status=state, actual_amount_paid=1000 if state == 'paid' else 400,
                            payout_payments=[{'id': 'payment', 'amount': 1000 if state == 'paid' else 400, 'actual_payment_date': '2026-10-02'}])
                result, expected = context(claims=[row]), report(claims=[row])
                for field in ('submitted_count', 'approved_count'):
                    self.assertEqual(result['claims'][field], expected['summary']['claims_' + field])
                self.assertEqual(result['claims']['submitted_amount_cents'], 100000)
                self.assertEqual(result['claims']['approved_amount_cents'], 100000 if state in ('approved', 'paid') else 0)

    def test_invalid_claim_amount_fails_closed_without_affecting_contributions(self):
        for value in (None, True, -1, float('nan'), float('inf'), 'bad'):
            result = context([contribution()], [claim(claim_amount=value)])
            self.assertIsNone(result['claims']['submitted_amount_cents'])
            self.assertEqual(result['contributions']['recorded_expected_cents'], 10000)

    def test_missing_submission_only_invalidates_submitted_fields(self):
        result = context(claims=[claim(submitted_at=None)])
        self.assertIsNone(result['claims']['submitted_count'])
        self.assertEqual(result['claims']['approved_count'], 1)
        self.assertEqual(result['payouts']['recorded_in_period_cents'], 30000)

    def test_missing_approval_only_invalidates_approved_fields(self):
        result = context(claims=[claim(reviewed_at='invalid')])
        self.assertIsNone(result['claims']['approved_amount_cents'])
        self.assertEqual(result['claims']['submitted_count'], 1)
        self.assertEqual(result['payouts']['current_approved_remaining_cents'], 60000)

    def test_incremental_payments_and_current_liability_match_reports(self):
        rows = [claim(), claim(id='another', payout_payments=[{'id': 'extra', 'amount': 400, 'actual_payment_date': '2026-10-31'}])]
        result, expected = context(claims=rows), report(claims=rows)
        self.assertEqual(result['payouts']['recorded_in_period_cents'], 70000)
        self.assertEqual(result['payouts']['recorded_in_period_cents'], cents(expected['summary']['actual_payouts']))
        self.assertEqual(result['payouts']['current_approved_remaining_cents'], 120000)
        self.assertEqual(context(claims=rows, month=12)['payouts']['current_approved_remaining_cents'], 120000)

    def test_paid_claim_not_current_liability(self):
        result = context(claims=[claim(claim_status='paid', actual_amount_paid=1000,
                                      payout_payments=[{'id': 'full', 'amount': 1000, 'actual_payment_date': '2026-10-01'}])])
        self.assertEqual(result['payouts']['current_approved_remaining_cents'], 0)
        self.assertEqual(result['payouts']['recorded_in_period_cents'], 100000)

    def test_incomplete_ledger_unavailable_not_cumulative_cash_flow(self):
        for entries in ([], None, [{'id': 'only', 'amount': 300, 'actual_payment_date': '2026-10-01'}]):
            result = context(claims=[claim(payout_payments=entries)])
            self.assertIsNone(result['payouts']['recorded_in_period_cents'])
            self.assertEqual(result['payouts']['current_approved_remaining_cents'], 60000)
            self.assertEqual(result['availability']['payouts.recorded_in_period_cents']['reasons'], [{'code': 'INCOMPLETE_PAYOUT_HISTORY'}])

    def test_missing_payout_date_unavailable(self):
        result = context(claims=[claim(payout_payments=[{'id': 'undated', 'amount': 400}])])
        self.assertIsNone(result['payouts']['recorded_in_period_cents'])
        self.assertEqual(result['payouts']['current_approved_remaining_cents'], 60000)
        self.assertEqual(result['availability']['payouts.recorded_in_period_cents']['reasons'], [{'code': 'PAYOUT_DATE_UNAVAILABLE'}])

    def test_invalid_payout_entry_amount_and_identifiers(self):
        for entry in ({'id': 'p', 'amount': -1}, {'amount': 400}, {'id': 'p', 'amount': 'bad'}):
            result = context(claims=[claim(payout_payments=[entry])])
            self.assertIsNone(result['payouts']['recorded_in_period_cents'])
        result = context(claims=[claim(payout_payments=[{'id': 'p', 'amount': 200}] * 2)])
        self.assertIn('DUPLICATE_RECORD', [w['code'] for w in result['warnings']])
        for malformed in ({}, 'bad', [None]):
            self.assertIsNone(context(claims=[claim(payout_payments=malformed)])['payouts']['recorded_in_period_cents'])

    def test_inconsistent_paid_state_makes_current_liability_unavailable(self):
        result = context(claims=[claim(claim_status='paid')])
        self.assertIsNone(result['payouts']['current_approved_remaining_cents'])
        self.assertIn('CLAIM_PAYMENT_STATE_MISMATCH', [w['code'] for w in result['warnings']])

    def test_paid_legacy_claim_without_payment_evidence_not_false_zero(self):
        result = context(claims=[claim(claim_status='paid', actual_amount_paid=None, payout_payments=None)])
        self.assertIsNone(result['payouts']['recorded_in_period_cents'])
        self.assertEqual(result['availability']['payouts.recorded_in_period_cents']['reasons'], [{'code': 'INCOMPLETE_PAYOUT_HISTORY'}])

    def test_unscheduled_unpaid_claim_is_valid_current_liability(self):
        result = context(claims=[claim(actual_amount_paid=None, payout_payments=None, scheduled_claim_date=None)])
        self.assertEqual(result['payouts'], {'recorded_in_period_cents': 0, 'current_approved_remaining_cents': 100000})

    def test_cents_rounding_is_shared(self):
        result = context(claims=[claim(claim_amount=1000.005)])
        self.assertEqual(result['claims']['submitted_amount_cents'], 100001)

    def test_precision_loss_is_unavailable_not_rounded_away(self):
        result = context(claims=[claim(claim_amount='100000000000000.01')])
        self.assertIsNone(result['claims']['submitted_amount_cents'])
        self.assertIn('INVALID_AMOUNT', [w['code'] for w in result['warnings']])

    def test_response_satisfies_typed_contract(self):
        from pydantic import TypeAdapter
        from services.intelligence.schemas import SummaryContext
        for result in (context(), context([contribution()], [claim()]), context(claims=[claim(submitted_at=None)])):
            self.assertEqual(TypeAdapter(SummaryContext).validate_python(result), result)

    def test_aggregate_response_privacy_and_pure_inputs(self):
        records = [{**contribution(), 'proof_of_payment': 'SECRET_PROOF', 'reference_number': 'SECRET_REFERENCE'}]
        claims = [claim(reason='SECRET_REASON', notes='SECRET_NOTES', phone_number='SECRET_PHONE')]
        before = copy.deepcopy((records, claims))
        result = context(records, claims)
        encoded = json.dumps(result)
        self.assertNotIn('SECRET_', encoded)
        self.assertNotIn('member_id', encoded)
        self.assertNotIn('record_id', encoded)
        self.assertEqual((records, claims), before)
        self.assertEqual(result['scope'], 'club_admin')
        self.assertFalse(result['basis']['verified_bank_balance'])
        self.assertEqual(set(result['basis']['definitions']), set(result['availability']))

    def test_existing_backend_functions_unchanged(self):
        current = (ROOT / 'backend/server.py').read_text()
        previous = subprocess.check_output(['git', 'show', '2f08613eff78738dcf0840014fd5d3286c8dd4c8:backend/server.py'], cwd=ROOT, text=True)
        def functions(source):
            return {n.name: ast.get_source_segment(source, n) for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        old, new = functions(previous), functions(current)
        self.assertEqual(set(new) - set(old), {'get_intelligence_summary'})
        for name in old:
            self.assertEqual(new[name], old[name], name)
        self.assertEqual((ROOT / 'backend/services/monthly_reports.py').read_bytes(),
                         subprocess.check_output(['git', 'show', 'HEAD:backend/services/monthly_reports.py'], cwd=ROOT))


class ReadOnlyCollection(Collection):
    """Mongo projections, including nested payout arrays; reject any write attempt."""
    def __getattribute__(self, name):
        if name.startswith(('insert', 'update', 'delete', 'replace', 'bulk', 'find_one_and')):
            raise AssertionError('Attempted database write: ' + name)
        return super().__getattribute__(name)

    @staticmethod
    def project(record, projection):
        result = Collection.project(record, projection)
        paths = [k for k, value in projection.items() if value == 1 and k.startswith('payout_payments.')]
        if paths and 'payout_payments' in record:
            entries = record['payout_payments']
            keys = {k.split('.')[1] for k in paths}
            result['payout_payments'] = [{k: copy.deepcopy(v) for k, v in e.items() if k in keys} for e in entries] if isinstance(entries, list) else entries
        return result


def route_environment():
    ns = proof_environment()
    ns.update({key: jwt_environment()[key] for key in ('verify_token', 'authenticated_user_id')})
    db = ns['db']
    db.claims = ReadOnlyCollection([claim()])
    db.contributions = ReadOnlyCollection([contribution()])
    for name in ('users', 'members', 'groups'):
        setattr(db, name, ReadOnlyCollection(getattr(db, name).records))
    for user in db.users.records:
        user['status'] = 'active'
    ns['summary_context'] = summary_context
    node = next(n for n in ast.parse((ROOT / 'backend/server.py').read_text()).body
                if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_intelligence_summary')
    node.decorator_list = []
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'intelligence-route', 'exec'), ns)  # noqa: S102 -- Execute the actual offline route, not a duplicate.
    return ns


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_session_no_database_reads(self):
        for token in (None, 'Bearer invalid', bearer('admin-user', key='wrong'), bearer('admin-user', expired=True)):
            ns = route_environment()
            with self.assertRaises(Exception) as caught:
                await ns['get_intelligence_summary']('group-a', 2026, 10, token)
            self.assertEqual(caught.exception.status_code, 401)
            self.assertTrue(all(not getattr(ns['db'], name).reads for name in ('users', 'groups', 'members', 'claims', 'contributions')))

    async def test_admin_and_treasurer_allowed_zero_writes(self):
        for role in ('admin', 'treasurer'):
            ns = route_environment(); db = ns['db']
            db.members.records[1]['role_in_group'] = role
            before = copy.deepcopy({name: getattr(db, name).records for name in ('users', 'groups', 'members', 'claims', 'contributions')})
            result = await ns['get_intelligence_summary']('group-a', 2026, 10, bearer('admin-user'))
            self.assertEqual(result['scope'], 'club_admin')
            self.assertEqual(result['payouts']['recorded_in_period_cents'], 30000)
            self.assertEqual(before, {name: getattr(db, name).records for name in before})
            self.assertEqual(result['membership']['active_memberships'], 2)

    async def test_member_and_cross_club_admin_denied_before_financial_reads(self):
        for actor, group in [('member-user', 'group-a'), ('admin-user', 'group-b')]:
            ns = route_environment()
            with self.assertRaises(HTTPError) as caught:
                await ns['get_intelligence_summary'](group, 2026, 10, bearer(actor))
            self.assertEqual(caught.exception.status_code, 403)
            self.assertEqual(ns['db'].contributions.reads, [])
            self.assertEqual(ns['db'].claims.reads, [])

    async def test_inactive_removed_demoted_memberships_denied(self):
        for state, role in [('inactive', 'admin'), ('removed', 'admin'), ('active', 'member')]:
            ns = route_environment()
            ns['db'].members.records[1].update(status=state, role_in_group=role)
            with self.assertRaises(HTTPError) as caught:
                await ns['get_intelligence_summary']('group-a', 2026, 10, bearer('admin-user'))
            self.assertEqual(caught.exception.status_code, 403)
            self.assertEqual(ns['db'].claims.reads, [])

    async def test_inactive_missing_account_denied(self):
        for state in ('inactive', 'missing'):
            ns = route_environment()
            ns['db'].users.records = [u for u in ns['db'].users.records if u['id'] != 'admin-user'] if state == 'missing' else ns['db'].users.records
            for user in ns['db'].users.records:
                if user['id'] == 'admin-user': user['status'] = state
            with self.assertRaises(HTTPError) as caught:
                await ns['get_intelligence_summary']('group-a', 2026, 10, bearer('admin-user'))
            self.assertEqual(caught.exception.status_code, 403)
            self.assertEqual(ns['db'].groups.reads, [])

    async def test_inactive_group_denied(self):
        ns = route_environment(); ns['db'].groups.records[0]['status'] = 'inactive'
        with self.assertRaises(HTTPError) as caught:
            await ns['get_intelligence_summary']('group-a', 2026, 10, bearer('admin-user'))
        self.assertEqual(caught.exception.status_code, 404)
        self.assertEqual(ns['db'].members.reads, [])

    async def test_invalid_period_rejected_before_financial_reads(self):
        for year, month in [(0, 10), (2026, 0), (2026, 13), (10000, 1)]:
            ns = route_environment()
            with self.assertRaises(HTTPError) as caught:
                await ns['get_intelligence_summary']('group-a', year, month, bearer('admin-user'))
            self.assertEqual(caught.exception.status_code, 422)
            self.assertEqual(ns['db'].claims.reads, [])

    async def test_scope_and_client_identity_not_authorization_inputs(self):
        node = next(n for n in ast.parse((ROOT / 'backend/server.py').read_text()).body
                    if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_intelligence_summary')
        self.assertEqual([arg.arg for arg in node.args.args], ['group_id', 'year', 'month', 'authorization'])
        ns = route_environment()
        result = await ns['get_intelligence_summary']('group-a', 2026, 10, bearer('admin-user'))
        self.assertEqual(result['scope'], 'club_admin')

    async def test_queries_uncapped_selected_club_and_sensitive_fields_excluded(self):
        ns = route_environment(); db = ns['db']
        db.claims.records[0]['payout_payments'][0]['notes'] = 'SECRET_ENTRY_NOTE'
        result = await ns['get_intelligence_summary']('group-a', 2026, 10, bearer('admin-user'))
        self.assertNotIn('SECRET_', json.dumps(result))
        for collection in (db.contributions, db.claims):
            query, projection = collection.reads[0][1:]
            self.assertEqual(query['group_id'], 'group-a')
            for key in ('phone_number', 'email', 'profile_photo', 'proof_of_payment', 'reference_number', 'reason', 'notes', 'bank_account_number', 'member_id'):
                self.assertNotIn(key, projection)
        self.assertNotIn('payout_payments', db.claims.reads[0][2])
        self.assertEqual(db.contributions.reads[0][1], {'group_id': 'group-a', 'year': 2026, 'month': 10})
        source = ast.get_source_segment((ROOT / 'backend/server.py').read_text(),
                                       next(n for n in ast.parse((ROOT / 'backend/server.py').read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_intelligence_summary'))
        self.assertNotIn('reconcile', source.split('person =')[1])
        self.assertEqual(source.count('.to_list(None)'), 3)


class HTTPContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_offline_asgi_auth_scope_parameter_validation_and_openapi(self):
        from fastapi import FastAPI, Header, HTTPException
        from services.intelligence.schemas import SummaryContext
        ns = route_environment()
        ns.update({key: jwt_environment()[key] for key in ('jwt', 'JWTError', 'SECRET_KEY', 'ALGORITHM')})
        ns.update(Header=Header, HTTPException=HTTPException)
        tree = ast.parse((ROOT / 'backend/server.py').read_text())
        functions = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                     and n.name in {'get_intelligence_summary', 'verify_token', 'authenticated_user_id'}]
        for node in functions:
            node.decorator_list = []
        exec(compile(ast.Module(body=functions, type_ignores=[]), 'offline-http-route', 'exec'), ns)  # noqa: S102 -- Actual application handlers in an isolated ASGI app.
        app = FastAPI()
        app.add_api_route('/api/intelligence/{group_id}/summary', ns['get_intelligence_summary'], methods=['GET'], response_model=SummaryContext)
        schema = app.openapi()
        self.assertIn('/api/intelligence/{group_id}/summary', schema['paths'])
        params = schema['paths']['/api/intelligence/{group_id}/summary']['get']['parameters']
        self.assertNotIn('scope', [param['name'] for param in params])
        for actor, query, expected in [('admin-user', 'year=2026&month=10&scope=member&user_id=outsider', 200),
                                        ('member-user', 'year=2026&month=10&scope=club_admin', 403),
                                        ('admin-user', 'year=2026&month=abc', 422),
                                        (None, 'year=2026&month=10', 401)]:
            messages = []
            async def receive():
                return {'type': 'http.request', 'body': b'', 'more_body': False}
            async def send(message, messages=messages):
                messages.append(message)
            await app({'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
                       'method': 'GET', 'scheme': 'http', 'path': '/api/intelligence/group-a/summary',
                       'raw_path': b'/api/intelligence/group-a/summary', 'query_string': query.encode(),
                       'root_path': '', 'server': ('offline.test', 80), 'client': ('offline', 0),
                       'headers': [(b'authorization', bearer(actor).encode())] if actor else []}, receive, send)
            self.assertEqual(messages[0]['status'], expected)
            if expected == 200:
                response = json.loads(b''.join(m.get('body', b'') for m in messages))
                self.assertEqual(response['scope'], 'club_admin')
                self.assertEqual(response['club'], {'id': 'group-a', 'name': 'group-a'})
                self.assertEqual(response['payouts']['recorded_in_period_cents'], 30000)


class WarningContractTests(unittest.TestCase):
    """Every public code has explicit fields, availability and independent facts."""
    def assert_contract(self, result, code, fields, unavailable, unaffected):
        self.assertIn({'code': code, 'fields': list(fields)}, result['warnings'])
        for field in fields:
            section, key = field.split('.')
            state = result['availability'][field]
            self.assertEqual(state['status'], 'UNAVAILABLE' if unavailable else 'AVAILABLE', field)
            if unavailable:
                self.assertIsNone(result[section][key], field)
                self.assertIn({'code': code}, state['reasons'])
            else:
                self.assertIsInstance(result[section][key], int, field)
                self.assertEqual(state['reasons'], [], field)
        for field, expected in unaffected.items():
            section, key = field.split('.')
            self.assertEqual(result[section][key], expected, field)
            self.assertEqual(result['availability'][field], {'status': 'AVAILABLE', 'reasons': []}, field)

    def test_invalid_amount_dependency_fields(self):
        cases = [
            (context([{**contribution(), 'amount_due': None}], [claim()]),
             (CONTRIBUTION_FIELDS[0], CONTRIBUTION_FIELDS[2]), {'contributions.confirmed_cents': 0, PAYOUT_FIELD: 30000}),
            (context([{**contribution(), 'amount_paid': -1}], [claim()]),
             (CONTRIBUTION_FIELDS[2],), {'contributions.recorded_expected_cents': 10000, PAYOUT_FIELD: 30000}),
            (context(claims=[claim(claim_amount=-1)]),
             (SUBMITTED_FIELDS[1], APPROVED_FIELDS[1], REMAINING_FIELD), {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[0]: 1, PAYOUT_FIELD: 30000}),
            (context(claims=[claim(actual_amount_paid='bad')]),
             (PAYOUT_FIELD, REMAINING_FIELD), {SUBMITTED_FIELDS[1]: 100000, APPROVED_FIELDS[1]: 100000}),
            (context(claims=[claim(payout_payments=[{'id': 'bad', 'amount': -1}])]),
             (PAYOUT_FIELD,), {SUBMITTED_FIELDS[1]: 100000, APPROVED_FIELDS[1]: 100000, REMAINING_FIELD: 60000}),
        ]
        for result, fields, unaffected in cases:
            with self.subTest(fields=fields):
                self.assert_contract(result, 'INVALID_AMOUNT', fields, True, unaffected)

    def test_invalid_money_does_not_destroy_known_zero_or_valid_count(self):
        result = context([{**contribution(), 'amount_paid': None}], [claim(claim_amount='bad', submitted_at='2026-09-01', reviewed_at='2026-09-02')])
        for field in [CONTRIBUTION_FIELDS[1], CONTRIBUTION_FIELDS[3], CONTRIBUTION_FIELDS[4], *SUBMITTED_FIELDS, *APPROVED_FIELDS]:
            section, key = field.split('.')
            self.assertEqual(result[section][key], 0)
            self.assertEqual(result['availability'][field]['status'], 'AVAILABLE')

    def test_nonapproved_invalid_money_does_not_invalidate_known_zero_liability(self):
        for status in ('upcoming', 'pending_review', 'rejected'):
            result = context(claims=[claim(claim_status=status, claim_amount='bad')])
            self.assert_contract(result, 'INVALID_AMOUNT', (SUBMITTED_FIELDS[1],), True,
                                 {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[0]: 0, APPROVED_FIELDS[1]: 0, PAYOUT_FIELD: 30000, REMAINING_FIELD: 0})
            result = context(claims=[claim(claim_status=status, actual_amount_paid='bad')])
            self.assert_contract(result, 'INVALID_AMOUNT', (PAYOUT_FIELD,), True,
                                 {SUBMITTED_FIELDS[0]: 1, SUBMITTED_FIELDS[1]: 100000, REMAINING_FIELD: 0})

    def test_invalid_due_retains_confirmed_and_invalid_paid_retains_expected(self):
        result = context([{**contribution(), 'amount_due': None, 'amount_paid': 100, 'contribution_status': 'confirmed', 'confirmation_date': '2026-10-01'}])
        self.assertEqual(result['contributions']['confirmed_cents'], 10000)
        self.assertEqual(result['availability'][CONTRIBUTION_FIELDS[1]]['status'], 'AVAILABLE')
        result = context([{**contribution(), 'amount_paid': None, 'contribution_status': 'confirmed'}])
        self.assertIsNone(result['contributions']['confirmed_cents'])
        self.assertEqual(result['contributions']['recorded_expected_cents'], 10000)

    def test_invalid_proof_money_affects_review_dependencies(self):
        result = context([{**contribution(), 'contribution_status': 'proof_uploaded', 'amount_paid': None}])
        self.assert_contract(result, 'INVALID_AMOUNT', (CONTRIBUTION_FIELDS[2], CONTRIBUTION_FIELDS[3], CONTRIBUTION_FIELDS[4]), True,
                             {CONTRIBUTION_FIELDS[0]: 10000, CONTRIBUTION_FIELDS[1]: 0})

    def test_missing_required_identity_fields(self):
        self.assert_contract(context([{**contribution(), 'id': None}], [claim()]), 'MISSING_REQUIRED_FIELD', CONTRIBUTION_FIELDS, True,
                             {PAYOUT_FIELD: 30000})
        self.assert_contract(context([contribution()], [claim(id=None)]), 'MISSING_REQUIRED_FIELD', CLAIM_FIELDS, True,
                             {CONTRIBUTION_FIELDS[0]: 10000})
        self.assert_contract(context(claims=[claim(payout_payments=[{'amount': 400}])]), 'MISSING_REQUIRED_FIELD', (PAYOUT_FIELD,), True,
                             {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, REMAINING_FIELD: 60000})

    def test_duplicate_authoritative_ids_and_only_payout_dependency(self):
        self.assert_contract(context([contribution(), contribution()], [claim()]), 'DUPLICATE_RECORD', CONTRIBUTION_FIELDS, True,
                             {PAYOUT_FIELD: 30000})
        self.assert_contract(context([contribution()], [claim(), claim()]), 'DUPLICATE_RECORD', CLAIM_FIELDS, True,
                             {CONTRIBUTION_FIELDS[0]: 10000})
        self.assert_contract(context(claims=[claim(payout_payments=[{'id': 'same', 'amount': 200, 'actual_payment_date': '2026-10-01'}] * 2)]),
                             'DUPLICATE_RECORD', (PAYOUT_FIELD,), True, {SUBMITTED_FIELDS[1]: 100000, APPROVED_FIELDS[0]: 1, REMAINING_FIELD: 60000})

    def test_shared_member_and_payment_ids_across_distinct_records_not_duplicates(self):
        result = context([contribution(), contribution('second')], [claim(), claim(id='another')])
        self.assertNotIn('DUPLICATE_RECORD', [w['code'] for w in result['warnings']])
        self.assertEqual(result['contributions']['recorded_expected_cents'], 20000)
        self.assertEqual(result['payouts']['recorded_in_period_cents'], 60000)

    def test_unsupported_status_preserves_independent_claim_events_and_payouts(self):
        self.assert_contract(context([{**contribution(), 'contribution_status': 'unknown'}], [claim()]),
                             'UNSUPPORTED_RECORD_STATUS', CONTRIBUTION_FIELDS, True, {PAYOUT_FIELD: 30000})
        self.assert_contract(context(claims=[claim(claim_status='unknown')]), 'UNSUPPORTED_RECORD_STATUS', (*APPROVED_FIELDS, REMAINING_FIELD), True,
                             {SUBMITTED_FIELDS[0]: 1, SUBMITTED_FIELDS[1]: 100000, PAYOUT_FIELD: 30000})

    def test_invalid_payout_structure_does_not_invalidate_claim_facts(self):
        for entries in ({}, 'bad', [None]):
            with self.subTest(entries=entries):
                self.assert_contract(context(claims=[claim(payout_payments=entries)]), 'INVALID_PAYOUT_HISTORY', (PAYOUT_FIELD,), True,
                                     {SUBMITTED_FIELDS[0]: 1, SUBMITTED_FIELDS[1]: 100000, APPROVED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, REMAINING_FIELD: 60000})

    def test_incomplete_payout_history_only_period_cash_flow_unavailable(self):
        result = context(claims=[claim(payout_payments=[{'id': 'only', 'amount': 300, 'actual_payment_date': '2026-10-01'}])])
        self.assert_contract(result, 'INCOMPLETE_PAYOUT_HISTORY', (PAYOUT_FIELD,), True,
                             {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, REMAINING_FIELD: 60000})

    def test_missing_submission_date_only_submission_metrics_unavailable(self):
        self.assert_contract(context(claims=[claim(submitted_at=None)]), 'SUBMISSION_DATE_UNAVAILABLE', SUBMITTED_FIELDS, True,
                             {APPROVED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, PAYOUT_FIELD: 30000, REMAINING_FIELD: 60000})

    def test_missing_approval_date_only_approval_metrics_unavailable(self):
        self.assert_contract(context(claims=[claim(reviewed_at='bad')]), 'APPROVAL_DATE_UNAVAILABLE', APPROVED_FIELDS, True,
                             {SUBMITTED_FIELDS[0]: 1, SUBMITTED_FIELDS[1]: 100000, PAYOUT_FIELD: 30000, REMAINING_FIELD: 60000})

    def test_missing_payout_date_preserves_events_and_liability(self):
        self.assert_contract(context(claims=[claim(payout_payments=[{'id': 'dated', 'amount': 400, 'actual_payment_date': None}])]),
                             'PAYOUT_DATE_UNAVAILABLE', (PAYOUT_FIELD,), True,
                             {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, REMAINING_FIELD: 60000})

    def test_underpaid_paid_state_valid_complete_cash_flow_stays_available(self):
        self.assert_contract(context(claims=[claim(claim_status='paid')]), 'CLAIM_PAYMENT_STATE_MISMATCH', (REMAINING_FIELD,), True,
                             {SUBMITTED_FIELDS[1]: 100000, APPROVED_FIELDS[0]: 1, PAYOUT_FIELD: 30000})

    def test_overpaid_state_valid_complete_cash_flow_stays_available(self):
        row = claim(actual_amount_paid=1200, payout_payments=[{'id': 'overpayment', 'amount': 1200, 'actual_payment_date': '2026-10-01'}])
        self.assert_contract(context(claims=[row]), 'CLAIM_PAYMENT_STATE_MISMATCH', (REMAINING_FIELD,), True,
                             {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, PAYOUT_FIELD: 120000})

    def test_paid_legacy_missing_evidence_not_reliable_zero(self):
        result = context(claims=[claim(claim_status='paid', actual_amount_paid=None, payout_payments=None)])
        self.assert_contract(result, 'CLAIM_PAYMENT_STATE_MISMATCH', (REMAINING_FIELD,), True, {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000})
        self.assert_contract(result, 'INCOMPLETE_PAYOUT_HISTORY', (PAYOUT_FIELD,), True, {SUBMITTED_FIELDS[0]: 1})

    def test_paid_legacy_unknown_amount_and_empty_history_not_false_zero(self):
        for amount in (None, 'bad'):
            result = context(claims=[claim(claim_status='paid', claim_amount=amount, actual_amount_paid=None, payout_payments=None)])
            self.assert_contract(result, 'INCOMPLETE_PAYOUT_HISTORY', (PAYOUT_FIELD,), True,
                                 {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[0]: 1})
            self.assert_contract(result, 'INVALID_AMOUNT', (SUBMITTED_FIELDS[1], APPROVED_FIELDS[1], REMAINING_FIELD), True,
                                 {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[0]: 1})

    def test_paid_zero_claim_empty_history_is_known_zero(self):
        result = context(claims=[claim(claim_status='paid', claim_amount=0, actual_amount_paid=None, payout_payments=None)])
        for field in (PAYOUT_FIELD, REMAINING_FIELD):
            section, key = field.split('.')
            self.assertEqual(result[section][key], 0)
            self.assertEqual(result['availability'][field], {'status': 'AVAILABLE', 'reasons': []})
        self.assertEqual(result['warnings'], [])

    def test_confirmation_timestamp_absence_provenance_never_period_selection(self):
        for timestamp in (None, '', 'bad', '2025-01-01'):
            with self.subTest(timestamp=timestamp):
                row = {**contribution(), 'contribution_status': 'confirmed', 'amount_paid': 100, 'confirmation_date': timestamp}
                result = context([row])
                if not timestamp:
                    self.assert_contract(result, 'CONFIRMATION_DATE_UNAVAILABLE', (CONTRIBUTION_FIELDS[1],), False,
                                         {CONTRIBUTION_FIELDS[0]: 10000, CONTRIBUTION_FIELDS[2]: 0})
                else:
                    self.assertNotIn('CONFIRMATION_DATE_UNAVAILABLE', [w['code'] for w in result['warnings']])
                self.assertEqual(result['contributions']['confirmed_cents'], 10000)
                self.assertEqual(result['availability'][CONTRIBUTION_FIELDS[1]]['status'], 'AVAILABLE')

    def test_bank_receipt_limitation_basis_only(self):
        result = context([{**contribution(), 'contribution_status': 'confirmed', 'amount_paid': 100}])
        self.assertNotIn('BANK_RECEIPT_DATE_UNAVAILABLE', [w['code'] for w in result['warnings']])
        self.assertFalse(result['basis']['verified_bank_balance'])
        self.assertFalse(result['basis']['bank_receipt_timing_used_for_period'])
        self.assertEqual(result['basis']['definitions'][CONTRIBUTION_FIELDS[0]]['selection'], 'recorded_obligation_year_month')

    def test_unconfirmed_payment_warning_relevant_fields_only(self):
        result = context([{**contribution(), 'amount_paid': 25}])
        self.assert_contract(result, 'UNCONFIRMED_RECORDED_PAYMENT', (CONTRIBUTION_FIELDS[1], CONTRIBUTION_FIELDS[2]), False,
                             {CONTRIBUTION_FIELDS[0]: 10000, CONTRIBUTION_FIELDS[3]: 0})
        self.assertEqual(result['contributions']['confirmed_cents'], 0)
        self.assertEqual(result['contributions']['outstanding_cents'], 7500)
        result = context([{**contribution(), 'amount_paid': 25, 'contribution_status': 'proof_uploaded'}])
        self.assert_contract(result, 'UNCONFIRMED_RECORDED_PAYMENT', (CONTRIBUTION_FIELDS[1], CONTRIBUTION_FIELDS[2], CONTRIBUTION_FIELDS[3], CONTRIBUTION_FIELDS[4]), False,
                             {CONTRIBUTION_FIELDS[0]: 10000})
        self.assertEqual(result['contributions']['awaiting_review_cents'], 7500)

    def test_settled_mismatch_nonfatal_relevant_fields_only(self):
        result = context([{**contribution(), 'amount_paid': 80, 'contribution_status': 'paid', 'confirmation_date': '2026-10-01'}])
        self.assert_contract(result, 'SETTLED_AMOUNT_MISMATCH', (CONTRIBUTION_FIELDS[1], CONTRIBUTION_FIELDS[2]), False,
                             {CONTRIBUTION_FIELDS[0]: 10000, CONTRIBUTION_FIELDS[3]: 0})
        self.assertEqual(result['contributions']['confirmed_cents'], 8000)
        self.assertEqual(result['contributions']['outstanding_cents'], 0)

    def test_invalid_scheduled_date_nonfatal_current_remaining(self):
        self.assert_contract(context(claims=[claim(scheduled_claim_date='not-a-date')]), 'SCHEDULED_DATE_INVALID', (REMAINING_FIELD,), False,
                             {SUBMITTED_FIELDS[0]: 1, APPROVED_FIELDS[1]: 100000, PAYOUT_FIELD: 30000})
        self.assertEqual(context(claims=[claim(scheduled_claim_date='not-a-date')])['payouts']['current_approved_remaining_cents'], 60000)

    def test_nonmonetary_reports_exceptions_propagate_not_invalid_amount(self):
        from unittest.mock import patch
        for error in (ValueError('nonmonetary report error'), TypeError('nonmonetary report error'), OverflowError('nonmonetary report error')):
            with self.subTest(error=type(error)), patch('services.intelligence.context.monthly_report', side_effect=error), self.assertRaises(type(error)) as caught:
                context([contribution()])
            self.assertIs(caught.exception, error)
