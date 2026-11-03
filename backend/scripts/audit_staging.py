"""Read-only staging audit. Never imports server.py or creates indexes/data.

Run only after confirming expected host/database against Railway STAGING
variables. Supply the URI privately as CLUBVEL_STAGING_MONGO_URL, not an argument.
The audit refuses data inspection if the connected credential can read other DBs.
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.phone_numbers import normalize_phone


def audit_users(records, test_phone=None):
    groups = defaultdict(list)
    invalid, key_mismatches, present_keys = [], [], defaultdict(list)
    for user in records:
        identifier = str(user.get('id', user.get('_id', 'missing-id')))
        try:
            normalized = normalize_phone(user.get('phone_number', ''))
            groups[normalized].append(user)
        except (ValueError, TypeError):
            invalid.append(identifier)
            normalized = None
        if 'phone_e164' in user:
            key = user['phone_e164']
            present_keys[json.dumps(key, sort_keys=True, default=str)].append(identifier)
            if not isinstance(key, str) or key != normalized:
                key_mismatches.append(identifier)
    conflicts = [{'phone_suffix': '***' + phone[-4:],
                  'user_ids': [str(u.get('id', u.get('_id'))) for u in users]}
                 for phone, users in groups.items() if len(users) > 1]
    test = {'status': 'not_requested'}
    if test_phone:
        matching = groups.get(normalize_phone(test_phone), [])
        if len(matching) > 1:
            test = {'status': 'conflict_manual_review_required'}
        elif not matching:
            test = {'status': 'not_found'}
        else:
            user = matching[0]
            test = {'status': 'verification_required' if user.get('otp_verified') is False else 'existing_password_login',
                    'user_id': str(user.get('id', user.get('_id'))),
                    'data_action': 'No rename, password change, account replacement or membership rewrite.'}
    return {'phone_conflicts': conflicts, 'invalid_phone_user_ids': invalid,
            'canonical_key_mismatch_user_ids': key_mismatches,
            'duplicate_existing_index_keys': [ids for ids in present_keys.values() if len(ids) > 1],
            'test_account': test}


def database_scoped_reads(privileges, expected_database):
    reads = [p.get('resource', {}) for p in privileges if 'find' in p.get('actions', [])]
    return bool(reads) and all(r.get('db') == expected_database and not r.get('anyResource') for r in reads)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-host', required=True)
    parser.add_argument('--expected-database', required=True)
    args = parser.parse_args()
    if os.environ.get('CLUBVEL_ENV') != 'staging':
        raise ValueError('Set CLUBVEL_ENV=staging only after confirming Railway staging identity.')
    uri = os.environ.get('CLUBVEL_STAGING_MONGO_URL', '')
    parsed = urlsplit(uri)
    if parsed.scheme not in {'mongodb', 'mongodb+srv'} or parsed.hostname != args.expected_host:
        raise ValueError('Staging URI host does not match the independently confirmed host.')
    uri_database = parsed.path.strip('/')
    if uri_database and uri_database != args.expected_database:
        raise ValueError('Staging URI database does not match expected database.')
    if args.expected_database in {'admin', 'config', 'local'}:
        raise ValueError('A MongoDB internal database is not a Clubvel staging database.')

    # Import only after all local guards pass; this module needs no credentials
    # to run its unit tests. There are no update/delete/index/create calls here.
    from pymongo import MongoClient
    client = MongoClient(uri, serverSelectionTimeoutMS=10000, connectTimeoutMS=10000, appname='ClubvelReadOnlyStagingAudit')
    try:
        status = client.admin.command('connectionStatus', showPrivileges=True)
        privileges = status.get('authInfo', {}).get('authenticatedUserPrivileges', [])
        if not database_scoped_reads(privileges, args.expected_database):
            raise ValueError('Database isolation is unverified: credential can read other databases or its scope is unavailable. No collection data inspected.')
        db = client[args.expected_database]
        collection_names = db.list_collection_names()
        counts = {name: db[name].count_documents({}, maxTimeMS=10000) for name in collection_names}
        users = list(db.users.find({}, {'id': 1, 'phone_number': 1, 'phone_e164': 1, 'otp_verified': 1}).max_time_ms(10000))
        result = audit_users(users, os.environ.get('CLUBVEL_STAGING_TEST_PHONE'))
        result.update({'environment': 'staging', 'host': args.expected_host, 'database': args.expected_database,
                       'credential_read_scope': 'selected_database_only', 'collection_counts': counts,
                       'users_indexes': list(db.users.list_indexes()) if 'users' in collection_names else [],
                       'otp_indexes': list(db.auth_otp_challenges.list_indexes()) if 'auth_otp_challenges' in collection_names else [],
                       'writes_performed': 0})
        print(json.dumps(result, indent=2, default=str))
    finally:
        client.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Avoid printing database-driver exception details that may embed a URI.
        if isinstance(error, ValueError): print(str(error), file=sys.stderr)
        else: print(f'Audit blocked ({type(error).__name__}); connection values withheld.', file=sys.stderr)
        sys.exit(1)
