import React, { useState } from 'react';
import { User, KeyRound, AlertCircle, Loader2 } from 'lucide-react';
import { parseApiError } from '../utils/formatError';

export default function LoginModal({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(parseApiError(data.detail, 'Invalid username or password'));
      }

      onLoginSuccess(data);
    } catch (err) {
      setError(typeof err.message === 'string' ? err.message : parseApiError(err, 'An unexpected error occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#161B22]/90 backdrop-blur-md p-4">
      <div className="bg-[#1D2430] w-full max-w-md p-8 rounded-2xl border border-[#2A3341] shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <img src="/logo.svg" alt="Homelab Sentinel" className="w-48 h-auto object-contain mb-3" />
          <p className="text-sm text-gray-400">Protected Sentinel Console</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Username
            </label>
            <div className="relative">
              <User className="w-5 h-5 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 absolute left-3.5 top-3 text-gray-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#161B22] border border-[#2A3341] rounded-xl py-2.5 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-[#00C853] focus:ring-1 focus:ring-[#69F0AE] transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00C853] hover:bg-[#69F0AE] text-[#161B22] font-bold py-3 rounded-xl transition-all shadow-lg shadow-[#00C853]/25 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[#161B22]" />
                Signing in...
              </>
            ) : (
              'Sign In to Console'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
