import { Link } from 'react-router-dom';

export function StatusBar() {
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
        <Link
          to="/settings"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Settings
        </Link>
      </div>
    </header>
  );
}
