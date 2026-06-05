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

    const formData = new URLSearchParams();
    formData.append("url", Buffer.from(url).toString("base64"));
    formData.append("format", "json");

    const appKey = process.env.PHISHTANK_APP_KEY;

    if (appKey) {
      formData.append("app_key", appKey);
    }

    const response = await fetch("https://checkurl.phishtank.com/checkurl/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ClicSur/1.0 contact: altolito@gmail.com",
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.text();

      return res.status(500).json({
        error: "Erreur PhishTank",
        details: error,
      });
    }

    const data = await response.json();

    const result = data.results ?? {};

    return res.status(200).json({
      listed: Boolean(result.in_database),
      verified: Boolean(result.verified),
      valid: Boolean(result.valid),
      phishId: result.phish_id ?? null,
      phishDetailUrl: result.phish_detail_page ?? null,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Erreur serveur PhishTank",
      details: error.message,
    });
  }
}