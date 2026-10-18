# Operations reference

Detailed deployment and configuration instructions. Start with the [project overview](../README.md) for capabilities and supported-platform limits. These commands affect the host where you run them; the automated test suite does not deploy this stack.

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

Released under the [MIT License](../LICENSE). Contributions are welcome — see [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines, and [SECURITY.md](../SECURITY.md) to report vulnerabilities responsibly.
