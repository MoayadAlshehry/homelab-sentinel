import ipaddress
import os
from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

DEFAULT_NETWORKS = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10,127.0.0.0/8,::1/128"

class IPRestrictionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        env_networks = os.getenv("ALLOWED_IP_NETWORKS", DEFAULT_NETWORKS)
        raw_list = [net.strip() for net in env_networks.split(",") if net.strip()]
        self.allowed_subnets = []
        for net in raw_list:
            try:
                self.allowed_subnets.append(ipaddress.ip_network(net))
            except ValueError as e:
                print(f"Warning: Invalid IP network in configuration '{net}': {e}", flush=True)

    async def dispatch(self, request: Request, call_next):
        # Allow internal health checks without IP restriction
        if request.url.path == "/api/health":
            return await call_next(request)

        # Check client IP
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            client_ip_str = x_forwarded_for.split(",")[0].strip()
        else:
            client_ip_str = request.client.host if request.client else "127.0.0.1"

        try:
            client_ip = ipaddress.ip_address(client_ip_str)
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "Forbidden: Invalid client IP format"}
            )

        is_allowed = any(client_ip in subnet for subnet in self.allowed_subnets)
        if not is_allowed:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": f"Forbidden: IP {client_ip_str} is not in allowed LAN/VPN subnets"}
            )

        return await call_next(request)
