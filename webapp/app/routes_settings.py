from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.routes_auth import get_current_user
from app.notifier import send_telegram_message, send_discord_message, get_setting, log_notification_attempt
from app.database import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

class UpdateSettingsRequest(BaseModel):
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    discord_webhook_url: str | None = None
    notification_level: str | None = None  # all, minimum, off
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: str | None = None
    quiet_hours_end: str | None = None

def mask_secret(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 8:
        return "*****"
    return s[:4] + "*****" + s[-4:]

@router.get("")
def get_settings(current_user: dict = Depends(get_current_user)):
    tg_token = get_setting("telegram_bot_token")
    tg_chat = get_setting("telegram_chat_id")
    dc_url = get_setting("discord_webhook_url")
    notif_level = get_setting("notification_level", "minimum")
    qh_enabled = get_setting("quiet_hours_enabled", "false").lower() == "true"
    qh_start = get_setting("quiet_hours_start", "22:00")
    qh_end = get_setting("quiet_hours_end", "07:00")
    
    return {
        "telegram_bot_token_configured": bool(tg_token),
        "telegram_bot_token_masked": mask_secret(tg_token),
        "telegram_chat_id": tg_chat,
        "discord_webhook_url_configured": bool(dc_url),
        "discord_webhook_url_masked": mask_secret(dc_url),
        "notification_level": notif_level,
        "quiet_hours_enabled": qh_enabled,
        "quiet_hours_start": qh_start,
        "quiet_hours_end": qh_end
    }

@router.get("/notifications/history")
def get_notification_history(current_user: dict = Depends(get_current_user)):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, severity, channel, status, error_reason, timestamp
            FROM notifications_log
            ORDER BY id DESC
            LIMIT 100
        """)
        rows = cursor.fetchall()
        conn.close()
        
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "title": r["title"],
                "severity": r["severity"],
                "channel": r["channel"],
                "status": r["status"],
                "error_reason": r["error_reason"],
                "timestamp": r["timestamp"]
            })
        return result
    except Exception as e:
        print(f"[NOTIF HISTORY ERROR] {e}", flush=True)
        return []

@router.post("")
def update_settings(req: UpdateSettingsRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cursor = conn.cursor()
    
    if req.telegram_bot_token is not None:
        cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('telegram_bot_token', ?, datetime('now'))", (req.telegram_bot_token.strip(),))
        
    if req.telegram_chat_id is not None:
        cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('telegram_chat_id', ?, datetime('now'))", (req.telegram_chat_id.strip(),))

    if req.discord_webhook_url is not None:
        cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('discord_webhook_url', ?, datetime('now'))", (req.discord_webhook_url.strip(),))

    if req.notification_level is not None:
        val = req.notification_level.strip().lower()
        if val in ("all", "minimum", "off"):
            cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('notification_level', ?, datetime('now'))", (val,))

    if req.quiet_hours_enabled is not None:
        val = "true" if req.quiet_hours_enabled else "false"
        cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('quiet_hours_enabled', ?, datetime('now'))", (val,))

    if req.quiet_hours_start is not None:
        cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('quiet_hours_start', ?, datetime('now'))", (req.quiet_hours_start.strip(),))

    if req.quiet_hours_end is not None:
        cursor.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('quiet_hours_end', ?, datetime('now'))", (req.quiet_hours_end.strip(),))
        
    conn.commit()
    conn.close()
    return {"message": "Notification settings updated successfully"}

@router.post("/test-telegram")
def test_telegram(current_user: dict = Depends(get_current_user)):
    tg_token = get_setting("telegram_bot_token")
    tg_chat = get_setting("telegram_chat_id")
    
    if not tg_token or not tg_chat:
        raise HTTPException(status_code=400, detail="Telegram Bot Token and Chat ID must be configured first")
        
    alert_data = {
        "title": "Channel Connection Test",
        "severity": "info",
        "description": "Test notification from your Sentinel system.",
        "fields": [
            {"name": "Channel Status", "value": "CONNECTED", "inline": True},
            {"name": "Host Node", "value": "Sentinel Console", "inline": True}
        ]
    }
    
    ok, detail = send_telegram_message(tg_token, tg_chat, alert_data)
    log_notification_attempt("Channel Connection Test", "info", "Telegram", "SENT" if ok else "FAILED", detail if not ok else "")
    if ok:
        return {"message": detail}
    raise HTTPException(status_code=400, detail=detail)

@router.post("/test-discord")
def test_discord(current_user: dict = Depends(get_current_user)):
    dc_url = get_setting("discord_webhook_url")
    
    if not dc_url:
        raise HTTPException(status_code=400, detail="Discord Webhook URL must be configured first")
        
    alert_data = {
        "title": "Channel Connection Test",
        "severity": "info",
        "description": "Test notification from your Sentinel system.",
        "fields": [
            {"name": "Channel Status", "value": "CONNECTED", "inline": True},
            {"name": "Host Node", "value": "Sentinel Console", "inline": True}
        ]
    }
    
    ok, detail = send_discord_message(dc_url, alert_data)
    log_notification_attempt("Channel Connection Test", "info", "Discord", "SENT" if ok else "FAILED", detail if not ok else "")
    if ok:
        return {"message": detail}
    raise HTTPException(status_code=400, detail=detail)
