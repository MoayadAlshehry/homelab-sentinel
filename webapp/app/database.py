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
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS devices (
        mac TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        vendor TEXT DEFAULT 'Unknown',
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_online BOOLEAN NOT NULL DEFAULT 1,
        missed_scans INTEGER NOT NULL DEFAULT 0
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS network_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mac TEXT NOT NULL,
        ip TEXT NOT NULL,
        event_type TEXT NOT NULL,
        message TEXT NOT NULL,
        alerted BOOLEAN NOT NULL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Migrations for missing columns if any
    try:
        cursor.execute("ALTER TABLE devices ADD COLUMN missed_scans INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE network_events ADD COLUMN alerted BOOLEAN NOT NULL DEFAULT 0")
    except Exception:
        pass
        
    conn.commit()

    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    count = cursor.fetchone()["cnt"]

    if count == 0:
        random_suffix = secrets.token_hex(2)
        generated_username = f"admin-{random_suffix}"
        generated_password = secrets.token_urlsafe(12)
        password_hash = hash_password_fn(generated_password)

        cursor.execute(
            "INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, 1)",
            (generated_username, password_hash)
        )
        conn.commit()

        print("\n" + "=" * 60, flush=True)
        print("=== FIRST-RUN LOGIN CREDENTIALS ===", flush=True)
        print("=" * 60, flush=True)
        print(f"Username: {generated_username}", flush=True)
        print(f"Password: {generated_password}", flush=True)
        print("NOTE: You MUST change these credentials upon your first login.", flush=True)
        print("=" * 60 + "\n", flush=True)

    conn.close()
