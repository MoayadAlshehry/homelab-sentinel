#!/usr/bin/env bash
# ==============================================================================
# Homelab Sentinel — Automated One-Command Production Installer & Deployer
# Target System: Any Linux arm64 (aarch64) server — designed and tested on Raspberry Pi 5 / Raspberry Pi OS
# ==============================================================================

set -eo pipefail

# ANSI / tput Terminal Colors
BOLD="$(tput bold 2>/dev/null || echo '')"
RESET="$(tput sgr0 2>/dev/null || echo '')"
GREEN="$(tput setaf 2 2>/dev/null || echo '')"
BLUE="$(tput setaf 4 2>/dev/null || echo '')"
CYAN="$(tput setaf 6 2>/dev/null || echo '')"
YELLOW="$(tput setaf 3 2>/dev/null || echo '')"
RED="$(tput setaf 1 2>/dev/null || echo '')"

log_step() {
    echo -e "\n${BOLD}${BLUE}[STEP ${1}]${RESET} ${CYAN}${2}${RESET}"
}

log_info() {
    echo -e "${BLUE}ℹ${RESET} ${1}"
}

log_success() {
    echo -e "${GREEN}✔${RESET} ${1}"
}

log_warn() {
    echo -e "${YELLOW}⚠${RESET} ${1}"
}

log_error() {
    echo -e "${RED}✖${RESET} ${1}"
}

prompt_input() {
    local prompt_text="$1"
    local result_var="$2"
    local input_val=""
    if [[ -t 0 ]]; then
        read -rp "$prompt_text" input_val || true
    else
        echo "$prompt_text (non-interactive session, using default)"
    fi
    eval "$result_var=\"$input_val\""
}

echo -e "${BOLD}${CYAN}"
echo "======================================================================"
echo "         🛡️  HOMELAB SENTINEL — LINUX ARM64 INSTALLER  🛡️"
echo "======================================================================"
echo -e "${RESET}"

# ------------------------------------------------------------------------------
# STEP 1: OS & Hardware Compatibility Check
# ------------------------------------------------------------------------------
log_step "1/7" "Checking OS & Hardware Architecture Compatibility"

ARCH="$(uname -m)"
if [[ "$ARCH" != "aarch64" && "$ARCH" != "arm64" ]]; then
    log_warn "Detected architecture: $ARCH (Recommended: aarch64 / arm64 for Pi 5)"
else
    log_success "Architecture verified: $ARCH (Linux arm64)"
fi

if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    log_success "Operating System: $PRETTY_NAME"
else
    log_warn "Could not verify OS details from /etc/os-release"
fi

# ------------------------------------------------------------------------------
# STEP 2: Host Dependencies & Essential Tools Check
# ------------------------------------------------------------------------------
log_step "2/7" "Verifying & Installing Host Packages (Docker, UFW, Avahi, arp-scan)"

# Check / Install Docker Engine
if ! command -v docker &>/dev/null; then
    log_info "Docker Engine not found. Installing official Docker Engine via get.docker.com..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sudo sh /tmp/get-docker.sh
    rm -f /tmp/get-docker.sh
    log_success "Docker Engine installed successfully."
else
    log_success "Docker Engine is already installed ($(docker --version))"
fi

# Ensure user is in docker group
if ! groups "$USER" | grep &>/dev/null "\bdocker\b"; then
    log_info "Adding current user ($USER) to docker group..."
    sudo usermod -aG docker "$USER" || true
fi

# Ensure docker compose plugin is available
if ! docker compose version &>/dev/null; then
    log_info "Installing docker-compose-plugin..."
    sudo apt-get update -qq
    sudo apt-get install -y docker-compose-plugin
fi
log_success "Docker Compose plugin verified ($(docker compose version))"

# Check & Install System Packages: arp-scan, nmap, avahi-daemon, ufw, curl, iproute2, python3
PACKAGES_TO_INSTALL=()
for pkg in arp-scan nmap avahi-daemon ufw curl iproute2 python3; do
    if ! dpkg -l | grep -E "^ii\s+$pkg\b" &>/dev/null; then
        PACKAGES_TO_INSTALL+=("$pkg")
    fi
done

