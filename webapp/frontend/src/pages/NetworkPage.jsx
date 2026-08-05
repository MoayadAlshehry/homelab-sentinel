import React, { useState, useEffect, useMemo } from 'react';
import { Network, RefreshCw, Loader2, Smartphone, Laptop, Monitor, Server, Router, Camera, Tv, Printer, Gamepad2, Cpu, HelpCircle, Edit2, Check, X } from 'lucide-react';
import DataTable from '../components/ui/DataTable';

export default function NetworkPage({ token }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [editingMac, setEditingMac] = useState(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('unknown');

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/network/devices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDevices(data);
        } else {
          setDevices(data.devices || []);
          if (data.last_scan) setLastScanTime(data.last_scan);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 15000);
    return () => clearInterval(interval);
  }, [token]);

  const handleTriggerScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/network/scan', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.last_scan) {
          setLastScanTime(data.last_scan);
        }
        await fetchDevices();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const handleSaveEdit = async (mac) => {
    try {
      const res = await fetch(`/api/network/devices/${mac}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          custom_name: editName,
          device_type: editType
        })
      });
      if (res.ok) {
        await fetchDevices();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEditingMac(null);
    }
  };

  const getDeviceIcon = (vendor = '', customType = '') => {
    const v = (vendor || '').toLowerCase();
    const t = (customType || '').toLowerCase();

    if (t === 'phone') return Smartphone;
    if (t === 'laptop') return Laptop;
    if (t === 'desktop') return Monitor;
    if (t === 'server') return Server;
    if (t === 'router') return Router;
    if (t === 'switch') return Network;
    if (t === 'camera') return Camera;
    if (t === 'tv') return Tv;
    if (t === 'printer') return Printer;
    if (t === 'console') return Gamepad2;
    if (t === 'iot') return Cpu;

    // Auto Detection
    if (v.includes('apple') || v.includes('samsung') || v.includes('huawei') || v.includes('xiaomi') || v.includes('oneplus')) {
      return Smartphone;
    }
    if (v.includes('intel') || v.includes('dell') || v.includes('lenovo') || v.includes('hp') || v.includes('microsoft')) {
      return Laptop;
    }
    if (v.includes('giga-byte') || v.includes('gigabyte') || v.includes('msi') || v.includes('asus')) {
      return Monitor;
    }
    if (v.includes('synology') || v.includes('qnap') || v.includes('supermicro') || v.includes('vmware')) {
      return Server;
    }
    if (v.includes('hikvision') || v.includes('dahua') || v.includes('reolink') || v.includes('axis') || v.includes('ring') || v.includes('nest')) {
      return Camera;
    }
    if (v.includes('tp-link') || v.includes('cisco') || v.includes('netgear') || v.includes('ubiquiti') || v.includes('zte')) {
      return Router;
    }
    if (v.includes('mikrotik') || v.includes('aruba') || v.includes('juniper')) {
      return Network;
    }
    if (v.includes('lg') || v.includes('sony') || v.includes('roku') || v.includes('vizio') || v.includes('tcl')) {
      return Tv;
    }
    if (v.includes('canon') || v.includes('epson') || v.includes('brother') || v.includes('lexmark')) {
      return Printer;
    }
    if (v.includes('nintendo') || v.includes('playstation') || v.includes('xbox')) {
      return Gamepad2;
    }
    if (v.includes('espressif') || v.includes('raspberry') || v.includes('sonoff') || v.includes('tuya') || v.includes('smart')) {
      return Cpu;
    }
    return HelpCircle;
  };

  const columns = useMemo(() => [
    {
      accessorKey: 'ip',
      header: 'IP Address',
      cell: ({ row }) => {
        const d = row.original;
        const IconComponent = getDeviceIcon(d.vendor, d.device_type);
        return (
          <div className="font-mono font-bold text-white flex items-center gap-2.5">
            <div className="p-1.5 bg-[#161B22] border border-[#2A3341] rounded-lg text-[#00C853]">
              <IconComponent className="w-4 h-4" />
            </div>
            <span>{d.ip}</span>
          </div>
        );
      }
    },
    {
      accessorKey: 'is_online',
      header: 'Status',
      cell: ({ row }) => {
        const isOnline = row.original.is_online === 1 || row.original.is_online === true;
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
            isOnline 
              ? 'bg-[#00C853]/15 text-[#00C853] border border-[#00C853]/30' 
              : 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-[#00C853] animate-pulse' : 'bg-gray-500'}`} />
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        );
      }
    },
    {
      accessorKey: 'vendor',
      header: 'Custom Name / Vendor',
      cell: ({ row }) => {
        const d = row.original;
        const isEditing = editingMac === d.mac;

        if (isEditing) {
          return (
            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Custom Label..."
                className="bg-[#161B22] border border-[#2A3341] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-[#00C853] w-32"
              />
              <select
                value={editType}
                onChange={e => setEditType(e.target.value)}
                className="bg-[#161B22] border border-[#2A3341] rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
              >
                <option value="auto">Auto</option>
                <option value="phone">Phone</option>
                <option value="laptop">Laptop</option>
                <option value="desktop">PC/Desktop</option>
                <option value="server">Server</option>
                <option value="router">Router</option>
                <option value="switch">Switch</option>
                <option value="camera">Camera</option>
                <option value="tv">Smart TV</option>
                <option value="printer">Printer</option>
                <option value="console">Game Console</option>
                <option value="iot">IoT/Chip</option>
              </select>
              <button
                onClick={() => handleSaveEdit(d.mac)}
                className="p-1 bg-[#00C853]/20 text-[#00C853] hover:bg-[#00C853]/30 rounded-md transition-colors"
                title="Save"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setEditingMac(null)}
                className="p-1 bg-gray-500/20 text-gray-400 hover:bg-gray-500/30 rounded-md transition-colors"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-2 group">
            <div>
              {d.custom_name ? (
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>{d.custom_name}</span>
                  <span className="text-[11px] font-normal text-gray-400">({d.vendor || 'Unknown'})</span>
                </div>
              ) : (
                <div className="font-bold text-gray-200">{d.vendor || 'Unknown Vendor'}</div>
              )}
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditingMac(d.mac);
                setEditName(d.custom_name || '');
                setEditType(d.device_type || 'auto');
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#2A3341] text-gray-400 hover:text-white rounded transition-all"
              title="Edit Device Label"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        );
      }
    },
    {
      accessorKey: 'mac',
      header: 'MAC Address',
      cell: ({ row }) => <span className="font-mono text-gray-400 text-[11px]">{row.original.mac}</span>
    },
    {
      accessorKey: 'last_seen',
      header: 'Last Active',
      cell: ({ row }) => <span className="text-gray-400 text-xs">{row.original.last_seen || 'Just now'}</span>
    }
  ], [editingMac, editName, editType]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-[#00C853]" />
            LAN Network Scanner & Device Directory
          </h2>
          <p className="text-sm text-gray-400 mt-1">Real-time Layer 2 ARP subnet scanning and MAC vendor resolution.</p>
        </div>

        <div className="flex items-center gap-3">
          {lastScanTime && (
            <span className="text-xs text-gray-400 font-mono">
              Last scan: <span className="text-white font-bold">{lastScanTime}</span>
            </span>
          )}
          <button
            disabled={scanning}
            onClick={handleTriggerScan}
            className="px-4 py-2 bg-[#00C853] hover:bg-[#69F0AE] text-[#161B22] font-bold rounded-xl text-xs transition-colors flex items-center gap-2 shadow-lg shadow-[#00C853]/20 disabled:opacity-50"
          >
            {scanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#161B22]" />
                Scanning Subnet...
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 text-[#161B22]" />
                Trigger ARP Scan
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#00C853]" />
        </div>
      ) : (
        <DataTable
          data={devices}
          columns={columns}
          searchPlaceholder="Search IP address, custom label, vendor name, MAC..."
        />
      )}
    </div>
  );
}
