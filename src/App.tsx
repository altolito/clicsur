export default function App() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="max-w-xl w-full space-y-6 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Analysez un lien suspect
        </h1>

        <p className="text-zinc-400 text-lg">
          Vérifiez rapidement si un site, un SMS ou un email semble dangereux.
        </p>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
          <input
            type="text"
            placeholder="Collez un lien ou un message..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none"
          />

          <button className="mt-4 w-full bg-white text-black font-medium rounded-xl py-3 hover:bg-zinc-200 transition">
            Analyser
          </button>
        </div>
      </div>
    </main>
  )
}