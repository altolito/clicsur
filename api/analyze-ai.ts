export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "Texte invalide",
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
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
      }
    );

    if (!response.ok) {
      const error = await response.text();

      return res.status(500).json({
        error: "Erreur OpenAI",
        details: error,
      });
    }

    const data = await response.json();

    const content =
      data?.choices?.[0]?.message?.content ?? "{}";

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