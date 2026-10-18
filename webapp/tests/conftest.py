"""Isolated API tests: temporary database, synthetic users, no background workers."""
import os
import sys
from pathlib import Path

os.environ["SECRET_KEY"] = "fictional-test-signing-key-not-for-deployment"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
import main
from app import database
from app.security import hash_password


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "test.db"))
    database.init_db(hash_password)
    conn = database.get_db()
    conn.execute("INSERT INTO users (username,password_hash,must_change_password) VALUES (?,?,0)",
                 ("example-user", hash_password("fictional-test-password")))
    conn.commit()
    conn.close()
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<html>Example application</html>", encoding="utf-8")
    (static / "example.txt").write_text("Public example", encoding="utf-8")
    (tmp_path / "private.txt").write_text("Private fixture", encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_DIR", str(static))
    # No context manager: startup workers never scan a real network during these tests.
    return TestClient(main.app, client=("127.0.0.1", 50000))
