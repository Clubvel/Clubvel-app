"""Offline execution of invitation handlers and isolated SMS delivery."""
import ast
import copy
import logging
import subprocess
import sys
import unittest
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as Obj
from typing import Optional
from unittest.mock import AsyncMock, Mock, patch

from services.phone_numbers import normalize_phone, phone_aliases
from test_authentication import Collection as BaseCollection
from test_authentication import DuplicateKeyError, HTTPError

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'backend/server.py'
NOTIFICATIONS = ROOT / 'backend/services/notification_service.py'


def matches(record, query):
    for key, value in query.items():
        actual = record.get(key)
        if isinstance(value, dict):
            if '$in' in value and actual not in value['$in']: return False
            if '$gt' in value and not (actual is not None and actual > value['$gt']): return False
        elif actual != value: return False
    return True


class Collection(BaseCollection):
    async def find_one(self, query):
        return next((r for r in self.records if matches(r, query)), None)
    def find(self, query):
        return Obj(to_list=AsyncMock(return_value=[r for r in self.records if matches(r, query)]))
    async def count_documents(self, query): return sum(matches(r, query) for r in self.records)
    async def insert_one(self, record):
        if record.get('_id') and any(r.get('_id') == record['_id'] for r in self.records): raise DuplicateKeyError()
        await super().insert_one(record)
    async def update_one(self, query, update):
        record = await self.find_one(query)
        if record is None: return Obj(modified_count=0)
        before = copy.deepcopy(record)
        record.update(copy.deepcopy(update.get('$set', {})))
        for key in update.get('$unset', {}): record.pop(key, None)
        for key, value in update.get('$addToSet', {}).items():
            values = record.setdefault(key, [])
            if value not in values: values.append(value)
        return Obj(modified_count=int(record != before))


class Member(Obj):
    def __init__(self, **data): super().__init__(id='member-' + uuid.uuid4().hex, **data)
    def dict(self): return vars(self).copy()


def environment():
    names = {'authenticated_user_id', 'verify_user_is_group_treasurer', 'invite_member',
             'get_pending_invitations', 'accept_invitation'}
    nodes = [n for n in ast.parse(SOURCE.read_text()).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
    for n in nodes: n.decorator_list = []
    def token(value):
        if value not in ('admin', 'treasurer', 'recipient', 'outsider'): raise HTTPError(401, 'Invalid session')
        return {'user_id': value}
    db = Obj(groups=Collection([{'id': 'group', 'group_name': 'WeTraveling', 'status': 'active'}]),
             users=Collection([{'id': uid, 'full_name': 'Admin Name' if uid == 'admin' else uid,
                                'phone_number': '+27821234567' if uid == 'recipient' else '+27831234567'}
                               for uid in ('admin', 'treasurer', 'recipient', 'outsider')]),
             members=Collection([{'id': uid, 'user_id': uid, 'group_id': 'group', 'status': 'active', 'role_in_group': role}
                                 for uid, role in [('admin', 'admin'), ('treasurer', 'treasurer')]]), invitations=Collection())
    async def user(uid):
        found = await db.users.find_one({'id': uid})
        if not found: raise HTTPError(404, 'User not found')
        return found
    ns = {'db': db, 'Optional': Optional, 'Header': lambda default: default, 'HTTPException': HTTPError,
              'InviteMemberRequest': Obj, 'AcceptInvitationRequest': Obj, 'datetime': datetime, 'timedelta': timedelta,
              'uuid': uuid, 'verify_token': token, 'verify_user_exists': user, 'Member': Member,
              'DuplicateKeyError': DuplicateKeyError, 'format_phone_number': normalize_phone,
              'phone_variants': lambda phone: sorted(set(phone_aliases(phone)) | {phone}),
              'reconcile_legacy_group_admin_membership': AsyncMock(return_value=None),
              'generate_reference_code': lambda prefix, position: f'{prefix}{position}'}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'invitation-routes', 'exec'), ns)  # noqa: S102 - Execute actual handlers with offline fixtures.
    return ns


def request(channel='whatsapp', **changes):
    return Obj(**{'phone_number': '0821234567', 'name': None, 'group_id': 'group',
                  'invited_by': 'admin', 'group_name': 'Spoofed Club', 'treasurer_name': 'Spoofed Admin',
                  'channel': channel, **changes})


@contextmanager
def sms_delivery(**options):
    sender = AsyncMock(**options)
    with patch.dict(sys.modules, {'services.notification_service': Obj(send_invitation_sms=sender)}):
        yield sender


