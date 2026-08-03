import urllib.request
import urllib.parse
import json
import sqlite3
from app.database import get_db

def get_setting(key: str) -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else ""

def send_telegram_message(token: str, chat_id: str, text: str) -> tuple[bool, str]:
    if not token or not chat_id:
        return False, "Telegram Bot Token or Chat ID not configured"
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            if res_data.get("ok"):
                return True, "Telegram message sent successfully"
            return False, f"Telegram API error: {res_data.get('description')}"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        return False, f"Telegram HTTP {e.code}: {err_msg}"
    except Exception as e:
        return False, f"Telegram request failed: {str(e)}"

def send_discord_message(webhook_url: str, text: str) -> tuple[bool, str]:
    if not webhook_url:
        return False, "Discord Webhook URL not configured"
    
    payload = {
        "content": text
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(webhook_url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return True, "Discord webhook notification sent successfully"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        return False, f"Discord HTTP {e.code}: {err_msg}"
    except Exception as e:
        return False, f"Discord request failed: {str(e)}"

def dispatch_alert(text: str) -> dict:
    tg_token = get_setting("telegram_bot_token")
    tg_chat = get_setting("telegram_chat_id")
    dc_url = get_setting("discord_webhook_url")
    
    results = {}
    if tg_token and tg_chat:
        ok_tg, msg_tg = send_telegram_message(tg_token, tg_chat, text)
        results["telegram"] = {"success": ok_tg, "detail": msg_tg}
    else:
        results["telegram"] = {"success": False, "detail": "Not configured"}
        
    if dc_url:
        ok_dc, msg_dc = send_discord_message(dc_url, text)
        results["discord"] = {"success": ok_dc, "detail": msg_dc}
    else:
        results["discord"] = {"success": False, "detail": "Not configured"}
        
    return results
