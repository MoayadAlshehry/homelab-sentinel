import React, { useState, useEffect } from 'react';
import { Activity, Plus, RefreshCw, Trash2, Edit3, CheckCircle2, AlertTriangle, XCircle, Globe, Shield, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { parseApiError } from '../utils/formatError';

const parseSecondsToUnit = (totalSeconds) => {
  const secs = parseInt(totalSeconds, 10) || 20;
  if (secs >= 3600 && secs % 3600 === 0) {
    return { val: secs / 3600, unit: 'hours' };
  }
  if (secs >= 60 && secs % 60 === 0) {
    return { val: secs / 60, unit: 'minutes' };
  }
  return { val: secs, unit: 'seconds' };
};

const convertUnitToSeconds = (val, unit) => {
  const num = parseInt(val, 10) || 20;
  if (unit === 'hours') return num * 3600;
  if (unit === 'minutes') return num * 60;
  return num;
};

const isInternalTarget = (urlOrHost = '') => {
  const str = (urlOrHost || '').toLowerCase();
  return (
    str.includes('192.168.') ||
    str.includes('10.') ||
    str.includes('172.16.') || str.includes('172.17.') || str.includes('172.18.') || str.includes('172.19.') ||
    str.includes('172.20.') || str.includes('172.21.') || str.includes('172.22.') || str.includes('172.23.') ||
    str.includes('172.24.') || str.includes('172.25.') || str.includes('172.26.') || str.includes('172.27.') ||
    str.includes('172.28.') || str.includes('172.29.') || str.includes('172.30.') || str.includes('172.31.') ||
    str.includes('localhost') ||
    str.includes('127.0.0.1') ||
    str.includes('.local')
  );
};

export default function MonitoringPage({ token }) {
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    type: 'http',
    maxretries: 3,
    keyword: ''
  });
  const [intervalVal, setIntervalVal] = useState(20);
  const [intervalUnit, setIntervalUnit] = useState('seconds');

  const fetchMonitors = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/monitoring/services', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMonitors(data);
        setError('');
      } else {
        setError('Failed to fetch monitoring targets');
      }
    } catch (err) {
      setError('Error connecting to telemetry service');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMonitors();
    const interval = setInterval(() => fetchMonitors(false), 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleOpenAddModal = () => {
    setEditingMonitor(null);
    setFormData({ name: '', url: '', type: 'http', maxretries: 3, keyword: '' });
    setIntervalVal(20);
    setIntervalUnit('seconds');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (mon) => {
    setEditingMonitor(mon);
    setFormData({
      name: mon.name || '',
      url: mon.url || mon.hostname || '',
      type: mon.type || 'http',
      maxretries: mon.maxretries || 3,
      keyword: mon.keyword || ''
    });
    const { val, unit } = parseSecondsToUnit(mon.interval || 20);
    setIntervalVal(val);
    setIntervalUnit(unit);
    setIsAddModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const urlPath = editingMonitor ? `/api/monitoring/services/${editingMonitor.id}` : '/api/monitoring/services';
      const method = editingMonitor ? 'PUT' : 'POST';

      const totalSeconds = convertUnitToSeconds(intervalVal, intervalUnit);
      const payload = {
        ...formData,
        interval: totalSeconds
      };

      const res = await fetch(urlPath, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(parseApiError(errData.detail, 'Failed to save monitor'));
      }

      setIsAddModalOpen(false);
      fetchMonitors(true);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete monitoring target "${name}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/monitoring/services/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchMonitors(true);
      }
    } catch (err) {
      alert('Failed to delete monitor');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleMaintenance = async (mon) => {
    try {
      if (mon.is_maintenance) {
        await fetch(`/api/monitoring/services/${mon.id}/maintenance`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } else {
        await fetch(`/api/monitoring/services/${mon.id}/maintenance`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ duration_minutes: 60 })
        });
      }
      fetchMonitors(true);
    } catch (e) {
      console.error(e);
    }
  };

  const totalMonitors = monitors.length;
  const upMonitors = monitors.filter(m => m.status === 'up').length;
  const downMonitors = monitors.filter(m => m.status === 'down').length;
  const avgLatency = monitors.length > 0 
    ? Math.round(monitors.reduce((acc, m) => acc + (m.avg_response_time || 0), 0) / monitors.length) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-[#00C853]" />
            API & Service Health Monitor
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Real-time ping, HTTP status, and response latency telemetry powered by Uptime Kuma engine
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchMonitors(true)}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-[#1D2430] border border-[#2A3341] text-gray-300 hover:text-white text-xs font-semibold flex items-center gap-2 hover:border-[#00C853] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[#00C853]' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-[#00C853] text-[#161B22] font-bold text-xs flex items-center gap-2 hover:bg-[#69F0AE] transition-all shadow-lg shadow-[#00C853]/20"
          >
            <Plus className="w-4 h-4" />
            Add Monitor
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-5 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Total Monitored Targets</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-white">{totalMonitors}</span>
            <span className="text-xs font-medium text-gray-400">Services</span>
          </div>
        </div>

        <div className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-5 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Services Online (UP)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-[#00C853]">{upMonitors}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#00C853]/10 text-[#00C853] border border-[#00C853]/20">
              {totalMonitors > 0 ? Math.round((upMonitors / totalMonitors) * 100) : 100}% Operational
            </span>
          </div>
        </div>

        <div className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-5 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Active Incidents (DOWN)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className={`text-2xl font-bold ${downMonitors > 0 ? 'text-rose-500 animate-pulse' : 'text-gray-300'}`}>
              {downMonitors}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${downMonitors > 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-gray-800 text-gray-400'}`}>
              {downMonitors > 0 ? 'Action Required' : 'All Clear'}
            </span>
          </div>
        </div>

        <div className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-5 shadow-sm">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Avg Latency (24h)</span>
          <div className="flex items-baseline justify-between mt-2">
            <span className="text-2xl font-bold text-[#0EA5E9]">{avgLatency} ms</span>
            <span className="text-xs font-medium text-gray-400">Response Time</span>
          </div>
        </div>
      </div>

      {/* Monitors List Grid */}
      {loading ? (
        <div className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-12 text-center text-gray-400 space-y-3">
          <div className="w-6 h-6 border-2 border-[#00C853] border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs font-medium">Fetching telemetry monitors...</p>
        </div>
      ) : monitors.length === 0 ? (
        <div className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-12 text-center text-gray-400 space-y-4">
          <Activity className="w-12 h-12 text-gray-600 mx-auto" />
          <div>
            <h3 className="text-lg font-bold text-white">No Monitored Services Added</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Start tracking your homelab APIs, router gateways, and container services by clicking "Add Monitor".
            </p>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-[#00C853] text-[#161B22] font-bold text-xs hover:bg-[#69F0AE] transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add First Monitor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {monitors.map((mon) => {
            const isUp = mon.status === 'up';
            const isDown = mon.status === 'down';
            const isDeleting = deletingId === mon.id;

            return (
              <div
                key={mon.id}
                className="bg-[#1D2430] border border-[#2A3341] rounded-2xl p-5 space-y-4 hover:border-[#2A3341]/80 transition-all shadow-sm relative group"
              >
                {/* Monitor Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-white truncate">{mon.name}</h3>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-[#161B22] text-gray-400 border border-[#2A3341]">
                        {mon.type}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase ${
                        (mon.scope || (isInternalTarget(mon.url || mon.hostname) ? 'internal' : 'external')) === 'internal'
                          ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                          : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {mon.scope || (isInternalTarget(mon.url || mon.hostname) ? 'internal' : 'external')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono truncate flex items-center gap-1">
                      <Globe className="w-3 h-3 text-gray-500 flex-shrink-0" />
                      {mon.url || mon.hostname || 'Internal Service'}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    {mon.is_maintenance && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase tracking-wider">
                        MAINTENANCE ({mon.maintenance_until})
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
                      isUp 
                        ? 'bg-[#00C853]/15 text-[#00C853] border-[#00C853]/30' 
                        : isDown 
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' 
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}>
                      {isUp && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {isDown && <XCircle className="w-3.5 h-3.5" />}
                      {!isUp && !isDown && <AlertTriangle className="w-3.5 h-3.5" />}
                      {mon.status.toUpperCase()}
                    </span>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleMaintenance(mon)}
                        title={mon.is_maintenance ? "Resume Alerts" : "Maintenance Mode (Pause Alerts)"}
                        className={`p-1.5 rounded-lg transition-colors ${
                          mon.is_maintenance 
                            ? 'text-sky-400 bg-sky-500/20 border border-sky-500/30' 
                            : 'text-gray-400 hover:text-white hover:bg-[#2A3341]'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(mon)}
                        disabled={isDeleting}
                        title="Edit Monitor"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#2A3341] transition-colors disabled:opacity-50"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(mon.id, mon.name)}
                        disabled={isDeleting}
                        title="Delete Monitor"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-[#2A3341] transition-colors disabled:opacity-50"
                      >
                        {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Telemetry Metrics Row */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#2A3341]/60 text-xs">
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">24h Uptime</span>
                    <span className="font-bold text-white">{mon.uptime_24h}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">30d Uptime</span>
                    <span className="font-bold text-white">{mon.uptime_30d}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block font-medium">Avg Latency</span>
                    <span className="font-bold text-[#0EA5E9]">{mon.avg_response_time} ms</span>
                  </div>
                </div>

                {/* Recent Latency Sparkline */}
                {mon.history && mon.history.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1.5">
                      <span>Response History</span>
                      <span>Last check: {mon.last_check ? mon.last_check.split(' ')[1] : 'Just now'}</span>
                    </div>
                    <div className="h-9 flex items-end gap-1 bg-[#161B22]/60 p-1.5 rounded-lg border border-[#2A3341]/40">
                      {mon.history.map((h, i) => {
                        const hIsUp = h.status === 'up';
                        const maxPing = 500;
                        const barHeight = Math.min(100, Math.max(15, (h.ping / maxPing) * 100));
                        return (
                          <div
                            key={i}
                            title={`${h.time}: ${h.ping}ms (${h.msg || h.status})`}
                            className={`flex-1 rounded-sm transition-all ${
                              hIsUp ? 'bg-[#00C853] hover:bg-[#69F0AE]' : 'bg-rose-500 hover:bg-rose-400'
                            }`}
                            style={{ height: `${barHeight}%` }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Monitor Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#161B22]/90 backdrop-blur-md p-4">
          <div className="bg-[#1D2430] w-full max-w-md p-6 rounded-2xl border border-[#2A3341] shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#2A3341] pb-3">
              <h2 className="text-lg font-bold text-white">
                {editingMonitor ? 'Edit Telemetry Monitor' : 'Add New Telemetry Monitor'}
              </h2>
              <button
                onClick={() => !submitting && setIsAddModalOpen(false)}
                disabled={submitting}
                className="text-gray-400 hover:text-white text-xs font-semibold p-1 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Service Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Home Server WebApp"
                  className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-[#00C853]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Monitor Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-[#00C853]"
                  >
                    <option value="http">HTTP(s) URL</option>
                    <option value="ping">ICMP Ping</option>
                    <option value="port">TCP Port</option>
                    <option value="dns">DNS Query</option>
                    <option value="keyword">HTTP Keyword</option>
                  </select>
                </div>

                {/* Check Interval Input + Time Unit Selector */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Check Interval
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min="1"
                      required
                      value={intervalVal}
                      onChange={(e) => setIntervalVal(parseInt(e.target.value, 10) || 1)}
                      className="w-20 bg-[#161B22] border border-[#2A3341] rounded-xl py-2 px-2.5 text-white text-sm focus:outline-none focus:border-[#00C853]"
                    />
                    <select
                      value={intervalUnit}
                      onChange={(e) => setIntervalUnit(e.target.value)}
                      className="flex-1 bg-[#161B22] border border-[#2A3341] rounded-xl py-2 px-2 text-white text-sm focus:outline-none focus:border-[#00C853]"
                    >
                      <option value="seconds">Seconds</option>
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Target URL / Hostname
                </label>
                <input
                  type="text"
                  required
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="e.g. https://example.com or 192.168.1.10:8080"
                  className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-[#00C853]"
                />
              </div>

              {formData.type === 'keyword' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Expected Response Keyword
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.keyword}
                    onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                    placeholder="e.g. OK or operational"
                    className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2 px-3 text-white text-sm focus:outline-none focus:border-[#00C853]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2A3341]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-[#2A3341] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-[#00C853] text-[#161B22] font-bold text-xs hover:bg-[#69F0AE] transition-all shadow-lg shadow-[#00C853]/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#161B22]" />
                      {editingMonitor ? 'Saving...' : 'Creating...'}
                    </>
                  ) : (
                    editingMonitor ? 'Save Changes' : 'Create Monitor'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
