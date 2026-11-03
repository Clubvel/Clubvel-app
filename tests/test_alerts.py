"""Execute the recovered alerts route offline, with no server import or DB connection."""
import ast
import unittest
from pathlib import Path
from typing import Optional
from types import SimpleNamespace

class HTTPError(Exception):
    def __init__(self, status_code, detail): self.status_code = status_code

class AlertsTests(unittest.IsolatedAsyncioTestCase):
    def route(self, identity):
        source = Path(__file__).resolve().parents[1] / 'backend/server.py'
        node = next(n for n in ast.parse(source.read_text(encoding='utf-8-sig')).body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'get_user_alerts')
        node.decorator_list = []
        calls = []
        class Cursor:
            def sort(self, *args): calls.append(('sort', args)); return self
            async def to_list(self, limit): calls.append(('limit', limit)); return [{'id': 'own-alert', 'user_id': identity}]
        def find(query, projection): calls.append(('find', query, projection)); return Cursor()
        ns = dict(Optional=Optional, Header=lambda value: value, HTTPException=HTTPError,
                  authenticated_user_id=lambda token: identity,
                  db=SimpleNamespace(alerts=SimpleNamespace(find=find)))
        exec(compile(ast.Module(body=[node], type_ignores=[]), 'alerts-route', 'exec'), ns)
        return ns['get_user_alerts'], calls

    async def test_own_alerts_are_scoped_sorted_and_strip_mongo_id(self):
        route, calls = self.route('owner')
        result = await route('owner', 'Bearer signed-token')
        self.assertEqual(result['alerts'][0]['user_id'], 'owner')
        self.assertEqual(calls[0], ('find', {'user_id': 'owner'}, {'_id': 0}))
        self.assertEqual(calls[1], ('sort', ('created_at', -1)))

    async def test_cannot_request_other_users_alerts(self):
        route, calls = self.route('owner')
        with self.assertRaises(HTTPError) as error: await route('other', 'Bearer signed-token')
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(calls, [])
