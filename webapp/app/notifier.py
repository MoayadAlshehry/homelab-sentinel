import urllib.request
import urllib.parse
import json
import sqlite3
import datetime
from app.database import get_db

USER_AGENT = "HomelabSentinel/1.0 (Linux arm64 Monitoring Service)"

def get_setting(key: str, default: str = "") -> str:
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        conn.close()
        return row["value"] if row and row["value"] is not None else default
    except Exception:
        return default

def escape_md_v2(text: str) -> str:
    """Escape special characters required by Telegram MarkdownV2."""
    if not text:
        return ""
    special_chars = r"_*[]()~`>#+-=|{}.!"
    for c in special_chars:
        text = text.replace(c, f"\\{c}")
    return text

def send_telegram_message(token: str, chat_id: str, alert_data: dict) -> tuple[bool, str]:
    if not token or not chat_id:
        return False, "Telegram Bot Token or Chat ID not configured"
    
    title = alert_data.get("title", "System Alert")
    severity = alert_data.get("severity", "info").upper()
    description = alert_data.get("description", "")
    fields = alert_data.get("fields", [])
    
    # Build clean MarkdownV2 text without any emojis
    header_text = f"*{escape_md_v2(f'[{severity}] {title}')}*"
    
    field_lines = []
    for f in fields:
        name_esc = escape_md_v2(f.get("name", ""))
        val_raw = str(f.get("value", ""))
        val_esc = escape_md_v2(val_raw)
        field_lines.append(f"• *{name_esc}*: `{val_esc}`")
        
    fields_formatted = "\n".join(field_lines)
    
    desc_formatted = ""
    if description:
        desc_formatted = f"\n\n> {escape_md_v2(description)}"
        
    footer_formatted = f"\n\n_{escape_md_v2('Homelab Sentinel Monitoring Console')}_"
    
    full_text = f"{header_text}\n\n{fields_formatted}{desc_formatted}{footer_formatted}"

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": full_text,
        "parse_mode": "MarkdownV2"
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            if res_data.get("ok"):
                return True, "Telegram MarkdownV2 message sent successfully"
            return False, f"Telegram API error: {res_data.get('description')}"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        return False, f"Telegram HTTP {e.code}: {err_msg}"
    except Exception as e:
        return False, f"Telegram request failed: {str(e)}"

