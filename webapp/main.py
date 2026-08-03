import asyncio
import os
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from app.database import init_db
from app.security import hash_password
from app.middleware import IPRestrictionMiddleware
from app.routes_auth import router as auth_router
from app.routes_containers import router as containers_router
from app.routes_network import router as network_router
from app.routes_settings import router as settings_router
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

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(hash_password)
    scanner_task = asyncio.create_task(periodic_network_scanner())
    alert_task = asyncio.create_task(alert_polling_loop())
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
app.include_router(settings_router)

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "homelab-sentinel-webapp"}

STATIC_DIR = "/app/static"

@app.get("/")
async def serve_root():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "healthy", "service": "homelab-sentinel-webapp"}

@app.get("/assets/{asset_path:path}")
async def serve_assets(asset_path: str):
    asset_file = os.path.join(STATIC_DIR, "assets", asset_path)
    if os.path.exists(asset_file) and os.path.isfile(asset_file):
        media_type = None
        if asset_path.endswith(".css"):
            media_type = "text/css"
        elif asset_path.endswith(".js"):
            media_type = "application/javascript"
        return FileResponse(asset_file, media_type=media_type)
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("api/"):
        return None
    static_file = os.path.join(STATIC_DIR, full_path)
    if os.path.exists(static_file) and os.path.isfile(static_file):
        return FileResponse(static_file)
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"detail": "Not Found"}
