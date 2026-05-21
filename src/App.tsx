import { useEffect, useRef, useState } from "react";
import { analyzeMessage, type AnalysisResult } from "./lib/analyzeMessage";

type HistoryItem = {
  id: string;
  text: string;
  risk: AnalysisResult["risk"];
  color: AnalysisResult["color"];
  score: number;
  category: string;
  createdAt: string;
};

type AiResult = {
  summary?: string;
  riskLevel?: "Faible" | "Moyen" | "Élevé";
  explanation?: string[];
  advice?: string;
  error?: string;
  skipped?: boolean;
};

const AI_TRIGGER_SCORE = 4;

const examples = [
  "Votre colis est bloqué. Paiement de 1,99€ requis sous 24h : http://suivi-livraison-client.xyz",
  "Bonjour, votre compte Netflix nécessite une reconnexion immédiate : http://netflix-verification.click",
  "Félicitations, vous avez gagné un iPhone. Cliquez ici pour recevoir votre cadeau.",
  "Bonjour maman, j'ai changé de numéro. Peux-tu m'envoyer un virement rapidement ?",
];

export default function App() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem("clicsur-history");
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
    } catch {
      localStorage.removeItem("clicsur-history");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("clicsur-history", JSON.stringify(history));
  }, [history]);

  async function handleAnalyze(customText?: string) {
    const textToAnalyze = customText ?? value;

    if (!textToAnalyze.trim()) return;

    const analysis = analyzeMessage(textToAnalyze);
    const shouldUseAI = analysis.score >= AI_TRIGGER_SCORE;

    setResult(analysis);
    setValue(textToAnalyze);
    setAiResult(null);

    if (shouldUseAI) {
      setAiLoading(true);

      try {
        const response = await fetch("/api/analyze-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: textToAnalyze,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setAiResult({
            error:
              data?.details ||
              data?.error ||
              "Erreur pendant l’analyse IA.",
          });
        } else {
          setAiResult(data);
        }
      } catch {
        setAiResult({
          error: "Impossible de contacter l’analyse IA.",
        });
      } finally {
        setAiLoading(false);
      }
    } else {
      setAiLoading(false);
      setAiResult({
        skipped: true,
        summary:
          "L’analyse locale ne détecte pas assez de signaux suspects pour déclencher l’IA.",
      });
    }

    const item: HistoryItem = {
      id: crypto.randomUUID(),
      text: textToAnalyze,
      risk: analysis.risk,
      color: analysis.color,
      score: analysis.score,
      category: analysis.category,
      createdAt: new Date().toLocaleString("fr-FR"),
    };

    setHistory((current) => [item, ...current].slice(0, 8));

    setTimeout(() => {
      resultRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  function loadExample(example: string) {
    setValue(example);
    setResult(null);
    setAiResult(null);
  }

  function resetAnalysis() {
    setValue("");
    setResult(null);
    setAiResult(null);
  }

  function copyReport() {
    if (!result) return;

    const aiBlock =
      aiResult && !aiResult.error && !aiResult.skipped
        ? `

Analyse IA :
${aiResult.summary || ""}

Niveau IA :
${aiResult.riskLevel || ""}

Explications IA :
${
  Array.isArray(aiResult.explanation)
    ? aiResult.explanation.map((item) => `- ${item}`).join("\n")
    : ""
}

Conseil IA :
${aiResult.advice || ""}
`
        : "";

    const report = `
Analyse ClicSûr

Niveau de risque : ${result.risk}
Score : ${result.score}/10
Catégorie : ${result.category}

Conclusion :
${result.confidenceMessage}

Alertes :
${result.alerts.map((alert) => `- ${alert}`).join("\n")}

Recommandation :
${result.recommendation}
${aiBlock}
`.trim();

    navigator.clipboard.writeText(report);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-6 py-10">
      <section className="mx-auto max-w-5xl space-y-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-bold">
              C
            </div>

            <div>
              <p className="font-semibold text-lg">ClicSûr</p>
              <p className="text-sm text-slate-500">
                Protection numérique famille
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            Analyse locale + IA ciblée
          </div>
        </header>

        <div className="text-center space-y-5">
          <div className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-4 py-2 text-sm font-medium">
            Détection de phishing et d’arnaques numériques
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight">
            Vérifiez un lien ou un message avant de cliquer
          </h1>

          <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed">
            ClicSûr aide à repérer les SMS frauduleux, faux emails, arnaques au
            colis, fausses banques et liens suspects.
          </p>
        </div>

        <div className="grid gap-3">
          <p className="text-sm text-slate-500">Exemples fréquents :</p>

          <div className="grid md:grid-cols-2 gap-3">
            {examples.map((example, index) => (
              <button
                key={index}
                onClick={() => loadExample(example)}
                className="text-left bg-white hover:bg-slate-100 transition border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 shadow-sm"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xl shadow-slate-200/50">
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Collez ici un SMS, un email ou une URL..."
            className="min-h-40 w-full resize-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-slate-900 outline-none focus:border-blue-500"
          />

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => handleAnalyze()}
              disabled={aiLoading}
              className="flex-1 bg-blue-600 text-white font-semibold rounded-2xl py-3 hover:bg-blue-700 transition disabled:opacity-60"
            >
              {aiLoading ? "Analyse en cours..." : "Analyser le risque"}
            </button>

            <button
              onClick={resetAnalysis}
              className="px-6 bg-slate-100 hover:bg-slate-200 transition rounded-2xl text-slate-700"
            >
              Reset
            </button>
          </div>
        </div>

        {result && (
          <div
            ref={resultRef}
            className={`rounded-3xl p-6 space-y-5 border shadow-lg scroll-mt-6 ${
              result.color === "red"
                ? "bg-red-50 border-red-200"
                : result.color === "yellow"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-emerald-50 border-emerald-200"
            }`}
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm text-slate-500">Niveau de risque</p>

                <p className="mt-2 inline-flex rounded-full bg-white/70 px-3 py-1 text-sm font-medium text-slate-700 border border-slate-200">
                  {result.category}
                </p>

                <h2
                  className={`mt-3 text-4xl font-bold ${
                    result.color === "red"
                      ? "text-red-700"
                      : result.color === "yellow"
                      ? "text-yellow-700"
                      : "text-emerald-700"
                  }`}
                >
                  Risque {result.risk}
                </h2>

                <p className="mt-2 text-slate-600 font-medium">
                  {result.confidenceMessage}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm text-slate-500">Score</p>

                <p className="text-5xl font-bold text-slate-900">
                  {result.score}
                  <span className="text-slate-400 text-2xl">/10</span>
                </p>
              </div>
            </div>

            <ul className="space-y-3 text-slate-700">
              {result.alerts.map((alert, index) => (
                <li key={index}>⚠️ {alert}</li>
              ))}
            </ul>

            {result.technicalDetails.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="font-semibold text-slate-900">
                  Analyse technique
                </p>

                <ul className="mt-2 space-y-2 text-slate-600">
                  {result.technicalDetails.map((detail, index) => (
                    <li key={index}>• {detail}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="font-semibold text-slate-900">Recommandation</p>

              <p className="text-slate-600 mt-1">{result.recommendation}</p>
            </div>

            {aiLoading && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="font-semibold text-slate-900">
                  Analyse IA en cours...
                </p>
              </div>
            )}

            {aiResult?.skipped && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <p className="font-semibold text-slate-900">
                  Analyse locale suffisante
                </p>

                <p className="text-slate-600 mt-1">{aiResult.summary}</p>
              </div>
            )}

            {aiResult && !aiResult.error && !aiResult.skipped && (
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
                <div>
                  <p className="font-semibold text-slate-900">Analyse IA</p>

                  <p className="text-slate-600 mt-1">{aiResult.summary}</p>
                </div>

                <div>
                  <p className="font-medium text-slate-900">Niveau détecté</p>

                  <p className="text-slate-600">{aiResult.riskLevel}</p>
                </div>

                {Array.isArray(aiResult.explanation) && (
                  <div>
                    <p className="font-medium text-slate-900">Explications</p>

                    <ul className="mt-2 space-y-2 text-slate-600">
                      {aiResult.explanation.map((item, index) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="font-medium text-slate-900">Conseil IA</p>

                  <p className="text-slate-600">{aiResult.advice}</p>
                </div>
              </div>
            )}

            {aiResult?.error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-700">{aiResult.error}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={copyReport}
                className="bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 text-sm text-slate-700 transition"
              >
                Copier le rapport
              </button>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-lg">Analyses récentes</h2>
                <p className="text-sm text-slate-500">
                  Historique conservé uniquement sur cet appareil.
                </p>
              </div>

              <button
                onClick={() => setHistory([])}
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                Effacer
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 border border-slate-100 rounded-2xl p-4"
                >
                  <div>
                    <p className="text-sm text-slate-500">{item.createdAt}</p>

                    <p className="mt-1 text-sm font-medium text-slate-600">
                      {item.category}
                    </p>

                    <p className="mt-1 text-slate-700 line-clamp-2">
                      {item.text}
                    </p>

                    <button
                      onClick={() => handleAnalyze(item.text)}
                      className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                    >
                      Réanalyser
                    </button>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                        item.color === "red"
                          ? "bg-red-100 text-red-700"
                          : item.color === "yellow"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {item.risk}
                    </span>

                    <p className="mt-1 text-sm text-slate-500">
                      {item.score}/10
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-sm text-slate-500 max-w-2xl mx-auto leading-relaxed">
          ClicSûr fournit une aide à la détection mais ne garantit pas qu’un
          contenu soit totalement sûr ou frauduleux. Ne communiquez jamais vos
          mots de passe, codes bancaires ou informations sensibles depuis un lien
          reçu par message.
        </div>
      </section>
    </main>
  );
}