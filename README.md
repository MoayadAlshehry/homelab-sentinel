# Homelab Sentinel

An automated monitoring, dashboarding, network sentinel, and container management suite for homelab infrastructure on Raspberry Pi 5.

---

## Quick One-Command Automated Installation

Deploy the complete Homelab Sentinel stack on any fresh Raspberry Pi 5 running 64-bit OS with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/MoayadAlshehry/homelab-sentinel/main/scripts/install.sh -o install.sh && bash install.sh
```

### What the Automated Installer Handles:
1. **OS & Hardware Verification**: Confirms Raspberry Pi 5 64-bit (`aarch64` / `arm64`) compatibility.
2. **Host Dependency Management**: Installs Docker Engine, Docker Compose plugin, `arp-scan`, `nmap`, `avahi-daemon`, `ufw`, and `curl`.
3. **Dynamic LAN Subnet Auto-Detection**: Auto-detects the active default route interface (e.g. `eth0` / `wlan0`) and computes the exact CIDR network address (e.g. `192.168.0.0/24` or `10.0.0.0/24`).
4. **Defense-in-Depth Firewall (UFW)**: Applies scoped UFW rules permitting incoming traffic on high ports strictly from the auto-detected LAN subnet, leaving all ports blocked to the external internet.
5. **Zero-Host-Port Socket Security**: Mounts Docker socket read-only into `sentinel-docker-socket-proxy` on an isolated internal bridge network (`sentinel-net`) with zero exposed host ports.
6. **Live Dashboard Deployment**: Builds and launches all 6 microservices (`webapp`, `docker-socket-proxy`, `prometheus`, `grafana`, `uptime-kuma`, `node-exporter`) and prints first-run login credentials.

---

## Architecture & Services

- **WebApp Console** (Port `28080`): Production React/Vite/Tailwind SPA & FastAPI management backend.
- **Grafana** (Port `23000`): Visual telemetry dashboarding with auto-provisioned Pi5 metrics dashboard.
- **Uptime Kuma** (Port `23001`): Active HTTP & Ping uptime monitor with sqlite persistence.
- **Prometheus** (Port `29090`): Metrics collection & alert evaluation engine.
- **Node Exporter** (Port `29100`): Real-time host hardware metrics collector (CPU, RAM, Disk, SoC Temp).
- **Docker Socket Proxy**: Restricted internal API proxy for container monitoring & lifecycle control.

---

## Uptime Kuma - Adding & Managing Monitors

### Option A: Web UI (Manual Setup)

1. Open your browser and navigate to Uptime Kuma: `http://<PI5-IP>:23001` or `http://moayad-pi5.local:23001`.
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
