import { useState } from "react";

type AnalysisResult = {
  risk: "Faible" | "Moyen" | "Élevé";
  color: string;
  alerts: string[];
  recommendation: string;
};

function analyzeMessage(text: string): AnalysisResult {
  const lower = text.toLowerCase();

  let score = 0;
  const alerts: string[] = [];

  if (
    lower.includes("urgence") ||
    lower.includes("immédiat") ||
    lower.includes("rapidement")
  ) {
    score += 2;
    alerts.push("Le message crée un sentiment d’urgence.");
  }

  if (
    lower.includes("paiement") ||
    lower.includes("carte bancaire") ||
    lower.includes("1,99€")
  ) {
    score += 3;
    alerts.push("Une demande de paiement a été détectée.");
  }

  if (
    lower.includes("mot de passe") ||
    lower.includes("compte suspendu") ||
    lower.includes("connexion")
  ) {
    score += 3;
    alerts.push("Le message demande des informations sensibles.");
  }

  if (
    lower.includes("cliquez") ||
    lower.includes("http") ||
    lower.includes("lien")
  ) {
    score += 2;
    alerts.push("Le message contient un lien ou une incitation à cliquer.");
  }

  if (score <= 2) {
    return {
      risk: "Faible",
      color: "emerald",
      alerts:
        alerts.length > 0
          ? alerts
          : ["Aucun signal critique détecté."],
      recommendation:
        "Le contenu semble relativement sûr, mais restez vigilant.",
    };
  }

  if (score <= 5) {
    return {
      risk: "Moyen",
      color: "yellow",
      alerts,
      recommendation:
        "Vérifiez l’expéditeur et évitez de cliquer trop rapidement.",
    };
  }

  return {
    risk: "Élevé",
    color: "red",
    alerts,
    recommendation:
      "Ne cliquez pas directement. Vérifiez l’information depuis le site officiel.",
  };
}

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