class InvitationTests(unittest.IsolatedAsyncioTestCase):
    async def test_whatsapp_creates_one_pending_authoritative_invitation_without_delivery_or_membership(self):
        ns = environment(); before = copy.deepcopy(ns['db'].members.records)
        with sms_delivery() as sms:
            result = await ns['invite_member'](request(), 'Bearer admin')
            sms.assert_not_called()
        self.assertEqual(len(ns['db'].invitations.records), 1)
        invitation = ns['db'].invitations.records[0]
        self.assertEqual(invitation['status'], 'pending')
        self.assertEqual(invitation['invited_by'], 'admin')
        self.assertEqual(invitation['group_name'], 'WeTraveling')
        self.assertEqual(result['phone_number'], '+27821234567')
        self.assertEqual(result['delivery_status'], 'ready')
        self.assertEqual(result['invitation_message'], 'Hi! Admin Name has invited you to join WeTraveling on Clubvel. Sign in or register using this phone number, then open My Clubvel → Join Group and accept. Your invitation is valid for 7 days.')
        self.assertNotIn(invitation['id'], result['invitation_message'])
        self.assertEqual(before, ns['db'].members.records)

    async def test_switching_retry_aliases_and_sms_reuse_original_record_and_expiry(self):
        ns = environment(); first = await ns['invite_member'](request(), 'Bearer admin')
        original = copy.deepcopy(ns['db'].invitations.records[0])
        with sms_delivery(return_value={'success': True, 'mock': False}) as sms:
            second = await ns['invite_member'](request('sms', phone_number='+27821234567'), 'Bearer admin')
            third = await ns['invite_member'](request(), 'Bearer admin')
            sms.assert_awaited_once_with('+27821234567', second['invitation_message'])
        self.assertEqual({first['invitation_id'], second['invitation_id'], third['invitation_id']}, {original['id']})
        self.assertEqual(second['delivery_status'], 'submitted')
        self.assertEqual(ns['db'].invitations.records, [original])
        self.assertIn('expires on', second['invitation_message'])
        self.assertEqual(second['invitation_message'], third['invitation_message'])

    async def test_new_sms_uses_same_message_as_new_whatsapp_and_no_otp_sender(self):
        whatsapp = await environment()['invite_member'](request(), 'Bearer admin')
        ns = environment()
        with sms_delivery(return_value={'success': True, 'mock': False}) as sms:
            result = await ns['invite_member'](request('sms'), 'Bearer admin')
        self.assertEqual(result['invitation_message'], whatsapp['invitation_message'])
        sms.assert_awaited_once_with('+27821234567', whatsapp['invitation_message'])
        self.assertNotIn('0000', result['invitation_message'])

    async def test_pending_lookup_requires_own_session_and_expired_acceptance_is_rejected(self):
        ns = environment(); result = await ns['invite_member'](request(), 'Bearer admin')
        for token, expected in [(None, 401), ('Bearer outsider', 403)]:
            with self.assertRaises(HTTPError) as error:
                await ns['get_pending_invitations']('recipient', token)
            self.assertEqual(error.exception.status_code, expected)
        ns['db'].invitations.records[0]['expires_at'] = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        self.assertEqual((await ns['get_pending_invitations']('recipient', 'Bearer recipient'))['invitations'], [])
        with self.assertRaises(HTTPError) as error:
            await ns['accept_invitation'](Obj(invitation_id=result['invitation_id'], user_id='recipient'), 'Bearer recipient')
        self.assertEqual(error.exception.status_code, 404)
        self.assertFalse(any(m.get('user_id') == 'recipient' for m in ns['db'].members.records))

    async def test_existing_member_rejected_and_expired_invitation_replaced(self):
        ns = environment(); ns['db'].members.records.append({'user_id': 'recipient', 'group_id': 'group'})
        with self.assertRaises(HTTPError) as error: await ns['invite_member'](request(), 'Bearer admin')
        self.assertEqual(error.exception.status_code, 400); self.assertEqual(ns['db'].invitations.records, [])
        ns = environment(); first = await ns['invite_member'](request(), 'Bearer admin')
        ns['db'].invitations.records[0]['expires_at'] = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        second = await ns['invite_member'](request(), 'Bearer admin')
        self.assertNotEqual(first['invitation_id'], second['invitation_id'])
        self.assertFalse(second['reused'])

    async def test_invalid_phone_and_unauthorized_inviter_are_controlled(self):
        for payload, token, status in [(request(), None, 401), (request(), 'Bearer invalid', 401),
                                       (request(invited_by='admin'), 'Bearer outsider', 403),
                                       (request(phone_number='not-a-phone'), 'Bearer admin', 422)]:
            ns = environment()
            with self.assertRaises(HTTPError) as error: await ns['invite_member'](payload, token)
            self.assertEqual(error.exception.status_code, status)
            self.assertEqual(ns['db'].invitations.records, [])
        ns = environment(); await ns['invite_member'](request(invited_by='admin'), 'Bearer treasurer')
        self.assertEqual(ns['db'].invitations.records[0]['invited_by'], 'treasurer')

    async def test_sms_failure_mock_and_exception_preserve_pending_invitation(self):
        for result, expected in [({'success': False}, 'failed'), ({'success': False, 'mock': True}, 'mock')]:
            ns = environment()
            with sms_delivery(return_value=result):
                response = await ns['invite_member'](request('sms'), 'Bearer admin')
            self.assertEqual(response['delivery_status'], expected)
            self.assertEqual(ns['db'].invitations.records[0]['status'], 'pending')
        ns = environment()
        with sms_delivery(side_effect=RuntimeError()):
            self.assertEqual((await ns['invite_member'](request('sms'), 'Bearer admin'))['delivery_status'], 'failed')

    async def test_authenticated_phone_acceptance_and_repeated_acceptance(self):
        ns = environment(); result = await ns['invite_member'](request(), 'Bearer admin')
        pending = await ns['get_pending_invitations']('recipient', 'Bearer recipient')
        self.assertEqual(pending['invitations'][0]['id'], result['invitation_id'])
        payload = Obj(invitation_id=result['invitation_id'], user_id='recipient')
        for user, token, status in [('recipient', None, 401), ('recipient', 'Bearer outsider', 403), ('outsider', 'Bearer outsider', 404)]:
            with self.assertRaises(HTTPError) as error:
                await ns['accept_invitation'](Obj(invitation_id=payload.invitation_id, user_id=user), token)
            self.assertEqual(error.exception.status_code, status)
        await ns['accept_invitation'](payload, 'Bearer recipient')
        self.assertEqual(ns['db'].invitations.records[0]['status'], 'accepted')
        self.assertEqual(sum(m.get('user_id') == 'recipient' for m in ns['db'].members.records), 1)
        with self.assertRaises(HTTPError): await ns['accept_invitation'](payload, 'Bearer recipient')
        self.assertEqual(sum(m.get('user_id') == 'recipient' for m in ns['db'].members.records), 1)

    async def test_sms_sender_submits_actual_text_and_reports_failure_mock(self):
        node = next(n for n in ast.parse(NOTIFICATIONS.read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'send_invitation_sms')
        ns = {'Dict': dict, 'Any': object, 'ENABLE_REAL_NOTIFICATIONS': True, 'is_twilio_configured': lambda: True,
                  'TWILIO_ACCOUNT_SID': 'offline', 'TWILIO_AUTH_TOKEN': 'offline', 'TWILIO_PHONE_NUMBER': 'sender',
                  'format_phone_number': normalize_phone, 'logger': logging.getLogger('offline-invitation')}
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'invitation-sms', 'exec'), ns)  # noqa: S102 - Isolate actual sender from live configuration.
        client = Mock(); provider = Obj(Client=Mock(return_value=client))
        with patch.dict(sys.modules, {'twilio.rest': provider}):
            result = await ns['send_invitation_sms']('0821234567', 'Actual invitation text')
            self.assertTrue(result['success'])
            client.messages.create.assert_called_once_with(from_='sender', to='+27821234567', body='Actual invitation text')
            client.messages.create.side_effect = RuntimeError('provider failure')
            self.assertFalse((await ns['send_invitation_sms']('0821234567', 'text'))['success'])
            ns['ENABLE_REAL_NOTIFICATIONS'] = False
            client.messages.create.reset_mock()
            result = await ns['send_invitation_sms']('0821234567', 'text')
            self.assertTrue(result['mock']); self.assertFalse(result['success']); client.messages.create.assert_not_called()

    def test_otp_acceptance_reports_and_payment_handlers_unchanged(self):
        def base(path): return subprocess.check_output(['git', 'show', 'HEAD:' + path], cwd=ROOT, text=True)
        def functions(source): return {n.name: ast.dump(n) for n in ast.parse(source).body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
        old, new = functions(base('backend/services/notification_service.py')), functions(NOTIFICATIONS.read_text())
        for name, body in old.items(): self.assertEqual(new[name], body, name)
        old, new = functions(base('backend/server.py')), functions(SOURCE.read_text())
        for name, body in old.items():
            if name != 'invite_member': self.assertEqual(new[name], body, name)
        self.assertNotIn('send_sms_otp', ast.get_source_segment(SOURCE.read_text(), next(n for n in ast.parse(SOURCE.read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'invite_member')))
        for path in ['frontend/app/(member)/home.tsx', 'frontend/app/(treasurer)/reports.tsx', 'frontend/services/pdfReportService.ts']:
            self.assertEqual((ROOT / path).read_text(), base(path))
