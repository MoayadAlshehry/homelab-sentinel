import React, { useState, useEffect } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from './components/ui/sidebar';
import { AppSidebar } from './components/app-sidebar';
import LoginModal from './components/LoginModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import DashboardPage from './pages/DashboardPage';
import ContainersPage from './pages/ContainersPage';
import NetworkPage from './pages/NetworkPage';
import MonitoringPage from './pages/MonitoringPage';
import SettingsPage from './pages/SettingsPage';
import CommandPalette from './components/CommandPalette';
import { Search, Sun, Moon } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('sentinel_jwt_token') || '');
  const [user, setUser] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [isCmdKOpen, setIsCmdKOpen] = useState(false);
  const [containersInitialFilter, setContainersInitialFilter] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('sentinel_theme') || 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('sentinel_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    if (sessionStorage.getItem('justFirstSetup') === 'true') {
      sessionStorage.removeItem('justFirstSetup');
    }
  }, []);

  const fetchCurrentUser = async (jwtToken) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setMustChangePassword(data.must_change_password);
      } else {
        handleLogout();
      }
    } catch (e) {
      handleLogout();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const handleLoginSuccess = (data) => {
    const jwtToken = data.access_token;
    localStorage.setItem('sentinel_jwt_token', jwtToken);
    setToken(jwtToken);
    setUser({ username: data.username, must_change_password: data.must_change_password });
    setMustChangePassword(data.must_change_password);
  };

  const handleLogout = () => {
    localStorage.removeItem('sentinel_jwt_token');
    setToken('');
    setUser(null);
    setMustChangePassword(false);
  };

  const handleNavigate = (tab, filter = '') => {
    setActiveTab(tab);
    if (filter) {
      setContainersInitialFilter(filter);
    } else {
      setContainersInitialFilter('');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdKOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#161B22] flex items-center justify-center text-gray-300">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-[#00C853] border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Initializing Homelab Sentinel...</span>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  if (mustChangePassword) {
    return (
      <ForcePasswordChangeModal
        token={token}
        onCredentialsChanged={(newUsername) => {
          setMustChangePassword(false);
          setUser(prev => ({ ...prev, username: newUsername, must_change_password: false }));
        }}
      />
    );
  }

  return (
    <SidebarProvider>
      <CommandPalette
        isOpen={isCmdKOpen}
        onClose={() => setIsCmdKOpen(false)}
        onNavigate={(tab) => handleNavigate(tab)}
        token={token}
      />
      <AppSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <SidebarInset>
        {/* App Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#2A3341] px-4 transition-[width,height] ease-linear bg-[#161B22]/90 backdrop-blur-md sticky top-0 z-30 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs min-w-0 overflow-hidden">
            <SidebarTrigger className="-ml-1 flex-shrink-0" />
            <div className="h-4 w-[1px] bg-[#2A3341] mx-0.5 sm:mx-1 flex-shrink-0" />
            <span className="text-gray-400 font-medium truncate hidden xs:inline">Homelab Sentinel</span>
            <span className="text-gray-600 hidden xs:inline">/</span>
            <span className="text-[#00C853] font-semibold capitalize truncate">{activeTab}</span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setIsCmdKOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 bg-[#1D2430] hover:bg-[#2A3341] text-gray-400 hover:text-white border border-[#2A3341] rounded-xl text-xs transition-all shadow-sm min-h-[36px]"
            >
              <Search className="w-3.5 h-3.5 text-[#00C853]" />
              <span className="hidden sm:inline font-medium">Search...</span>
              <kbd className="px-1.5 py-0.5 bg-[#161B22] text-[10px] text-gray-400 border border-[#2A3341] rounded font-mono">⌘K</kbd>
            </button>
          </div>
        </header>

        {/* Main Content Area inside SidebarInset */}
        <div className="flex-1 p-3.5 sm:p-6 max-w-7xl w-full mx-auto min-w-0">
          {activeTab === 'dashboard' && <DashboardPage token={token} onNavigate={handleNavigate} />}
          {activeTab === 'containers' && <ContainersPage token={token} initialFilter={containersInitialFilter} />}
          {activeTab === 'network' && <NetworkPage token={token} />}
          {activeTab === 'monitoring' && <MonitoringPage token={token} />}
          {activeTab === 'settings' && <SettingsPage token={token} />}
        </div>

        <footer className="border-t border-[#2A3341] py-4 px-6 text-center text-xs text-gray-400 bg-[#1D2430]/40 flex items-center justify-center gap-2">
          <span>Homelab Sentinel v1.0</span>
          <span>•</span>
          <a
            href="https://github.com/MoayadAlshehry"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00C853] hover:underline font-medium transition-colors"
          >
            GitHub
          </a>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
