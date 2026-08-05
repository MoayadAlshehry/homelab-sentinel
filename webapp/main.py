import asyncio
import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from app.database import init_db
from app.security import hash_password
from app.middleware import IPRestrictionMiddleware
from app.routes_auth import router as auth_router
from app.routes_containers import router as containers_router
from app.routes_network import router as network_router
from app.routes_monitoring import router as monitoring_router
from app.routes_settings import router as settings_router
from app.routes_system import router as system_router
from app.routes_export import router as export_router
from app.scanner import process_scan_results
from app.alert_worker import alert_polling_loop

SCAN_INTERVAL = int(os.getenv("SCAN_INTERVAL", "300"))

async def periodic_network_scanner():
    await asyncio.sleep(5)
    while True:
        try:
            print("[BACKGROUND SCANNER] Starting scheduled LAN scan...", flush=True)
            process_scan_results()
        except Exception as e:
            print(f"[BACKGROUND SCANNER ERROR] {e}", flush=True)
        await asyncio.sleep(SCAN_INTERVAL)

import time

START_TIME_STAMP = time.time()

def log_startup_phase(phase: str):
    elapsed = time.time() - START_TIME_STAMP
    print(f"[STARTUP {elapsed:.2f}s] {phase}", flush=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    log_startup_phase("Checking environment security configuration...")
    if not os.getenv("SECRET_KEY"):
        raise RuntimeError("[CRITICAL SECURITY ERROR] SECRET_KEY environment variable is missing or empty. Refusing to start.")
    
    log_startup_phase("Initializing SQLite database & default credentials...")
    init_db(hash_password)
    
    log_startup_phase("Launching background network scanner worker...")
    scanner_task = asyncio.create_task(periodic_network_scanner())
    
    log_startup_phase("Launching alert polling watchdog worker...")
    alert_task = asyncio.create_task(alert_polling_loop())
    
    log_startup_phase("Homelab Sentinel WebApp initialization complete. Server ready.")
    yield
    scanner_task.cancel()
    alert_task.cancel()

app = FastAPI(
    title="Homelab Sentinel WebApp",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(IPRestrictionMiddleware)

app.include_router(auth_router)
app.include_router(containers_router)
app.include_router(network_router)
app.include_router(monitoring_router)
app.include_router(settings_router)
app.include_router(system_router)
app.include_router(export_router)

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "homelab-sentinel-webapp"}

STATIC_DIR = os.getenv("STATIC_DIR", "/app/static")
ASSETS_DIR = os.path.join(STATIC_DIR, "assets")

if os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

@app.get("/")
async def serve_root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Homelab Sentinel Web API is running."}

@app.get("/{full_path:path}")
async def serve_static_or_spa(full_path: str):
    if full_path.startswith("api/"):
        return {"error": "API route not found", "path": full_path}
    
    file_path = os.path.join(STATIC_DIR, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Do not return index.html for missing static assets or files with extensions
    if full_path.startswith("assets/") or ("." in os.path.basename(full_path) and not full_path.endswith(".html")):
        raise HTTPException(status_code=404, detail="Asset not found")
    
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return {"message": "Static assets loading"}
