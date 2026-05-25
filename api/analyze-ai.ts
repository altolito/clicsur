/// <reference types="node" />

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type LocalAnalysis = {
  risk?: "Faible" | "Moyen" | "Élevé";
  score?: number;
  category?: string;
  likelyIntent?: string;
  confidenceLevel?: "Faible" | "Moyenne" | "Élevée";
  safeSignals?: string[];
  alerts?: string[];
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(req: any): string {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || current.resetAt < now) {
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });

    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count += 1;
  rateLimitStore.set(ip, current);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - current.count,
    resetAt: current.resetAt,
  };
}

function sanitizeLocalAnalysis(value: any): LocalAnalysis | null {
  if (!value || typeof value !== "object") return null;

  return {
    risk: value.risk,
    score: typeof value.score === "number" ? value.score : undefined,
    category: typeof value.category === "string" ? value.category : undefined,
    likelyIntent:
      typeof value.likelyIntent === "string" ? value.likelyIntent : undefined,
    confidenceLevel: value.confidenceLevel,
    safeSignals: Array.isArray(value.safeSignals)
      ? value.safeSignals.filter((item: unknown) => typeof item === "string")
      : [],
    alerts: Array.isArray(value.alerts)
      ? value.alerts.filter((item: unknown) => typeof item === "string")
      : [],
  };
}

function normalizeAiResult(parsed: any, localAnalysis: LocalAnalysis | null) {
  const localRisk = localAnalysis?.risk;

  const result = {
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "Analyse complémentaire effectuée.",
    riskLevel:
      parsed?.riskLevel === "Faible" ||
      parsed?.riskLevel === "Moyen" ||
      parsed?.riskLevel === "Élevé"
        ? parsed.riskLevel
        : localRisk || "Moyen",
    explanation: Array.isArray(parsed?.explanation)
      ? parsed.explanation.filter((item: unknown) => typeof item === "string")
      : [],
    advice:
      typeof parsed?.advice === "string"
        ? parsed.advice
        : "Restez prudent et vérifiez toujours l’expéditeur.",
  };

  // Le moteur local reste la source de vérité.
  if (localRisk) {
    result.riskLevel = localRisk;
  }

  return result;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(ip);

  console.log("AI analysis request", {
    ip,
    remaining: rateLimit.remaining,
    allowed: rateLimit.allowed,
  });

  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());
  res.setHeader("X-RateLimit-Reset", rateLimit.resetAt.toString());

  if (!rateLimit.allowed) {
    return res.status(429).json({
      error:
        "Trop d’analyses IA en peu de temps. Réessayez dans quelques instants.",
    });
  }

  try {
    const { text, localAnalysis } = req.body;
    const cleanedLocalAnalysis = sanitizeLocalAnalysis(localAnalysis);

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "Texte invalide",
      });
    }

    if (text.length > 3000) {
      return res.status(400).json({
        error: "Le message est trop long pour l’analyse IA.",
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Clé OpenAI manquante côté serveur",
      });
    }

    const localContext = cleanedLocalAnalysis
      ? `
Analyse locale déjà effectuée par le moteur ClicSûr :

- Catégorie : ${cleanedLocalAnalysis.category || "Non déterminée"}
- Niveau de risque : ${cleanedLocalAnalysis.risk || "Non déterminé"}
- Score : ${
          typeof cleanedLocalAnalysis.score === "number"
            ? `${cleanedLocalAnalysis.score}/10`
            : "Non déterminé"
        }
- Objectif probable : ${cleanedLocalAnalysis.likelyIntent || "Non déterminé"}
- Niveau de confiance : ${
          cleanedLocalAnalysis.confidenceLevel || "Non déterminé"
        }

Alertes locales :
${
  cleanedLocalAnalysis.alerts?.length
    ? cleanedLocalAnalysis.alerts.map((item) => `- ${item}`).join("\n")
    : "- Aucune alerte locale fournie."
}

Éléments rassurants :
${
  cleanedLocalAnalysis.safeSignals?.length
    ? cleanedLocalAnalysis.safeSignals.map((item) => `- ${item}`).join("\n")
    : "- Aucun élément rassurant fourni."
}
`
      : "Aucune analyse locale fournie.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: `
Tu es l’assistant explicatif de ClicSûr, un outil de détection d’arnaques numériques.

Règle principale :
Le moteur local ClicSûr est la source de vérité pour la catégorie, le score et le niveau de risque.

Ton rôle :
- expliquer l’analyse locale avec des mots simples ;
- compléter l’analyse sans la contredire ;
- nuancer si le message ressemble plutôt à du marketing agressif ;
- éviter les formulations alarmistes si le moteur local classe le message en "SMS marketing agressif" ou en risque "Moyen" ;
- ne jamais reclasser en "Élevé" si l’analyse locale indique "Moyen" ou "Faible", sauf si le texte contient clairement une demande de mot de passe, carte bancaire, virement, code de sécurité ou paiement.

Réponds uniquement en JSON valide avec ce format :

{
  "summary": "résumé court",
  "riskLevel": "Faible | Moyen | Élevé",
  "explanation": [
    "raison 1",
    "raison 2"
  ],
  "advice": "conseil utilisateur"
}

Ne rajoute aucun texte hors JSON.
`,
          },
          {
            role: "user",
            content: `
${localContext}

Message à analyser :
${text}
`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();

      return res.status(500).json({
        error: "Erreur OpenAI",
        details: error,
      });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";

    let parsed;

    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = {
        summary: "Impossible d’analyser correctement la réponse IA.",
        riskLevel: cleanedLocalAnalysis?.risk || "Moyen",
        explanation: [
          "La réponse IA n’était pas dans un format exploitable.",
        ],
        advice:
          "Basez-vous sur l’analyse locale et vérifiez l’expéditeur avant de cliquer.",
      };
    }

    const normalized = normalizeAiResult(parsed, cleanedLocalAnalysis);

    return res.status(200).json(normalized);
  } catch (error: any) {
    return res.status(500).json({
      error: "Erreur serveur",
      details: error.message,
    });
  }
}