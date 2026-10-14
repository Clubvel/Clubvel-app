"""Offline dashboard agreement; no live credentials or database."""
import ast
import copy
import unittest
from datetime import datetime
from unittest.mock import AsyncMock
from test_payment_proof_review import SOURCE, environment

class October(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026,10,10,tzinfo=tz)
    @classmethod
    def utcnow(cls):
        return cls(2026,10,10)

def dashboard():
    ns=environment()
    route=next(n for n in ast.parse(SOURCE.read_text()).body if isinstance(n,ast.AsyncFunctionDef) and n.name=='get_admin_dashboard')
    route.decorator_list=[]
    ns['datetime']=October
    ns['verify_treasurer_owns_groups']=AsyncMock(return_value=[ns['db'].groups.records[0]])
    exec(compile(ast.Module(body=[route],type_ignores=[]),'admin-dashboard','exec'),ns)
    return ns

class DashboardFinancialTests(unittest.IsolatedAsyncioTestCase):
    async def test_all_recorded_obligations_confirmed_only_and_historical_identity(self):
        ns=dashboard();ns['db'].groups.records[0].update(contribution_mode='flexible_goal',target_amount_per_member=5000)
        template=ns['db'].contributions.records[0]
        fixture=[(300,'confirmed'),(5000,'paid'),(200,'confirmed'),(300,'pending'),(300,'proof_uploaded'),(600,'pending')]
        records=[]
        for i,(amount,status) in enumerate(fixture):
            records.append({**template,'id':str(i),'month':10,'year':2026,'amount_due':amount,'amount_paid':amount if status in ('paid','confirmed') else 0,'contribution_status':status,'proof_review_status':'declined' if i==5 else None})
        records[-1]['member_id']='removed-membership'
        ns['db'].contributions.records=records+[dict(records[0],id='old',month=9),dict(records[0],id='other',group_id='group-b')]
        before=copy.deepcopy(ns['db'].contributions.records)
        result=await ns['get_admin_dashboard']('admin-user','Bearer admin-user')
        summary=result['clubs'][0]['financial_summary']
        self.assertEqual(summary['total_expected'],6700)
        self.assertEqual(summary['collected'],5500)
        self.assertEqual(summary['outstanding'],1200)
        self.assertEqual(round(summary['collection_rate']),82)
        self.assertEqual(result['summary']['confirmed_collected_current_period'],5500)
        self.assertEqual(result['clubs'][0]['period']['timezone'],'Africa/Johannesburg')
        self.assertEqual(result['clubs'][0]['target_amount_per_member'],5000)
        self.assertIsInstance(result['summary']['total_collected_this_month'],float)
        self.assertEqual(ns['db'].contributions.records,before)
    async def test_genuine_zero_and_unavailable_are_distinct(self):
        ns=dashboard();ns['db'].contributions.records=[]
        result=await ns['get_admin_dashboard']('admin-user','Bearer admin-user')
        self.assertEqual(result['summary']['confirmed_collected_current_period'],0)
        ns['db'].contributions.records=[{'id':'invalid','member_id':'former','group_id':'group-a','month':10,'year':2026,'amount_due':None,'amount_paid':0,'contribution_status':'pending'}]
        result=await ns['get_admin_dashboard']('admin-user','Bearer admin-user')
        self.assertIsNone(result['summary']['confirmed_collected_current_period'])
        self.assertIsNone(result['clubs'][0]['financial_summary']['total_expected'])
    async def test_other_account_denied_before_managed_club_lookup(self):
        ns=dashboard()
        with self.assertRaises(Exception) as error:
            await ns['get_admin_dashboard']('admin-user','Bearer member-user')
        self.assertEqual(error.exception.status_code,403)
        ns['verify_treasurer_owns_groups'].assert_not_awaited()


def legacy_admin_dashboard(node):
    """Remove only the specified additive reporting statements for strict legacy comparison."""
    if node.name != 'get_admin_dashboard':
        return node
    node=copy.deepcopy(node)
    additions={'authoritative_details','financial_period','recorded','recorded_details','recorded_summary'}
    node.body=[statement for statement in node.body if not (
        isinstance(statement,ast.Assign) and any(isinstance(target,ast.Name) and target.id in additions for target in statement.targets))]
    for statement in node.body:
        if isinstance(statement,ast.For):
            statement.body=[item for item in statement.body if not (
                isinstance(item,ast.Assign) and any(isinstance(target,ast.Name) and target.id in additions for target in item.targets)) and not (
                isinstance(item,ast.Expr) and isinstance(item.value,ast.Call) and isinstance(item.value.func,ast.Attribute) and isinstance(item.value.func.value,ast.Name) and item.value.func.value.id=='authoritative_details' and item.value.func.attr=='extend')]
    class Fields(ast.NodeTransformer):
        def visit_Dict(self,item):
            self.generic_visit(item)
            approved={'financial_summary','contribution_mode','target_amount_per_member','period','confirmed_collected_current_period','financial_period'}
            pairs=[(key,value) for key,value in zip(item.keys,item.values) if not(isinstance(key,ast.Constant) and key.value in approved)]
            item.keys=[key for key,_ in pairs];item.values=[value for _,value in pairs]
            return item
    return Fields().visit(node)