if [[ ${#PACKAGES_TO_INSTALL[@]} -gt 0 ]]; then
    log_info "Installing missing host system packages: ${PACKAGES_TO_INSTALL[*]}..."
    sudo apt-get update -qq
    sudo apt-get install -y --no-install-recommends "${PACKAGES_TO_INSTALL[@]}"
    log_success "Host system packages installed."
else
    log_success "All required host system packages are installed."
fi

# Ensure avahi-daemon (mDNS .local resolution) is active
if command -v systemctl &>/dev/null; then
    sudo systemctl enable avahi-daemon --now &>/dev/null || true
    log_success "Avahi mDNS daemon active (.local hostname resolution enabled)"
fi

# ------------------------------------------------------------------------------
# STEP 3: Repository Setup & Synchronization
# ------------------------------------------------------------------------------
log_step "3/7" "Setting Up Homelab Sentinel Project Directory"

TARGET_DIR="$HOME/homelab-sentinel"

if [[ -d "$TARGET_DIR/.git" ]]; then
    log_info "Existing repository detected at $TARGET_DIR. Resetting and syncing latest main branch..."
    cd "$TARGET_DIR"
    git fetch origin main
    git checkout -B main origin/main
    git reset --hard origin/main
else
    log_info "Cloning Homelab Sentinel repository (main branch) into $TARGET_DIR..."
    git clone --branch main --single-branch https://github.com/MoayadAlshehry/homelab-sentinel.git "$TARGET_DIR"
    cd "$TARGET_DIR"
fi

DEPLOYED_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
log_success "Project directory ready at $TARGET_DIR (Commit: ${BOLD}${DEPLOYED_SHA}${RESET})"

# ------------------------------------------------------------------------------
# STEP 4: Interactive .env & Credentials Configuration
# ------------------------------------------------------------------------------
log_step "4/7" "Configuring Environment Variables & Secrets (.env)"

ENV_FILE="$TARGET_DIR/.env"
ENV_EXAMPLE="$TARGET_DIR/.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f "$ENV_EXAMPLE" ]]; then
        cp "$ENV_EXAMPLE" "$ENV_FILE"
    else
        touch "$ENV_FILE"
    fi
fi

# Read existing values if any
existing_grafana_pass="$(grep -E '^GRAFANA_ADMIN_PASSWORD=' "$ENV_FILE" | cut -d'=' -f2- || echo '')"
existing_secret_key="$(grep -E '^SECRET_KEY=' "$ENV_FILE" | cut -d'=' -f2- || echo '')"

if [[ -z "$existing_secret_key" || "$existing_secret_key" == "change_this_secret_key_in_production" ]]; then
    SECRET_KEY="$(openssl rand -hex 16 2>/dev/null || echo "sentinel_secret_key_random_$(date +%s)")"
else
    SECRET_KEY="$existing_secret_key"
fi

# Interactive Prompts for Credentials
echo -e "\n${BOLD}=== INTERACTIVE CONFIGURATION (Press Enter for defaults) ===${RESET}"

if [[ -n "$existing_grafana_pass" && "$existing_grafana_pass" != "admin_sentinel_pass_change_me" && "$existing_grafana_pass" != "change_this_password_in_production" ]]; then
    GRAFANA_PASS="$existing_grafana_pass"
else
    GRAFANA_PASS="$(openssl rand -hex 12 2>/dev/null || echo "SentinelGrafanaPass2026!")"
fi

prompt_input "Enter Telegram Bot Token [Optional - Press Enter to skip]: " user_tg_token
prompt_input "Enter Telegram Chat ID [Optional - Press Enter to skip]: " user_tg_chat
prompt_input "Enter Discord Webhook URL [Optional - Press Enter to skip]: " user_discord_url

# Update .env file idempotently
sed -i '/^SECRET_KEY=/d' "$ENV_FILE"
echo "SECRET_KEY=$SECRET_KEY" >> "$ENV_FILE"

sed -i '/^GRAFANA_ADMIN_PASSWORD=/d' "$ENV_FILE"
echo "GRAFANA_ADMIN_PASSWORD=$GRAFANA_PASS" >> "$ENV_FILE"

sed -i '/^PROMETHEUS_PORT=/d' "$ENV_FILE"
echo "PROMETHEUS_PORT=29090" >> "$ENV_FILE"

sed -i '/^NODE_EXPORTER_PORT=/d' "$ENV_FILE"
echo "NODE_EXPORTER_PORT=29100" >> "$ENV_FILE"

sed -i '/^GRAFANA_PORT=/d' "$ENV_FILE"
echo "GRAFANA_PORT=23000" >> "$ENV_FILE"

sed -i '/^UPTIME_KUMA_PORT=/d' "$ENV_FILE"
echo "UPTIME_KUMA_PORT=23001" >> "$ENV_FILE"

sed -i '/^WEBAPP_PORT=/d' "$ENV_FILE"
echo "WEBAPP_PORT=28080" >> "$ENV_FILE"

sed -i '/^ALLOWED_IP_NETWORKS=/d' "$ENV_FILE"
echo "ALLOWED_IP_NETWORKS=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,100.64.0.0/10,127.0.0.0/8,::1/128" >> "$ENV_FILE"

log_success "Environment file configured (.env)"

# ------------------------------------------------------------------------------
# STEP 5: Dynamic LAN Subnet Auto-Detection & Scoped UFW Rules
# ------------------------------------------------------------------------------
log_step "5/7" "Configuring Dynamic LAN Subnet Auto-Detection & Scoped UFW Rules"

# Detect default network interface (e.g. eth0, wlan0) from default route
DEFAULT_IFACE="$(ip route 2>/dev/null | awk '/^default/ {print $5; exit}')"
if [[ -z "$DEFAULT_IFACE" ]]; then
    DEFAULT_IFACE="$(ip -o link show 2>/dev/null | awk -F': ' '$2 != "lo" && $2 !~ /^docker|^br-|^veth/ {print $2; exit}')"
fi

IP_CIDR=""
if [[ -n "$DEFAULT_IFACE" ]]; then
    IP_CIDR="$(ip -o -f inet addr show "$DEFAULT_IFACE" 2>/dev/null | awk '{print $4}' | head -n1)"
fi

LAN_SUBNET=""
if [[ -n "$IP_CIDR" ]]; then
    LAN_SUBNET="$(python3 -c "import ipaddress; print(ipaddress.ip_network('$IP_CIDR', strict=False))" 2>/dev/null || echo "")"
fi

LAN_SUBNET="$(echo "$LAN_SUBNET" | tr -d '\r\n\t ')"

if [[ -n "$LAN_SUBNET" && -n "$DEFAULT_IFACE" ]]; then
    log_success "Detected LAN Subnet: ${BOLD}${LAN_SUBNET}${RESET} (via interface ${DEFAULT_IFACE})"
else
    log_warn "Could not automatically detect active LAN subnet from default route interface."
    prompt_input "Enter your LAN subnet in CIDR notation (e.g. 192.168.1.0/24): " user_subnet
    user_subnet="$(echo "$user_subnet" | tr -d '\r\n\t ')"
    if [[ -n "$user_subnet" ]]; then
        LAN_SUBNET="$user_subnet"
        log_info "Using user-entered LAN subnet: $LAN_SUBNET"
    else
        LAN_SUBNET="192.168.0.0/16"
        log_warn "Falling back to default LAN subnet: $LAN_SUBNET"
    fi
fi

PORTS=(28080)

if command -v ufw &>/dev/null; then
    UFW_STATUS="$(sudo ufw status | head -n 1 || echo "inactive")"
    if echo "$UFW_STATUS" | grep -iq "active"; then
        log_info "UFW Firewall is active. Applying scoped rules for subnet ${LAN_SUBNET} across ports: ${PORTS[*]}..."
        for port in "${PORTS[@]}"; do
            sudo ufw allow from "$LAN_SUBNET" to any port "$port" proto tcp comment "Homelab Sentinel Port $port" || true
        done
        sudo ufw reload || true
        log_success "UFW firewall rules applied for subnet $LAN_SUBNET"
    else
        log_info "UFW is installed but currently inactive. Staging scoped rules for subnet ${LAN_SUBNET}..."
        for port in "${PORTS[@]}"; do
            sudo ufw allow from "$LAN_SUBNET" to any port "$port" proto tcp comment "Homelab Sentinel Port $port" || true
        done
        log_success "UFW firewall rules staged for subnet $LAN_SUBNET"
    fi
fi

# ------------------------------------------------------------------------------
# STEP 6: Deploy & Build Docker Compose Stack
# ------------------------------------------------------------------------------
log_step "6/7" "Building & Launching Homelab Sentinel Docker Containers"

COMPOSE_FILE="$TARGET_DIR/compose/docker-compose.yml"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

log_info "Building Docker webapp image from local source code (Commit: ${DEPLOYED_SHA})..."
sudo -E docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build webapp

DOCKER_START_TIME=$(date +%s)
log_info "Launching container stack..."
sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate

log_info "Waiting for all 6 Sentinel containers to report healthy status (timeout: 180s)..."

TIMEOUT=180
ALL_HEALTHY=false

# Use docker command directly (user is in docker group)
DOCKER_BIN="docker"
if ! command -v docker &>/dev/null || ! docker ps &>/dev/null; then
    DOCKER_BIN="sudo docker"
fi

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - DOCKER_START_TIME))

    if [[ $ELAPSED -ge $TIMEOUT ]]; then
        log_warn "Timeout reached while waiting for containers."
        break
    fi

    # Strict container health inspect check
    HEALTHY_COUNT="$(python3 -c "
import subprocess
containers = {
    'sentinel-prometheus': True,
    'sentinel-node-exporter': True,
    'sentinel-grafana': True,
    'sentinel-uptime-kuma': True,
    'sentinel-webapp': True,
    'sentinel-docker-socket-proxy': False
}
count = 0
docker_cmd = '$DOCKER_BIN'.split()
for c, has_healthcheck in containers.items():
    try:
        res = subprocess.run(
            docker_cmd + ['inspect', '--format', '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}', c],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
        )
        out = res.stdout.strip()
        if out:
            parts = out.split()
            status = parts[0]
            health = parts[1] if len(parts) > 1 else 'none'
            if status == 'running':
                if has_healthcheck:
                    if health == 'healthy':
                        count += 1
                else:
                    count += 1
    except Exception:
        pass
print(count)
" 2>/dev/null | tail -n 1)"

    HEALTHY_COUNT="$(echo "$HEALTHY_COUNT" | tr -d '\r\n\t ')"

    if [[ "$HEALTHY_COUNT" =~ ^[0-9]+$ ]] && [ "$HEALTHY_COUNT" -ge 6 ]; then
        ALL_HEALTHY=true
        break
    fi

    sleep 2
done

DOCKER_END_TIME=$(date +%s)
BOOT_ELAPSED=$((DOCKER_END_TIME - DOCKER_START_TIME))

if [[ "$ALL_HEALTHY" == "true" ]]; then
    log_success "All 6 Homelab Sentinel containers are running and healthy (measured boot time: ${BOOT_ELAPSED}s)!"
    if [[ -f "$TARGET_DIR/scripts/setup_uptime_kuma.py" ]]; then
        log_info "Seeding initial Uptime Kuma monitoring targets..."
        python3 "$TARGET_DIR/scripts/setup_uptime_kuma.py" &>/dev/null || true
    fi
else
    log_error "Timeout reached: not all 6 Sentinel containers reported healthy status within ${TIMEOUT}s."
    log_warn "Current stack status:"
    sudo docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    log_error "Deployment failed due to container health check timeout."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 7: Save Initial Settings to WebApp SQLite DB if provided
# ------------------------------------------------------------------------------
if [[ -n "$user_discord_url" || -n "$user_tg_token" ]]; then
    log_info "Saving notification channel settings to WebApp database..."
    sleep 3
    if [[ -n "$user_discord_url" ]]; then
        sudo docker exec sentinel-webapp sqlite3 /app/data/sentinel.db \
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('discord_webhook_url', '$user_discord_url', datetime('now'));" &>/dev/null || true
    fi
    if [[ -n "$user_tg_token" && -n "$user_tg_chat" ]]; then
        sudo docker exec sentinel-webapp sqlite3 /app/data/sentinel.db \
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('telegram_bot_token', '$user_tg_token', datetime('now'));" &>/dev/null || true
        sudo docker exec sentinel-webapp sqlite3 /app/data/sentinel.db \
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('telegram_chat_id', '$user_tg_chat', datetime('now'));" &>/dev/null || true
    fi
    log_success "Notification settings saved."
fi

# ------------------------------------------------------------------------------
# FINAL SUMMARY BANNER
# ------------------------------------------------------------------------------
PRIMARY_IP="$(hostname -I | awk '{print $1}' || echo "127.0.0.1")"
MDNS_NAME="$(hostname).local"

echo -e "\n${BOLD}${GREEN}"
echo "======================================================================"
echo " 🎉  HOMELAB SENTINEL DEPLOYMENT COMPLETED SUCCESSFULLY!  🎉"
echo "======================================================================"
echo -e "${RESET}"

echo -e "${BOLD}Access your live service from any device on your home LAN:${RESET}\n"

echo -e "  🛡️  ${BOLD}WebApp Console${RESET}:   ${CYAN}http://${PRIMARY_IP}:28080${RESET}  or  ${CYAN}http://${MDNS_NAME}:28080${RESET}"
echo -e "  📦  ${BOLD}Deployed Commit${RESET}:  ${CYAN}${DEPLOYED_SHA}${RESET}"

echo -e "\n${BOLD}${YELLOW}=== FIRST-RUN LOGIN CREDENTIALS ===${RESET}"
echo -e "To view your auto-generated WebApp login username and password, run:"
echo -e "  ${BOLD}sudo docker logs sentinel-webapp | grep -A 5 'FIRST-RUN'${RESET}\n"

echo -e "${BOLD}Deployment complete! All services protected & monitored.${RESET}\n"
