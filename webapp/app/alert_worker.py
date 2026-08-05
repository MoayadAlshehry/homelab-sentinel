import asyncio
import os
import json
import sqlite3
import urllib.request
import time
import datetime
from app.notifier import dispatch_alert
from app.database import get_db
from app.maintenance import run_weekly_retention_cleanup

ALERT_POLL_INTERVAL = int(os.getenv("ALERT_POLL_INTERVAL", "20"))
DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "http://127.0.0.1:2375")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:29090")
UPTIME_KUMA_URL = os.getenv("UPTIME_KUMA_URL", "http://127.0.0.1:23001")

known_container_states = {}
known_prometheus_alerts = set()

# Adaptive CPU Safety Watchdog State
high_cpu_counter = 0
current_poll_interval = ALERT_POLL_INTERVAL

def get_cpu_usage_sample():
    """Read CPU usage percentage from /proc/stat."""
    try:
        if not os.path.exists("/proc/stat"):
            return 10.0
        with open("/proc/stat", "r") as f:
            line1 = f.readline()
        parts1 = [float(x) for x in line1.split()[1:]]
        idle1 = parts1[3] + parts1[4]
        total1 = sum(parts1)

        time.sleep(0.2)

        with open("/proc/stat", "r") as f:
            line2 = f.readline()
        parts2 = [float(x) for x in line2.split()[1:]]
        idle2 = parts2[3] + parts2[4]
        total2 = sum(parts2)

        idle_delta = idle2 - idle1
        total_delta = total2 - total1

        if total_delta > 0:
            return round((1.0 - (idle_delta / total_delta)) * 100.0, 1)
        return 10.0
    except Exception:
        return 10.0

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
                        
                        alert_data = {
                            "title": f"Prometheus Alert: {alert_name}",
                            "severity": "critical" if "critical" in alert_name.lower() or "down" in alert_name.lower() else "warning",
                            "description": summary or desc,
                            "fields": [
                                {"name": "Alert Name", "value": alert_name, "inline": True},
                                {"name": "Target Instance", "value": instance, "inline": True},
                                {"name": "Description", "value": desc if desc else summary, "inline": False}
                            ]
                        }
                        
                        print(f"[ALERT WORKER] Dispatching Prometheus alert: {alert_key}", flush=True)
                        dispatch_alert(alert_data)
            
            known_prometheus_alerts.clear()
            known_prometheus_alerts.update(current_firing)
    except Exception:
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
                        exit_code = 0
                        try:
                            detail_url = f"{DOCKER_PROXY_URL}/containers/{c['Id']}/json"
                            d_req = urllib.request.Request(detail_url)
                            with urllib.request.urlopen(d_req, timeout=3) as d_resp:
                                d_data = json.loads(d_resp.read().decode("utf-8"))
                                exit_code = d_data.get("State", {}).get("ExitCode", 0)
                        except Exception:
                            pass

                        if exit_code == 137:
                            msg = f"[CRITICAL] Container '{cname}' crashed unexpectedly (exit code 137 - possible OOM)"
                            title = f"CRITICAL: Container OOM Crash: {cname}"
                            sev = "critical"
                        elif exit_code != 0:
                            msg = f"[CRITICAL] Container '{cname}' crashed unexpectedly (exit code {exit_code})"
                            title = f"CRITICAL: Container Crash (code {exit_code}): {cname}"
                            sev = "critical"
                        else:
                            msg = f"Container '{cname}' state changed from '{prev_state}' to '{cstate}'"
                            title = f"Container Stopped: {cname}"
                            sev = "down"

                        alert_data = {
                            "title": title,
                            "severity": sev,
                            "description": msg,
                            "fields": [
                                {"name": "Container Name", "value": cname, "inline": True},
                                {"name": "Exit Code", "value": str(exit_code), "inline": True},
                                {"name": "State", "value": cstate.upper(), "inline": True}
                            ]
                        }
                        print(f"[ALERT WORKER] {msg}", flush=True)
                        dispatch_alert(alert_data)
                        try:
                            conn = get_db()
                            cursor = conn.cursor()
                            now_str = time.strftime("%Y-%m-%d %H:%M:%S")
                            cursor.execute(
                                "INSERT INTO network_events (mac, ip, event_type, message, alerted, timestamp) VALUES (?, ?, ?, ?, 1, ?)",
                                ("00:00:00:00:00:00", "127.0.0.1", "CONTAINER_CRASH" if exit_code != 0 else "CONTAINER_STOPPED", msg, now_str)
                            )
                            conn.commit()
                            conn.close()
                        except Exception as dbe:
                            print(f"[DB EVENT LOG ERROR] {dbe}", flush=True)
                
                known_container_states[cname] = cstate
    except Exception as e:
        print(f"[DEBUG CONTAINER EVENT ERROR] {e}", flush=True)

async def check_network_events():
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, mac, ip, event_type, message FROM network_events WHERE alerted = 0")
        rows = cursor.fetchall()
        
        for r in rows:
            event_id = r["id"]
            event_type = r["event_type"]
            severity = "info" if event_type == "JOINED" else "warning"
            
            alert_data = {
                "title": f"Network Device {event_type}",
                "severity": severity,
                "description": r["message"],
                "fields": [
                    {"name": "Device IP", "value": r["ip"], "inline": True},
                    {"name": "MAC Address", "value": r["mac"], "inline": True},
                    {"name": "Event Type", "value": event_type, "inline": True}
                ]
            }
            print(f"[ALERT WORKER] Dispatching network event alert: {r['message']}", flush=True)
            dispatch_alert(alert_data)
            cursor.execute("UPDATE network_events SET alerted = 1 WHERE id = ?", (event_id,))
            
        conn.commit()
        conn.close()
    except Exception:
        pass

async def alert_polling_loop():
    global high_cpu_counter, current_poll_interval
    await asyncio.sleep(5)
    print(f"[ALERT WORKER] Alert polling worker started with {current_poll_interval}s interval...", flush=True)
    
    while True:
        try:
            # 1. Adaptive CPU Watchdog Check
            cpu_val = get_cpu_usage_sample()
            if cpu_val > 70.0:
                high_cpu_counter += 1
                if high_cpu_counter >= 3 and current_poll_interval == 20:
                    current_poll_interval = 60
                    print(f"[ALERT WATCHDOG WARNING] Sustained CPU usage >70% ({cpu_val}%). Auto-reverting to safe 60s polling interval.", flush=True)
            else:
                if high_cpu_counter > 0:
                    high_cpu_counter -= 1
                if high_cpu_counter == 0 and current_poll_interval == 60:
                    current_poll_interval = 20
                    print(f"[ALERT WATCHDOG INFO] CPU usage stabilized ({cpu_val}%). Resuming fast 20s polling interval.", flush=True)

            # 2. Run Alert Checkers
            await check_prometheus_alerts()
            await check_container_down_events()
            await check_network_events()

            # 3. Weekly Friday Data Retention Cleanup Check (8-day retention)
            try:
                run_weekly_retention_cleanup(force=False)
            except Exception as ce:
                print(f"[CLEANUP ERROR] {ce}", flush=True)

        except Exception as e:
            print(f"[ALERT WORKER ERROR] {e}", flush=True)

        await asyncio.sleep(current_poll_interval)
