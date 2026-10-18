import React, { useState, useEffect } from 'react';
import { Server, Play, Square, RotateCw, FileText, Loader2, Copy, Check } from 'lucide-react';
import LogViewerModal from '../components/LogViewerModal';
import DataTable from '../components/ui/DataTable';

export default function ContainersPage({ token, initialFilter = '' }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [bulkLoading, setBulkLoading] = useState(null);
  const [selectedLogsContainer, setSelectedLogsContainer] = useState(null);
  const [copiedImage, setCopiedImage] = useState(null);

  const handleCopyImage = (imgStr, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(imgStr);
    setCopiedImage(imgStr);
    setTimeout(() => setCopiedImage(null), 2000);
  };

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
    const interval = setInterval(fetchContainers, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleContainerAction = async (containerName, action, e) => {
    if (e) e.stopPropagation();
    setActionLoading(prev => ({ ...prev, [`${containerName}-${action}`]: true }));
    try {
      const res = await fetch(`/api/containers/${containerName}/${action}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        await fetchContainers();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(prev => ({ ...prev, [`${containerName}-${action}`]: false }));
    }
  };

  const handleBulkAction = async (action, selectedRows) => {
    if (!selectedRows || selectedRows.length === 0) return;
    setBulkLoading(action);
    let successCount = 0;
    let failCount = 0;

    for (const c of selectedRows) {
      try {
        const res = await fetch(`/api/containers/${c.name}/${action}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch (e) {
        failCount++;
      }
    }

    await fetchContainers();
    setBulkLoading(null);
  };

  const formatContainerMemory = (memMb) => {
    if (!memMb || memMb <= 0) return '0.0 MB';
    if (memMb < 1024) {
      return `${memMb.toFixed(1)} MB`;
    }
    return `${(memMb / 1024).toFixed(2)} GB`;
  };

  const columns = [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
          className="accent-signal-green rounded-sm"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          className="accent-signal-green rounded-sm"
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Container Name',
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center gap-2.5 font-bold text-white">
            <Server className="w-4 h-4 text-signal-green shrink-0" />
            <span>{c.name}</span>
          </div>
        );
      }
    },
    {
      accessorKey: 'state',
      header: 'Status',
      cell: ({ row }) => {
        const state = row.original.state;
        const isRunning = state === 'running';
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
            isRunning 
              ? 'bg-signal-green/15 text-signal-green border border-signal-green/30'
              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-signal-green animate-pulse' : 'bg-rose-500'}`} />
            {state ? state.toUpperCase() : 'UNKNOWN'}
          </span>
        );
      }
    },
    {
      accessorKey: 'image',
      header: 'Image',
      cell: ({ row }) => {
        const img = row.original.image;
        const isCopied = copiedImage === img;
        return (
          <div className="flex items-center gap-2 group/img">
            <span className="font-mono text-gray-400 text-[11px] truncate max-w-[200px]" title={img}>
              {img}
            </span>
            <button
              onClick={(e) => handleCopyImage(img, e)}
              className="p-1 hover:bg-graphite-border text-gray-500 hover:text-white rounded-sm transition-all"
              title={img}
            >
              {isCopied ? <Check className="w-3 h-3 text-signal-green" /> : <Copy className="w-3 h-3" />}
            </button>
            {isCopied && <span className="text-[10px] font-bold text-signal-green">Copied!</span>}
            {row.original.update_available && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-sky-500/20 text-sky-400 border border-sky-500/30 uppercase tracking-wider">
                Update Available
              </span>
            )}
          </div>
        );
      }
    },
    {
      accessorKey: 'memory_mb',
      header: 'Memory Usage',
      cell: ({ row }) => {
        const memMb = row.original.memory_mb || 0;
        return (
          <span className="font-bold text-gray-200">
            {formatContainerMemory(memMb)}
          </span>
        );
      }
    },
    {
      accessorKey: 'status',
      header: 'Uptime',
      cell: ({ row }) => <span className="text-gray-400 text-xs">{row.original.status}</span>
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const c = row.original;
        const isRunning = c.state === 'running';
        return (
          <div className="flex items-center space-x-1.5">
            <button
              onClick={(e) => handleContainerAction(c.name, isRunning ? 'stop' : 'start', e)}
              disabled={actionLoading[`${c.name}-start`] || actionLoading[`${c.name}-stop`]}
              className={`p-1.5 rounded-lg font-bold text-xs transition-colors ${
                isRunning 
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20' 
                  : 'bg-signal-green/10 hover:bg-signal-green/20 text-signal-green border border-signal-green/20'
              }`}
              title={isRunning ? "Stop Container" : "Start Container"}
            >
              {actionLoading[`${c.name}-start`] || actionLoading[`${c.name}-stop`] ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRunning ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              onClick={(e) => handleContainerAction(c.name, 'restart', e)}
              disabled={actionLoading[`${c.name}-restart`]}
              className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-lg transition-colors"
              title="Restart Container"
            >
              {actionLoading[`${c.name}-restart`] ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <RotateCw className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedLogsContainer(c.name);
              }}
              className="p-1.5 bg-graphite-border hover:bg-sky-500/20 hover:text-sky-400 text-gray-300 rounded-lg transition-colors"
              title="View Container Logs"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }
    }
  ];

  const runningCount = containers.filter(c => c.state === 'running').length;
  const stoppedCount = containers.length - runningCount;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <Server className="w-5 h-5 text-signal-green" />
            Docker Container Management
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-graphite-surface border border-graphite-border text-gray-300 flex items-center gap-1.5">
              <span className="text-signal-green">{runningCount} Running</span>
              <span>/</span>
              <span className="text-rose-400">{stoppedCount} Stopped</span>
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">Live status, resource metrics, and control operations for all Docker containers.</p>
        </div>

        <button
          onClick={fetchContainers}
          className="px-4 py-2 bg-graphite-border hover:bg-[#374151] text-gray-200 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 border border-[#374151]"
        >
          <RotateCw className="w-3.5 h-3.5 text-signal-green" />
          Refresh Containers
        </button>
      </div>

      {(Object.values(actionLoading).some(Boolean) || !!bulkLoading) && (
        <div className="w-full bg-graphite h-1 rounded-full overflow-hidden border border-graphite-border">
          <div className="bg-signal-green h-full w-full animate-pulse" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-signal-green" />
        </div>
      ) : (
        <DataTable
          data={containers}
          columns={columns}
          initialSearch={initialFilter}
          searchPlaceholder="Search container name, status, image..."
          bulkActions={(selectedRows) => (
            <div className="flex items-center gap-1.5 bg-graphite p-1 rounded-xl border border-graphite-border">
              <button
                disabled={!!bulkLoading}
                onClick={() => handleBulkAction('start', selectedRows)}
                className="px-2.5 py-1 bg-signal-green/20 hover:bg-signal-green/30 text-signal-green border border-signal-green/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
              >
                {bulkLoading === 'start' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                Start Selected
              </button>
              <button
                disabled={!!bulkLoading}
                onClick={() => handleBulkAction('stop', selectedRows)}
                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
              >
                {bulkLoading === 'stop' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                Stop Selected
              </button>
              <button
                disabled={!!bulkLoading}
                onClick={() => handleBulkAction('restart', selectedRows)}
                className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
              >
                {bulkLoading === 'restart' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                Restart Selected
              </button>
            </div>
          )}
        />
      )}

      {/* Log Viewer Modal */}
      {selectedLogsContainer && (
        <LogViewerModal
          token={token}
          containerName={selectedLogsContainer}
          onClose={() => setSelectedLogsContainer(null)}
        />
      )}
    </div>
  );
}
