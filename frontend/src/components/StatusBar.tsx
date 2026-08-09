import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';

export function StatusBar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <h1 className="text-base font-semibold text-zinc-100 tracking-tight">
            Jersey Systems
          </h1>
        </Link>
        <span className="text-xs text-zinc-600 font-medium">AV Control</span>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <>
            <Link
              to="/zoom"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Zoom
            </Link>
            {user.role === 'admin' && (
              <Link
                to="/settings"
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Settings
              </Link>
            )}
            <span className="flex items-center gap-1.5 text-xs text-zinc-400">
              {user.username}
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                  user.role === 'admin'
                    ? 'bg-emerald-900/40 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {user.role}
              </span>
            </span>
            <button
              onClick={() => void logout()}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
            >
              Log out
            </button>
          </>
        )}
      </div>
    </header>
  );
}
