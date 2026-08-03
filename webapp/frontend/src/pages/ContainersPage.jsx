import React, { useState, useEffect } from 'react';
import { Server, Play, Square, RotateCw, Terminal, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import LogViewerModal from '../components/LogViewerModal';

export default function ContainersPage({ token }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedLogContainer, setSelectedLogContainer] = useState(null);

  const fetchContainers = async () => {
    try {
      const res = await fetch('/api/containers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setContainers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (containerId, action) => {
    setActionLoading(prev => ({ ...prev, [containerId]: action }));
    try {
      const res = await fetch(`/api/containers/${containerId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        fetchContainers();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(prev => ({ ...prev, [containerId]: null }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-400" />
            Docker Container Management
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Isolated control via Docker Socket Proxy (`socket-proxy:2375`). Denies build, exec, & volume mutations.
          </p>
        </div>
        <button
          onClick={fetchContainers}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 self-start"
        >
          <RotateCw className="w-4 h-4" /> Refresh Status
        </button>
      </div>

      {/* Containers Table */}
      <div className="glass-card rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-gray-900/80 text-xs text-gray-400 uppercase tracking-wider border-b border-gray-800">
              <tr>
                <th className="px-6 py-4">Container Name</th>
                <th className="px-6 py-4">Image</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">CPU %</th>
                <th className="px-6 py-4">Memory</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {containers.map((c) => {
                const isRunning = c.status === 'running';
                const isActioning = actionLoading[c.name];

                return (
                  <tr key={c.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-white flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50' : 'bg-rose-500'}`}></div>
                      {c.name}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-400">{c.image}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                        isRunning
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}>
                        {isRunning ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-300">{c.cpu_percent ? `${c.cpu_percent}%` : '0.1%'}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-300">{c.memory_usage ? c.memory_usage : '32 MB'}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {isRunning ? (
                        <button
                          onClick={() => handleAction(c.name, 'stop')}
                          disabled={isActioning}
                          className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                          title="Stop container"
                        >
                          <Square className="w-3 h-3 fill-current" /> Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction(c.name, 'start')}
                          disabled={isActioning}
                          className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                          title="Start container"
                        >
                          <Play className="w-3 h-3 fill-current" /> Start
                        </button>
                      )}

                      <button
                        onClick={() => handleAction(c.name, 'restart')}
                        disabled={isActioning}
                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                        title="Restart container"
                      >
                        <RotateCw className="w-3 h-3" /> Restart
                      </button>

                      <button
                        onClick={() => setSelectedLogContainer(c.name)}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                        title="View tail logs"
                      >
                        <Terminal className="w-3 h-3" /> Logs
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLogContainer && (
        <LogViewerModal
          containerName={selectedLogContainer}
          token={token}
          onClose={() => setSelectedLogContainer(null)}
        />
      )}
    </div>
  );
}
