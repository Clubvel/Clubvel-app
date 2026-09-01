import pytest
from fastapi.testclient import TestClient
from backend.server import app

client = TestClient(app)

def test_protected_endpoint_requires_auth():
    resp = client.get('/api/auth/test-protected')
    assert resp.status_code == 401
    assert 'Missing or invalid Authorization' in resp.json().get('detail', '')
