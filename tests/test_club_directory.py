"""Offline tests of the actual club directory route with authenticated synthetic identities."""
import ast
import unittest
from pathlib import Path
from typing import Optional
from test_member_read_authorization import environment, snapshot, bearer
from test_account_authorization import DenyDatabase, HTTPError as AuthHTTPError


def directory_environment():
    ns = environment()
    node = next(n for n in ast.parse((Path(__file__).resolve().parents[1]/'backend/server.py').read_text()).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_club_directory')
    node.decorator_list = []
    ns['Optional'] = Optional
    ns['Header'] = lambda default: default
    exec(compile(ast.Module(body=[node], type_ignores=[]), 'directory-route', 'exec'), ns)
    return ns


class DirectoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_member_and_admin_receive_existing_photos_names_and_club_roles_only(self):
        for actor in ['member-user', 'admin-user']:
            ns=directory_environment()
            for person in ns['db'].users.records:
                person['profile_photo']='data:image/jpeg;base64,'+person['id']
                person['password']='PRIVATE';person['bank_account']='PRIVATE'
            before=snapshot(ns)
            result=await ns['get_club_directory']('group-a',bearer(actor))
            self.assertEqual(set(result),{'group_id','members'})
            self.assertEqual(result['group_id'],'group-a')
            self.assertTrue(result['members'])
            for row in result['members']:
                self.assertEqual(set(row),{'id','name','profile_photo','role'})
                self.assertTrue(row['profile_photo'].startswith('data:image/jpeg;base64,'))
            self.assertEqual(before,snapshot(ns))
            self.assertEqual(len([read for read in ns['db'].users.reads if read[0]=='find']),1)
            self.assertFalse(ns['db'].contributions.reads)

    async def test_missing_photo_is_null_and_role_is_selected_club_membership(self):
        ns=directory_environment()
        ns['db'].members.records[0]['role_in_group']='treasurer'
        result=await ns['get_club_directory']('group-a',bearer('member-user'))
        row=next(row for row in result['members'] if row['id']==ns['db'].members.records[0]['id'])
        self.assertIsNone(row['profile_photo']);self.assertEqual(row['role'],'treasurer')

    async def test_missing_invalid_forged_and_expired_bearer_rejected_before_database(self):
        for token in [None,'Bearer invalid',bearer('member-user',key='wrong-key'),bearer('member-user',expired=True)]:
            ns=directory_environment();ns['db']=DenyDatabase()
            with self.assertRaises(AuthHTTPError) as caught:await ns['get_club_directory']('group-a',token)
            self.assertEqual(caught.exception.status_code,401);self.assertEqual(ns['db'].accesses,0)

    async def test_nonmember_cross_club_and_removed_inactive_members_denied(self):
        for actor,state in [('other-member',None),('member-user','inactive'),('member-user','removed'),('member-user','deleted')]:
            ns=directory_environment()
            if state == 'deleted':ns['db'].members.records.pop(0)
            elif state:ns['db'].members.records[0]['status']=state
            before=snapshot(ns)
            with self.assertRaises(ns['HTTPException']) as caught:await ns['get_club_directory']('group-a',bearer(actor))
            self.assertEqual(caught.exception.status_code,403);self.assertEqual(snapshot(ns),before);self.assertFalse(ns['db'].users.reads)

    async def test_inactive_club_rejected_and_foreign_inactive_identities_not_returned(self):
        ns=directory_environment();ns['db'].groups.records[0]['status']='inactive'
        with self.assertRaises(ns['HTTPException']) as caught:await ns['get_club_directory']('group-a',bearer('member-user'))
        self.assertEqual(caught.exception.status_code,404)
        ns=directory_environment();ns['db'].members.records[1]['status']='inactive'
        result=await ns['get_club_directory']('group-a',bearer('member-user'))
        ids={row['id'] for row in result['members']}
        self.assertNotIn(ns['db'].members.records[1]['id'],ids);self.assertNotIn(ns['db'].members.records[2]['id'],ids)

    def test_existing_backend_and_financial_intelligence_handlers_unchanged(self):
        import subprocess
        root=Path(__file__).resolve().parents[1]
        functions=lambda source:{n.name:ast.dump(n) for n in ast.parse(source).body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
        old=functions(subprocess.check_output(['git','show','d632d6b62f52911a5bb7218ef826ef385464bf97:backend/server.py'],cwd=root,text=True));new=functions((root/'backend/server.py').read_text())
        self.assertEqual(set(new)-set(old),{'get_club_directory', 'get_club_home_context'})
        for name,body in old.items():self.assertEqual(new[name],body,name)

    async def test_inactive_or_missing_user_records_are_not_exposed(self):
        for missing in [False, True]:
            ns=directory_environment()
            admin=next(row for row in ns['db'].users.records if row['id']=='admin-user')
            if missing:ns['db'].users.records.remove(admin)
            else:admin['status']='inactive'
            result=await ns['get_club_directory']('group-a',bearer('member-user'))
            admin_ids={row['id'] for row in ns['db'].members.records if row['user_id']=='admin-user'}
            self.assertFalse(admin_ids.intersection(row['id'] for row in result['members']))

    async def test_inactive_or_deleted_account_cannot_use_retained_membership(self):
        for missing in [False, True]:
            ns=directory_environment();person=next(row for row in ns['db'].users.records if row['id']=='member-user')
            if missing:ns['db'].users.records.remove(person)
            else:person['status']='inactive'
            with self.assertRaises(ns['HTTPException']) as caught:await ns['get_club_directory']('group-a',bearer('member-user'))
            self.assertEqual(caught.exception.status_code,403)
