export function StatusBar({
  socketConnected,
}: {
  socketConnected: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
        <h1 className="text-base font-semibold text-zinc-100 tracking-tight">
          Jersey Systems
        </h1>
        <span className="text-xs text-zinc-600 font-medium">AV Control</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span
          className={`inline-flex items-center gap-1.5 ${
            socketConnected ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              socketConnected ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {socketConnected ? 'Live' : 'Offline'}
        </span>
      </div>
    </header>
  );
}
