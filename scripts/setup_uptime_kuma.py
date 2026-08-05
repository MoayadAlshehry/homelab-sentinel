#!/usr/bin/env python3
"""
Setup script for Uptime Kuma monitors in Homelab Sentinel.
Inserts initial monitoring targets directly into Uptime Kuma's SQLite database.
"""
import sqlite3
import subprocess
import time
import os

DB_PATH = "/var/lib/docker/volumes/homelab-sentinel_uptime_kuma_data/_data/kuma.db"
CONTAINER_NAME = "sentinel-uptime-kuma"

def get_default_gateway():
    """Dynamically discover active default gateway IP for Home Gateway Router monitor."""
    try:
        res = subprocess.run(["ip", "route"], capture_output=True, text=True, timeout=3)
        for line in res.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 3 and parts[0] == "default":
                return parts[2]
    except Exception:
        pass
    return "127.0.0.1"

MONITORS = [
    {
        "name": "Homelab Sentinel WebApp",
        "type": "http",
        "url": "http://127.0.0.1:28080/api/health",
        "hostname": "",
        "dns_resolve_server": "",
        "dns_resolve_type": "",
        "port": None,
        "interval": 20
    },
    {
        "name": "Grafana Dashboard",
        "type": "http",
        "url": "http://127.0.0.1:23000/api/health",
        "hostname": "",
        "dns_resolve_server": "",
        "dns_resolve_type": "",
        "port": None,
        "interval": 20
    },
    {
        "name": "Prometheus Metrics",
        "type": "http",
        "url": "http://127.0.0.1:29090/-/healthy",
        "hostname": "",
        "dns_resolve_server": "",
        "dns_resolve_type": "",
        "port": None,
        "interval": 20
    },
    {
        "name": "Home Gateway Router",
        "type": "ping",
        "url": "",
        "hostname": get_default_gateway(),
        "dns_resolve_server": "",
        "dns_resolve_type": "",
        "port": None,
        "interval": 20
    },
    {
        "name": "Cloudflare DNS",
        "type": "dns",
        "url": "",
        "hostname": "cloudflare.com",
        "dns_resolve_server": "1.1.1.1",
        "dns_resolve_type": "A",
        "port": 53,
        "interval": 20
    },
    {
        "name": "Google DNS",
        "type": "dns",
        "url": "",
        "hostname": "google.com",
        "dns_resolve_server": "8.8.8.8",
        "dns_resolve_type": "A",
        "port": 53,
        "interval": 20
    }
]

def seed_monitors_via_container():
    sql_statements = []
    for m in MONITORS:
        dns_server = f"'{m['dns_resolve_server']}'" if m.get('dns_resolve_server') else "NULL"
        dns_type = f"'{m['dns_resolve_type']}'" if m.get('dns_resolve_type') else "NULL"
        port_val = m.get('port') if m.get('port') else "NULL"
        sql = f"""
        DELETE FROM monitor WHERE name = '{m['name']}';
        INSERT INTO monitor (name, type, url, hostname, dns_resolve_server, dns_resolve_type, port, interval, active)
        VALUES ('{m['name']}', '{m['type']}', '{m['url']}', '{m['hostname']}', {dns_server}, {dns_type}, {port_val}, {m['interval']}, 1);
        """
        sql_statements.append(sql)
    
    full_sql = "".join(sql_statements)
    cmd = ["sudo", "docker", "exec", "-i", CONTAINER_NAME, "sqlite3", "/app/data/kuma.db"]
    res = subprocess.run(cmd, input=full_sql, text=True, capture_output=True)
    if res.returncode != 0:
        print(f"Error seeding monitors: {res.stderr}")
        return False
    
    subprocess.run(["sudo", "docker", "restart", CONTAINER_NAME], capture_output=True)
    print("Monitors seeded and Uptime Kuma restarted successfully.")
    return True

if __name__ == "__main__":
    seed_monitors_via_container()
