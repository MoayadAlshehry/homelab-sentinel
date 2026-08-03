from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.routes_auth import get_current_user
from app.notifier import send_telegram_message, send_discord_message, get_setting
from app.database import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])

class UpdateSettingsRequest(BaseModel):
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    discord_webhook_url: str | None = None

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
    
    return {
        "telegram_bot_token_configured": bool(tg_token),
        "telegram_bot_token_masked": mask_secret(tg_token),
        "telegram_chat_id": tg_chat,
        "discord_webhook_url_configured": bool(dc_url),
        "discord_webhook_url_masked": mask_secret(dc_url)
    }

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
        
    conn.commit()
    conn.close()
    return {"message": "Notification settings updated successfully"}

@router.post("/test-telegram")
def test_telegram(current_user: dict = Depends(get_current_user)):
    tg_token = get_setting("telegram_bot_token")
    tg_chat = get_setting("telegram_chat_id")
    
    if not tg_token or not tg_chat:
        raise HTTPException(status_code=400, detail="Telegram Bot Token and Chat ID must be configured first")
        
    msg = "🛡️ *Homelab Sentinel*: Test notification from your Raspberry Pi 5 Sentinel system!"
    ok, detail = send_telegram_message(tg_token, tg_chat, msg)
    if ok:
        return {"message": detail}
    raise HTTPException(status_code=400, detail=detail)

@router.post("/test-discord")
def test_discord(current_user: dict = Depends(get_current_user)):
    dc_url = get_setting("discord_webhook_url")
    
    if not dc_url:
        raise HTTPException(status_code=400, detail="Discord Webhook URL must be configured first")
        
    msg = "🛡️ **Homelab Sentinel**: Test notification from your Raspberry Pi 5 Sentinel system!"
    ok, detail = send_discord_message(dc_url, msg)
    if ok:
        return {"message": detail}
    raise HTTPException(status_code=400, detail=detail)
