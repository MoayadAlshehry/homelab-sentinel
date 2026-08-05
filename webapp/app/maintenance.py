import sqlite3
import datetime
import os
from app.database import get_db, DB_PATH

KUMA_DB_PATH = os.getenv("KUMA_DB_PATH", "/app/data/kuma.db")

def run_weekly_retention_cleanup(force: bool = False) -> dict:
    """
    Executes 8-day retention cleanup on SQLite databases every Friday or when force=True.
    Returns a summary dictionary of deleted record counts per table.
    """
    today_str = datetime.date.today().isoformat()
    is_friday = (datetime.date.today().weekday() == 4)  # 4 == Friday

    conn = get_db()
    cursor = conn.cursor()

    # Ensure settings table exists
    cursor.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);")

    if not force:
        cursor.execute("SELECT value FROM settings WHERE key = 'last_weekly_cleanup';")
        row = cursor.fetchone()
        if row and row["value"] == today_str:
            conn.close()
            return {"status": "skipped", "reason": "Already executed today"}

        if not is_friday:
            conn.close()
            return {"status": "skipped", "reason": "Not Friday"}

    results = {}
    cutoff_8d = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=8)).strftime("%Y-%m-%d %H:%M:%S")

    # 1. Clean network_events table in sentinel.db
    try:
        cursor.execute("SELECT COUNT(*) FROM network_events WHERE timestamp < ?", (cutoff_8d,))
        count_ne = cursor.fetchone()[0]
        cursor.execute("DELETE FROM network_events WHERE timestamp < ?", (cutoff_8d,))
        results["network_events"] = count_ne
    except Exception as e:
        results["network_events_error"] = str(e)

    # 2. Clean notifications_log table in sentinel.db (if exists)
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications_log';")
        if cursor.fetchone():
            cursor.execute("SELECT COUNT(*) FROM notifications_log WHERE timestamp < ?", (cutoff_8d,))
            count_nl = cursor.fetchone()[0]
            cursor.execute("DELETE FROM notifications_log WHERE timestamp < ?", (cutoff_8d,))
            results["notifications_log"] = count_nl
    except Exception as e:
        results["notifications_log_error"] = str(e)

    # Record cleanup timestamp
    cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_weekly_cleanup', ?);", (today_str,))
    conn.commit()

    # Vacuum sentinel.db
    try:
        cursor.execute("VACUUM;")
        results["sentinel_db_vacuum"] = True
    except Exception as e:
        results["sentinel_db_vacuum_error"] = str(e)
    finally:
        conn.close()

    # 3. Clean Uptime Kuma kuma.db heartbeat table (if file exists & has heartbeat table)
    if os.path.exists(KUMA_DB_PATH) and os.path.getsize(KUMA_DB_PATH) > 0:
        try:
            kconn = sqlite3.connect(KUMA_DB_PATH)
            kcursor = kconn.cursor()
            kcursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='heartbeat';")
            if kcursor.fetchone():
                kcursor.execute("SELECT COUNT(*) FROM heartbeat WHERE time < ?", (cutoff_8d,))
                count_hb = kcursor.fetchone()[0]
                kcursor.execute("DELETE FROM heartbeat WHERE time < ?", (cutoff_8d,))
                kconn.commit()
                kcursor.execute("VACUUM;")
                results["kuma_heartbeat"] = count_hb
                results["kuma_db_vacuum"] = True
            kconn.close()
        except Exception as e:
            results["kuma_db_error"] = str(e)

    # Format summary log
    summary_items = [f"{k}: {v}" for k, v in results.items()]
    log_msg = f"[CLEANUP] Weekly retention cleanup executed: {', '.join(summary_items)}"
    print(log_msg, flush=True)

    return {"status": "success", "results": results, "log": log_msg}
