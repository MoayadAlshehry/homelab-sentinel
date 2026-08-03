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

MONITORS = [
    {
        "name": "Pi5 Self-Check (Grafana)",
        "type": "http",
        "url": "http://sentinel-grafana:3000",
        "hostname": "",
        "interval": 20
    },
    {
        "name": "Home Gateway Router",
        "type": "ping",
        "url": "",
        "hostname": "192.168.0.1",
        "interval": 20
    },
    {
        "name": "Prometheus Sentinel Service",
        "type": "http",
        "url": "http://sentinel-prometheus:9090/-/healthy",
        "hostname": "",
        "interval": 20
    },
    {
        "name": "moayad.work",
        "type": "http",
        "url": "https://moayad.work",
        "hostname": "",
        "interval": 20
    }
]

def seed_monitors_via_container():
    # Insert via docker exec sqlite3
    sql_statements = []
    for m in MONITORS:
        sql = f"""
        INSERT INTO monitor (name, type, url, hostname, interval, active)
        SELECT '{m['name']}', '{m['type']}', '{m['url']}', '{m['hostname']}', {m['interval']}, 1
        WHERE NOT EXISTS (SELECT 1 FROM monitor WHERE name = '{m['name']}');
        """
        sql_statements.append(sql)
    
    full_sql = "".join(sql_statements)
    cmd = ["sudo", "docker", "exec", "-i", CONTAINER_NAME, "sqlite3", "/app/data/kuma.db"]
    res = subprocess.run(cmd, input=full_sql, text=True, capture_output=True)
    if res.returncode != 0:
        print(f"Error seeding monitors: {res.stderr}")
        return False
    print("Monitors seeded successfully.")
    return True

if __name__ == "__main__":
    seed_monitors_via_container()
