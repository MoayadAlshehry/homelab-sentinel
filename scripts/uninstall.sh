#!/usr/bin/env bash
# ==============================================================================
# Homelab Sentinel — Uninstallation Script
# Completely and safely removes Homelab Sentinel deployment, containers,
# volumes, images, firewall rules, and optional repository files.
# ==============================================================================

set -e

# ANSI Color Codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${RESET} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${RESET} $1"; }
log_warn()    { echo -e "${YELLOW}[WARNING]${RESET} $1"; }
log_error()   { echo -e "${RED}[ERROR]${RESET} $1"; }
log_step()    { echo -e "\n${CYAN}${BOLD}[STEP $1] $2${RESET}"; }

# Detect script location and repository directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_DIR/compose/docker-compose.yml"
ENV_FILE="$REPO_DIR/.env"

# ------------------------------------------------------------------------------
# STEP 1: Confirmation Prompt
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${RED}======================================================================${RESET}"
echo -e "${BOLD}${RED}      ⚠️   HOMELAB SENTINEL — UNINSTALLATION WARNING   ⚠️${RESET}"
echo -e "${BOLD}${RED}======================================================================${RESET}"
echo -e "This script will permanently remove the following Homelab Sentinel resources:\n"
echo -e "  • Docker Containers (sentinel-webapp, grafana, prometheus, node-exporter, etc.)"
echo -e "  • Docker Volumes & Databases (webapp_data, grafana_data, prometheus_data, etc.)"
echo -e "  • Docker Network (homelab-sentinel_sentinel-net)"
echo -e "  • Docker Images (sentinel-webapp:local, grafana-oss, prometheus, etc.)"
echo -e "  • UFW Firewall Rules (created with comment 'Homelab Sentinel')"
echo -e "  • Environment configuration file (.env)\n"
echo -e "${BOLD}This action is destructive and irreversible.${RESET}\n"

# Support non-interactive mode via UNATTENDED=1 or -y flag
CONFIRM=""
if [[ "$1" == "-y" || "$1" == "--yes" || "$UNATTENDED" == "1" ]]; then
    CONFIRM="yes"
else
    read -p "Type 'yes' to proceed with uninstallation: " CONFIRM
fi

if [[ "$CONFIRM" != "yes" ]]; then
    log_warn "Uninstallation cancelled. No changes were made to your system."
    exit 0
fi

# ------------------------------------------------------------------------------
# STEP 2: Stop and Remove Containers, Networks, Volumes
# ------------------------------------------------------------------------------
log_step "1/5" "Stopping and removing Docker containers, networks, and volumes..."

if [[ -f "$COMPOSE_FILE" ]]; then
    SECRET_KEY="${SECRET_KEY:-dummy_key_for_teardown}" GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-dummy_pass_for_teardown}" sudo -E docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
fi

# Fallback cleanup for any lingering containers, volumes, or networks
SENTINEL_CONTAINERS=$(sudo docker ps -a --filter "name=sentinel-" --format "{{.Names}}" 2>/dev/null || echo "")
if [[ -n "$SENTINEL_CONTAINERS" ]]; then
    echo "$SENTINEL_CONTAINERS" | xargs -r sudo docker stop 2>/dev/null || true
    echo "$SENTINEL_CONTAINERS" | xargs -r sudo docker rm -vf 2>/dev/null || true
fi

SENTINEL_VOLUMES=$(sudo docker volume ls --filter "name=homelab-sentinel_" --filter "name=sentinel" --format "{{.Name}}" 2>/dev/null || echo "")
if [[ -n "$SENTINEL_VOLUMES" ]]; then
    echo "$SENTINEL_VOLUMES" | xargs -r sudo docker volume rm -f 2>/dev/null || true
fi

sudo docker network rm homelab-sentinel_sentinel-net 2>/dev/null || true
log_success "Docker stack containers, networks, and volumes removed."

# ------------------------------------------------------------------------------
# STEP 3: Remove Project-Specific Docker Images
# ------------------------------------------------------------------------------
log_step "2/5" "Removing project-specific Docker images..."

