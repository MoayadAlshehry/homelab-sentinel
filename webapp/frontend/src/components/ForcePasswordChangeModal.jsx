import React, { useState } from 'react';
import { Lock, AlertTriangle, CheckCircle } from 'lucide-react';
import { parseApiError } from '../utils/formatError';

export default function ForcePasswordChangeModal({ token, onCredentialsChanged }) {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newUsername.trim().length < 3) {
      setError('Username must be between 3 and 30 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          new_username: newUsername.trim(),
          new_password: newPassword
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errorMsg = parseApiError(data.detail, 'Failed to update credentials');
        throw new Error(errorMsg);
      }

      onCredentialsChanged(newUsername.trim());
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : parseApiError(err, 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="glass-card w-full max-w-md p-8 rounded-2xl border border-yellow-500/30 shadow-2xl">
        <div className="flex items-center gap-3 mb-6 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20 text-yellow-400">
          <AlertTriangle className="w-6 h-6 flex-shrink-0" />
          <div className="text-xs">
            <p className="font-bold">First-Login Setup Required</p>
            <p className="text-gray-400">You must configure your permanent credentials to continue.</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              New Permanent Username
            </label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={30}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="sentinel_admin"
              className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
            />
            <p className="text-[11px] text-gray-500 mt-1">Username: 3–30 characters</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              New Strong Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
            />
            <p className="text-[11px] text-gray-500 mt-1">Password: minimum 8 characters</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-gray-900/80 border border-gray-700/80 rounded-xl py-2.5 px-4 text-white text-sm focus:outline-none focus:border-yellow-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold py-3 rounded-xl transition-all shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? 'Updating Credentials...' : 'Save & Secure Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
