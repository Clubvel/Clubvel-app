import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).resolve().parents[1] / 'backend/scripts/audit_staging.py'
spec = importlib.util.spec_from_file_location('staging_audit', source)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class StagingAuditTests(unittest.TestCase):
    def test_equivalent_accounts_are_reported_without_mutation(self):
        records = [{'id': 'a', 'phone_number': '0821234567'}, {'id': 'b', 'phone_number': '+27821234567'}]
        result = audit.audit_users(records, '0821234567')
        self.assertEqual(result['phone_conflicts'][0]['user_ids'], ['a', 'b'])
        self.assertEqual(result['test_account']['status'], 'conflict_manual_review_required')
        self.assertEqual(records[0]['phone_number'], '0821234567')

    def test_bad_existing_sparse_index_keys_are_reported(self):
        result = audit.audit_users([{'id': 'a', 'phone_number': '0821234567', 'phone_e164': None},
                                    {'id': 'b', 'phone_number': '0831234567', 'phone_e164': None}])
        self.assertEqual(result['duplicate_existing_index_keys'], [['a', 'b']])
        self.assertEqual(result['canonical_key_mismatch_user_ids'], ['a', 'b'])

    def test_existing_test_account_handling_is_explicit(self):
        for verified, status in [(False, 'verification_required'), (True, 'existing_password_login'), (None, 'existing_password_login')]:
            record = {'id': 'test', 'phone_number': '(082) 123-4567', 'otp_verified': verified}
            self.assertEqual(audit.audit_users([record], '+27821234567')['test_account']['status'], status)

    def test_broad_or_unknown_database_permissions_do_not_prove_isolation(self):
        self.assertTrue(audit.database_scoped_reads([{'resource': {'db': 'stage', 'collection': ''}, 'actions': ['find']}], 'stage'))
        for privileges in [[], [{'resource': {'db': '', 'collection': ''}, 'actions': ['find']}],
                           [{'resource': {'anyResource': True}, 'actions': ['find']}],
                           [{'resource': {'db': 'prod'}, 'actions': ['find']}]]:
            self.assertFalse(audit.database_scoped_reads(privileges, 'stage'))
