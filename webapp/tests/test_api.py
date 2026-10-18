from pathlib import Path
import pytest
import main
from app.security import create_access_token


def test_health(client):
    assert client.get("/api/health").json() == {"status": "healthy", "service": "homelab-sentinel-webapp"}


def test_login_and_authenticated_identity(client):
    response = client.post("/api/auth/login", json={"username": "example-user", "password": "fictional-test-password"})
    assert response.status_code == 200
    token = response.json()["access_token"]
    identity = client.get("/api/auth/me", headers={"Authorization": "Bearer " + token})
    assert identity.status_code == 200
    assert identity.json()["username"] == "example-user"


def test_wrong_password(client):
    assert client.post("/api/auth/login", json={"username": "example-user", "password": "wrong"}).status_code == 401


@pytest.mark.parametrize("token", [None, "invalid", create_access_token({"other": "value"})])
def test_identity_requires_valid_subject(client, token):
    headers = {"Authorization": "Bearer " + token} if token else {}
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_container_operations_require_authentication(client):
    assert client.get("/api/containers").status_code == 401


@pytest.mark.parametrize("path", ["/api", "/api/does-not-exist", "/assets/missing.js", "/missing.css"])
def test_missing_routes_return_404(client, path):
    assert client.get(path).status_code == 404


def test_static_file_and_spa_navigation(client):
    assert client.get("/example.txt").text == "Public example"
    assert "Example application" in client.get("/dashboard").text


@pytest.mark.parametrize("path", ["/%2e%2e%2fprivate.txt", "/..%5cprivate.txt"])
def test_static_path_cannot_escape_root(client, path):
    response = client.get(path)
    assert "Private fixture" not in response.text
    assert response.status_code == 404


def test_symlink_cannot_escape_root(client, tmp_path):
    link = Path(main.STATIC_DIR) / "escape.txt"
    try:
        link.symlink_to(tmp_path / "private.txt")
    except OSError:
        pytest.skip("Creating symlinks is unavailable on this host; Linux CI covers this case.")
    assert client.get("/escape.txt").status_code == 404
