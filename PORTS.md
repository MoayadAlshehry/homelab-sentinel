# Homelab Sentinel - Port Mapping Guide

To avoid conflicts with standard host services and maintain high security, Homelab Sentinel maps all internal service ports to uncommon high ports in the **20000–59999** range.

| Service | Internal Port | External (Host) Port | Environment Variable | Default Value |
| :--- | :--- | :--- | :--- | :--- |
| **Prometheus** | `9090` | `29090` | `PROMETHEUS_PORT` | `29090` |
| **Node Exporter** | `9100` | `29100` | `NODE_EXPORTER_PORT` | `29100` |
| **Grafana** | `3000` | `23000` | `GRAFANA_PORT` | `23000` |
| **Uptime Kuma** | `3001` | `23001` | `UPTIME_KUMA_PORT` | `23001` |

## How to Change Service Ports

1. Edit the `.env` file in the project root:
   ```bash
   nano .env
   ```
2. Modify the target port variable (e.g., change `GRAFANA_PORT=23000` to `GRAFANA_PORT=24000`).
3. Restart the Docker Compose services to apply the new port mapping:
   ```bash
   docker compose -f compose/docker-compose.yml up -d
   ```
4. Verify the new port assignment:
   ```bash
   curl -I http://localhost:<NEW_PORT>
   ```
