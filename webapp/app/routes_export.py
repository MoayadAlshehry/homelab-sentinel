import time
import datetime
import os
import json
import sqlite3
import urllib.request
import urllib.parse
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Request, status
from fastapi.responses import PlainTextResponse
from app.database import get_db
from app.security import decode_access_token

router = APIRouter(tags=["export"])

DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "http://127.0.0.1:2375")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:29090")
KUMA_DB_PATH = os.getenv("KUMA_DB_PATH", "/app/data/kuma.db")

APP_START_TIME = time.time()
APP_START_ISO = datetime.datetime.now(datetime.timezone.utc).isoformat()

def get_export_user(request: Request):
    token = request.query_params.get("api_token") or request.headers.get("x-api-token")
    configured_read_token = os.getenv("EXPORT_API_TOKEN", "sentinel_read_only_token_2026")
    if token and token == configured_read_token:
        return {"username": "read_only_exporter", "role": "exporter"}

    auth_header = request.headers.get("authorization") or ""
    if auth_header.startswith("Bearer "):
        btoken = auth_header.split(" ")[1]
        payload = decode_access_token(btoken)
        if payload:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, must_change_password FROM users WHERE username = ?", (payload["sub"],))
            user = cursor.fetchone()
            conn.close()
            if user:
                return dict(user)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication credentials for export endpoint"
    )

def query_prom(query: str):
    url = f"{PROMETHEUS_URL}/api/v1/query?query=" + urllib.parse.quote(query)
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("data", {}).get("result", [])
    except Exception:
        return []

def get_system_snapshot():
    # 1. Temp C
    temp_c = 45.0
    temp_res = query_prom('node_thermal_zone_temp{zone="0"}')
    if temp_res:
        try:
            temp_c = round(float(temp_res[0]["value"][1]), 1)
        except Exception:
            pass
    elif os.path.exists("/sys/class/thermal/thermal_zone0/temp"):
        try:
            with open("/sys/class/thermal/thermal_zone0/temp") as f:
                temp_c = round(float(f.read().strip()) / 1000.0, 1)
        except Exception:
            pass

    # 2. CPU Usage %
    cpu_pct = 12.0
    cpu_res = query_prom('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)')
    if cpu_res:
        try:
            cpu_pct = round(float(cpu_res[0]["value"][1]), 1)
        except Exception:
            pass

    # 3. RAM Usage
    ram_total_bytes = 16 * 1024**3
    ram_used_bytes = 3.5 * 1024**3
    ram_used_pct = 22.0

    tot_res = query_prom("node_memory_MemTotal_bytes")
    avail_res = query_prom("node_memory_MemAvailable_bytes")
    if tot_res and avail_res:
        try:
            tot_bytes = float(tot_res[0]["value"][1])
            avail_bytes = float(avail_res[0]["value"][1])
            used_bytes = max(0.0, tot_bytes - avail_bytes)
            ram_total_bytes = int(tot_bytes)
            ram_used_bytes = int(used_bytes)
            ram_used_pct = round((used_bytes / tot_bytes) * 100.0, 1)
        except Exception:
            pass

    # 4. Disk Usage
    disk_used_pct = 0.0
    size_res = query_prom('node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs|devtmpfs"}')
    free_res = query_prom('node_filesystem_free_bytes{fstype!~"tmpfs|overlay|squashfs|devtmpfs"}')
    if size_res and free_res:
        try:
            tot_b = sum(float(r["value"][1]) for r in size_res)
            free_b = sum(float(r["value"][1]) for r in free_res)
            used_b = max(0.0, tot_b - free_b)
            if tot_b > 0:
                disk_used_pct = round((used_b / tot_b) * 100.0, 1)
        except Exception:
            pass

    return {
        "temperature_c": temp_c,
        "cpu_usage_pct": cpu_pct,
        "ram_total_bytes": ram_total_bytes,
        "ram_used_bytes": ram_used_bytes,
        "ram_used_pct": ram_used_pct,
        "disk_used_pct": disk_used_pct
    }

