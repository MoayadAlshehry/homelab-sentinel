import asyncio
import os
import json
import sqlite3
import urllib.request
import subprocess
from app.notifier import dispatch_alert
from app.database import get_db

ALERT_POLL_INTERVAL = int(os.getenv("ALERT_POLL_INTERVAL", "15"))
DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "http://127.0.0.1:2375")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:29090")
UPTIME_KUMA_URL = os.getenv("UPTIME_KUMA_URL", "http://127.0.0.1:23001")

known_container_states = {}
known_prometheus_alerts = set()
known_kuma_statuses = {}

async def check_prometheus_alerts():
    try:
        url = f"{PROMETHEUS_URL}/api/v1/alerts"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            alerts = data.get("data", {}).get("alerts", [])
            current_firing = set()
            for a in alerts:
                if a.get("state") == "firing":
                    alert_name = a.get("labels", {}).get("alertname", "UnknownAlert")
                    instance = a.get("labels", {}).get("instance", "unknown")
                    alert_key = f"{alert_name}:{instance}"
                    current_firing.add(alert_key)
                    
                    if alert_key not in known_prometheus_alerts:
                        summary = a.get("annotations", {}).get("summary", alert_name)
                        desc = a.get("annotations", {}).get("description", "")
                        msg = f"🚨 **[PROMETHEUS ALERT FIRING]** `{alert_name}`\n• **Summary**: {summary}\n• **Detail**: {desc}"
                        print(f"[ALERT WORKER] Dispatching Prometheus alert: {alert_key}", flush=True)
                        dispatch_alert(msg)
            
            known_prometheus_alerts.clear()
            known_prometheus_alerts.update(current_firing)
    except Exception as e:
        pass

async def check_container_down_events():
    try:
        url = f"{DOCKER_PROXY_URL}/containers/json?all=true"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            containers = json.loads(resp.read().decode("utf-8"))
            for c in containers:
                cname = c["Names"][0].lstrip("/") if c.get("Names") else c["Id"][:12]
                cstate = c.get("State", "")
                
                if cname in known_container_states:
                    prev_state = known_container_states[cname]
                    if prev_state == "running" and cstate in ("exited", "stopped", "dead"):
                        msg = f"🚨 **[CONTAINER STOPPED]** Container `{cname}` state changed from `running` to `{cstate}`!"
                        print(f"[ALERT WORKER] Dispatching container down alert: {cname}", flush=True)
                        dispatch_alert(msg)
                
                known_container_states[cname] = cstate
    except Exception as e:
        pass

async def check_network_events():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, mac, ip, event_type, message FROM network_events WHERE alerted = 0")
        rows = cursor.fetchall()
        
        for r in rows:
            event_id = r["id"]
            icon = "📡" if r["event_type"] == "JOINED" else "⚠️"
            msg = f"{icon} **[NETWORK EVENT]** {r['message']}"
            print(f"[ALERT WORKER] Dispatching network event alert: {r['message']}", flush=True)
            dispatch_alert(msg)
            cursor.execute("UPDATE network_events SET alerted = 1 WHERE id = ?", (event_id,))
            
        conn.commit()
        conn.close()
    except Exception as e:
        pass

async def check_uptime_kuma_status():
    try:
        url = f"{UPTIME_KUMA_URL}/"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            pass
    except Exception as e:
        pass

async def alert_polling_loop():
    await asyncio.sleep(5)
    print("[ALERT WORKER] Alert polling worker started...", flush=True)
    while True:
        try:
            await check_prometheus_alerts()
            await check_container_down_events()
            await check_network_events()
            await check_uptime_kuma_status()
        except Exception as e:
            print(f"[ALERT WORKER ERROR] {e}", flush=True)
        await asyncio.sleep(ALERT_POLL_INTERVAL)
