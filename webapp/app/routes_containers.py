import os
import json
import urllib.request
import urllib.parse
from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from app.routes_auth import get_current_user

router = APIRouter(prefix="/api/containers", tags=["containers"])

DOCKER_PROXY_URL = os.getenv("DOCKER_PROXY_URL", "http://docker-socket-proxy:2375")

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
        try:
            parsed = json.loads(raw_err)
        except Exception:
            parsed = {"detail": raw_err}
        return e.code, parsed
    except Exception as e:
        return 503, {"detail": f"Failed to communicate with Docker proxy: {str(e)}"}

@router.get("")
def list_containers(current_user: dict = Depends(get_current_user)):
    code, data = call_docker_api("/containers/json?all=true", timeout=5)
    if code != 200:
        raise HTTPException(status_code=code, detail=data)
    
    if not isinstance(data, list):
        return []

    result = []
    for c in data:
        cid = c.get("Id", "")
        cnames = c.get("Names", [])
        cname = cnames[0].lstrip("/") if cnames else cid[:12]
        cstatus = c.get("Status", "")
        cstate = c.get("State", "")
        cimage = c.get("Image", "")
        
        cpu_pct = 0.0
        mem_pct = 0.0
        mem_usage_mb = 0.0
        
        # Gather stats with quick 1s timeout per running container
        if cstate == "running":
            try:
                scode, sdata = call_docker_api(f"/containers/{cid}/stats?stream=false", timeout=1)
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
            except Exception:
                pass
        
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
        raise HTTPException(status_code=code, detail=data)
    
    return {"message": f"Container {container_id} action '{req.action}' executed successfully"}

@router.get("/{container_id}/logs")
def get_container_logs(container_id: str, tail: int = Query(200, ge=1, le=2000), current_user: dict = Depends(get_current_user)):
    code, data = call_docker_api(f"/containers/{container_id}/logs?stdout=true&stderr=true&tail={tail}", timeout=10)
    if code != 200:
        raise HTTPException(status_code=code, detail=data)
    
    # Strip Docker stream headers if present
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
