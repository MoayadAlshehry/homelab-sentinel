import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginModal from './components/LoginModal';
import ForcePasswordChangeModal from './components/ForcePasswordChangeModal';
import DashboardPage from './pages/DashboardPage';
import ContainersPage from './pages/ContainersPage';
import NetworkPage from './pages/NetworkPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('sentinel_jwt_token') || '');
  const [user, setUser] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-gray-400">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
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
    <div className="min-h-screen bg-[#090d16] text-gray-100 flex flex-col">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
        {activeTab === 'dashboard' && <DashboardPage token={token} />}
        {activeTab === 'containers' && <ContainersPage token={token} />}
        {activeTab === 'network' && <NetworkPage token={token} />}
        {activeTab === 'settings' && <SettingsPage token={token} />}
      </main>

      <footer className="border-t border-gray-800/80 py-4 px-6 text-center text-xs text-gray-500 bg-gray-950/40">
        Homelab Sentinel v1.0 • Protected Console • Raspberry Pi 5 Deployment
      </footer>
    </div>
  );
}
