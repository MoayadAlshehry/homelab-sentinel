import os
import json
import logging
import urllib.request
import urllib.parse
import threading
import time
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from app.routes_auth import get_current_user

router = APIRouter(prefix="/api/containers", tags=["containers"])

DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "http://127.0.0.1:2375")

logger = logging.getLogger("sentinel.containers")
logger.setLevel(logging.INFO)

CONTAINER_STATS_CACHE = {}
CPU_PREV_USAGE = {}
CACHE_LOCK = threading.Lock()

# Get total host RAM in MB once for percentage calculations
HOST_TOTAL_MEM_MB = 16000.0
if os.path.exists("/proc/meminfo"):
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    HOST_TOTAL_MEM_MB = round(int(line.split()[1]) / 1024.0, 1)
                    break
    except Exception:
        pass

def call_docker_api(path: str, method: str = "GET", body: dict = None, timeout: int = 5):
    url = f"{DOCKER_PROXY_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return resp.status, json.loads(raw.decode("utf-8"))
            return resp.status, raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raw_err = e.read().decode("utf-8", errors="replace")
        logger.error(f"[DOCKER API HTTP {e.code}] Path: {path} | Error: {raw_err}")
        try:
            parsed = json.loads(raw_err)
        except Exception:
            parsed = {"detail": raw_err}
        return e.code, parsed
    except Exception as e:
        logger.error(f"[DOCKER API EXCEPTION] Path: {path} | Exception: {str(e)}")
        return 503, {"detail": f"Failed to communicate with Docker proxy: {str(e)}"}

def update_single_container_stats(cid: str):
    # 1. Fetch Stats for CPU
    scode, sdata = call_docker_api(f"/containers/{cid}/stats?stream=false", timeout=3)
    if scode != 200 or not isinstance(sdata, dict):
        logger.warning(f"[CONTAINER STATS WARN] Failed stats call for {cid[:12]} (Status: {scode})")
        return
    
    cpu_stats = sdata.get("cpu_stats", {})
    precpu_stats = sdata.get("precpu_stats", {})
    
    cpu_usage = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
    precpu_usage = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
    system_usage = cpu_stats.get("system_cpu_usage", 0)
    presystem_usage = precpu_stats.get("system_cpu_usage", 0)
    online_cpus = cpu_stats.get("online_cpus", 4) or 4
    
    cpu_pct = 0.0
    
    if cid in CPU_PREV_USAGE:
        prev_cpu, prev_sys = CPU_PREV_USAGE[cid]
        c_delta = cpu_usage - prev_cpu
        s_delta = system_usage - prev_sys
        if s_delta > 0 and c_delta >= 0:
            cpu_pct = round((c_delta / s_delta) * online_cpus * 100.0, 2)
            
    if cpu_pct == 0.0:
        c_delta = cpu_usage - precpu_usage
        s_delta = system_usage - presystem_usage
        if s_delta > 0 and c_delta > 0:
            cpu_pct = round((c_delta / s_delta) * online_cpus * 100.0, 2)
            
    CPU_PREV_USAGE[cid] = (cpu_usage, system_usage)
    
    # 2. Fetch Container Inspection for PID and Memory VmRSS
    mem_usage_mb = 0.0
    icode, idata = call_docker_api(f"/containers/{cid}/json", timeout=2)
    if icode == 200 and isinstance(idata, dict):
        pid = idata.get("State", {}).get("Pid", 0)
        if pid > 0 and os.path.exists(f"/proc/{pid}/status"):
            try:
                with open(f"/proc/{pid}/status") as f:
                    for line in f:
                        if line.startswith("VmRSS:"):
                            kb = int(line.split()[1])
                            mem_usage_mb = round(kb / 1024.0, 1)
                            break
            except Exception:
                pass
                
    # Fallback to docker memory stats if proc reading unavailable
    if mem_usage_mb == 0.0:
        mem_stats = sdata.get("memory_stats", {})
        usage = mem_stats.get("usage", 0) or 0
        stats = mem_stats.get("stats", {})
        cache = (stats.get("inactive_file") or 0) or (stats.get("cache") or 0)
        actual_usage = max(0, usage - cache)
        mem_usage_mb = round(actual_usage / (1024 * 1024), 1)

    mem_pct = round((mem_usage_mb / HOST_TOTAL_MEM_MB) * 100.0, 1) if HOST_TOTAL_MEM_MB > 0 else 0.0
    
    with CACHE_LOCK:
        CONTAINER_STATS_CACHE[cid] = {
            "cpu_percent": cpu_pct,
            "memory_mb": mem_usage_mb,
            "memory_percent": mem_pct
        }

