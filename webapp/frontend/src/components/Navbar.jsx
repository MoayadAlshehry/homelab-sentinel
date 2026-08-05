import React from 'react';
import { Shield, LayoutDashboard, Server, Wifi, Settings, LogOut } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, user, onLogout }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'containers', label: 'Containers', icon: Server },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="bg-[#1D2430] sticky top-0 z-40 border-b border-[#2A3341] px-6 py-3 shadow-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-[#00C853]/10 rounded-xl border border-[#00C853]/30 text-[#00C853]">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-wide flex items-center gap-2">
              Homelab Sentinel
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#00C853]/10 text-[#00C853] border border-[#00C853]/20 font-medium">
                Pi 5 Active
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#00C853] text-[#161B22] shadow-lg shadow-[#00C853]/30'
                    : 'text-gray-300 hover:text-white hover:bg-[#2A3341]/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-4">
          {user && (
            <div className="flex items-center space-x-3 bg-[#161B22] px-3 py-1.5 rounded-xl border border-[#2A3341]">
              <div className="w-2 h-2 rounded-full bg-[#69F0AE] animate-pulse"></div>
              <span className="text-sm font-medium text-gray-200">{user.username}</span>
              <button
                onClick={onLogout}
                title="Sign out"
                className="text-gray-400 hover:text-red-400 p-1 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
