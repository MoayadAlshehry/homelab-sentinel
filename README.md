<div align="center">

# Homelab Sentinel

**A self-hosted infrastructure control center for Linux arm64 servers**

Unified monitoring, container management, network auditing, and multi-channel alerting — running entirely on your own hardware, with zero cloud dependency.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20arm64-c51a4a.svg)](#)
[![Architecture](https://img.shields.io/badge/arch-arm64-2496ED.svg)](https://www.debian.org/)
[![Docker Compose](https://img.shields.io/badge/docker%20compose-v2.35%2B-2496ED.svg)](https://docs.docker.com/compose/)
[![Status](https://img.shields.io/badge/status-production--ready-brightgreen.svg)](#)

[Quick Start](#quick-start) · [Architecture](#architecture) · [Features](#features) · [Security](#security-model) · [Troubleshooting](#troubleshooting)

</div>

---

## Overview

Homelab Sentinel is a single-pane-of-glass control center built for people who self-host on a Linux arm64 server and want one place to see everything: system health, running containers, LAN devices, and service uptime — without stitching together five separate dashboards or exposing every tool directly to the network.

It wraps a curated stack of proven open-source components (Prometheus, Grafana, Uptime Kuma) behind a single hardened FastAPI + React console, so the underlying services stay internal while you get one consistent, mobile-friendly interface.

> **Platform note:** Homelab Sentinel is designed and primarily tested on Raspberry Pi 5 running Raspberry Pi OS (Debian arm64), but runs on any Linux server with arm64 (aarch64) architecture and Docker support. amd64 (x86_64) compatibility has not been officially tested and is not guaranteed.

**Design principles:**

- **Single entry point.** Every underlying service (Grafana, Prometheus, Uptime Kuma) is bound to `localhost` only. The only port ever exposed to your LAN is the Sentinel console itself.
- **Security by default.** Kernel-level IP allowlisting, a zero-host-port Docker socket proxy, and auto-scoped firewall rules — not opt-in hardening, but the default state.
- **Low footprint.** Tuned to run comfortably on modest hardware with shared resources alongside everything else in your homelab, with automatic data retention and log rotation so it never quietly fills your disk.
- **One-command deploy.** From a blank Debian-based Linux install to a fully running, authenticated stack in one shell command.

---

## Architecture

Sentinel's webapp is the only service exposed on the LAN. Grafana, Prometheus, and Uptime Kuma run behind it, reachable only through Docker's internal network or `localhost` on the host — never directly from another device.

| Layer | Component | Exposure |
|---|---|---|
| Edge | UFW firewall (auto-scoped to your LAN subnet) | LAN |
| Application | FastAPI backend + React SPA (port 28080) | LAN (single entry point) |
| Control | `docker-socket-proxy` (read-only, no host ports) | Internal only |
| Metrics | Prometheus + Node Exporter | `localhost` only |
| Visualization | Grafana | `localhost` only |
| Uptime | Uptime Kuma | `localhost` only |
| Persistence | SQLite (`sentinel.db`, `kuma.db`) + Docker volumes | Internal |

All internal services communicate over a dedicated Docker bridge network (`sentinel-net`) using container hostnames — port bindings to the host are either absent entirely (socket proxy) or restricted to `127.0.0.1` (Grafana, Prometheus, Uptime Kuma), so they cannot be reached from any device on the LAN even if a user knows the port number.

---

## Features

### Dashboard
Live SoC temperature, CPU usage, RAM, and disk utilization, with a rolling Prometheus-backed performance history chart and a real-time event/failure feed.

### Containers
Full lifecycle control (start, stop, restart) for every Docker container on the host, routed through a permission-scoped socket proxy — never a raw Docker socket mount. Includes live log streaming per container.

### Monitoring
HTTP, ping, port, and DNS uptime checks powered by Uptime Kuma, surfaced natively inside the Sentinel console rather than requiring a separate login.

### Network
Layer-2 ARP-based LAN scanning with MAC vendor resolution, custom device labeling, and debounced offline detection (a 3-cycle / ~15 minute threshold) to avoid false alerts from devices in power-saving sleep.

### Alerting
Multi-channel notifications via Telegram and Discord, triggered by container crashes, monitor state changes, Prometheus alert rules, and new/departing network devices. Configurable quiet hours and minimum severity thresholds.

### Unified Export API
A single `/api/export` endpoint (JSON) and `/api/export/prometheus` endpoint (Prometheus exposition format) expose Sentinel's own internal state — system telemetry, container counts, monitor status, and notification stats — so external tools can scrape Sentinel itself, not just the services it manages.

### Interface
Fully responsive layout with a dedicated mobile card view for data tables, a collapsible navigation drawer on small screens, and a light/dark theme toggle with persisted preference.

### Maintenance
Automatic weekly data retention (records older than 8 days are purged every Friday, with database vacuuming), plus rotation limits on every container's logs to keep long-term disk usage bounded.

---

## Quick Start

Deploy the complete stack on a fresh 64-bit Debian-based Linux arm64 system with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/MoayadAlshehry/homelab-sentinel/main/scripts/install.sh -o install.sh && bash install.sh
```

The installer will:

1. Verify architecture and install Docker Engine, Compose, and required system packages (`arp-scan`, `nmap`, `avahi-daemon`, `ufw`) if missing.
2. Clone or update the repository.
3. Prompt for optional configuration — press Enter on any prompt to skip or auto-generate secure defaults:
   - Grafana admin password (auto-generated if left blank)
   - Telegram bot token / chat ID (optional, configurable later in-app)
   - Discord webhook URL (optional, configurable later in-app)
4. Auto-detect your LAN subnet and scope UFW rules to it — nothing is ever opened to `0.0.0.0/0`.
5. Build and launch the full container stack, waiting for all services to report healthy.

Once complete, the console is available at:

```
http://<host-ip>:28080
```
or
```
http://<hostname>.local:28080
```

### First login

A secure admin account is generated automatically on first boot. Retrieve the credentials with:

```bash
sudo docker logs sentinel-webapp | grep -A 5 "FIRST-RUN"
```

Or retrieve the credentials file directly from the container's data volume:

```bash
sudo docker exec sentinel-webapp cat /app/data/first_run_credentials.txt
```

You will be required to set a new password on first login.

---

## Configuration

### Grafana password & custom secrets

The installer automatically generates a strong random Grafana admin password and writes it to `~/homelab-sentinel/.env`.

To retrieve your Grafana admin password after installation:
```bash
grep GRAFANA_ADMIN_PASSWORD ~/homelab-sentinel/.env
```

If you wish to specify a custom Grafana password prior to installation, create `~/homelab-sentinel/.env` before running `install.sh` and set:
```env
GRAFANA_ADMIN_PASSWORD=YourCustomPasswordHere
```

### Changing ports

Edit `~/homelab-sentinel/.env`:

```env
WEBAPP_PORT=28080
GRAFANA_PORT=23000
UPTIME_KUMA_PORT=23001
PROMETHEUS_PORT=29090
NODE_EXPORTER_PORT=29100
```

Then re-run the installer to apply the new ports and firewall rules:

```bash
bash ~/homelab-sentinel/scripts/install.sh
```

### Seeding Uptime Kuma monitors

To pre-populate core infrastructure monitors instead of adding them manually:

```bash
python3 scripts/setup_uptime_kuma.py
```

### Notification channels

Configure Telegram and Discord directly from the console's Settings page — no file editing required. Test buttons confirm delivery before saving.

---

## Security Model

| Control | Implementation |
|---|---|
| IP allowlisting | Middleware evaluates the raw kernel-level TCP peer address against private subnet ranges, ignoring spoofable headers like `X-Forwarded-For`. |
| Docker access | All container actions are routed through `tecnativa/docker-socket-proxy`, which publishes zero host ports and permits only `CONTAINERS`, `INFO`, and `POST` — `EXEC`, `BUILD`, `IMAGES`, and `VOLUMES` are explicitly denied. |
| Service exposure | Grafana, Prometheus, and Uptime Kuma bind to `127.0.0.1` only. They are unreachable from any device on the LAN — including the person running the installer, from any device other than the host itself. |
| Firewall | UFW rules are generated dynamically from the host's detected default-route subnet, scoping access to your actual home network rather than any network. |
| Secrets | Webhook URLs and bot tokens are stored in SQLite inside a Docker-managed volume, excluded from version control. API responses return masked values (e.g. `1234*****wxyZ`), never full secrets. |
| Auth | Passwords are hashed with bcrypt; sessions are signed JWTs with a randomly generated secret key created on first install. |

---

## Troubleshooting

**Cannot reach the console from another device on the LAN**

Check that UFW is allowing the webapp port for your subnet:

```bash
sudo ufw status verbose
```

Add the rule manually if needed:

```bash
sudo ufw allow from 192.168.0.0/24 to any port 28080 proto tcp comment 'Homelab Sentinel'
```

**`<hostname>.local` is not resolving**

Confirm Avahi (mDNS) is running:

```bash
systemctl status avahi-daemon
sudo systemctl enable avahi-daemon --now
```

**A service isn't starting or reports unhealthy**

```bash
sudo docker compose -f ~/homelab-sentinel/compose/docker-compose.yml ps
sudo docker logs sentinel-webapp --tail 50
```

**`docker compose logs` fails with `SECRET_KEY environment variable is required` error**

Running `docker compose -f ... logs webapp` from outside the project directory fails because Docker Compose evaluates `.env` in the current working directory. Use direct container log or credential commands instead, which work from any directory with zero `.env` dependency:

```bash
sudo docker logs sentinel-webapp | grep -A 5 "FIRST-RUN"
```

Or retrieve credentials directly from the container's data volume:

```bash
sudo docker exec sentinel-webapp cat /app/data/first_run_credentials.txt
```

**Docker reports a kernel cgroup memory warning on startup**

This is common on some arm64 distributions (including stock Raspberry Pi OS), which ship with cgroup memory accounting disabled by default. It is harmless — all services run normally without a hard memory ceiling enforced. To enable it, add `cgroup_enable=memory cgroup_memory=1` to your kernel command line (e.g. `/boot/firmware/cmdline.txt` on Raspberry Pi OS) and reboot.

---

## Project Structure

```
homelab-sentinel/
├── compose/                 Docker Compose stack definition
├── grafana/                 Provisioned dashboards and datasources
├── prometheus/              Scrape config and alert rules
├── scripts/                 Installer, uninstaller, and Uptime Kuma seeding script
└── webapp/
    ├── app/                 FastAPI backend (routes, auth, scanner, alert worker)
    └── frontend/             React + Vite single-page application
```

---

## Uninstallation

To completely remove Homelab Sentinel and restore your host environment, execute the uninstallation script:

```bash
bash ~/homelab-sentinel/scripts/uninstall.sh
```

Or via curl if the repository directory has already been removed:

```bash
curl -fsSL https://raw.githubusercontent.com/MoayadAlshehry/homelab-sentinel/main/scripts/uninstall.sh -o uninstall.sh && bash uninstall.sh
```

The uninstallation script performs the following actions:
- Stops and removes all stack Docker containers, named volumes, and internal networks.
- Removes stack-specific Docker images (`sentinel-webapp:local`, `grafana-oss`, `prometheus`, `node-exporter`, `uptime-kuma`, `docker-socket-proxy`).
- Removes UFW firewall rules added during installation (identified by comment `Homelab Sentinel`).
- Deletes the environment configuration file (`.env`).
- Prompts with an optional separate confirmation to delete the local git repository directory (`~/homelab-sentinel`).

---

## License

Released under the [MIT License](LICENSE). Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines, and [SECURITY.md](SECURITY.md) to report vulnerabilities responsibly.
