from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.database import init_db
from app.security import hash_password
from app.middleware import IPRestrictionMiddleware
from app.routes_auth import router as auth_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB & generate first-run credentials if needed
    init_db(hash_password)
    yield

app = FastAPI(
    title="Homelab Sentinel WebApp",
    version="1.0.0",
    lifespan=lifespan
)

# Add IP restriction middleware
app.add_middleware(IPRestrictionMiddleware)

# Include Auth Router
app.include_router(auth_router)

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "homelab-sentinel-webapp"}
