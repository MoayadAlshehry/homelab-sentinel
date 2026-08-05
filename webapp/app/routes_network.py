from fastapi import APIRouter, HTTPException, Depends
from app.routes_auth import get_current_user
from app.scanner import process_scan_results
from app.database import get_db

router = APIRouter(prefix="/api/network", tags=["network"])

from pydantic import BaseModel

def init_device_custom_columns():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(devices)")
        cols = [r["name"] for r in cursor.fetchall()]
        if "custom_name" not in cols:
            try:
                cursor.execute("ALTER TABLE devices ADD COLUMN custom_name TEXT DEFAULT ''")
                conn.commit()
            except Exception:
                pass
        if "device_type" not in cols:
            try:
                cursor.execute("ALTER TABLE devices ADD COLUMN device_type TEXT DEFAULT ''")
                conn.commit()
            except Exception:
                pass
        conn.close()
    except Exception:
        pass

init_device_custom_columns()

class DeviceUpdateRequest(BaseModel):
    custom_name: str | None = None
    device_type: str | None = None

@router.get("/devices")
def list_devices(current_user: dict = Depends(get_current_user)):
    init_device_custom_columns()
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT mac, ip, vendor, first_seen, last_seen, is_online, COALESCE(custom_name,'') as custom_name, COALESCE(device_type,'') as device_type
            FROM devices 
            ORDER BY is_online DESC, last_seen DESC
        """)
        rows = cursor.fetchall()
    except sqlite3.OperationalError:
        cursor.execute("""
            SELECT mac, ip, vendor, first_seen, last_seen, is_online
            FROM devices 
            ORDER BY is_online DESC, last_seen DESC
        """)
        raw_rows = cursor.fetchall()
        rows = []
        for r in raw_rows:
            d = dict(r)
            d["custom_name"] = ""
            d["device_type"] = ""
            rows.append(d)
    
    last_scan = ""
    try:
        cursor.execute("SELECT value FROM settings WHERE key = 'last_network_scan'")
        scan_row = cursor.fetchone()
        last_scan = scan_row["value"] if scan_row else ""
    except Exception:
        pass
    finally:
        conn.close()
    
    result = []
    for r in rows:
        result.append({
            "mac": r["mac"],
            "ip": r["ip"],
            "vendor": r["vendor"],
            "first_seen": r["first_seen"],
            "last_seen": r["last_seen"],
            "is_online": bool(r["is_online"]),
            "custom_name": r["custom_name"],
            "device_type": r["device_type"]
        })
    return {"devices": result, "last_scan": last_scan}

@router.put("/devices/{mac}")
def update_device(mac: str, payload: DeviceUpdateRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    if payload.custom_name is not None:
        cursor.execute("UPDATE devices SET custom_name = ? WHERE mac = ?", (payload.custom_name, mac))
    if payload.device_type is not None:
        cursor.execute("UPDATE devices SET device_type = ? WHERE mac = ?", (payload.device_type, mac))
    conn.commit()
    conn.close()
    return {"message": "Device updated successfully"}

@router.get("/events")
def list_network_events(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, mac, ip, event_type, message, timestamp 
        FROM network_events 
        ORDER BY id DESC 
        LIMIT 100
    """)
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        result.append({
            "id": r["id"],
            "mac": r["mac"],
            "ip": r["ip"],
            "event_type": r["event_type"],
            "message": r["message"],
            "timestamp": r["timestamp"]
        })
    return result

@router.post("/scan")
def trigger_scan(current_user: dict = Depends(get_current_user)):
    res = process_scan_results()
    import time
    now_str = time.strftime("%H:%M:%S")
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_network_scan', ?)", (now_str,))
        conn.commit()
        conn.close()
    except Exception:
        pass

    return {
        "message": "LAN scan completed successfully",
        "scanned_devices_count": res["scanned_count"],
        "last_scan": now_str
    }
