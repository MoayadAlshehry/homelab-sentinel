import asyncio
import os
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.database import init_db
from app.security import hash_password
from app.middleware import IPRestrictionMiddleware
from app.routes_auth import router as auth_router
from app.routes_containers import router as containers_router
from app.routes_network import router as network_router
from app.scanner import process_scan_results

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
    yield
    scanner_task.cancel()

app = FastAPI(
    title="Homelab Sentinel WebApp",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(IPRestrictionMiddleware)

app.include_router(auth_router)
app.include_router(containers_router)
app.include_router(network_router)

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "homelab-sentinel-webapp"}
