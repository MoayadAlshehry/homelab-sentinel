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
    oui_map = {
        "10FFE0": "Giga-byte Technology",
        "80646F": "Espressif Systems",
        "5C4DBF": "ZTE Corporation",
        "D83ADD": "Raspberry Pi Trading",
        "DCA632": "Raspberry Pi Trading",
        "E45F01": "Raspberry Pi Trading",
        "B827EB": "Raspberry Pi Foundation",
        "001A11": "Google LLC",
        "F4F5E8": "Google LLC",
        "FC65DE": "Amazon Technologies",
        "005056": "VMware, Inc.",
        "000C29": "VMware, Inc."
    }
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

def get_active_interface():
    env_iface = os.getenv("SCAN_INTERFACE")
    if env_iface and env_iface.strip() and env_iface.strip() != "auto":
        return env_iface.strip()
    try:
        res = subprocess.run(["ip", "route"], capture_output=True, text=True, timeout=3)
        for line in res.stdout.splitlines():
            if line.startswith("default"):
                parts = line.split()
                if "dev" in parts:
                    idx = parts.index("dev")
                    if idx + 1 < len(parts):
                        return parts[idx + 1]
    except Exception:
        pass
    try:
        if os.path.exists("/sys/class/net"):
            for iface in os.listdir("/sys/class/net"):
                if iface != "lo" and not iface.startswith("docker") and not iface.startswith("veth") and not iface.startswith("br-"):
                    return iface
    except Exception:
        pass
    return "eth0"

def get_lan_subnet():
    """Dynamically determine active LAN subnet in CIDR notation across any network setup."""
    local_ip = None
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    if not local_ip or local_ip.startswith("127."):
        try:
            host_ip = socket.gethostbyname(socket.gethostname())
            if host_ip and not host_ip.startswith("127."):
                local_ip = host_ip
        except Exception:
            pass

    if local_ip:
        try:
            import ipaddress
            res = subprocess.run(["ip", "-o", "-f", "inet", "addr", "show"], capture_output=True, text=True, timeout=3)
            for line in res.stdout.splitlines():
                parts = line.split()
                if len(parts) >= 4 and not any(parts[1].startswith(p) for p in ("docker", "br-", "veth", "lo")):
                    ip_cidr = parts[3]
                    net = ipaddress.ip_network(ip_cidr, strict=False)
                    if ipaddress.ip_address(local_ip) in net:
                        return str(net)
        except Exception:
            pass
        
        parts = local_ip.split(".")
        return f"{parts[0]}.{parts[1]}.{parts[2]}.0/24"

    try:
        if os.path.exists("/proc/net/route"):
            with open("/proc/net/route", "r") as f:
                for line in f.readlines()[1:]:
                    parts = line.split()
                    if len(parts) >= 3:
                        iface, dest_hex = parts[0], parts[1]
                        if not any(iface.startswith(p) for p in ("docker", "br-", "veth", "lo")):
                            if dest_hex != "00000000":
                                import struct
                                net_ip = socket.inet_ntoa(struct.pack("<L", int(dest_hex, 16)))
                                return f"{net_ip}/24"
    except Exception:
        pass

    return "192.168.0.0/16"

def read_proc_arp_cache():
    """Read system ARP table (/proc/net/arp) to catch any active devices on Layer 2."""
    arp_devices = []
    try:
        if os.path.exists("/proc/net/arp"):
            with open("/proc/net/arp", "r") as f:
                lines = f.readlines()[1:]  # skip header
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 6:
                        ip = parts[0].strip()
                        flags = parts[2].strip()
                        mac = parts[3].strip().upper()
                        device = parts[5].strip()
                        # flags 0x2 means reachable/resolved, 0x0 is incomplete
                        if flags != "0x0" and re.match(r"^([0-9A-FA-F]{2}:){5}[0-9A-FA-F]{2}$", mac):
                            if mac != "00:00:00:00:00:00" and not device.startswith("docker") and not device.startswith("br-") and not device.startswith("veth"):
                                vendor = get_vendor_for_mac(mac)
                                arp_devices.append({"mac": mac, "ip": ip, "vendor": vendor})
    except Exception as e:
        print(f"Notice: Failed reading ARP cache: {e}", flush=True)
    return arp_devices

