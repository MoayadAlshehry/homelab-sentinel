# Homelab Sentinel

An automated monitoring, dashboarding, and alert sentinel for homelab infrastructure on Raspberry Pi 5.

## Architecture & Services

- **Prometheus** (Port `29090`): Metrics collection & alert evaluation engine.
- **Node Exporter** (Port `29100`): Real-time host metrics collector (CPU, RAM, Disk, SoC Temp).
- **Grafana** (Port `23000`): Visual dashboarding with auto-provisioned Pi5 dashboard.
- **Uptime Kuma** (Port `23001`): Active HTTP & Ping uptime monitoring.

---

## Uptime Kuma - Adding & Managing Monitors

### Option A: Web UI (Manual Setup)

1. Open your browser and navigate to Uptime Kuma: `http://<PI5-IP>:23001` (e.g. `http://localhost:23001`).
2. On initial login, create your administrator account.
3. Click **"+ Add New Monitor"** at the top left of the dashboard.
4. Fill in the monitor settings:
   - **Monitor Type**: HTTP / Ping / Port / Keyword (e.g. `HTTP(s)` for websites, `Ping` for routers).
   - **Friendly Name**: Descriptive name (e.g. `Home Gateway Router`).
   - **URL / Hostname**: Target address (e.g. `https://moayad.work` or `192.168.0.1`).
   - **Heartbeat Interval**: Desired check frequency in seconds (default: `20`s).
5. Click **Save**.

### Option B: Automated Seeding Script

To quickly seed or restore core monitors automatically, run:

```bash
python3 scripts/setup_uptime_kuma.py
```

This seeds the database directly inside the persistent Uptime Kuma container volume.