def background_stats_worker():
    """Continuously refreshes container stats in the background."""
    while True:
        try:
            code, data = call_docker_api("/containers/json?all=false", timeout=3)
            if code == 200 and isinstance(data, list):
                for c in data:
                    if c.get("State") == "running":
                        cid = c.get("Id", "")
                        if cid:
                            update_single_container_stats(cid)
                            time.sleep(0.05)
        except Exception as e:
            logger.error(f"[BACKGROUND STATS WORKER ERROR] {e}")
        time.sleep(3)

worker_thread = threading.Thread(target=background_stats_worker, daemon=True)
worker_thread.start()

@router.get("")
def list_containers(current_user: dict = Depends(get_current_user)):
    code, data = call_docker_api("/containers/json?all=true", timeout=5)
    if code != 200:
        logger.error(f"[LIST CONTAINERS FAILED] Status: {code} | Detail: {data}")
        raise HTTPException(status_code=code, detail=data)
    
    if not isinstance(data, list):
        return []

    result = []
    with CACHE_LOCK:
        stats_copy = dict(CONTAINER_STATS_CACHE)

    for c in data:
        cid = c.get("Id", "")
        cnames = c.get("Names", [])
        cname = cnames[0].lstrip("/") if cnames else cid[:12]
        cstatus = c.get("Status", "")
        cstate = c.get("State", "")
        cimage = c.get("Image", "")
        
        cstats = stats_copy.get(cid, {}) if cstate == "running" else {}
        
        result.append({
            "id": cid[:12],
            "name": cname,
            "image": cimage,
            "state": cstate,
            "status": cstatus,
            "cpu_percent": cstats.get("cpu_percent", 0.0),
            "memory_mb": cstats.get("memory_mb", 0.0),
            "memory_percent": cstats.get("memory_percent", 0.0)
        })
        
    return result

class ContainerActionRequest(BaseModel):
    action: str

from app.database import get_db

def log_container_event_to_db(container_id: str, action: str):
    try:
        conn = get_db()
        cursor = conn.cursor()
        event_type = "CONTAINER_STOPPED" if action == "stop" else ("CONTAINER_STARTED" if action == "start" else "CONTAINER_RESTARTED")
        msg = f"Container '{container_id}' was {action}ed"
        now_str = time.strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO network_events (mac, ip, event_type, message, alerted, timestamp) VALUES (?, ?, ?, ?, 1, ?)",
            ("00:00:00:00:00:00", "127.0.0.1", event_type, msg, now_str)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.error(f"[LOG CONTAINER EVENT DB ERROR] {e}")

@router.post("/{container_id}/action")
def container_action(container_id: str, req: ContainerActionRequest, current_user: dict = Depends(get_current_user)):
    valid_actions = ["start", "stop", "restart"]
    if req.action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action '{req.action}'. Allowed actions: {valid_actions}"
        )
    
    code, data = call_docker_api(f"/containers/{container_id}/{req.action}", method="POST", timeout=15)
    if code not in (200, 204):
        logger.error(f"[CONTAINER ACTION FAILED] Container: {container_id} | Action: {req.action} | Code: {code}")
        raise HTTPException(status_code=code, detail=data)
    
    log_container_event_to_db(container_id, req.action)
    return {"message": f"Container {container_id} action '{req.action}' executed successfully"}

@router.post("/{container_id}/{action}")
def container_direct_action(container_id: str, action: str, current_user: dict = Depends(get_current_user)):
    valid_actions = ["start", "stop", "restart"]
    if action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid action '{action}'. Allowed actions: {valid_actions}"
        )
    
    code, data = call_docker_api(f"/containers/{container_id}/{action}", method="POST", timeout=15)
    if code not in (200, 204):
        logger.error(f"[CONTAINER ACTION FAILED] Container: {container_id} | Action: {action} | Code: {code}")
        raise HTTPException(status_code=code, detail=data)
    
    log_container_event_to_db(container_id, action)
    return {"message": f"Container {container_id} action '{action}' executed successfully"}

@router.get("/{container_id}/logs")
def get_container_logs(container_id: str, tail: int = Query(200, ge=1, le=2000), current_user: dict = Depends(get_current_user)):
    code, data = call_docker_api(f"/containers/{container_id}/logs?stdout=true&stderr=true&tail={tail}", timeout=10)
    if code != 200:
        logger.error(f"[CONTAINER LOGS FAILED] Container: {container_id} | Code: {code}")
        raise HTTPException(status_code=code, detail=data)
    
    if isinstance(data, str):
        lines = data.splitlines()
        clean_lines = []
        for line in lines:
            if len(line) > 8 and line[0] in (1, 2, '\x01', '\x02'):
                clean_lines.append(line[8:])
            else:
                clean_lines.append(line)
        return {"logs": "\n".join(clean_lines)}
    return {"logs": str(data)}
