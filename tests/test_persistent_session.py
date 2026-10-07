"""Actual token issuance retains signature/expiry verification with a 30-day lifetime."""
import ast
import unittest
import uuid
from datetime import datetime,timedelta
from jose import jwt,JWTError
from test_account_authorization import SOURCE,TEST_KEY,HTTPError

class PersistentSession(unittest.TestCase):
    def test_issued_token_has_absolute_thirty_day_lifetime_and_signature_is_still_checked(self):
        tree=ast.parse(SOURCE.read_text())
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'create_access_token','verify_token'}]
        constant=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='ACCESS_TOKEN_EXPIRE_MINUTES' for t in n.targets))
        ns={'datetime':datetime,'timedelta':timedelta,'jwt':jwt,'JWTError':JWTError,'uuid':uuid,'SECRET_KEY':TEST_KEY,'ALGORITHM':'HS256','HTTPException':HTTPError}
        exec(compile(ast.Module(body=[constant,*nodes],type_ignores=[]),'sessions','exec'),ns)
        token=ns['create_access_token']({'user_id':'member'})
        claims=ns['verify_token'](token)
        self.assertAlmostEqual(claims['exp']-claims['iat'],30*86400,delta=1)
        expired=ns['create_access_token']({'user_id':'member'},timedelta(seconds=-1))
        with self.assertRaises(HTTPError):ns['verify_token'](expired)
        forged=jwt.encode({'user_id':'member','exp':claims['exp']},'different-test-key',algorithm='HS256')
        with self.assertRaises(HTTPError):ns['verify_token'](forged)
