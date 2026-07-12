import { useSocket } from './hooks/useSocket.js';
import { StatusBar } from './components/StatusBar.js';
import { X32Panel } from './components/X32Panel.js';

export default function App() {
  const { socket, connected } = useSocket();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <StatusBar socketConnected={connected} />

      <main className="flex-1 p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <X32Panel socket={socket} connected={connected} />

            {/* Placeholder cards for future device panels */}
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 border-dashed flex items-center justify-center text-zinc-600 text-sm h-48">
              ATEM Switcher — Coming soon
            </div>
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 border-dashed flex items-center justify-center text-zinc-600 text-sm h-48">
              Videohub Routing — Coming soon
            </div>
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 border-dashed flex items-center justify-center text-zinc-600 text-sm h-48">
              Projector &amp; Screen — Coming soon
            </div>
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 border-dashed flex items-center justify-center text-zinc-600 text-sm h-48">
              Power (TV &amp; Amp) — Coming soon
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
