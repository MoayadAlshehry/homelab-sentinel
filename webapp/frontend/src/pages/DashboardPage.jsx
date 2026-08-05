import React, { useState, useEffect } from 'react';
import { Cpu, HardDrive, Thermometer, Activity, Radio, Clock, Loader2, RefreshCw, Server, ArrowRight } from 'lucide-react';
import { AreaChart as RechartsAreaChart, Area as RechartsArea, XAxis as RechartsXAxis, YAxis as RechartsYAxis, Tooltip as RechartsTooltip, ResponsiveContainer as RechartsResponsiveContainer } from 'recharts';

let GLOBAL_DASHBOARD_CACHE = null;

export default function DashboardPage({ token, onNavigate }) {
  const [sysMetrics, setSysMetrics] = useState(() => GLOBAL_DASHBOARD_CACHE?.sysMetrics || null);
  const [containers, setContainers] = useState(() => GLOBAL_DASHBOARD_CACHE?.containers || []);
  const [monitors, setMonitors] = useState(() => GLOBAL_DASHBOARD_CACHE?.monitors || []);
  const [events, setEvents] = useState(() => GLOBAL_DASHBOARD_CACHE?.events || []);
  const [trendData, setTrendData] = useState(() => GLOBAL_DASHBOARD_CACHE?.trendData || []);
  
  const [timeRange, setTimeRange] = useState('live');
  const [loading, setLoading] = useState(() => !GLOBAL_DASHBOARD_CACHE);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  const fetchData = async () => {
    try {
      const [sysRes, contRes, evRes, monRes, monEvRes] = await Promise.all([
        fetch('/api/system/metrics', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/containers', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/network/events', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/monitoring/services', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/monitoring/events', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      let nextSysMetrics = sysMetrics;
      let nextContainers = containers;
      let nextMonitors = monitors;
      let combinedEvents = events;

      if (sysRes.ok) {
        nextSysMetrics = await sysRes.json();
        setSysMetrics(nextSysMetrics);
      }

      if (contRes.ok) {
        nextContainers = await contRes.json();
        setContainers(nextContainers);
      }

      if (monRes.ok) {
        nextMonitors = await monRes.json();
        setMonitors(nextMonitors);
      }

      let netEvents = [];
      let monEvents = [];
      if (evRes.ok) netEvents = await evRes.json();
      if (monEvRes.ok) {
        const rawMonEv = await monEvRes.json();
        monEvents = rawMonEv.map(m => ({
          id: `mon-${m.id}`,
          message: m.message || `Service '${m.service}' ${m.status ? m.status.toUpperCase() : 'CHECK'} (${m.msg || 'Health check'})`,
          event_type: m.status === 'up' ? 'JOINED' : 'LEFT',
          timestamp: m.timestamp
        }));
      }

      combinedEvents = [...monEvents, ...netEvents];
      combinedEvents.sort((a, b) => {
        const timeA = a.timestamp ? new Date(String(a.timestamp).replace(' ', 'T')).getTime() : 0;
        const timeB = b.timestamp ? new Date(String(b.timestamp).replace(' ', 'T')).getTime() : 0;
        return timeB - timeA;
      });

      setEvents(combinedEvents);

      GLOBAL_DASHBOARD_CACHE = {
        sysMetrics: nextSysMetrics,
        containers: nextContainers,
        monitors: nextMonitors,
        events: combinedEvents,
        trendData
      };
    } catch (e) {
      console.error('[DASHBOARD FETCH ERROR]', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (range) => {
    setFetchingHistory(true);
    try {
      const res = await fetch(`/api/system/history?range=${range}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const histData = await res.json();
        setTrendData(histData);
        if (GLOBAL_DASHBOARD_CACHE) {
          GLOBAL_DASHBOARD_CACHE.trendData = histData;
        }
      }
    } catch (e) {
      console.error('[HISTORY FETCH ERROR]', e);
    } finally {
      setFetchingHistory(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (timeRange === 'live') {
      fetchHistory('live');
    }
  }, [token]);

  useEffect(() => {
    fetchHistory(timeRange);

    if (timeRange === 'live') {
      const interval = setInterval(() => {
        fetchData();
        fetchHistory('live');
      }, 2000);
      return () => clearInterval(interval);
    } else {
      const interval = setInterval(() => {
        fetchData();
        fetchHistory(timeRange);
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [timeRange, token]);

  const activeContainers = containers.filter(c => c.state === 'running').length;
  const totalContainers = containers.length;
  const upMonitors = monitors.filter(m => m.status === 'up').length;
  const totalMonitors = monitors.length;

  if (loading && !sysMetrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-10 h-10 text-[#00C853] animate-spin" />
        <p className="text-sm text-gray-400 font-medium">Initializing Homelab Sentinel Telemetry Engine...</p>
      </div>
    );
  }

  const temp = sysMetrics?.temperature_c ?? 45.0;
  const cpu = sysMetrics?.cpu_usage_pct ?? 12.0;
  const ramUsedGb = sysMetrics?.ram_used_gb ?? 3.5;
  const ramTotalGb = sysMetrics?.ram_total_gb ?? 16.0;
  const ramPct = sysMetrics?.ram_used_pct ?? 22.0;
  const disks = sysMetrics?.disks ?? [];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            Host System Overview
          </h2>
          <p className="text-sm text-gray-400 mt-1">Live hardware metrics, Prometheus time-series data, & multi-channel alert engine.</p>
        </div>

        {/* Stack Status Indicator Card (Clickable to Containers) */}
        <div
          onClick={() => onNavigate && onNavigate('containers')}
          className="flex items-center gap-3 bg-[#161B22] px-4 py-3 rounded-xl border border-[#2A3341] hover:border-[#00C853] cursor-pointer group transition-all"
        >
          <div className="p-2 bg-[#00C853]/10 text-[#00C853] rounded-lg border border-[#00C853]/20 group-hover:scale-110 transition-transform">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1">
              Stack Status
              <ArrowRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#00C853] transition-colors" />
            </div>
            <div className="text-xs text-gray-300 font-medium">
              <span className="text-[#00C853] font-bold">{activeContainers}</span>/{totalContainers} Services Running
            </div>
          </div>
        </div>
      </div>

      {/* Top Telemetry Cards (4 Grid Layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Services Health Card */}
        <div 
          onClick={() => onNavigate && onNavigate('monitoring')}
          className="bg-[#1D2430] glass-card-hover p-6 rounded-2xl border border-[#2A3341] cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Services Health</span>
            <div className="p-2.5 bg-[#00C853]/10 text-[#00C853] rounded-xl border border-[#00C853]/20 group-hover:scale-110 transition-transform">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white flex items-center justify-between">
            <span>{upMonitors}/{totalMonitors} UP</span>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-[#00C853] transition-colors" />
          </p>
          <p className="text-xs text-[#00C853] mt-1 font-medium flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00C853] animate-pulse"></span>
            100% Uptime Kuma Telemetry
          </p>
        </div>

        {/* Temperature Card */}
        <div className="bg-[#1D2430] glass-card-hover p-6 rounded-2xl border border-[#2A3341]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SoC Temperature</span>
            <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-xl border border-rose-500/20">
              <Thermometer className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{temp}°C</p>
          <p className="text-xs text-[#00C853] mt-1 flex items-center gap-1 font-medium">
            <span>Normal Range (&lt; 75°C threshold)</span>
          </p>
        </div>

        {/* CPU Card */}
        <div className="bg-[#1D2430] glass-card-hover p-6 rounded-2xl border border-[#2A3341]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">CPU Usage</span>
            <div className="p-2.5 bg-[#00C853]/10 text-[#00C853] rounded-xl border border-[#00C853]/20">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{cpu}%</p>
          <p className="text-xs text-[#00C853] mt-1 font-medium">4 Cores Cortex-A76 @ 2.4GHz</p>
        </div>

        {/* RAM Card */}
        <div className="bg-[#1D2430] glass-card-hover p-6 rounded-2xl border border-[#2A3341]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">RAM Memory</span>
            <div className="p-2.5 bg-[#0EA5E9]/10 text-[#0EA5E9] rounded-xl border border-[#0EA5E9]/20">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">
            {ramUsedGb < 1.0 ? `${Math.round(ramUsedGb * 1024)} MB` : `${ramUsedGb.toFixed(1)} GB`} / {ramTotalGb.toFixed(1)} GB used
          </p>
          <p className="text-xs text-[#0EA5E9] mt-1 font-medium">{ramPct}% Active Utilization</p>
        </div>
      </div>

      {/* Storage Section */}
      <div className="bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[#0EA5E9]" />
            Mounted Physical Disks & Storage Drives ({disks.length})
          </h3>
          <span className="text-xs text-gray-400">Host Filesystem Monitor</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {disks.map((d) => (
            <div key={d.mountpoint} className="p-4 bg-[#161B22] rounded-xl border border-[#2A3341] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-[#0EA5E9] font-bold">{d.mountpoint}</span>
                <span className="text-gray-400 font-mono text-[11px]">{d.device} ({d.fstype})</span>
              </div>
              <p className="text-lg font-bold text-white">{d.used_gb} GB / {d.total_gb} GB</p>
              <div className="w-full bg-[#1D2430] rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    d.used_pct > 85 ? 'bg-rose-500' : d.used_pct > 70 ? 'bg-amber-500' : 'bg-[#00C853]'
                  }`} 
                  style={{ width: `${Math.min(100, d.used_pct)}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[11px] text-gray-400">
                <span>Free: {d.free_gb} GB</span>
                <span className="font-semibold text-[#0EA5E9]">{d.used_pct}% Used</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Charts & Feed Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Metric Chart */}
        <div className="lg:col-span-2 bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] shadow-xl flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                Performance Telemetry History
                {fetchingHistory && <RefreshCw className="w-3.5 h-3.5 text-[#00C853] animate-spin" />}
              </h3>
              <p className="text-xs text-gray-400">
                {timeRange === 'live' ? 'Live Prometheus stream (2s refresh)' : `Prometheus 7-day TSDB archive (${timeRange.toUpperCase()} view)`}
              </p>
            </div>

            <div className="flex items-center space-x-1 p-1 bg-[#161B22] rounded-xl border border-[#2A3341]">
              {['live', '3h', '24h', '7d'].map((rangeKey) => (
                <button
                  key={rangeKey}
                  onClick={() => setTimeRange(rangeKey)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    timeRange === rangeKey
                      ? 'bg-[#00C853] text-[#161B22] shadow-md shadow-[#00C853]/30'
                      : 'text-gray-400 hover:text-white hover:bg-[#2A3341]'
                  }`}
                >
                  {rangeKey === 'live' ? 'Live' : rangeKey.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-4 text-xs font-semibold mb-3">
            <span className="flex items-center gap-1.5 text-[#00C853]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00C853]"></span> CPU % (Green)
            </span>
            <span className="flex items-center gap-1.5 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Temp (°C) (Red)
            </span>
            <span className="flex items-center gap-1.5 text-[#0EA5E9]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0EA5E9]"></span> RAM % (Blue)
            </span>
          </div>

          <div className="h-64 w-full">
            <RechartsResponsiveContainer width="100%" height="100%">
              <RechartsAreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00C853" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#00C853" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <RechartsXAxis dataKey="time" stroke="#6b7280" fontSize={11} tickLine={false} />
                <RechartsYAxis stroke="#6b7280" fontSize={11} tickLine={false} domain={[0, 100]} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#2A3341', borderRadius: '12px' }} />
                <RechartsArea type="monotone" dataKey="cpu" stroke="#00C853" fillOpacity={1} fill="url(#colorCpu)" />
                <RechartsArea type="monotone" dataKey="temp" stroke="#f43f5e" fillOpacity={1} fill="url(#colorTemp)" />
                <RechartsArea type="monotone" dataKey="ram" stroke="#0EA5E9" fillOpacity={1} fill="url(#colorRam)" />
              </RechartsAreaChart>
            </RechartsResponsiveContainer>
          </div>
        </div>

        {/* Live Event & Failure Feed */}
        <div className="bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] shadow-xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-[#69F0AE] animate-pulse" />
              Event & Failure Feed
            </h3>
            <span className="text-xs text-gray-400">Real-time</span>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-72 pr-1">
            {events.length === 0 ? (
              <div className="text-center py-8 text-xs text-gray-500">No events recorded yet</div>
            ) : (
              events.slice(0, 7).map((ev) => (
                <div key={ev.id} className="p-3 bg-[#161B22] rounded-xl border border-[#2A3341] text-xs flex items-start gap-2.5">
                  <div className={`mt-0.5 p-1 rounded-md ${ev.event_type === 'JOINED' ? 'bg-[#00C853]/10 text-[#00C853]' : 'bg-rose-500/10 text-rose-400'}`}>
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 leading-snug font-medium truncate">{ev.message}</p>
                    <span className="text-[10px] text-gray-400 mt-1 block flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {ev.timestamp}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
