import os
import json
import time
import urllib.request
import urllib.parse
from fastapi import APIRouter, Depends, Query
from app.routes_auth import get_current_user

router = APIRouter(prefix="/api/system", tags=["system"])

PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://127.0.0.1:29090")

def query_prom(query: str):
    url = f"{PROMETHEUS_URL}/api/v1/query?query=" + urllib.parse.quote(query)
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("data", {}).get("result", [])
    except Exception:
        return []

def query_prom_range(query: str, start_ts: int, end_ts: int, step: str):
    url = f"{PROMETHEUS_URL}/api/v1/query_range?query=" + urllib.parse.quote(query) + f"&start={start_ts}&end={end_ts}&step={step}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("data", {}).get("result", [])
    except Exception:
        return []

@router.get("/metrics")
def get_system_metrics(current_user: dict = Depends(get_current_user)):
    # 1. Temperature
    temp_c = 45.0
    temp_res = query_prom("node_thermal_zone_temp{zone=\"0\"}")
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
    cpu_res = query_prom("100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)")
    if cpu_res:
        try:
            cpu_pct = round(float(cpu_res[0]["value"][1]), 1)
        except Exception:
            pass

    # 3. RAM Usage
    ram_total_gb = 16.0
    ram_used_gb = 3.5
    ram_used_pct = 22.0
    
    tot_res = query_prom("node_memory_MemTotal_bytes")
    avail_res = query_prom("node_memory_MemAvailable_bytes")
    if tot_res and avail_res:
        try:
            tot_bytes = float(tot_res[0]["value"][1])
            avail_bytes = float(avail_res[0]["value"][1])
            used_bytes = max(0.0, tot_bytes - avail_bytes)
            ram_total_gb = round(tot_bytes / (1024**3), 2)
            ram_used_gb = round(used_bytes / (1024**3), 2)
            ram_used_pct = round((used_bytes / tot_bytes) * 100.0, 1)
        except Exception:
            pass

    # 4. Disks (ALL MOUNTED PHYSICAL DISKS)
    disks = []
    size_res = query_prom("node_filesystem_size_bytes{fstype!~\"tmpfs|overlay|squashfs|devtmpfs\"}")
    free_res = query_prom("node_filesystem_free_bytes{fstype!~\"tmpfs|overlay|squashfs|devtmpfs\"}")
    
    free_map = {}
    for r in free_res:
        mpt = r.get("metric", {}).get("mountpoint", "")
        if mpt:
            free_map[mpt] = float(r["value"][1])
            
    for r in size_res:
        metric = r.get("metric", {})
        mpt = metric.get("mountpoint", "")
        dev = metric.get("device", "")
        fstype = metric.get("fstype", "")
        if mpt and dev:
            tot_b = float(r["value"][1])
            free_b = free_map.get(mpt, 0.0)
            used_b = max(0.0, tot_b - free_b)
            tot_gb = round(tot_b / (1024**3), 2)
            used_gb = round(used_b / (1024**3), 2)
            free_gb = round(free_b / (1024**3), 2)
            pct = round((used_b / tot_b) * 100.0, 1) if tot_b > 0 else 0.0
            disks.append({
                "device": dev,
                "mountpoint": mpt,
                "fstype": fstype,
                "total_gb": tot_gb,
                "used_gb": used_gb,
                "free_gb": free_gb,
                "used_pct": pct
            })
            
    disks.sort(key=lambda d: (0 if d["mountpoint"] == "/" else (1 if "ssd" in d["mountpoint"] else 2), d["mountpoint"]))

    return {
        "temperature_c": temp_c,
        "cpu_usage_pct": cpu_pct,
        "ram_total_gb": ram_total_gb,
        "ram_used_gb": ram_used_gb,
        "ram_used_pct": ram_used_pct,
        "disks": disks
    }

@router.get("/history")
def get_system_history(
    range: str = Query("live", regex="^(live|3h|24h|7d)$"),
    current_user: dict = Depends(get_current_user)
):
    end_ts = int(time.time())
    
    if range == "3h":
        start_ts = end_ts - 3 * 3600
        step = "60s"
        time_fmt = "%H:%M"
    elif range == "24h":
        start_ts = end_ts - 24 * 3600
        step = "5m"
        time_fmt = "%H:%M"
    elif range == "7d":
        start_ts = end_ts - 7 * 86400
        step = "1h"
        time_fmt = "%m/%d %H:%M"
    else: # live
        start_ts = end_ts - 900 # 15 mins
        step = "5s"
        time_fmt = "%H:%M:%S"

    cpu_res = query_prom_range("100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)", start_ts, end_ts, step)
    temp_res = query_prom_range("node_thermal_zone_temp{zone=\"0\"}", start_ts, end_ts, step)
    ram_res = query_prom_range("(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100", start_ts, end_ts, step)

    cpu_map = {v[0]: round(float(v[1]), 1) for v in (cpu_res[0]["values"] if cpu_res else [])}
    temp_map = {v[0]: round(float(v[1]), 1) for v in (temp_res[0]["values"] if temp_res else [])}
    ram_map = {v[0]: round(float(v[1]), 1) for v in (ram_res[0]["values"] if ram_res else [])}

    all_timestamps = sorted(list(set(cpu_map.keys()) | set(temp_map.keys()) | set(ram_map.keys())))

    points = []
    for ts in all_timestamps:
        time_str = time.strftime(time_fmt, time.localtime(ts))
        points.append({
            "timestamp": ts,
            "time": time_str,
            "cpu": cpu_map.get(ts, 0.0),
            "temp": temp_map.get(ts, 0.0),
            "ram": ram_map.get(ts, 0.0)
        })

    return points