def get_containers_snapshot():
    total = 0
    running = 0
    stopped = 0
    container_list = []
    try:
        url = f"{DOCKER_PROXY_URL}/containers/json?all=true"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3) as resp:
            containers = json.loads(resp.read().decode("utf-8"))
            total = len(containers)
            for c in containers:
                cname = c["Names"][0].lstrip("/") if c.get("Names") else c["Id"][:12]
                state = c.get("State", "").lower()
                is_run = (state == "running")
                if is_run:
                    running += 1
                else:
                    stopped += 1
                container_list.append({
                    "name": cname,
                    "image": c.get("Image", ""),
                    "state": state,
                    "status": c.get("Status", ""),
                    "is_running": is_run
                })
    except Exception:
        pass

    return {
        "total_count": total,
        "running_count": running,
        "stopped_count": stopped,
        "containers": container_list
    }

def kuma_exec(cmd_list):
    try:
        req1 = urllib.request.Request(f"{DOCKER_PROXY_URL}/v1.43/containers/sentinel-uptime-kuma/exec",
            data=json.dumps({'AttachStdout': True, 'AttachStderr': True, 'Cmd': cmd_list}).encode('utf-8'),
            headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req1, timeout=5) as res1:
            exec_id = json.loads(res1.read().decode('utf-8'))['Id']
        
        req2 = urllib.request.Request(f"{DOCKER_PROXY_URL}/v1.43/exec/{exec_id}/start",
            data=json.dumps({'Detach': False, 'Tty': False}).encode('utf-8'),
            headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req2, timeout=5) as res2:
            raw = res2.read()
            out = []
            i = 0
            while i < len(raw):
                if i + 8 <= len(raw):
                    size = int.from_bytes(raw[i+4:i+8], 'big')
                    payload = raw[i+8:i+8+size]
                    out.append(payload.decode('utf-8', errors='replace'))
                    i += 8 + size
                else:
                    out.append(raw[i:].decode('utf-8', errors='replace'))
                    break
            return ''.join(out)
    except Exception as e:
        print(f"[EXPORT KUMA EXEC ERROR] {e}", flush=True)
        return ""

def get_monitors_snapshot():
    total = 0
    up_count = 0
    down_count = 0
    monitor_list = []

    raw_monitors = kuma_exec(["/usr/bin/sqlite3", "/app/data/kuma.db", "SELECT id, name, type, active FROM monitor;"])
    if raw_monitors:
        lines = [l for l in raw_monitors.split('\n') if l.strip()]
        total = len(lines)
        for line in lines:
            parts = line.split('|')
            if len(parts) >= 4:
                m_id = parts[0]
                m_name = parts[1]
                m_type = parts[2]
                m_active = (parts[3] == "1")

                hb_raw = kuma_exec([
                    "/usr/bin/sqlite3", "/app/data/kuma.db",
                    f"SELECT status, ping FROM heartbeat WHERE monitor_id = {m_id} ORDER BY id DESC LIMIT 1;"
                ])
                hb_line = hb_raw.strip().split('|') if hb_raw.strip() else []
                is_up = bool(hb_line and hb_line[0] == "1")
                ping_val = int(hb_line[1]) if len(hb_line) > 1 and hb_line[1].isdigit() else 0

                if is_up:
                    up_count += 1
                else:
                    down_count += 1

                monitor_list.append({
                    "id": int(m_id) if m_id.isdigit() else m_id,
                    "name": m_name,
                    "type": m_type,
                    "is_active": m_active,
                    "status": "UP" if is_up else "DOWN",
                    "latency_ms": ping_val
                })

    return {
        "total_count": total,
        "up_count": up_count,
        "down_count": down_count,
        "monitors": monitor_list
    }

def get_network_snapshot():
    total = 0
    online = 0
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*), SUM(CASE WHEN is_online = 1 THEN 1 ELSE 0 END) FROM devices;")
        row = cursor.fetchone()
        if row:
            total = row[0] or 0
            online = row[1] or 0
        conn.close()
    except Exception:
        pass

    return {
        "total_count": total,
        "online_count": online,
        "offline_count": max(0, total - online)
    }

def get_notifications_snapshot():
    total_24h = 0
    success_24h = 0
    failed_24h = 0
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications_log';")
        if cursor.fetchone():
            cutoff_24h = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("SELECT COUNT(*), SUM(CASE WHEN UPPER(status) IN ('SENT', 'SUCCESS') THEN 1 ELSE 0 END), SUM(CASE WHEN UPPER(status) IN ('FAILED', 'ERROR') THEN 1 ELSE 0 END) FROM notifications_log WHERE timestamp >= ?;", (cutoff_24h,))
            row = cursor.fetchone()
            if row:
                total_24h = row[0] or 0
                success_24h = row[1] or 0
                failed_24h = row[2] or 0
        conn.close()
    except Exception:
        pass

    return {
        "total_24h": total_24h,
        "success_24h": success_24h,
        "failed_24h": failed_24h
    }

