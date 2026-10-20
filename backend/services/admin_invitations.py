"""Conditional group reservations for the existing invitation lifecycle."""
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException


async def administrators(db, group):
    rows = await db.members.find({'group_id': group['id']}).to_list(None)
    memberships = {row['user_id']: row for row in rows}
    active = {row['user_id'] for row in rows
              if row.get('status') == 'active' and row.get('role_in_group') in ('admin', 'treasurer')}
    # Historical ownership counts only when no explicit membership overrides it.
    legacy = set(group.get('admin_user_ids', []))
    if group.get('treasurer_user_id'):
        legacy.add(group['treasurer_user_id'])
    return active | {person for person in legacy if person not in memberships}


async def active_slots(db, group):
    slots = []
    for item in group.get('admin_invitation_slots', []):
        invitation = await db.invitations.find_one({'id': item['id']})
        if invitation and invitation['status'] in ('accepted', 'declined', 'expired'):
            continue
        accepting = invitation and invitation['status'] == 'accepting'
        expiry = invitation['expires_at'] if invitation else item['expires_at']
        prepared = item.get('state') == 'accepting'
        if invitation and invitation.get('intended_role') == 'admin' and expiry <= datetime.now(UTC).replace(tzinfo=None):
            if not await cancel_admin_grant(db, invitation, 'expired'):
                slots.append(dict(item))
            continue
        if accepting or prepared or expiry > datetime.now(UTC).replace(tzinfo=None):
            slot = dict(item)
            if accepting:
                slot['state'] = 'accepting'
            slots.append(slot)
    return slots


async def change_slots(db, group, slots, **fields):
    revision = group.get('admin_invitation_revision')
    result = await db.groups.update_one(
        {'id': group['id'], 'status': 'active', 'admin_invitations_closed': {'$ne': True},
         'admin_invitation_revision': revision,
         'admin_user_ids': group.get('admin_user_ids')},
        {'$set': {'admin_invitation_slots': slots,
                  'admin_invitation_revision': (revision or 0) + 1, **fields}})
    return result.modified_count == 1


async def reserve_invitation(db, group_id, phone, aliases, role, inviter, name=None):
    """A single group CAS arbitrates duplicate recipients, roles and capacity."""
    for _ in range(20):
        group = await db.groups.find_one({'id': group_id, 'status': 'active', 'admin_invitations_closed': {'$ne': True}})
        if not group:
            raise HTTPException(404, 'Active group not found')
        now = datetime.now(UTC).replace(tzinfo=None)
        slots = await active_slots(db, group)
        accepting = await db.invitations.find_one({
            'group_id': group_id, 'phone_number': {'$in': aliases}, 'status': 'accepting'})
        if accepting:
            raise HTTPException(409, 'This invitation is being accepted')
        existing = await db.invitations.find_one({
            'group_id': group_id, 'phone_number': {'$in': aliases},
            'status': 'pending', 'expires_at': {'$gt': now}})
        if existing and existing.get('intended_role', 'member') != role:
            raise HTTPException(409, 'A pending invitation for a different role already exists')
        slot = next((item for item in slots if item['phone_number'] == phone), None)
        if slot and slot['intended_role'] != role:
            raise HTTPException(409, 'A pending invitation for a different role already exists')
        if slot and slot['state'] == 'accepting':
            raise HTTPException(409, 'This invitation is being accepted')
        reused = slot is not None or existing is not None
        if slot is None:
            slot = {'id': existing['id'] if existing else 'inv_' + uuid.uuid4().hex,
                    'phone_number': phone, 'intended_role': role, 'state': 'pending',
                    'invited_by': existing['invited_by'] if existing else inviter['id'],
                    'treasurer_name': existing.get('treasurer_name') if existing else inviter['full_name'],
                    'created_at': existing['created_at'] if existing else now,
                    'expires_at': existing['expires_at'] if existing else now + timedelta(days=7),
                    'name': existing.get('name') if existing else name}
            if role == 'admin':
                issuer = await db.members.find_one({'user_id': slot['invited_by'], 'group_id': group_id,
                                                    'status': 'active', 'role_in_group': {'$in': ['admin', 'treasurer']}})
                issuer_user = await db.users.find_one({'id': slot['invited_by']})
                if not issuer or not issuer_user or issuer_user.get('account_deletion_started'):
                    raise HTTPException(403, 'Inviter membership is no longer authorized')
                slot['inviter_membership_id'] = issuer['id']
            slots.append(slot)
        admins = await administrators(db, group)
        reserved = sum(item['intended_role'] == 'admin' and item.get('recipient_id') not in admins
                       for item in slots)
        if role == 'admin' and len(admins) + reserved > min(group.get('max_admins', 5), 5):
            raise HTTPException(400, 'Maximum 5 Admins, including pending Admin invitations, allowed per club')
        if not await change_slots(db, group, slots):
            continue
        document = {key: value for key, value in slot.items()
                    if key not in ('state', 'recipient_id')}
        document.update(group_id=group_id, group_name=group['group_name'], status='pending')
        # Existing Mongo _id uniqueness needs no index or migration. Reservation
        # retries repair interrupted persistence using the same invitation identity.
        if existing is None:
            await db.invitations.update_one({'_id': slot['id']}, {'$setOnInsert': document}, upsert=True)
        invitation = await db.invitations.find_one({'id': slot['id']})
        if invitation is None or invitation['status'] != 'pending':
            raise HTTPException(409, 'Invitation changed. Please refresh')
        return invitation, group, reused
    raise HTTPException(409, 'Club invitations changed. Please try again')


