import React, { useState, useEffect, useRef } from 'react';
import { Search, LayoutDashboard, Server, Activity, Network, Settings, Bell, X, ArrowRight } from 'lucide-react';

export default function CommandPalette({ isOpen, onClose, onNavigate, token }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [items, setItems] = useState([]);
  const inputRef = useRef(null);

  const pages = [
    { type: 'page', id: 'dashboard', title: 'Go to Dashboard', icon: LayoutDashboard, category: 'Navigation' },
    { type: 'page', id: 'containers', title: 'Go to Containers', icon: Server, category: 'Navigation' },
    { type: 'page', id: 'monitoring', title: 'Go to Monitoring', icon: Activity, category: 'Navigation' },
    { type: 'page', id: 'network', title: 'Go to Network Devices', icon: Network, category: 'Navigation' },
    { type: 'page', id: 'settings', title: 'Go to Settings', icon: Settings, category: 'Navigation' },
    { type: 'page', id: 'notifications', title: 'Go to Notification Logs', icon: Bell, category: 'Navigation' },
  ];

  const [dynamicItems, setDynamicItems] = useState([]);

  useEffect(() => {
    if (!isOpen) return;

    // Focus input on open
    setTimeout(() => inputRef.current?.focus(), 50);

    // Fetch containers, monitors, network devices for quick search
    const fetchSearchData = async () => {
      const results = [];
      try {
        const [cRes, mRes, nRes] = await Promise.allSettled([
          fetch('/api/containers', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/monitoring/services', { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch('/api/network/devices', { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        if (cRes.status === 'fulfilled' && cRes.value.ok) {
          const containers = await cRes.value.json();
          containers.forEach(c => {
            results.push({
              type: 'container',
              id: 'containers',
              title: `Container: ${c.name}`,
              subtitle: `State: ${c.state} • Image: ${c.image}`,
              icon: Server,
              category: 'Containers'
            });
          });
        }

        if (mRes.status === 'fulfilled' && mRes.value.ok) {
          const monitors = await mRes.value.json();
          monitors.forEach(m => {
            results.push({
              type: 'monitor',
              id: 'monitoring',
              title: `Monitor: ${m.name}`,
              subtitle: `Status: ${m.status || 'unknown'} • ${m.url || m.hostname}`,
              icon: Activity,
              category: 'Monitoring'
            });
          });
        }

        if (nRes.status === 'fulfilled' && nRes.value.ok) {
          const devices = await nRes.value.json();
          devices.forEach(d => {
            results.push({
              type: 'device',
              id: 'network',
              title: `Device: ${d.ip}`,
              subtitle: `Vendor: ${d.vendor || 'Unknown'} • MAC: ${d.mac}`,
              icon: Network,
              category: 'Network'
            });
          });
        }

        setDynamicItems(results);
      } catch (e) {
        console.error(e);
      }
    };

    fetchSearchData();
  }, [isOpen, token]);

  const allItems = [...pages, ...dynamicItems];

  const filteredItems = allItems.filter(item => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (item) => {
    if (!item) return;
    onNavigate(item.id);
    onClose();
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1D2430] border border-[#2A3341] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-[#2A3341] bg-[#161B22]/60">
          <Search className="w-5 h-5 text-[#00C853] mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command, page, container, monitor, or IP address..."
            className="w-full py-4 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors ml-2"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">
              No matching commands or resources found for "{query}".
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.type}-${item.id}-${idx}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all text-xs ${
                    isSelected
                      ? 'bg-[#00C853]/15 text-white border border-[#00C853]/30'
                      : 'hover:bg-[#2A3341]/60 text-gray-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      isSelected ? 'bg-[#00C853] text-[#161B22]' : 'bg-[#2A3341] text-gray-300'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="truncate">
                      <div className="font-bold truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-[11px] text-gray-400 truncate">{item.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#161B22] border border-[#2A3341] text-gray-400 uppercase tracking-wider">
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-[#00C853]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[#161B22] border-t border-[#2A3341] flex items-center justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-[#2A3341] text-gray-300 rounded text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 bg-[#2A3341] text-gray-300 rounded text-[10px]">↓</kbd> to navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-[#2A3341] text-gray-300 rounded text-[10px]">↵</kbd> to select</span>
            <span><kbd className="px-1.5 py-0.5 bg-[#2A3341] text-gray-300 rounded text-[10px]">esc</kbd> to close</span>
          </div>
          <span className="font-mono text-[#00C853]">Homelab Sentinel</span>
        </div>
      </div>
    </div>
  );
}
