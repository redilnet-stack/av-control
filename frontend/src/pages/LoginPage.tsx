import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await login(username, password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    navigate('/', { replace: true });
  }

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Jersey Systems</h1>
          <p className="text-xs text-zinc-500 mt-1">AV Control — sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-md text-sm bg-red-900/30 text-red-300 border border-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Username</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-2.5 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-2.5 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full px-4 py-2.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors"
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  );
}
