import React, { useState, useEffect } from 'react';
import { Settings, Bell, Send, Lock, CheckCircle2, AlertCircle, Loader2, Sliders, Moon } from 'lucide-react';
import { parseApiError } from '../utils/formatError';

export default function SettingsPage({ token }) {
  const [settings, setSettings] = useState({
    telegram_bot_token_masked: '',
    telegram_chat_id: '',
    discord_webhook_url_masked: '',
    notification_level: 'minimum'
  });

  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [notificationLevel, setNotificationLevel] = useState('minimum');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [message, setMessage] = useState({ type: '', text: '' });
  const [saveLoading, setSaveLoading] = useState(false);
  const [credLoading, setCredLoading] = useState(false);
  const [testingChannel, setTestingChannel] = useState(null);
  const [notifHistory, setNotifHistory] = useState([]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/settings/notifications/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifHistory(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setTelegramChatId(data.telegram_chat_id || '');
        setNotificationLevel(data.notification_level || 'minimum');
        setQuietHoursEnabled(data.quiet_hours_enabled || false);
        setQuietHoursStart(data.quiet_hours_start || '22:00');
        setQuietHoursEnd(data.quiet_hours_end || '07:00');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, [token]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaveLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const body = {
        notification_level: notificationLevel,
        quiet_hours_enabled: quietHoursEnabled,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd
      };
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
        setMessage({ type: 'error', text: parseApiError(data.detail, 'Failed to update settings') });
      }
    } catch (e) {
      setMessage({ type: 'error', text: parseApiError(e, 'An unexpected error occurred') });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleTestNotification = async (channel) => {
    setTestingChannel(channel);
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
        setMessage({ type: 'error', text: parseApiError(data.detail, `Failed to send ${channel} test message`) });
      }
    } catch (e) {
      setMessage({ type: 'error', text: parseApiError(e, 'An unexpected error occurred') });
    } finally {
      setTestingChannel(null);
    }
  };

  const handleChangeCredentials = async (e) => {
    e.preventDefault();
    setCredLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const body = {
        current_password: currentPassword || undefined,
        new_username: newUsername,
        new_password: newPassword
      };

      const res = await fetch('/api/auth/change-credentials', {
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
        setCurrentPassword('');
        setNewUsername('');
        setNewPassword('');
      } else {
        setMessage({ type: 'error', text: parseApiError(data.detail, 'Failed to change credentials') });
      }
    } catch (e) {
      setMessage({ type: 'error', text: parseApiError(e, 'An unexpected error occurred') });
    } finally {
      setCredLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#00C853]" />
          System Settings & Alert Integrations
        </h2>
        <p className="text-sm text-gray-400 mt-1">Configure Telegram/Discord alert webhooks, notification levels, and admin credentials.</p>
      </div>

      {message.text && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 text-sm font-medium ${
          message.type === 'success'
            ? 'bg-[#00C853]/10 border-[#00C853]/30 text-[#00C853]'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Alert Webhooks & Notification Level Form */}
      <div className="bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] shadow-xl space-y-6">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#00C853]" />
          Alert Channels Configuration
        </h3>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* 3-Tier Notification Level Selector */}
          <div className="space-y-3 p-4 bg-[#161B22] rounded-xl border border-[#2A3341]">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#00C853]" />
              Notification Level (Verbosity Filter)
            </label>
            <p className="text-xs text-gray-400">
              Control which system events trigger external Discord & Telegram alerts.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col ${
                notificationLevel === 'all' 
                  ? 'bg-[#00C853]/15 border-[#00C853] text-white shadow-md shadow-[#00C853]/10' 
                  : 'bg-[#1D2430] border-[#2A3341] text-gray-400 hover:border-gray-500'
              }`}>
                <div className="flex items-center gap-2 font-bold text-xs">
                  <input
                    type="radio"
                    name="notif_level"
                    value="all"
                    checked={notificationLevel === 'all'}
                    onChange={() => setNotificationLevel('all')}
                    className="accent-[#00C853]"
                  />
                  All Events
                </div>
                <span className="text-[11px] text-gray-400 mt-1">
                  Alert on every event (monitors, network joins, container starts/stops).
                </span>
              </label>

              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col ${
                notificationLevel === 'minimum' 
                  ? 'bg-[#00C853]/15 border-[#00C853] text-white shadow-md shadow-[#00C853]/10' 
                  : 'bg-[#1D2430] border-[#2A3341] text-gray-400 hover:border-gray-500'
              }`}>
                <div className="flex items-center gap-2 font-bold text-xs">
                  <input
                    type="radio"
                    name="notif_level"
                    value="minimum"
                    checked={notificationLevel === 'minimum'}
                    onChange={() => setNotificationLevel('minimum')}
                    className="accent-[#00C853]"
                  />
                  Minimum (Default)
                </div>
                <span className="text-[11px] text-gray-400 mt-1">
                  Alert ONLY on critical incidents (service DOWN, container crashes, temp &gt;75°C).
                </span>
              </label>

              <label className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col ${
                notificationLevel === 'off' 
                  ? 'bg-rose-500/15 border-rose-500 text-white shadow-md shadow-rose-500/10' 
                  : 'bg-[#1D2430] border-[#2A3341] text-gray-400 hover:border-gray-500'
              }`}>
                <div className="flex items-center gap-2 font-bold text-xs">
                  <input
                    type="radio"
                    name="notif_level"
                    value="off"
                    checked={notificationLevel === 'off'}
                    onChange={() => setNotificationLevel('off')}
                    className="accent-rose-500"
                  />
                  Off (Mute All)
                </div>
                <span className="text-[11px] text-gray-400 mt-1">
                  Disable all outgoing webhook messages (internal feed still logs events).
                </span>
              </label>
            </div>
          </div>

          {/* Quiet Hours Schedule Block */}
          <div className="space-y-3 p-4 bg-[#161B22] rounded-xl border border-[#2A3341]">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                  <Moon className="w-4 h-4 text-sky-400" />
                  Quiet Hours Schedule (Overnight Alert Suppression)
                </label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Suppress external webhooks overnight while continuing internal event logging.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={quietHoursEnabled}
                  onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[#2A3341] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00C853]"></div>
              </label>
            </div>

            {quietHoursEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#2A3341]">
                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">Start Time (Local)</label>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="w-full bg-[#1D2430] border border-[#2A3341] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#00C853]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-300 mb-1">End Time (Local)</label>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="w-full bg-[#1D2430] border border-[#2A3341] rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#00C853]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Telegram Bot Integration</h4>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Telegram Bot Token {settings.telegram_bot_token_masked && <span className="text-[#00C853] text-[11px]">(Configured: {settings.telegram_bot_token_masked})</span>}
              </label>
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="Leave blank to keep existing token..."
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Telegram Chat ID</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 987654321"
                  className="flex-1 bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
                />
                <button
                  type="button"
                  disabled={testingChannel === 'telegram'}
                  onClick={() => handleTestNotification('telegram')}
                  className="px-4 py-2.5 bg-[#2A3341] hover:bg-[#374151] text-gray-200 border border-[#374151] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {testingChannel === 'telegram' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00C853]" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {testingChannel === 'telegram' ? 'Testing...' : 'Test Telegram'}
                </button>
              </div>
            </div>
          </div>

          <hr className="border-[#2A3341]" />

          <div className="space-y-4">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Discord Webhook Integration</h4>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Webhook URL {settings.discord_webhook_url_masked && <span className="text-[#00C853] text-[11px]">(Configured: {settings.discord_webhook_url_masked})</span>}
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                  placeholder="e.g. https://discord.com/api/webhooks/..."
                  className="flex-1 bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
                />
                <button
                  type="button"
                  disabled={testingChannel === 'discord'}
                  onClick={() => handleTestNotification('discord')}
                  className="px-4 py-2.5 bg-[#2A3341] hover:bg-[#374151] text-gray-200 border border-[#374151] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {testingChannel === 'discord' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#00C853]" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {testingChannel === 'discord' ? 'Testing...' : 'Test Discord'}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saveLoading}
            className="px-6 py-2.5 bg-[#00C853] hover:bg-[#69F0AE] text-[#161B22] font-bold rounded-xl transition-all shadow-lg shadow-[#00C853]/25 text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saveLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#161B22]" />
                Saving...
              </>
            ) : (
              'Save Channel Integrations'
            )}
          </button>
        </form>
      </div>

      {/* Change Credentials Form */}
      <div className="bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] shadow-xl">
        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <Lock className="w-5 h-5 text-[#00C853]" />
          Admin Credentials Management
        </h3>

        <form onSubmit={handleChangeCredentials} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Required to confirm identity..."
              className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">New Username</label>
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">New Password (min 8 chars)</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={credLoading}
            className="px-6 py-2.5 bg-[#00C853] hover:bg-[#69F0AE] text-[#161B22] font-bold rounded-xl transition-all shadow-lg shadow-[#00C853]/25 text-sm flex items-center gap-2 disabled:opacity-50 mt-2"
          >
            {credLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#161B22]" />
                Updating Credentials...
              </>
            ) : (
              'Update Admin Credentials'
            )}
          </button>
        </form>
      </div>

      {/* Notification History Log Card */}
      <div className="bg-[#1D2430] p-6 rounded-2xl border border-[#2A3341] shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#00C853]" />
            Notification History Log
          </h2>
          <button
            onClick={fetchHistory}
            className="text-xs text-[#00C853] hover:underline font-medium"
          >
            Refresh Log
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2A3341] text-gray-400 font-semibold uppercase tracking-wider">
                <th className="pb-3 px-3">Timestamp</th>
                <th className="pb-3 px-3">Title</th>
                <th className="pb-3 px-3">Channel</th>
                <th className="pb-3 px-3">Severity</th>
                <th className="pb-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2A3341]/60">
              {notifHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    No notification history recorded yet.
                  </td>
                </tr>
              ) : (
                notifHistory.map((item) => (
                  <tr key={item.id} className="hover:bg-[#161B22]/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-gray-400">{item.timestamp}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{item.title}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-medium">{item.channel}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        item.severity === 'critical' 
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {item.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        item.status === 'SENT' 
                          ? 'bg-[#00C853]/20 text-[#00C853] border border-[#00C853]/30' 
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