def run_lan_scan():
    discovered_by_mac = {}
    iface = get_active_interface()
    target_subnet = get_lan_subnet()
    
    # 1. Primary L2 Scanner: arp-scan
    try:
        cmd = [
            "arp-scan",
            "--localnet",
            f"--interface={iface}",
            "--ignoredups",
            "-q"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if res.returncode != 0:
            cmd = [
                "arp-scan",
                f"--interface={iface}",
                "--ignoredups",
                "-q",
                target_subnet
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

        if res.returncode == 0:
            for line in res.stdout.splitlines():
                parts = line.strip().split()
                if len(parts) >= 2:
                    ip = parts[0].strip()
                    mac = parts[1].strip().upper()
                    if re.match(r"^([0-9A-FA-F]{2}:){5}[0-9A-FA-F]{2}$", mac):
                        raw_vendor = " ".join(parts[2:]).strip() if len(parts) >= 3 else None
                        vendor = raw_vendor if raw_vendor and raw_vendor != "Unknown" else get_vendor_for_mac(mac)
                        discovered_by_mac[mac] = {"mac": mac, "ip": ip, "vendor": vendor}
    except Exception as e:
        print(f"arp-scan execution notice: {e}", flush=True)

    # 2. Secondary L2 Scanner: nmap -sn -PR (ARP Ping Sweep fallback if arp-scan returned 0 devices)
    if not discovered_by_mac:
        target_subnet = get_lan_subnet()
        try:
            cmd = ["nmap", "-sn", "-PR", "--host-timeout", "3s", target_subnet]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            current_ip = None
            current_mac = None
            current_vendor = None
            
            for line in res.stdout.splitlines():
                ip_match = re.search(r"Nmap scan report for (?:[^\s]+ \()?([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\)?", line)
                if ip_match:
                    if current_ip and current_mac:
                        vendor = current_vendor if current_vendor and current_vendor != "Unknown" else get_vendor_for_mac(current_mac)
                        if current_mac not in discovered_by_mac:
                            discovered_by_mac[current_mac] = {"mac": current_mac, "ip": current_ip, "vendor": vendor}
                    current_ip = ip_match.group(1)
                    current_mac = None
                    current_vendor = None
                    
                mac_match = re.search(r"MAC Address: ([0-9A-FA-F:]+)(?: \((.*?)\))?", line)
                if mac_match:
                    current_mac = mac_match.group(1).upper()
                    if mac_match.group(2):
                        current_vendor = mac_match.group(2)

            if current_ip and current_mac and current_mac not in discovered_by_mac:
                vendor = current_vendor if current_vendor and current_vendor != "Unknown" else get_vendor_for_mac(current_mac)
                discovered_by_mac[current_mac] = {"mac": current_mac, "ip": current_ip, "vendor": vendor}
        except Exception as e:
            print(f"nmap scan notice: {e}", flush=True)

    # 3. Cross-reference system ARP cache (/proc/net/arp)
    arp_cached = read_proc_arp_cache()
    for d in arp_cached:
        if d["mac"] not in discovered_by_mac:
            discovered_by_mac[d["mac"]] = d

    return list(discovered_by_mac.values())

def process_scan_results():
    scanned_devices = run_lan_scan()
    scanned_macs = {d["mac"]: d for d in scanned_devices}
    
    conn = get_db()
    cursor = conn.cursor()
    
    now_local = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
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
            """, (info["ip"], info["vendor"], now_local, mac))
            
            if prev["is_online"] == 0:
                msg = f"Device '{info['vendor']}' ({info['ip']} / {mac}) reconnected to the network at {time_display}"
                cursor.execute("""
                    INSERT INTO network_events (mac, ip, event_type, message, timestamp)
                    VALUES (?, ?, 'JOINED', ?, ?)
                """, (mac, info["ip"], msg, now_local))
                print(f"[NETWORK EVENT] {msg}", flush=True)
        else:
            cursor.execute("""
                INSERT INTO devices (mac, ip, vendor, first_seen, last_seen, is_online, missed_scans)
                VALUES (?, ?, ?, ?, ?, 1, 0)
            """, (mac, info["ip"], info["vendor"], now_local, now_local))
            
            msg = f"New device '{info['vendor']}' ({info['ip']} / {mac}) joined the network for the first time at {time_display}"
            cursor.execute("""
                INSERT INTO network_events (mac, ip, event_type, message, timestamp)
                VALUES (?, ?, 'JOINED', ?, ?)
            """, (mac, info["ip"], msg, now_local))
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
                """, (mac, prev["ip"], msg, now_local))
                print(f"[NETWORK EVENT] {msg}", flush=True)
            else:
                cursor.execute("UPDATE devices SET missed_scans = ? WHERE mac = ?", (new_missed, mac))

    conn.commit()
    conn.close()
    return {
        "scanned_count": len(scanned_devices),
        "devices": scanned_devices
    }
