import sqlite3
import secrets
import os

DB_PATH = os.getenv("DATABASE_PATH", "/app/data/sentinel.db")

def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(hash_password_fn):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        must_change_password BOOLEAN NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.commit()

    # Check if any user exists
    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    count = cursor.fetchone()["cnt"]

    if count == 0:
        # First-run credential generation
        random_suffix = secrets.token_hex(2)  # 4 hex chars e.g. a3f8
        generated_username = f"admin-{random_suffix}"
        generated_password = secrets.token_urlsafe(12)  # Strong random password
        password_hash = hash_password_fn(generated_password)

        cursor.execute(
            "INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, 1)",
            (generated_username, password_hash)
        )
        conn.commit()

        # Print banner to stdout (docker logs)
        print("\n" + "=" * 60, flush=True)
        print("=== FIRST-RUN LOGIN CREDENTIALS ===", flush=True)
        print("=" * 60, flush=True)
        print(f"Username: {generated_username}", flush=True)
        print(f"Password: {generated_password}", flush=True)
        print("NOTE: You MUST change these credentials upon your first login.", flush=True)
        print("=" * 60 + "\n", flush=True)

    conn.close()
