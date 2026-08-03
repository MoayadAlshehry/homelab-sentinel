import React, { useState, useEffect } from 'react';
import { Settings, Bell, Send, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage({ token }) {
  const [settings, setSettings] = useState({
    telegram_bot_token_masked: '',
    telegram_chat_id: '',
    discord_webhook_url_masked: ''
  });

  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setTelegramChatId(data.telegram_chat_id || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const body = {};
      if (telegramToken) body.telegram_bot_token = telegramToken;
      if (telegramChatId) body.telegram_chat_id = telegramChatId;
      if (discordWebhookUrl) body.discord_webhook_url = discordWebhookUrl;

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setTelegramToken('');
        setDiscordWebhookUrl('');
        fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to update settings' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotification = async (channel) => {
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch(`/api/settings/test-${channel}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
      } else {
        setMessage({ type: 'error', text: data.detail || `Failed to send ${channel} test message` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const handleChangeCredentials = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          new_username: newUsername,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'Account credentials updated successfully!' });
        setNewUsername('');
        setNewPassword('');
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to change credentials' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-400" />
          Settings & Multi-Channel Alert Configuration
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Configure real-time Telegram and Discord alert delivery channels, and manage security credentials.
        </p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm ${
          message.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Alert Channels Card */}
      <div className="glass-card p-6 rounded-2xl border border-gray-800 space-y-6">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
          <Bell className="w-4 h-4 text-emerald-400" />
          Notification Dispatch Channels
        </h3>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Telegram Settings */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wider">Telegram Bot Integration</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Telegram Bot Token {settings.telegram_bot_token_masked && <span className="text-xs text-gray-500">({settings.telegram_bot_token_masked})</span>}
                </label>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjkl..."
                  className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2 px-3.5 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Telegram Chat ID</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="987654321"
                  className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2 px-3.5 text-white text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Discord Settings */}
          <div className="space-y-4 pt-2">
            <h4 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Discord Webhook Integration</h4>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Discord Webhook URL {settings.discord_webhook_url_masked && <span className="text-xs text-gray-500">({settings.discord_webhook_url_masked})</span>}
              </label>
              <input
                type="password"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2 px-3.5 text-white text-xs focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-800">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl text-xs transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50"
            >
              Save Notification Settings
            </button>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => handleTestNotification('telegram')}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-blue-400 border border-gray-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Test Telegram
              </button>

              <button
                type="button"
                onClick={() => handleTestNotification('discord')}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-indigo-400 border border-gray-700 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Test Discord
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Change Password Card */}
      <div className="glass-card p-6 rounded-2xl border border-gray-800 space-y-4">
        <h3 className="text-base font-semibold text-white flex items-center gap-2 border-b border-gray-800 pb-3">
          <Lock className="w-4 h-4 text-yellow-400" />
          Update Account Credentials
        </h3>

        <form onSubmit={handleChangeCredentials} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">New Username</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="sentinel_admin"
                className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2 px-3.5 text-white text-xs focus:outline-none focus:border-yellow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2 px-3.5 text-white text-xs focus:outline-none focus:border-yellow-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-xl text-xs transition-colors shadow-lg shadow-yellow-500/20 disabled:opacity-50"
          >
            Update Credentials
          </button>
        </form>
      </div>
    </div>
  );
}
