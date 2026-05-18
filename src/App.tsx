import { useState } from "react";
import { analyzeMessage, type AnalysisResult } from "./lib/analyzeMessage";

const examples = [
  "Votre colis est bloqué. Paiement de 1,99€ requis sous 24h : http://suivi-livraison-client.xyz",

  "Bonjour, votre compte Netflix nécessite une reconnexion immédiate : http://netflix-verification.click",

  "Félicitations, vous avez gagné un iPhone. Cliquez ici pour recevoir votre cadeau.",

  "Bonjour maman, j’ai changé de numéro. Peux-tu m’envoyer un virement rapidement ?",
];

export default function App() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  function handleAnalyze() {
    if (!value.trim()) return;

    const analysis = analyzeMessage(value);
    setResult(analysis);
  }

  function loadExample(example: string) {
    setValue(example);
    setResult(null);
  }

  function resetAnalysis() {
    setValue("");
    setResult(null);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-6 py-10">
      <section className="mx-auto max-w-4xl space-y-8">
        <div className="text-center space-y-5">
          <p className="text-sm font-medium text-emerald-400">
            Protection numérique famille
          </p>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Analysez un lien ou un message suspect
          </h1>

          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            ClicSûr détecte les signaux fréquents des SMS frauduleux,
            faux emails et liens de phishing avant que vous ne cliquiez.
          </p>
        </div>

        <div className="grid gap-3">
          <p className="text-sm text-zinc-500">
            Exemples rapides :
          </p>

          <div className="grid md:grid-cols-2 gap-3">
            {examples.map((example, index) => (
              <button
                key={index}
                onClick={() => loadExample(example)}
                className="text-left bg-zinc-900 hover:bg-zinc-800 transition border border-zinc-800 rounded-2xl p-4 text-sm text-zinc-300"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Collez ici un SMS, un email ou une URL..."
            className="min-h-40 w-full resize-none bg-zinc-950 border border-zinc-800 rounded-2xl px-4 py-4 text-white outline-none focus:border-emerald-500"
          />

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAnalyze}
              className="flex-1 bg-emerald-400 text-zinc-950 font-semibold rounded-2xl py-3 hover:bg-emerald-300 transition"
            >
              Analyser le risque
            </button>

            <button
              onClick={resetAnalysis}
              className="px-6 bg-zinc-800 hover:bg-zinc-700 transition rounded-2xl"
            >
              Reset
            </button>
          </div>
        </div>

        {result && (
          <div
            className={`rounded-3xl p-6 space-y-5 border transition-all duration-300 ${
              result.color === "red"
                ? "bg-red-950/40 border-red-900"
                : result.color === "yellow"
                ? "bg-yellow-950/30 border-yellow-800"
                : "bg-emerald-950/30 border-emerald-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-300">
                  Niveau de risque
                </p>

                <h2
                  className={`text-4xl font-bold ${
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

              <div className="text-right">
                <p className="text-sm text-zinc-400">Score</p>

                <p className="text-5xl font-bold">
                  {result.score}
                  <span className="text-zinc-500 text-2xl">/10</span>
                </p>
              </div>
            </div>

            <ul className="space-y-3 text-zinc-200">
              {result.alerts.map((alert, index) => (
                <li key={index}>⚠️ {alert}</li>
              ))}
            </ul>

            {result.technicalDetails.length > 0 && (
              <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4">
                <p className="font-semibold">
                  Analyse technique
                </p>

                <ul className="mt-2 space-y-2 text-zinc-400">
                  {result.technicalDetails.map((detail, index) => (
                    <li key={index}>• {detail}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4">
              <p className="font-semibold">
                Recommandation
              </p>

              <p className="text-zinc-400 mt-1">
                {result.recommendation}
              </p>
            </div>
          </div>
        )}

        <div className="text-center text-sm text-zinc-600 max-w-2xl mx-auto">
          ClicSûr fournit une aide à la détection mais ne garantit pas
          qu’un contenu soit totalement sûr ou frauduleux.
          Vérifiez toujours les informations sensibles via les canaux officiels.
        </div>
      </section>
    </main>
  );
}