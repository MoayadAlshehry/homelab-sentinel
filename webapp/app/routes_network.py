from fastapi import APIRouter, HTTPException, Depends
from app.routes_auth import get_current_user
from app.scanner import process_scan_results
from app.database import get_db

router = APIRouter(prefix="/api/network", tags=["network"])

@router.get("/devices")
def list_devices(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mac, ip, vendor, first_seen, last_seen, is_online 
        FROM devices 
        ORDER BY is_online DESC, last_seen DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        result.append({
            "mac": r["mac"],
            "ip": r["ip"],
            "vendor": r["vendor"],
            "first_seen": r["first_seen"],
            "last_seen": r["last_seen"],
            "is_online": bool(r["is_online"])
        })
    return result

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
    return {
        "message": "LAN scan completed successfully",
        "scanned_devices_count": res["scanned_count"]
    }
