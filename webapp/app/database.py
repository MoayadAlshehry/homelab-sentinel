import sys
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
        missed_scans INTEGER NOT NULL DEFAULT 0,
        custom_name TEXT DEFAULT '',
        device_type TEXT DEFAULT ''
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

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS monitor_maintenance (
        monitor_id INTEGER PRIMARY KEY,
        until_timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        error_reason TEXT DEFAULT '',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Migrations for missing columns if any
    try:
        cursor.execute("ALTER TABLE devices ADD COLUMN missed_scans INTEGER NOT NULL DEFAULT 0")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE devices ADD COLUMN custom_name TEXT DEFAULT ''")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE devices ADD COLUMN device_type TEXT DEFAULT ''")
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE network_events ADD COLUMN alerted BOOLEAN NOT NULL DEFAULT 0")
    except Exception:
        pass
        
    # Ensure default settings
    cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('notification_level', 'minimum');")
    conn.commit()

    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    count = cursor.fetchone()["cnt"]

    if count == 0:
        generated_username = "admin"
        generated_password = secrets.token_urlsafe(12)
        password_hash = hash_password_fn(generated_password)

        cursor.execute(
            "INSERT INTO users (username, password_hash, must_change_password) VALUES (?, ?, 1)",
            (generated_username, password_hash)
        )
        conn.commit()

        try:
            with open("/app/data/first_run_credentials.txt", "w") as f:
                f.write(f"Username: {generated_username}\nPassword: {generated_password}\n")
        except Exception:
            pass

        print("\n" + "=" * 60, file=sys.stderr, flush=True)
        print("=== FIRST-RUN LOGIN CREDENTIALS ===", file=sys.stderr, flush=True)
        print("=" * 60, file=sys.stderr, flush=True)
        print(f"Username: {generated_username}", file=sys.stderr, flush=True)
        print(f"Password: {generated_password}", file=sys.stderr, flush=True)
        print("NOTE: You MUST change these credentials upon your first login.", file=sys.stderr, flush=True)
        print("=" * 60 + "\n", file=sys.stderr, flush=True)

    conn.close()