PROJECT_IMAGES=(
    "sentinel-webapp:local"
    "grafana/grafana-oss:11.4.0"
    "prom/prometheus:latest"
    "prom/node-exporter:latest"
    "louislam/uptime-kuma:1"
    "tecnativa/docker-socket-proxy:latest"
)

for img in "${PROJECT_IMAGES[@]}"; do
    if sudo docker image inspect "$img" &>/dev/null; then
        sudo docker rmi -f "$img" &>/dev/null || true
        log_info "Removed Docker image: $img"
    fi
done
log_success "Project-specific Docker images cleaned up."

# ------------------------------------------------------------------------------
# STEP 4: Revert UFW Firewall Rules
# ------------------------------------------------------------------------------
log_step "3/5" "Reverting UFW Firewall Rules added by Homelab Sentinel..."

if command -v ufw &>/dev/null; then
    UFW_RULES=$(sudo ufw status numbered 2>/dev/null | grep -i "Homelab Sentinel" | sed -E 's/^\[ *([0-9]+)\].*/\1/' | sort -rn || echo "")
    if [[ -n "$UFW_RULES" ]]; then
        for r_num in $UFW_RULES; do
            echo "y" | sudo ufw delete "$r_num" >/dev/null 2>&1 || true
            log_info "Removed UFW rule #$r_num (Homelab Sentinel)"
        done
        sudo ufw reload >/dev/null 2>&1 || true
        log_success "All Homelab Sentinel UFW firewall rules removed."
    else
        log_info "No active UFW firewall rules found for Homelab Sentinel."
    fi
else
    log_info "UFW firewall is not installed. Skipping firewall rule cleanup."
fi

# ------------------------------------------------------------------------------
# STEP 5: Remove Environment File (.env)
# ------------------------------------------------------------------------------
log_step "4/5" "Removing environment configuration (.env)..."

if [[ -f "$ENV_FILE" ]]; then
    rm -f "$ENV_FILE"
    log_success "Removed $ENV_FILE"
else
    log_info "No .env file found at $ENV_FILE."
fi

# ------------------------------------------------------------------------------
# STEP 6: Optional Repository Directory Removal
# ------------------------------------------------------------------------------
log_step "5/5" "Repository Source Code Cleanup"

REMOVE_REPO=""
if [[ "$1" == "-y" || "$1" == "--yes" || "$UNATTENDED" == "1" ]]; then
    REMOVE_REPO="no"
else
    echo -e "\nWould you like to delete the source code repository directory at ${BOLD}$REPO_DIR${RESET}?"
    read -p "Type 'yes' to delete directory, or press Enter to keep source code: " REMOVE_REPO
fi

if [[ "$REMOVE_REPO" == "yes" ]]; then
    cd "$HOME"
    rm -rf "$REPO_DIR"
    log_success "Deleted repository directory: $REPO_DIR"
else
    log_info "Source code repository kept at $REPO_DIR."
fi

# ------------------------------------------------------------------------------
# FINAL SUMMARY
# ------------------------------------------------------------------------------
echo -e "\n${BOLD}${GREEN}======================================================================${RESET}"
echo -e "${BOLD}${GREEN}   🎉  HOMELAB SENTINEL UNINSTALLATION COMPLETED SUCCESSFULLY!  🎉${RESET}"
echo -e "${BOLD}${GREEN}======================================================================${RESET}\n"
echo -e "Summary of actions taken:"
echo -e "  ✓ Stopped & removed Docker containers, volumes, and networks."
echo -e "  ✓ Cleared stack Docker images."
echo -e "  ✓ Removed Homelab Sentinel UFW firewall rules."
echo -e "  ✓ Deleted .env configuration file."
if [[ "$REMOVE_REPO" == "yes" ]]; then
    echo -e "  ✓ Removed repository source directory ($REPO_DIR)."
else
    echo -e "  ℹ Preserved repository source directory ($REPO_DIR)."
fi
echo -e "\nYour system has been restored to its pre-installation state.\n"
