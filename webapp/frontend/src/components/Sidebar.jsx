import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Server, Wifi, Settings, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sentinel_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sentinel_sidebar_collapsed', next.toString());
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'containers', label: 'Containers', icon: Server },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside
      className={`bg-[#1D2430] border-r border-[#2A3341] flex flex-col justify-between transition-all duration-300 ease-in-out sticky top-0 h-screen z-40 select-none ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Sidebar Header */}
      <div className="p-3 border-b border-[#2A3341] flex items-center justify-between">
        <div className="flex items-center overflow-hidden">
          <img src="/logo.svg" alt="Homelab Sentinel" className="h-7 w-auto object-contain" />
        </div>

        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-[#2A3341] transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <div className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  collapsed ? 'justify-center' : 'space-x-2.5'
                } ${
                  isActive
                    ? 'bg-[#00C853]/15 text-[#00C853] font-semibold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-[#2A3341]/60'
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#00C853]' : 'text-gray-400 group-hover:text-gray-200'}`} />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </button>

              {/* Collapsed Tooltip */}
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-[#161B22] text-white text-xs font-medium rounded-md border border-[#2A3341] shadow-lg whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer User Section */}
      <div className="p-3 border-t border-[#2A3341] bg-[#161B22]/30">
        {user && (
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between space-x-2'}`}>
            <div className="flex items-center space-x-2 overflow-hidden">
              <div className="w-2 h-2 rounded-full bg-[#69F0AE] animate-pulse flex-shrink-0"></div>
              {!collapsed && (
                <span className="text-xs font-medium text-gray-300 truncate">{user.username}</span>
              )}
            </div>

            <button
              onClick={onLogout}
              title="Sign out"
              className="text-gray-400 hover:text-rose-400 p-1.5 rounded-md hover:bg-[#2A3341] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
