"""Offline ownership/audit tests execute actual dismissal and claim handlers."""
import ast
import copy
import unittest
from types import SimpleNamespace as Obj
from test_claims_workflow import ClaimsWorkflowTests, Collection, HTTPError
from test_payment_proof_review import environment as proof_environment, review, upload, SOURCE

class Dismissals(unittest.IsolatedAsyncioTestCase):
    def claims(self, actor='member-user'):
        ns=ClaimsWorkflowTests().setup_env(actor)
        ns['db'].claims.records=[{'id':'rejected','member_id':'membership-a','group_id':'group-a',
          'claim_amount':20000,'reason':'Event','claim_status':'rejected','rejection_reason':'Outside policy'}]
        return ns

    async def test_claim_dismiss_retains_audit_and_is_excluded_only_from_personal_view(self):
        ns=self.claims(); original=copy.deepcopy(ns['db'].claims.records[0])
        await ns['dismiss_rejected_claim']('rejected','Bearer member-user')
        saved=ns['db'].claims.records[0]
        for key,value in original.items(): self.assertEqual(saved[key],value)
        self.assertEqual((await ns['get_member_claims']('member-user','Bearer member-user'))['claims'],[])
        ns['authenticated_user_id']=lambda _: 'admin-user'
        self.assertEqual(len((await ns['get_group_claims']('group-a','Bearer admin-user'))['claims']),1)

    async def test_claim_dismiss_denies_other_users_and_nonrejected_claims(self):
        for actor,status,code in [('outsider','rejected',403),('member-user','approved',409),('member-user','pending_review',409)]:
            ns=self.claims(actor);ns['db'].claims.records[0]['claim_status']=status
            before=copy.deepcopy(ns['db'].claims.records)
            with self.assertRaises(HTTPError) as caught: await ns['dismiss_rejected_claim']('rejected','Bearer test')
            self.assertEqual(caught.exception.status_code,code);self.assertEqual(ns['db'].claims.records,before)

    async def test_resubmit_creates_linked_new_claim_and_preserves_rejection(self):
        ns=self.claims();original=copy.deepcopy(ns['db'].claims.records[0])
        await ns['submit_member_claim'](Obj(group_id='group-a',claim_amount=19000,reason='Corrected event',resubmitted_from_claim_id='rejected'),'Bearer member-user')
        self.assertEqual(ns['db'].claims.records[0],original)
        self.assertEqual(ns['db'].claims.records[1]['resubmitted_from_claim_id'],'rejected')
        self.assertEqual(ns['db'].claims.records[1]['claim_status'],'pending_review')
        ns=self.claims();ns['db'].claims.records[0]['member_id']='somebody-else'
        with self.assertRaises(HTTPError): await ns['submit_member_claim'](Obj(group_id='group-a',claim_amount=1,reason='x',resubmitted_from_claim_id='rejected'),'Bearer member-user')
        self.assertEqual(len(ns['db'].claims.records),1)

    async def test_rejection_alert_is_persisted_once_and_retry_does_not_overwrite_review(self):
        ns=self.claims('admin-user');row=ns['db'].claims.records[0];row['claim_status']='pending_review'
        data=Obj(action='reject',rejection_reason='Outside policy')
        await ns['review_group_claim']('group-a','rejected',data,'Bearer admin-user')
        saved=copy.deepcopy(row)
        await ns['review_group_claim']('group-a','rejected',data,'Bearer admin-user')
        self.assertEqual(row,saved);self.assertEqual(len(ns['db'].alerts.records),1)
        alert=ns['db'].alerts.records[0];self.assertIn('R20,000.00',alert['alert_message']);self.assertIn('Group A',alert['alert_message'])
        self.assertIn('Outside policy',alert['alert_message']);self.assertEqual(alert['action_url'],'/(member)/claims')

    def proofs(self):
        ns=proof_environment()
        names={'dismiss_declined_proof','dismiss_alert','get_user_alerts'}
        funcs=[n for n in ast.parse(SOURCE.read_text()).body if isinstance(n,ast.AsyncFunctionDef) and n.name in names]
        for n in funcs:n.decorator_list=[]
        exec(compile(ast.Module(body=funcs,type_ignores=[]),'dismissal-routes','exec'),ns)
        # Use production-like result shape without changing unrelated proof test doubles.
        original=ns['db'].contributions.update_one
        async def update(*args,**kwargs):
            matched=any(ns['db'].contributions.matches(r,args[0]) for r in ns['db'].contributions.records)
            result=await original(*args,**kwargs);result.matched_count=int(matched);return result
        ns['db'].contributions.update_one=update
        return ns

    async def test_declined_proof_dismissal_preserves_file_amounts_and_allows_replacement(self):
        ns=self.proofs();await ns['decline_contribution_proof']('contribution-a',review(ns),'Bearer admin-user')
        record=ns['db'].contributions.records[0];before=copy.deepcopy(record);other=copy.deepcopy(ns['db'].contributions.records[2])
        await ns['dismiss_declined_proof']('contribution-a',review(ns),'Bearer member-user')
        for key,value in before.items():self.assertEqual(record[key],value)
        self.assertEqual(ns['db'].contributions.records[2],other)
        rows=await ns['get_personal_contributions']('member-user','Bearer member-user');self.assertTrue(rows['contributions'][0]['proof_dismissed'])
        await ns['upload_proof_of_payment'](upload(),'Bearer member-user')
        rows=await ns['get_personal_contributions']('member-user','Bearer member-user');self.assertFalse(rows['contributions'][0]['proof_dismissed'])

    async def test_proof_dismiss_denies_approved_wrong_owner_and_stale_version(self):
        from test_payment_proof_review import HTTPError as ProofError
        for actor,status,version in [('other-member','declined',None),('member-user','approved',None),('member-user','declined','old')]:
            ns=self.proofs();r=ns['db'].contributions.records[0];r['proof_review_status']=status;r['contribution_status']='pending' if status=='declined' else 'confirmed'
            data=review(ns);data.proof_version=version or data.proof_version;before=copy.deepcopy(r)
            with self.assertRaises(ProofError):await ns['dismiss_declined_proof']('contribution-a',data,'Bearer '+actor)
            self.assertEqual(r,before)

    async def test_alert_dismissal_is_owned_persistent_and_retains_event(self):
        ns=self.proofs();ns['db'].alerts=Collection([{'id':'alert','user_id':'member-user','alert_message':'Rejected'}])
        await ns['dismiss_alert']('alert','Bearer member-user')
        self.assertTrue(ns['db'].alerts.records[0]['dismissed']);self.assertEqual(ns['db'].alerts.records[0]['alert_message'],'Rejected')
        from test_payment_proof_review import HTTPError as ProofError
        with self.assertRaises(ProofError):await ns['dismiss_alert']('alert','Bearer other-member')
