/// <reference types="node" />

type RateLimitEntry = {
  count: number;
  resetAt: number;
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
    console.warn("AI rate limit reached", {
      ip,
      resetAt: rateLimit.resetAt,
    });

    return res.status(429).json({
      error:
        "Trop d’analyses IA en peu de temps. Réessayez dans quelques instants.",
    });
  }

  try {
    const { text } = req.body;

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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `
Tu es un assistant spécialisé dans la détection d’arnaques numériques.

Analyse le message fourni par l’utilisateur.

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
            content: text,
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
        summary: "Impossible d’analyser la réponse IA.",
        riskLevel: "Moyen",
        explanation: ["Réponse IA invalide."],
        advice: "Réessayez plus tard.",
      };
    }

    return res.status(200).json(parsed);
  } catch (error: any) {
    return res.status(500).json({
      error: "Erreur serveur",
      details: error.message,
    });
  }
}