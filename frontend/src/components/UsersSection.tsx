import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth, type AuthUser } from '../auth/AuthContext.js';

export function UsersSection() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator'>('operator');
  const [busy, setBusy] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      } else {
        setMessage({ ok: false, text: 'Failed to load users' });
      }
    } catch {
      setMessage({ ok: false, text: 'Network error loading users' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => [...prev, data.user]);
        setNewUsername('');
        setNewPassword('');
        setNewRole('operator');
        setMessage({ ok: true, text: `User "${data.user.username}" created` });
      } else {
        setMessage({ ok: false, text: data.error ?? 'Failed to create user' });
      }
    } catch {
      setMessage({ ok: false, text: 'Network error creating user' });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, role: 'admin' | 'operator') {
    setMessage(null);
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
      } else {
        setMessage({ ok: false, text: data.error ?? 'Failed to update role' });
      }
    } catch {
      setMessage({ ok: false, text: 'Network error updating role' });
    }
  }

  async function savePassword(userId: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)));
        setPasswordTarget(null);
        setResetPassword('');
        setMessage({ ok: true, text: 'Password updated' });
      } else {
        setMessage({ ok: false, text: data.error ?? 'Failed to update password' });
      }
    } catch {
      setMessage({ ok: false, text: 'Network error updating password' });
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(userId: string, username: string) {
    if (!window.confirm(`Delete user "${username}"?`)) return;
    setMessage(null);
    try {
      const res = await fetch(`/api/auth/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
        setMessage({ ok: true, text: `User "${username}" deleted` });
      } else {
        setMessage({ ok: false, text: data.error ?? 'Failed to delete user' });
      }
    } catch {
      setMessage({ ok: false, text: 'Network error deleting user' });
    }
  }

  if (loading) {
    return <div className="text-center text-xs text-zinc-500 py-6">Loading users...</div>;
  }

  return (
    <fieldset className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <legend className="text-sm font-semibold text-zinc-300 px-1.5">User Accounts</legend>
      <p className="text-[11px] text-zinc-600 mb-3">
        Admins can change settings and manage accounts. Operators can control devices.
      </p>

      {message && (
        <div
          className={`mb-3 px-3 py-2 rounded-md text-sm ${
            message.ok
              ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800'
              : 'bg-red-900/30 text-red-300 border border-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={addUser} className="mb-4 rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 space-y-2">
        <span className="text-xs font-medium text-zinc-400">Add User</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Username"
            autoComplete="off"
            className="flex-1 px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password (min 6 chars)"
            autoComplete="new-password"
            className="flex-1 px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as 'admin' | 'operator')}
            className="px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 focus:outline-none focus:border-emerald-600"
          >
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={busy || !newUsername || newPassword.length < 6}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors"
          >
            {busy ? '...' : 'Add'}
          </button>
        </div>
      </form>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="rounded-lg bg-zinc-800/40 border border-zinc-700/50 p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-medium text-zinc-200">{u.username}</span>
                {currentUser?.id === u.id && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-300">
                    you
                  </span>
                )}
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                    u.role === 'admin'
                      ? 'bg-emerald-900/40 text-emerald-300'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {u.role}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={u.role}
                  disabled={currentUser?.id === u.id}
                  onChange={(e) => void changeRole(u.id, e.target.value as 'admin' | 'operator')}
                  className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-emerald-600"
                >
                  <option value="operator">Operator</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordTarget(passwordTarget === u.id ? null : u.id);
                    setResetPassword('');
                  }}
                  className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  disabled={currentUser?.id === u.id}
                  onClick={() => void removeUser(u.id, u.username)}
                  className="px-2 py-1 text-[11px] font-medium rounded bg-red-900/40 hover:bg-red-800/60 disabled:opacity-40 text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {passwordTarget === u.id && (
              <div className="mt-2 flex gap-2">
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  autoComplete="new-password"
                  className="flex-1 px-2.5 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-600 transition-colors"
                />
                <button
                  type="button"
                  disabled={busy || resetPassword.length < 6}
                  onClick={() => void savePassword(u.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