async def accepting_slot(db, invitation, recipient_id):
    for _ in range(20):
        group = await db.groups.find_one({'id': invitation['group_id'], 'status': 'active', 'admin_invitations_closed': {'$ne': True}})
        if not group:
            raise HTTPException(404, 'Active group not found')
        slots = await active_slots(db, group)
        slot = next((item for item in slots if item['id'] == invitation['id']), None)
        if slot is None:
            raise HTTPException(409, 'Admin invitation reservation is unavailable')
        slot.update(state='accepting', recipient_id=recipient_id)
        admins = await administrators(db, group)
        reserved = sum(item['intended_role'] == 'admin' and item.get('recipient_id') not in admins for item in slots)
        if len(admins) + reserved > min(group.get('max_admins', 5), 5):
            raise HTTPException(409, 'Admin capacity is no longer available')
        if await change_slots(db, group, slots):
            return group
    raise HTTPException(409, 'Club invitations changed. Please try again')


async def release_slot(db, invitation):
    for _ in range(20):
        group = await db.groups.find_one({'id': invitation['group_id']})
        if not group or group.get('admin_invitations_closed'):
            return
        slots = [item for item in group.get('admin_invitation_slots', []) if item['id'] != invitation['id']]
        if len(slots) == len(group.get('admin_invitation_slots', [])):
            return
        if await change_slots(db, group, slots):
            return
    raise HTTPException(409, 'Club invitations changed. Please try again')


async def grant_decision(db, invitation):
    """Decisions live on the original issuer membership, including its tombstone."""
    issuer = await db.members.find_one({'id': invitation['inviter_membership_id'],
                                        'user_id': invitation['invited_by'], 'group_id': invitation['group_id']})
    return (issuer or {}).get('admin_invitation_decisions', {}).get(invitation['id'])


async def cancel_admin_grant(db, invitation, reason):
    """Cancellation and grant compete for one immutable field on one document."""
    path = 'admin_invitation_decisions.' + invitation['id']
    await db.members.update_one(
        {'id': invitation['inviter_membership_id'], 'user_id': invitation['invited_by'],
         'group_id': invitation['group_id'], path: {'$exists': False}},
        {'$set': {path: {'decision': 'cancelled', 'invitation_id': invitation['id'],
                        'reason': reason, 'committed_at': datetime.now(UTC).replace(tzinfo=None)}}})
    decision = await grant_decision(db, invitation)
    if decision and decision['decision'] == 'granted':
        return False
    # A missing original membership cannot commit a receipt: grant never upserts it.
    await db.invitations.update_one(
        {'id': invitation['id'], 'status': {'$in': ['pending', 'accepting']}},
        {'$set': {'status': reason}, '$unset': {'accepting_by': ''}})
    await db.members.delete_one(
        {'group_id': invitation['group_id'], 'status': 'invitation_accepting',
         'role_in_group': 'member', 'admin_invitation_id': invitation['id'],
         'admin_grant_applied': {'$exists': False}})
    await release_slot(db, invitation)
    return True


async def commit_admin_grant(db, invitation, recipient_id, membership_id):
    path = 'admin_invitation_decisions.' + invitation['id']
    receipt = {'decision': 'granted', 'invitation_id': invitation['id'],
               'recipient_user_id': recipient_id, 'recipient_membership_id': membership_id,
               'group_id': invitation['group_id'], 'intended_role': 'admin',
               'committed_at': datetime.now(UTC).replace(tzinfo=None)}
    await db.members.update_one(
        {'id': invitation['inviter_membership_id'], 'user_id': invitation['invited_by'],
         'group_id': invitation['group_id'], 'status': 'active',
         'role_in_group': {'$in': ['admin', 'treasurer']}, path: {'$exists': False}},
        {'$set': {path: receipt}})
    decision = await grant_decision(db, invitation)
    if not decision or decision['decision'] != 'granted':
        await cancel_admin_grant(db, invitation, 'declined')
        raise HTTPException(403, 'Inviter revoked or invitation cancelled before the grant')
    if decision['recipient_user_id'] != recipient_id or decision['recipient_membership_id'] != membership_id:
        raise HTTPException(409, 'Invitation grant belongs to a different membership')
    return decision
