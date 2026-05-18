import { useState } from "react";
import { analyzeMessage, type AnalysisResult } from "./lib/analyzeMessage";



export default function App() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function handleAnalyze() {
    if (!value.trim()) return;

    const analysis = analyzeMessage(value);
    setResult(analysis);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-10">
      <section className="mx-auto max-w-3xl space-y-8">
        <div className="text-center space-y-4">
          <p className="text-sm font-medium text-emerald-400">
            Protection numérique famille
          </p>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Analysez un lien ou un message suspect
          </h1>

          <p className="text-zinc-400 text-lg">
            Collez un SMS, un email ou une URL douteuse.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Exemple : Votre colis est bloqué. Payez 1,99€ ici..."
            className="min-h-36 w-full resize-none bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white outline-none focus:border-emerald-500"
          />

          <button
            onClick={handleAnalyze}
            className="mt-4 w-full bg-emerald-400 text-zinc-950 font-semibold rounded-2xl py-3 hover:bg-emerald-300 transition"
          >
            Analyser le risque
          </button>
        </div>

        {result && (
          <div
            className={`rounded-3xl p-6 space-y-4 border ${
              result.color === "red"
                ? "bg-red-950/40 border-red-900"
                : result.color === "yellow"
                ? "bg-yellow-950/30 border-yellow-800"
                : "bg-emerald-950/30 border-emerald-800"
            }`}
          >
            <div>
              <p className="text-sm text-zinc-300">Niveau de risque</p>

              <h2
                className={`text-3xl font-bold ${
                  result.color === "red"
                    ? "text-red-200"
                    : result.color === "yellow"
                    ? "text-yellow-200"
                    : "text-emerald-200"
                }`}
              >
                Risque {result.risk}
              </h2>
            </div>

            <ul className="space-y-3 text-zinc-200">
              {result.alerts.map((alert, index) => (
                <li key={index}>⚠️ {alert}</li>
              ))}
            </ul>

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4">
              <p className="font-semibold">Recommandation</p>

              <p className="text-zinc-400">{result.recommendation}</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}