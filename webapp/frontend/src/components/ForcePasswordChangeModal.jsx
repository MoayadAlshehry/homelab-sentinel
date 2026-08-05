import React, { useState } from 'react';
import { User, KeyRound, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
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
          new_username: newUsername,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(parseApiError(data.detail, 'Failed to update credentials'));
      }

      sessionStorage.setItem('justFirstSetup', 'true');
      onCredentialsChanged(newUsername);
      window.location.reload();
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : parseApiError(err, 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#161B22]/90 backdrop-blur-md p-4">
      <div className="bg-[#1D2430] w-full max-w-md p-8 rounded-2xl border border-[#2A3341] shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center">
          <img src="/logo.svg" alt="Homelab Sentinel" className="w-44 h-auto object-contain mb-3" />
          <h2 className="text-xl font-bold text-white tracking-tight">Security Setup Required</h2>
          <p className="text-sm text-gray-400 mt-1">First-time login detected. Replace default credentials to secure your Sentinel console.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              New Admin Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="text"
                required
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              New Password (min 8 chars)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <CheckCircle2 className="w-4 h-4 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00C853] hover:bg-[#69F0AE] text-[#161B22] font-bold py-3 rounded-xl transition-all shadow-lg shadow-[#00C853]/25 flex items-center justify-center gap-2 text-sm disabled:opacity-50 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#161B22]" />
                Securing Account...
              </>
            ) : (
              'Save & Secure Account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
