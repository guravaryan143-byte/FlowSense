from tests.conftest import PASSWORD


def test_register_creates_viewer_and_never_returns_password(client):
    r = client.post("/api/auth/register", json={"name": "Asha  Rao", "email": "Asha@Example.com", "password": "a-long-password"})
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "viewer" and body["email"] == "asha@example.com" and body["name"] == "Asha Rao"
    assert "password" not in str(body).lower() and "hash" not in str(body).lower()


def test_cannot_self_register_as_admin(client):
    r = client.post("/api/auth/register", json={"name": "Eve", "email": "eve@example.com", "password": "a-long-password", "role": "admin"})
    assert r.status_code == 201 and r.json()["role"] == "viewer"  # extra field ignored


def test_duplicate_email_conflict(client):
    r = client.post("/api/auth/register", json={"name": "X", "email": "viewer@flowsense.demo", "password": "a-long-password"})
    assert r.status_code == 409 and r.json()["error"] == "conflict"


def test_register_validation_does_not_echo_password(client):
    r = client.post("/api/auth/register", json={"name": "X", "email": "not-an-email", "password": "short"})
    assert r.status_code == 422
    assert "short" not in r.text and r.json()["error"] == "validation_error"


def test_login_and_me(client):
    r = client.post("/api/auth/login", json={"email": "operator@flowsense.demo", "password": PASSWORD})
    assert r.status_code == 200 and r.json()["token_type"] == "bearer"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.status_code == 200 and me.json()["role"] == "operator"


def test_wrong_password_and_unknown_user_look_identical(client):
    a = client.post("/api/auth/login", json={"email": "operator@flowsense.demo", "password": "wrong-password"})
    b = client.post("/api/auth/login", json={"email": "nobody@flowsense.demo", "password": "wrong-password"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_login_is_rate_limited_after_repeated_failures(client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "viewer@flowsense.demo", "password": "bad-password"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "viewer@flowsense.demo", "password": PASSWORD}).status_code == 429


def test_protected_endpoint_needs_valid_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_expired_token_rejected(client):
    from app.core.security import create_access_token
    token = create_access_token(1, expires_minutes=-1)
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_passwords_are_stored_as_argon2_hashes(db):
    from app.models import User
    u = db.query(User).filter_by(email="viewer@flowsense.demo").one()
    assert u.password_hash.startswith("$argon2") and PASSWORD not in u.password_hash


def test_only_admin_can_list_users_and_change_roles(client, admin, operator, viewer):
    assert client.get("/api/auth/users", headers=operator).status_code == 403
    assert client.get("/api/auth/users", headers=viewer).status_code == 403
    users = client.get("/api/auth/users", headers=admin).json()
    target = next(u for u in users if u["email"] == "viewer@flowsense.demo")
    assert client.patch(f"/api/auth/users/{target['id']}/role", json={"role": "operator"}, headers=operator).status_code == 403
    r = client.patch(f"/api/auth/users/{target['id']}/role", json={"role": "operator"}, headers=admin)
    assert r.status_code == 200 and r.json()["role"] == "operator"
    assert client.patch("/api/auth/users/9999/role", json={"role": "viewer"}, headers=admin).status_code == 404
    assert client.patch(f"/api/auth/users/{target['id']}/role", json={"role": "root"}, headers=admin).status_code == 422
