import os
import json
import urllib.request
import urllib.parse
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from app.routes_auth import get_current_user

router = APIRouter(prefix="/api/containers", tags=["containers"])

DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "http://docker-socket-proxy:2375")

def call_docker_api(path: str, method: str = "GET", body: dict = None):
    url = f"{DOCKER_PROXY_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body else None
    headers = {"Content-Type": "application/json"} if body else {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read()
            if "application/json" in content_type:
                return resp.status, json.loads(raw.decode("utf-8"))
            return resp.status, raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        raw_err = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw_err)
        except Exception:
            parsed = {"detail": raw_err}
        return e.code, parsed
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to communicate with Docker proxy: {str(e)}"
        )

@router.get("")
def list_containers(current_user: dict = Depends(get_current_user)):
    code, data = call_docker_api("/containers/json?all=true")
    if code != 200:
        raise HTTPException(status_code=code, detail=data)
    
    result = []
    for c in data:
        cid = c["Id"]
        cname = c["Names"][0].lstrip("/") if c.get("Names") else cid[:12]
        cstatus = c.get("Status", "")
        cstate = c.get("State", "")
        cimage = c.get("Image", "")
        
        cpu_pct = 0.0
        mem_pct = 0.0
        mem_usage_mb = 0.0
        
        if cstate == "running":
            scode, sdata = call_docker_api(f"/containers/{cid}/stats?stream=false")
            if scode == 200 and isinstance(sdata, dict):
                cpu_stats = sdata.get("cpu_stats", {})
                precpu_stats = sdata.get("precpu_stats", {})
                
                cpu_usage = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
                precpu_usage = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)
                system_usage = cpu_stats.get("system_cpu_usage", 0)
                presystem_usage = precpu_stats.get("system_cpu_usage", 0)
                
                cpu_delta = cpu_usage - precpu_usage
                system_delta = system_usage - presystem_usage
                online_cpus = cpu_stats.get("online_cpus", 1) or 1
                
                if system_delta > 0 and cpu_delta > 0:
                    cpu_pct = round((cpu_delta / system_delta) * online_cpus * 100.0, 2)
                
                mem_stats = sdata.get("memory_stats", {})
                usage = mem_stats.get("usage", 0)
                stats = mem_stats.get("stats", {})
                inactive_file = stats.get("inactive_file", 0)
                actual_usage = max(0, usage - inactive_file)
                limit = mem_stats.get("limit", 1)
                
                mem_usage_mb = round(actual_usage / (1024 * 1024), 2)
                if limit > 0:
                    mem_pct = round((actual_usage / limit) * 100.0, 2)
        
        result.append({
            "id": cid[:12],
            "name": cname,
            "image": cimage,
            "state": cstate,
            "status": cstatus,
            "cpu_percent": cpu_pct,
            "memory_mb": mem_usage_mb,
            "memory_percent": mem_pct
        })
        
    return result

class ContainerActionRequest(BaseModel):
    action: str

@router.post("/{name_or_id}/action")
def container_action(name_or_id: str, req: ContainerActionRequest, current_user: dict = Depends(get_current_user)):
    action = req.action.lower()
    if action not in ("start", "stop", "restart"):
        raise HTTPException(status_code=400, detail="Action must be start, stop, or restart")
    
    code, res = call_docker_api(f"/containers/{name_or_id}/{action}", method="POST")
    if code in (204, 200):
        return {"message": f"Container '{name_or_id}' action '{action}' executed successfully"}
    raise HTTPException(status_code=code, detail=res)

@router.get("/{name_or_id}/logs")
def container_logs(name_or_id: str, tail: int = Query(100, ge=1, le=1000), current_user: dict = Depends(get_current_user)):
    code, logs = call_docker_api(f"/containers/{name_or_id}/logs?stdout=true&stderr=true&tail={tail}")
    if code != 200:
        raise HTTPException(status_code=code, detail=logs)
    return {"container": name_or_id, "logs": logs}
