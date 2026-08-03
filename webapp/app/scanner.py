import subprocess
import sqlite3
import re
import os
import time
import datetime
import socket
from app.database import get_db

INTERFACE = os.getenv("SCAN_INTERFACE", "eth0")
MISSED_SCAN_THRESHOLD = int(os.getenv("MISSED_SCAN_THRESHOLD", "3"))

_OUI_MAP = None

def load_oui_database():
    """Load OUI vendor database from system files (/usr/share/nmap/nmap-mac-prefixes and arp-scan OUI)."""
    oui_map = {}
    for oui_file in ["/usr/share/nmap/nmap-mac-prefixes", "/usr/share/arp-scan/ieee-oui.txt"]:
        if os.path.exists(oui_file):
            try:
                with open(oui_file, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#"):
                            parts = line.split("\t") if "\t" in line else line.split(" ", 1)
                            if len(parts) >= 2:
                                prefix = parts[0].strip().replace(":", "").replace("-", "").upper()[:6]
                                vendor = parts[1].strip()
                                if prefix and prefix not in oui_map:
                                    oui_map[prefix] = vendor
            except Exception as e:
                print(f"Notice: Failed loading OUI database from {oui_file}: {e}", flush=True)
    return oui_map

def get_vendor_for_mac(mac: str) -> str:
    global _OUI_MAP
    if _OUI_MAP is None:
        _OUI_MAP = load_oui_database()
    clean_mac = mac.replace(":", "").replace("-", "").strip().upper()
    prefix = clean_mac[:6]
    return _OUI_MAP.get(prefix, "Unknown Vendor")

def get_lan_subnet():
    """Dynamically determine active LAN subnet in CIDR notation."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split(".")
        return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"
    except Exception:
        return "192.168.0.0/24"

def run_lan_scan():
    devices = []
    
    # 1. Primary L2 Scanner: arp-scan (resolves real MACs and real IEEE OUI vendors)
    try:
        cmd = [
            "arp-scan",
            "--localnet",
            f"--interface={INTERFACE}",
            "--ignoredups",
            "-q"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                parts = line.strip().split("\t")
                if len(parts) >= 2:
                    ip = parts[0].strip()
                    mac = parts[1].strip().upper()
                    raw_vendor = parts[2].strip() if len(parts) >= 3 and parts[2].strip() else None
                    vendor = raw_vendor if raw_vendor and raw_vendor != "Unknown" else get_vendor_for_mac(mac)
                    if re.match(r"^([0-9A-FA-F]{2}:){5}[0-9A-FA-F]{2}$", mac):
                        devices.append({"mac": mac, "ip": ip, "vendor": vendor})
            if devices:
                return devices
    except Exception as e:
        print(f"arp-scan execution notice: {e}", flush=True)

    # 2. Backup L2/L3 Scanner: nmap (only accepts entries with real resolved MAC addresses)
    target_subnet = get_lan_subnet()
    try:
        cmd = ["nmap", "-sn", target_subnet]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        current_ip = None
        current_mac = None
        current_vendor = None
        
        for line in res.stdout.splitlines():
            ip_match = re.search(r"Nmap scan report for (?:[^\s]+ \()?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\)?", line)
            if ip_match:
                if current_ip and current_mac:
                    vendor = current_vendor if current_vendor and current_vendor != "Unknown" else get_vendor_for_mac(current_mac)
                    devices.append({"mac": current_mac, "ip": current_ip, "vendor": vendor})
                current_ip = ip_match.group(1)
                current_mac = None
                current_vendor = None
                
            mac_match = re.search(r"MAC Address: ([0-9A-FA-F:]+)(?: \((.*?)\))?", line)
            if mac_match:
                current_mac = mac_match.group(1).upper()
                if mac_match.group(2):
                    current_vendor = mac_match.group(2)

        if current_ip and current_mac:
            vendor = current_vendor if current_vendor and current_vendor != "Unknown" else get_vendor_for_mac(current_mac)
            devices.append({"mac": current_mac, "ip": current_ip, "vendor": vendor})

    except Exception as e:
        print(f"nmap scan notice: {e}", flush=True)

    return devices

def process_scan_results():
    scanned_devices = run_lan_scan()
    scanned_macs = {d["mac"]: d for d in scanned_devices}
    
    conn = get_db()
    cursor = conn.cursor()
    
    now_utc = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    time_display = datetime.datetime.now().strftime("%H:%M:%S")

    cursor.execute("SELECT mac, ip, vendor, is_online, missed_scans FROM devices")
    existing_devices = {row["mac"]: dict(row) for row in cursor.fetchall()}

    # 1. Process scanned online devices
    for mac, info in scanned_macs.items():
        if mac in existing_devices:
            prev = existing_devices[mac]
            cursor.execute("""
                UPDATE devices 
                SET ip = ?, vendor = ?, last_seen = ?, is_online = 1, missed_scans = 0 
                WHERE mac = ?
            """, (info["ip"], info["vendor"], now_utc, mac))
            
            if prev["is_online"] == 0:
                msg = f"Device '{info['vendor']}' ({info['ip']} / {mac}) reconnected to the network at {time_display}"
                cursor.execute("""
                    INSERT INTO network_events (mac, ip, event_type, message, timestamp)
                    VALUES (?, ?, 'JOINED', ?, ?)
                """, (mac, info["ip"], msg, now_utc))
                print(f"[NETWORK EVENT] {msg}", flush=True)
        else:
            cursor.execute("""
                INSERT INTO devices (mac, ip, vendor, first_seen, last_seen, is_online, missed_scans)
                VALUES (?, ?, ?, ?, ?, 1, 0)
            """, (mac, info["ip"], info["vendor"], now_utc, now_utc))
            
            msg = f"New device '{info['vendor']}' ({info['ip']} / {mac}) joined the network for the first time at {time_display}"
            cursor.execute("""
                INSERT INTO network_events (mac, ip, event_type, message, timestamp)
                VALUES (?, ?, 'JOINED', ?, ?)
            """, (mac, info["ip"], msg, now_utc))
            print(f"[NETWORK EVENT] {msg}", flush=True)

    # 2. Process devices missed in current scan cycle (Debounce threshold)
    for mac, prev in existing_devices.items():
        if mac not in scanned_macs:
            new_missed = prev["missed_scans"] + 1
            if new_missed >= MISSED_SCAN_THRESHOLD and prev["is_online"] == 1:
                cursor.execute("UPDATE devices SET is_online = 0, missed_scans = ? WHERE mac = ?", (new_missed, mac))
                msg = f"Device '{prev['vendor']}' ({prev['ip']} / {mac}) left the network (missed {MISSED_SCAN_THRESHOLD} consecutive scans) at {time_display}"
                cursor.execute("""
                    INSERT INTO network_events (mac, ip, event_type, message, timestamp)
                    VALUES (?, ?, 'LEFT', ?, ?)
                """, (mac, prev["ip"], msg, now_utc))
                print(f"[NETWORK EVENT] {msg}", flush=True)
            else:
                cursor.execute("UPDATE devices SET missed_scans = ? WHERE mac = ?", (new_missed, mac))

    conn.commit()
    conn.close()
    return {
        "scanned_count": len(scanned_devices),
        "devices": scanned_devices
    }
