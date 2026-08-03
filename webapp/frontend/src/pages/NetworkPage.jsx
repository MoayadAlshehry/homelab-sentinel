import React, { useState, useEffect } from 'react';
import { Wifi, RefreshCw, Radio, CheckCircle, XCircle, Clock, ShieldAlert } from 'lucide-react';

export default function NetworkPage({ token }) {
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchNetworkData = async () => {
    try {
      const [devRes, evRes] = await Promise.all([
        fetch('/api/network/devices', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/network/events', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (devRes.ok) setDevices(await devRes.json());
      if (evRes.ok) setEvents(await evRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworkData();
    const interval = setInterval(fetchNetworkData, 10000);
    return () => clearInterval(interval);
  }, []);

  const triggerScan = async () => {
    setScanning(true);
    try {
      await fetch('/api/network/scan', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchNetworkData();
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Wifi className="w-5 h-5 text-emerald-400" />
            LAN Network Scanner & Device Tracking
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Periodic `arp-scan` on local subnet (`192.168.0.0/24`). Tracks MAC addresses, vendor OUI, and join/leave events.
          </p>
        </div>

        <button
          onClick={triggerScan}
          disabled={scanning}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-emerald-600/25 flex items-center gap-2 self-start disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning LAN Subnet...' : 'Run On-Demand LAN Scan'}
        </button>
      </div>

      {/* Connected Devices Table */}
      <div className="glass-card rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            Discovered Devices ({devices.length})
          </h3>
          <span className="text-xs text-gray-400">Automatic scan every 5 minutes</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900/80 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-800">
              <tr>
                <th className="px-6 py-4">IP Address</th>
                <th className="px-6 py-4">MAC Address</th>
                <th className="px-6 py-4">Vendor / Manufacturer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">First Seen</th>
                <th className="px-6 py-4 text-right">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {devices.map((d) => (
                <tr key={d.mac} className="hover:bg-gray-800/30 transition-colors">
                  <td className="px-6 py-4 font-mono font-semibold text-blue-400">{d.ip}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-300">{d.mac}</td>
                  <td className="px-6 py-4 text-gray-200">{d.vendor}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                      d.is_online
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                    }`}>
                      {d.is_online ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {d.is_online ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-400">{d.first_seen}</td>
                  <td className="px-6 py-4 text-xs text-gray-400 text-right">{d.last_seen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Network Event Audit Log */}
      <div className="glass-card p-6 rounded-2xl border border-gray-800">
        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          Network Join / Leave Audit Logs
        </h3>

        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {events.map((ev) => (
            <div key={ev.id} className="p-3 bg-gray-900/60 rounded-xl border border-gray-800/80 text-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                  ev.event_type === 'JOINED'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {ev.event_type}
                </span>
                <span className="text-gray-200">{ev.message}</span>
              </div>
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {ev.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