def send_discord_message(webhook_url: str, alert_data: dict) -> tuple[bool, str]:
    if not webhook_url:
        return False, "Discord Webhook URL not configured"
    
    severity = alert_data.get("severity", "info").lower()
    
    # Discord Embed Color Mapping (Red=Critical, Amber=Warning, Green=Resolved, Blue=Info)
    if severity in ("critical", "down", "error"):
        color = 14753096  # 0xE11D48 (Red)
    elif severity in ("warning", "warn"):
        color = 16097291  # 0xF59E0B (Amber)
    elif severity in ("resolved", "up", "recovered", "success"):
        color = 51283     # 0x00C853 (Signal Green)
    else:
        color = 959977    # 0x0EA5E9 (Sky Blue)

    title = alert_data.get("title", "System Alert")
    severity_label = severity.upper()
    full_title = f"[{severity_label}] {title}"
    
    iso_timestamp = alert_data.get("timestamp")
    if not iso_timestamp:
        iso_timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()

    embed = {
        "title": full_title,
        "description": alert_data.get("description", ""),
        "color": color,
        "fields": alert_data.get("fields", []),
        "footer": {
            "text": "Homelab Sentinel Monitoring Console"
        },
        "timestamp": iso_timestamp
    }

    payload = {
        "embeds": [embed]
    }
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT
    }
    req = urllib.request.Request(webhook_url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status in (200, 204):
                return True, "Discord rich embed sent successfully"
            return True, f"Discord webhook delivered (HTTP {resp.status})"
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace")
        return False, f"Discord HTTP {e.code}: {err_msg}"
    except Exception as e:
        return False, f"Discord request failed: {str(e)}"

def log_notification_attempt(title: str, severity: str, channel: str, status: str, error_reason: str = ""):
    try:
        import time
        conn = get_db()
        cursor = conn.cursor()
        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO notifications_log (title, severity, channel, status, error_reason, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
            (title, severity, channel, status, error_reason, now_str)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[NOTIF LOG ERROR] {e}", flush=True)

def is_quiet_hours() -> bool:
    try:
        enabled = get_setting("quiet_hours_enabled", "false").lower() == "true"
        if not enabled:
            return False
        start_str = get_setting("quiet_hours_start", "22:00")
        end_str = get_setting("quiet_hours_end", "07:00")
        import time
        now_hm = time.strftime("%H:%M")
        if start_str <= end_str:
            return start_str <= now_hm <= end_str
        else:
            return now_hm >= start_str or now_hm <= end_str
    except Exception:
        return False

def dispatch_alert(alert_data_or_text, severity: str = "critical") -> dict:
    """
    Dispatches alerts to configured Telegram & Discord webhooks after checking the 3-Tier Notification Level & Quiet Hours:
    - 'off': All notifications disabled.
    - 'minimum': Only critical/severe events sent.
    - 'all': All events sent.
    """
    notif_level = get_setting("notification_level", "minimum").lower()
    
    # 1. Standardize alert_data dictionary
    if isinstance(alert_data_or_text, str):
        alert_data = {
            "title": "System Alert",
            "severity": severity,
            "description": alert_data_or_text,
            "fields": [
                {"name": "Details", "value": alert_data_or_text, "inline": False}
            ]
        }
    else:
        alert_data = dict(alert_data_or_text)
        if "severity" not in alert_data:
            alert_data["severity"] = severity
            
    event_severity = alert_data.get("severity", "critical").lower()
    title = alert_data.get("title", "System Alert")

    # Check Quiet Hours
    if is_quiet_hours():
        log_notification_attempt(title, event_severity, "All Channels", "SUPPRESSED", "Quiet hours active")
        return {
            "telegram": {"success": False, "detail": "Suppressed due to active Quiet Hours schedule"},
            "discord": {"success": False, "detail": "Suppressed due to active Quiet Hours schedule"}
        }

    # 2. Verbosity Filtering Logic
    if notif_level == "off":
        log_notification_attempt(title, event_severity, "System", "FILTERED", "Notifications disabled (Level: Off)")
        return {
            "telegram": {"success": False, "detail": "Notifications disabled (Level: Off)"},
            "discord": {"success": False, "detail": "Notifications disabled (Level: Off)"}
        }
        
    if notif_level == "minimum" and event_severity not in ("critical", "down", "error", "severe", "warning", "warn"):
        log_notification_attempt(title, event_severity, "System", "FILTERED", "Filtered out by verbosity setting (Level: Minimum)")
        return {
            "telegram": {"success": False, "detail": "Filtered out by verbosity setting (Level: Minimum)"},
            "discord": {"success": False, "detail": "Filtered out by verbosity setting (Level: Minimum)"}
        }

    # 3. Dispatch to Channels
    tg_token = get_setting("telegram_bot_token")
    tg_chat = get_setting("telegram_chat_id")
    dc_url = get_setting("discord_webhook_url")
    title = alert_data.get("title", "System Alert")
    
    results = {}
    has_external_channel = False

    if tg_token and tg_chat:
        has_external_channel = True
        ok_tg, msg_tg = send_telegram_message(tg_token, tg_chat, alert_data)
        results["telegram"] = {"success": ok_tg, "detail": msg_tg}
        log_notification_attempt(title, event_severity, "Telegram", "SENT" if ok_tg else "FAILED", msg_tg if not ok_tg else "")
    else:
        results["telegram"] = {"success": False, "detail": "Telegram not configured"}
        
    if dc_url:
        has_external_channel = True
        ok_dc, msg_dc = send_discord_message(dc_url, alert_data)
        results["discord"] = {"success": ok_dc, "detail": msg_dc}
        log_notification_attempt(title, event_severity, "Discord", "SENT" if ok_dc else "FAILED", msg_dc if not ok_dc else "")
    else:
        results["discord"] = {"success": False, "detail": "Discord not configured"}
        
    if not has_external_channel:
        log_notification_attempt(title, event_severity, "System", "SENT", "Alert logged locally (No external webhooks configured)")

    return results
