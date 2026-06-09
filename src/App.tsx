import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { analyzeMessage, type AnalysisResult } from "./lib/analyzeMessage";
import { supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import AuthBox from "./AuthBox";

type DbHistoryItem = {
  id: string;
  created_at: string;
  input_text: string;
  risk: AnalysisResult["risk"];
  score: number;
  category: string | null;
  urls: string[] | null;
  domains: string[] | null;
  user_id: string | null;
};

type UserStats = {
  total: number;
  low: number;
  medium: number;
  high: number;
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
  const [session, setSession] = useState<Session | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({
  total: 0,
  low: 0,
  medium: 0,
  high: 0,
});

useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
    setSession(data.session);
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });

  return () => subscription.unsubscribe();
}, []);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [dbHistory, setDbHistory] = useState<DbHistoryItem[]>([]);
  const [feedbackSent, setFeedbackSent] = useState<Record<string, string>>({});
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
  loadDbHistory();
  loadUserStats();
  }, [session]);

  async function saveFeedback(
    analysisId: string,
    feedbackType: "correct" | "incorrect"
  ) {
    if (feedbackSent[analysisId]) return;

  

  const { error } = await supabase.from("feedback").insert({
  analysis_id: analysisId,
  feedback_type: feedbackType,
  user_id: session?.user.id ?? null,
  });

  
    if (error) {
      console.error(error);
      return;
    }

    setFeedbackSent((current) => ({
      ...current,
      [analysisId]:
        feedbackType === "correct"
          ? "Merci pour votre retour 👍"
          : "Merci pour votre signalement 👍",
    }));
  }

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldown]);

  async function loadDbHistory() {
  let query = supabase
    .from("analyses")
    .select("id, created_at, input_text, risk, score, category, urls, domains, user_id")
    .order("created_at", { ascending: false })
    .limit(10);

  if (session?.user.id) {
    query = query.eq("user_id", session.user.id);
  } else {
    query = query.is("user_id", null);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Erreur chargement historique Supabase :", error);
    return;
  }

  setDbHistory((data || []) as DbHistoryItem[]);
}

