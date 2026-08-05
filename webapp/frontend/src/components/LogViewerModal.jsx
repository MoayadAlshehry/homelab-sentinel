import React, { useState, useEffect } from 'react';
import { Terminal, X, RefreshCw } from 'lucide-react';

export default function LogViewerModal({ containerName, token, onClose }) {
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/containers/${containerName}/logs?tail=200`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || 'No recent log output.');
      } else {
        setLogs(`Error fetching logs: ${data.detail || 'Unknown error'}`);
      }
    } catch (e) {
      setLogs(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [containerName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-card w-full max-w-4xl h-[80vh] flex flex-col rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between bg-gray-900/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Container Logs: {containerName}</h3>
              <p className="text-xs text-gray-400">Tail: last 200 lines</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 bg-[#060911] overflow-y-auto font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap select-text">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading container logs...
            </div>
          ) : (
            logs
          )}
        </div>
      </div>
    </div>
  );
}
