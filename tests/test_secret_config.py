import ast
import unittest
from pathlib import Path
from types import SimpleNamespace

SOURCE = Path(__file__).resolve().parents[1] / 'backend/server.py'

class SecretConfigTests(unittest.TestCase):
    def resolve(self, env):
        tree = ast.parse(SOURCE.read_text(encoding='utf-8-sig'))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'required_secret')
        namespace = {'os': SimpleNamespace(environ=env)}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), 'secret-config', 'exec'), namespace)
        return namespace['required_secret']

    def test_missing_or_short_secret_fails_without_leaking_its_value(self):
        for env in ({}, {'JWT_SECRET_KEY': 'short-test-value'}):
            with self.assertRaises(RuntimeError) as error: self.resolve(env)('JWT_SECRET_KEY')
            self.assertNotIn('short-test-value', str(error.exception))

    def test_existing_explicit_key_is_preserved_exactly(self):
        value = 'test-only-private-key-' * 3
        self.assertEqual(self.resolve({'JWT_SECRET_KEY': value})('JWT_SECRET_KEY'), value)

    def test_both_sensitive_settings_use_required_config(self):
        tree = ast.parse(SOURCE.read_text(encoding='utf-8-sig'))
        for target in ('SECRET_KEY', 'ENCRYPTION_KEY'):
            assignment = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == target for t in n.targets))
            self.assertEqual(assignment.value.func.id, 'required_secret')