async function loadUserStats() {
  if (!session?.user.id) {
    setUserStats({
      total: 0,
      low: 0,
      medium: 0,
      high: 0,
    });
    return;
  }

  const { data, error } = await supabase
    .from("analyses")
    .select("risk")
    .eq("user_id", session.user.id);

  if (error) {
    console.error("Erreur chargement statistiques :", error);
    return;
  }

  const analyses = data || [];

  setUserStats({
    total: analyses.length,
    low: analyses.filter((item) => item.risk === "Faible").length,
    medium: analyses.filter((item) => item.risk === "Moyen").length,
    high: analyses.filter((item) => item.risk === "Élevé").length,
  });
}

  async function prepareImageForOcr(file: File) {
    const imageBitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");

    const maxWidth = 1400;
    const scale = Math.min(1, maxWidth / imageBitmap.width);

    canvas.width = Math.round(imageBitmap.width * scale);
    canvas.height = Math.round(imageBitmap.height * scale);

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas non disponible");
    }

    ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.85);
    });

    if (!compressedBlob) {
      throw new Error("Compression impossible");
    }

    return compressedBlob;
  }

  function cleanOcrText(text: string) {
    return text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[|]/g, "I")
      .trim();
  }

  async function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setOcrError("Le fichier sélectionné n’est pas une image.");
      return;
    }

    setOcrLoading(true);
    setOcrError(null);
    setResult(null);
    setAiResult(null);

    try {
      const compressedImage = await prepareImageForOcr(file);

      const {
        data: { text },
      } = await Tesseract.recognize(compressedImage, "fra+eng");

      const cleanedText = cleanOcrText(text);

      if (!cleanedText) {
        setOcrError(
          "Aucun texte lisible détecté dans cette image. Essaie avec une capture plus nette."
        );
        return;
      }

      setValue(cleanedText);

      await handleAnalyze(cleanedText, {
        allowDuringOcr: true,
      });
    } catch (error) {
      console.error(error);

      setOcrError(
        "Impossible de lire cette image. Essaie avec une capture plus nette."
      );
    } finally {
      setOcrLoading(false);
      setIsDragging(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    await processImageFile(file);
  }

  async function handleAnalyze(
    customText?: string,
    options?: { allowDuringOcr?: boolean }
  ) {
    if (
      cooldown > 0 ||
      aiLoading ||
      (ocrLoading && !options?.allowDuringOcr)
    ) {
      return;
    }

    const textToAnalyze = customText ?? value;

    if (!textToAnalyze.trim()) return;

    setCooldown(5);

    const analysis = await analyzeMessage(
  textToAnalyze,
  session?.user.id ?? null
    );
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
            localAnalysis: {
              risk: analysis.risk,
              score: analysis.score,
              category: analysis.category,
              likelyIntent: analysis.likelyIntent,
              confidenceLevel: analysis.confidenceLevel,
              safeSignals: analysis.safeSignals,
              alerts: analysis.alerts,
            },
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

    await loadDbHistory();

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
    setOcrError(null);
  }

  function resetAnalysis() {
    setValue("");
    setResult(null);
    setAiResult(null);
    setOcrError(null);
  }

  function copyReport() {
    if (!result) return;

    const safeSignalsBlock =
      result.safeSignals && result.safeSignals.length > 0
        ? `

Éléments rassurants :
${result.safeSignals.map((item) => `- ${item}`).join("\n")}
`
        : "";

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
Objectif probable : ${result.likelyIntent || "Indéterminé"}
Niveau de confiance : ${result.confidenceLevel || "Non évalué"}

Conclusion :
${result.confidenceMessage}

Alertes :
${result.alerts.map((alert) => `- ${alert}`).join("\n")}
${safeSignalsBlock}

Recommandation :
${result.recommendation}
${aiBlock}
`.trim();

    navigator.clipboard.writeText(report);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-6 py-10">
      <section className="mx-auto max-w-5xl space-y-10">
        {session ? (
                  <div className="rounded-xl border bg-white p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <span>
                        Connecté : {session.user.email}
                      </span>

                      <button
                        onClick={() => supabase.auth.signOut()}
                        className="rounded-lg border px-3 py-2"
                      >
                        Se déconnecter
                      </button>
                    </div>
                  </div>
                ) : (
                  <AuthBox />
                )}

                {session && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white border border-slate-200 rounded-2xl p-4">
                      <p className="text-sm text-slate-500">Analyses</p>
                      <p className="text-2xl font-bold">{userStats.total}</p>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                      <p className="text-sm text-emerald-700">Faibles</p>
                      <p className="text-2xl font-bold text-emerald-700">{userStats.low}</p>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                      <p className="text-sm text-yellow-700">Moyens</p>
                      <p className="text-2xl font-bold text-yellow-700">{userStats.medium}</p>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                      <p className="text-sm text-red-700">Élevés</p>
                      <p className="text-2xl font-bold text-red-700">{userStats.high}</p>
                    </div>
                  </div>
                )}


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

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xl shadow-slate-200/50 space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);

              const file = event.dataTransfer.files?.[0];

              if (!file) return;

              processImageFile(file);
            }}
            className={`rounded-2xl border-2 border-dashed p-3 transition ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-slate-200 bg-white"
            }`}
          >
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Collez ici un SMS, un email ou une URL... ou déposez une capture d’écran dans cette zone."
              className="min-h-40 w-full resize-none bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 text-slate-900 outline-none focus:border-blue-500"
            />

            <p className="mt-2 text-xs text-slate-500">
              Vous pouvez aussi glisser-déposer une capture d’écran ici.
            </p>
          </div>

          <div className="border border-dashed border-slate-300 rounded-2xl p-4 bg-slate-50">
            <p className="font-medium text-slate-900">
              Analyser une capture d’écran
            </p>

            <p className="text-sm text-slate-500 mt-1">
              Ajoutez une image ou un screenshot : ClicSûr extrait le texte, le
              nettoie puis lance l’analyse automatiquement.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={ocrLoading || aiLoading}
              className="mt-3 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 disabled:opacity-60"
            />

            {ocrLoading && (
              <p className="text-sm text-blue-700 mt-3">
                Lecture de l’image en cours...
              </p>
            )}

            {ocrError && (
              <p className="text-sm text-red-700 mt-3">{ocrError}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => handleAnalyze()}
              disabled={aiLoading || cooldown > 0 || ocrLoading}
              className="flex-1 bg-blue-600 text-white font-semibold rounded-2xl py-3 hover:bg-blue-700 transition disabled:opacity-60"
            >
              {ocrLoading
                ? "Lecture image..."
                : aiLoading
                ? "Analyse en cours..."
                : cooldown > 0
                ? `Patientez ${cooldown}s`
                : "Analyser le risque"}
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

                {result.specialNotice && (
                  <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-medium text-blue-900">
                      {result.specialNotice}
                    </p>
                  </div>
                )}

                <div className="mt-4 grid md:grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-sm text-slate-500">Objectif probable</p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {result.likelyIntent || "Indéterminé"}
                    </p>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-sm text-slate-500">
                      Niveau de confiance
                    </p>

                    <p className="mt-1 font-semibold text-slate-900">
                      {result.confidenceLevel || "Non évalué"}
                    </p>
                  </div>
                </div>
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

            {result.safeSignals && result.safeSignals.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="font-semibold text-emerald-800">
                  Éléments rassurants
                </p>

                <ul className="mt-2 space-y-2 text-emerald-700">
                  {result.safeSignals.map((item, index) => (
                    <li key={index}>• {item}</li>
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

        {dbHistory.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
               <h2 className="font-semibold text-lg">
                Mes analyses
              </h2>

              <p className="text-sm text-slate-500">
                Mes 10 dernières analyses
              </p>
              </div>

              <button
                onClick={loadDbHistory}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Rafraîchir
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {dbHistory.map((item) => {
                const color =
                  item.risk === "Élevé"
                    ? "red"
                    : item.risk === "Moyen"
                    ? "yellow"
                    : "emerald";

                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 border border-slate-100 rounded-2xl p-4"
                  >
                    <div>
                      <p className="text-sm text-slate-500">
                        {new Date(item.created_at).toLocaleString("fr-FR")}
                      </p>

                      <p className="mt-1 text-sm font-medium text-slate-600">
                        {item.category || "Analyse générale"}
                      </p>

                      <p className="mt-1 text-slate-700 line-clamp-2">
                        {item.input_text}
                      </p>

                      {item.domains && item.domains.length > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          Domaine détecté : {item.domains.join(", ")}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-4">
                        <button
                          onClick={() => handleAnalyze(item.input_text)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          Réanalyser
                        </button>

                        <button
                          onClick={() => saveFeedback(item.id, "correct")}
                          disabled={Boolean(feedbackSent[item.id])}
                          className="text-sm text-green-600 hover:text-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ✅ Analyse correcte
                        </button>

                        <button
                          onClick={() => saveFeedback(item.id, "incorrect")}
                          disabled={Boolean(feedbackSent[item.id])}
                          className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          ❌ Mauvaise analyse
                        </button>
                      </div>

                      {feedbackSent[item.id] && (
                        <p className="mt-2 text-sm text-emerald-700">
                          {feedbackSent[item.id]}
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                          color === "red"
                            ? "bg-red-100 text-red-700"
                            : color === "yellow"
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
                );
              })}
            </div>
          </div>
        )}

        <div className="text-center text-sm text-slate-500 max-w-2xl mx-auto leading-relaxed">
          ClicSûr fournit une aide à la détection mais ne garantit pas qu’un
          contenu soit totalement sûr ou frauduleux. Ne communiquez jamais vos
          mots de passe, codes bancaires ou informations sensibles depuis un
          lien reçu par message.
        </div>
      </section>
    </main>
  );
}