/// <reference types="node" />

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Méthode non autorisée",
    });
  }

  try {
    const { url } = req.body;

    if (!url || typeof url !== "string") {
      return res.status(400).json({
        error: "URL invalide",
      });
    }

    const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Clé Google Safe Browsing manquante",
      });
    }

    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client: {
            clientId: "clicsur",
            clientVersion: "1.0.0",
          },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();

      return res.status(500).json({
        error: "Erreur Google Safe Browsing",
        details: error,
      });
    }

    const data = await response.json();

    const matches = data.matches ?? [];

    return res.status(200).json({
      dangerous: matches.length > 0,
      threats: matches.map((match: any) => match.threatType),
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Erreur serveur",
      details: error.message,
    });
  }
}