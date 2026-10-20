"""Offline financial fixtures plus the actual read-only route and authorization guards."""
# ruff: noqa: DTZ001, C408 -- Synthetic fixtures intentionally exercise naive UTC timestamps and calendar dates.
import ast
import copy
import importlib.util
import subprocess
import unittest
from datetime import datetime
from pathlib import Path

from test_payment_proof_review import Collection, HTTPError, environment

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('monthly_reports', ROOT / 'backend/services/monthly_reports.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


def contribution(identity='c1', **extra):
    return dict(id=identity, group_id='group-a', member_id='membership-a', month=10, year=2026,
                amount_due=100, amount_paid=0, contribution_status='pending', **extra)


def claim(**extra):
    row = dict(id='claim-a', group_id='group-a', member_id='membership-a', claim_amount=1000,
               actual_amount_paid=400, claim_status='approved', submitted_at=datetime(2026, 9, 30, 22, 30),
               reviewed_at=datetime(2026, 10, 1), scheduled_claim_date=datetime(2026, 11, 2),
               payout_payments=[dict(id='sept', amount=100, actual_payment_date=datetime(2026, 9, 30)),
                               dict(id='oct', amount=300, actual_payment_date=datetime(2026, 10, 1))])
    row.update(extra)
    return row


def report(records=(), claims=(), year=2026, month=10, memberships=None):
    ns = environment()
    return service.monthly_report(ns['db'].groups.records[0], records, claims,
                                  ns['db'].members.records if memberships is None else memberships,
                                  ns['db'].users.records, year, month, ns['contribution_outstanding'])


class MonthlyReportTests(unittest.TestCase):
    def test_selected_obligation_month_year_and_cross_club_filter(self):
        rows = [contribution(), {**contribution('old'), 'month': 9}, {**contribution('year'), 'year': 2025},
                {**contribution('foreign'), 'group_id': 'group-b'}]
        result = report(rows)
        self.assertEqual([r['id'] for r in result['contributions']], ['c1'])
        self.assertEqual(result['period'], dict(year=2026, month=10, timezone='Africa/Johannesburg'))

    def test_expected_uses_recorded_obligations_not_current_rate_or_members(self):
        self.assertEqual(report([contribution(), {**contribution('second'), 'amount_due': 175}])['summary']['expected'], 275)

    def test_excused_obligation_excluded_and_retained_in_detail(self):
        result = report([{**contribution(), 'contribution_status': 'excused'}])
        self.assertEqual(result['summary']['expected'], 0)
        self.assertEqual(result['contributions'][0]['amount_due'], 100)
        self.assertEqual(result['summary']['outstanding'], 0)

    def test_multiple_records_for_same_member_remain_separate(self):
        result = report([contribution(), contribution('another')])
        self.assertEqual(len(result['contributions']), 2)
        self.assertEqual(result['summary']['expected'], 200)

    def test_confirmed_and_paid_records_only(self):
        result = report([{**contribution(), 'contribution_status': 'confirmed', 'amount_paid': 100},
                         {**contribution('paid'), 'contribution_status': 'paid', 'amount_paid': 100}])
        self.assertEqual(result['summary']['confirmed'], 200)
        self.assertEqual(result['summary']['outstanding'], 0)

    def test_pending_proof_never_confirmed_and_included_in_outstanding(self):
        result = report([{**contribution(), 'contribution_status': 'proof_uploaded', 'proof_review_status': 'pending'}])
        self.assertEqual(result['summary']['confirmed'], 0)
        self.assertEqual(result['summary']['awaiting_review'], 100)
        self.assertEqual(result['summary']['outstanding'], 100)

    def test_partial_unconfirmed_payment_follows_existing_outstanding_rule(self):
        result = report([{**contribution(), 'amount_paid': 25}])
        self.assertEqual(result['summary']['outstanding'], 75)
        self.assertEqual(result['summary']['confirmed'], 0)
        self.assertIn('unconfirmed_recorded_payment', [w['code'] for w in result['warnings']])

    def test_declined_proof_not_awaiting_review(self):
        result = report([{**contribution(), 'proof_review_status': 'declined'}])
        self.assertEqual(result['summary']['awaiting_review'], 0)
        self.assertEqual(result['summary']['outstanding'], 100)

    def test_submissions_use_johannesburg_event_date_not_current_state(self):
        result = report(claims=[claim(claim_status='rejected')])
        self.assertEqual(result['summary']['claims_submitted_count'], 1)
        self.assertEqual(result['summary']['claims_approved_count'], 0)
        self.assertEqual(result['claim_activity']['submitted'][0]['submitted_at'], '2026-09-30T22:30:00+00:00')

    def test_paid_claim_still_counts_as_approval_in_review_month(self):
        result = report(claims=[claim(claim_status='paid', actual_amount_paid=1000)])
        self.assertEqual(result['summary']['claims_approved_count'], 1)
        self.assertEqual(report(claims=[claim(reviewed_at=datetime(2026, 9, 1))])['summary']['claims_approved_count'], 0)

    def test_actual_payouts_incremental_not_cumulative_and_calendar_date(self):
        result = report(claims=[claim()])
        self.assertEqual(result['summary']['actual_payouts'], 300)
        self.assertEqual([r['id'] for r in result['payout_payments']], ['oct'])
        self.assertEqual(report(claims=[claim()], month=9)['summary']['actual_payouts'], 100)
        self.assertEqual(report(claims=[claim()], month=11)['summary']['actual_payouts'], 0)

    def test_current_liability_is_separate_from_selected_month_and_schedule(self):
        result = report(claims=[claim()], month=2)
        self.assertTrue(result['empty_period'])
        self.assertEqual(result['summary']['current_commitments'], 600)
        self.assertEqual(result['current_commitments'][0]['scheduled_claim_date'], '2026-11-02')

    def test_fully_paid_claim_has_no_current_commitment(self):
        self.assertEqual(report(claims=[claim(claim_status='paid', actual_amount_paid=1000)])['summary']['current_commitments'], 0)

    def test_empty_period_is_valid(self):
        result = report()
        self.assertTrue(result['empty_period'])
        self.assertTrue(all(v == 0 for v in result['summary'].values()))

    def test_deleted_membership_warns_and_preserves_amount_without_cross_club_identity(self):
        memberships = [dict(id='membership-a', group_id='group-b', user_id='other-member')]
        result = report([contribution()], memberships=memberships)
        self.assertEqual(result['contributions'][0]['member_name'], 'Former / unknown member')
        self.assertEqual(result['summary']['expected'], 100)
        self.assertIn('historical_identity_unavailable', [w['code'] for w in result['warnings']])

    def test_legacy_missing_dates_and_ledger_warn_without_inventing_events(self):
        result = report(claims=[claim(submitted_at=None, reviewed_at=None, payout_payments=[])])
        self.assertEqual(result['summary']['claims_approved_count'], 0)
        self.assertEqual(result['summary']['actual_payouts'], 0)
        codes = {w['code'] for w in result['warnings']}
        self.assertTrue({'approval_date_unavailable', 'submission_date_unavailable', 'payout_history_incomplete'} <= codes)
        self.assertEqual(len(result['unallocated_activity']), 2)

    def test_missing_payout_date_retains_unallocated_incremental_amount(self):
        result = report(claims=[claim(payout_payments=[dict(id='missing-date', amount=400)])])
        self.assertEqual(result['summary']['actual_payouts'], 0)
        self.assertEqual(result['unallocated_activity'][-1]['amount'], 400)

    def test_confirmed_receipt_date_not_fabricated_from_upload_date(self):
        result = report([{**contribution(), 'contribution_status': 'confirmed', 'amount_paid': 100, 'payment_date': datetime(2026, 10, 3)}])
        codes = {w['code'] for w in result['warnings']}
        self.assertTrue({'receipt_date_unavailable', 'confirmation_date_unavailable'} <= codes)
        self.assertNotIn('payment_date', result['contributions'][0])

    def test_johannesburg_previous_month_and_year_boundaries(self):
        self.assertEqual(service.event_date(datetime(2026, 12, 31, 22)), datetime(2027, 1, 1).date())
        self.assertEqual(service.event_date(datetime(2026, 9, 30, 21, 59)), datetime(2026, 9, 30).date())
        self.assertEqual(service.calendar_date(datetime(2026, 9, 30)), datetime(2026, 9, 30).date())

    def test_totals_are_derived_from_returned_records(self):
        result = report([contribution(), contribution('two')], [claim()])
        for field in ('expected', 'confirmed', 'outstanding', 'awaiting_review'):
            self.assertEqual(result['summary'][field], sum(r[field] for r in result['contributions']))
        self.assertEqual(result['summary']['actual_payouts'], sum(r['amount'] for r in result['payout_payments']))
        self.assertEqual(result['summary']['current_commitments'], sum(r['remaining'] for r in result['current_commitments']))

    def test_invalid_amounts_duplicate_ids_and_invalid_period_fail_closed(self):
        for records in ([{**contribution(), 'amount_due': float('nan')}], [contribution(), contribution()]):
            with self.assertRaises(ValueError): report(records)
        with self.assertRaises(ValueError): report(month=13)
        with self.assertRaises(ValueError): report(claims=[claim(payout_payments=[dict(id='same', amount=2)] * 2)])

    def test_read_only_service_does_not_mutate_inputs(self):
        rows, claims = [contribution()], [claim()]
        before = copy.deepcopy((rows, claims)); report(rows, claims)
        self.assertEqual((rows, claims), before)

    def test_existing_operational_and_export_functions_unchanged(self):
        current = (ROOT / 'backend/server.py').read_text()
        previous = subprocess.check_output(['git', 'show', '267b31427060e7d539df7cfd34b0f3d0249c8c59:backend/server.py'], cwd=ROOT, text=True)
        original = {n.name: ast.get_source_segment(previous, n) for n in ast.parse(previous).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        for node in ast.parse(current).body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in original:
                self.assertEqual(ast.get_source_segment(current, node), original[node.name], node.name)


class MonthlyReportRouteTests(unittest.IsolatedAsyncioTestCase):
    def setup_route(self):
        ns = environment()
        node = next(n for n in ast.parse((ROOT / 'backend/server.py').read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_monthly_group_report')
        node.decorator_list = []
        ns['monthly_report'] = service.monthly_report
        ns['db'].claims = Collection([claim()])
        ns['db'].contributions = Collection([contribution(proof_of_payment='private-base64')])
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'actual-monthly-route', 'exec'), ns)  # noqa: S102 - Execute the actual handler against isolated offline collections.
        return ns

    async def test_no_token_normal_member_cross_club_and_inactive_denied(self):
        for user, membership_status, expected in [(None, 'active', 401), ('member-user', 'active', 403), ('outsider', 'active', 403), ('admin-user', 'inactive', 403), ('admin-user', 'removed', 403)]:
            ns = self.setup_route(); ns['db'].members.records[1]['status'] = membership_status
            before = copy.deepcopy({k: v.records for k, v in vars(ns['db']).items()})
            with self.assertRaises(HTTPError) as caught:
                await ns['get_monthly_group_report']('group-a', 2026, 10, authorization=f'Bearer {user}' if user else None)
            self.assertEqual(caught.exception.status_code, expected)
            self.assertEqual({k: v.records for k, v in vars(ns['db']).items()}, before)

    async def test_active_admin_and_treasurer_read_only_and_proof_content_excluded(self):
        for role in ('admin', 'treasurer'):
            ns = self.setup_route(); ns['db'].members.records[1]['role_in_group'] = role
            before = copy.deepcopy({k: v.records for k, v in vars(ns['db']).items()})
            result = await ns['get_monthly_group_report']('group-a', 2026, 10, authorization='Bearer admin-user')
            self.assertEqual(result['summary']['expected'], 100)
            self.assertNotIn('private-base64', str(result))
            self.assertEqual({k: v.records for k, v in vars(ns['db']).items()}, before)
            self.assertEqual(ns['db'].contributions.reads[-1][2], {'proof_of_payment': 0})

    async def test_inactive_club_invalid_period_and_invalid_financial_data(self):
        ns = self.setup_route(); ns['db'].groups.records[0]['status'] = 'inactive'
        with self.assertRaises(HTTPError) as caught:
            await ns['get_monthly_group_report']('group-a', 2026, 10, authorization='Bearer admin-user')
        self.assertEqual(caught.exception.status_code, 404)
        ns = self.setup_route()
        for month, expected in [(13, 422), (10, 409)]:
            ns['db'].contributions.records[0]['amount_due'] = -1
            with self.assertRaises(HTTPError) as caught:
                await ns['get_monthly_group_report']('group-a', 2026, month, authorization='Bearer admin-user')
            self.assertEqual(caught.exception.status_code, expected)