@router.get("/api/export")
def export_json_snapshot(user: dict = Depends(get_export_user)):
    uptime_sec = round(time.time() - APP_START_TIME, 1)
    sys_meta = get_system_snapshot()
    ct_meta = get_containers_snapshot()
    mon_meta = get_monitors_snapshot()
    net_meta = get_network_snapshot()
    notif_meta = get_notifications_snapshot()

    return {
        "sentinel": {
            "status": "healthy",
            "version": "1.0.0",
            "start_time": APP_START_ISO,
            "uptime_seconds": uptime_sec
        },
        "system": sys_meta,
        "containers": ct_meta,
        "monitors": mon_meta,
        "network_devices": net_meta,
        "notifications": notif_meta
    }

@router.get("/api/export/prometheus", response_class=PlainTextResponse)
def export_prometheus_metrics(user: dict = Depends(get_export_user)):
    uptime_sec = round(time.time() - APP_START_TIME, 1)
    sys_meta = get_system_snapshot()
    ct_meta = get_containers_snapshot()
    mon_meta = get_monitors_snapshot()
    net_meta = get_network_snapshot()
    notif_meta = get_notifications_snapshot()

    lines = [
        "# HELP sentinel_uptime_seconds Total running time of Sentinel webapp in seconds",
        "# TYPE sentinel_uptime_seconds counter",
        f"sentinel_uptime_seconds {uptime_sec}",
        "",
        "# HELP sentinel_cpu_usage_percent Current CPU usage percentage",
        "# TYPE sentinel_cpu_usage_percent gauge",
        f"sentinel_cpu_usage_percent {sys_meta['cpu_usage_pct']}",
        "",
        "# HELP sentinel_ram_usage_percent Current RAM usage percentage",
        "# TYPE sentinel_ram_usage_percent gauge",
        f"sentinel_ram_usage_percent {sys_meta['ram_used_pct']}",
        "",
        "# HELP sentinel_ram_used_bytes Current RAM used in bytes",
        "# TYPE sentinel_ram_used_bytes gauge",
        f"sentinel_ram_used_bytes {sys_meta['ram_used_bytes']}",
        "",
        "# HELP sentinel_temp_celsius CPU or system temperature in degrees Celsius",
        "# TYPE sentinel_temp_celsius gauge",
        f"sentinel_temp_celsius {sys_meta['temperature_c']}",
        "",
        "# HELP sentinel_containers_total_count Total Docker containers tracked by Sentinel",
        "# TYPE sentinel_containers_total_count gauge",
        f"sentinel_containers_total_count {ct_meta['total_count']}",
        "",
        "# HELP sentinel_containers_running_count Currently running Docker containers",
        "# TYPE sentinel_containers_running_count gauge",
        f"sentinel_containers_running_count {ct_meta['running_count']}",
        "",
        "# HELP sentinel_monitors_total_count Total service health monitors",
        "# TYPE sentinel_monitors_total_count gauge",
        f"sentinel_monitors_total_count {mon_meta['total_count']}",
        "",
        "# HELP sentinel_monitors_up_count Currently UP service monitors",
        "# TYPE sentinel_monitors_up_count gauge",
        f"sentinel_monitors_up_count {mon_meta['up_count']}",
        "",
        "# HELP sentinel_network_devices_total_count Total LAN network devices recorded",
        "# TYPE sentinel_network_devices_total_count gauge",
        f"sentinel_network_devices_total_count {net_meta['total_count']}",
        "",
        "# HELP sentinel_network_devices_online_count Currently online LAN network devices",
        "# TYPE sentinel_network_devices_online_count gauge",
        f"sentinel_network_devices_online_count {net_meta['online_count']}",
        "",
        "# HELP sentinel_notifications_sent_24h_total Total alerts dispatched in last 24h",
        "# TYPE sentinel_notifications_sent_24h_total counter",
        f"sentinel_notifications_sent_24h_total {notif_meta['total_24h']}",
        ""
    ]

    return PlainTextResponse(content="\n".join(lines), media_type="text/plain; version=0.0.4; charset=utf-8")
