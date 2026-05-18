export type AnalysisResult = {
  risk: "Faible" | "Moyen" | "Élevé";
  color: "emerald" | "yellow" | "red";
  score: number;
  alerts: string[];
  recommendation: string;
  technicalDetails: string[];
  category: string;
  confidenceMessage: string;
};

function extractDomain(rawUrl: string): string | null {
  try {
    const normalizedUrl = rawUrl.startsWith("http")
      ? rawUrl
      : `https://${rawUrl}`;

    return new URL(normalizedUrl).hostname;
  } catch {
    return null;
  }
}

export function analyzeMessage(text: string): AnalysisResult {
  const lower = text.toLowerCase();

  let score = 0;
  let category = "Analyse générale";
  const alerts: string[] = [];
  const technicalDetails: string[] = [];

  const urlRegex =
    /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}(\/[^\s]*)?)/gi;

  const urls = text.match(urlRegex) || [];

  if (urls.length > 0) {
    score += 2;
    alerts.push("Un lien a été détecté dans le message.");

    const firstUrl = urls[0];

    if (firstUrl) {
      const domain = extractDomain(firstUrl);

      if (domain) {
        technicalDetails.push(`Domaine détecté : ${domain}`);

        if (firstUrl.startsWith("http://")) {
          score += 2;
          alerts.push("Le lien utilise HTTP au lieu de HTTPS.");
          technicalDetails.push("Protocole : HTTP non sécurisé");
        } else {
          technicalDetails.push("Protocole : HTTPS ou URL normalisée");
        }

        if (domain.length > 30) {
          score += 2;
          alerts.push("Le nom de domaine est anormalement long.");
          technicalDetails.push("Domaine long : oui");
        } else {
          technicalDetails.push("Domaine long : non");
        }

        if (/\d/.test(domain)) {
          score += 1;
          alerts.push("Le domaine contient des chiffres.");
          technicalDetails.push("Chiffres dans le domaine : oui");
        }

        if (domain.split("-").length > 2) {
          score += 1;
          alerts.push("Le domaine contient plusieurs tirets.");
          technicalDetails.push("Nombreux tirets dans le domaine : oui");
        }

        const suspiciousExtensions = [
          ".xyz",
          ".top",
          ".click",
          ".shop",
          ".info",
        ];

        if (
          suspiciousExtensions.some((extension) => domain.endsWith(extension))
        ) {
          score += 2;
          alerts.push(
            "Le domaine utilise une extension souvent présente dans des campagnes douteuses."
          );
          technicalDetails.push("Extension à surveiller : oui");
        }
      }
    }
  }

  if (urls.some((url) => url.length > 80)) {
    score += 2;
    alerts.push("L’URL semble anormalement longue.");
  }

  if (
    lower.includes("bit.ly") ||
    lower.includes("tinyurl") ||
    lower.includes("t.co") ||
    lower.includes("goo.gl") ||
    lower.includes("cutt.ly") ||
    lower.includes("shorturl")
  ) {
    score += 3;
    alerts.push("Le lien semble utiliser un raccourcisseur d’URL.");
  }

  if (
    lower.includes("urgence") ||
    lower.includes("immédiat") ||
    lower.includes("rapidement") ||
    lower.includes("dernier rappel") ||
    lower.includes("sous 24h") ||
    lower.includes("expire")
  ) {
    score += 2;
    alerts.push("Le message crée un sentiment d’urgence.");
  }

  if (
    lower.includes("paiement") ||
    lower.includes("carte bancaire") ||
    lower.includes("virement") ||
    lower.includes("1,99€") ||
    lower.includes("frais") ||
    lower.includes("régulariser")
  ) {
    score += 3;
    category = "Demande de paiement suspecte";
    alerts.push("Une demande de paiement a été détectée.");
  }

  if (
    lower.includes("mot de passe") ||
    lower.includes("compte suspendu") ||
    lower.includes("connexion") ||
    lower.includes("identifiants") ||
    lower.includes("code de sécurité") ||
    lower.includes("confirmez votre compte")
  ) {
    score += 3;
    category = "Compte ou identifiants menacés";
    alerts.push("Le message évoque des informations sensibles.");
  }

  if (
    lower.includes("colis") ||
    lower.includes("livraison") ||
    lower.includes("amende") ||
    lower.includes("banque") ||
    lower.includes("cpf") ||
    lower.includes("assurance maladie") ||
    lower.includes("carte vitale")
  ) {
    score += 2;
    category = "Arnaque au colis, service ou administration";
    alerts.push("Le message ressemble à un scénario d’arnaque courant.");
  }

  if (
    lower.includes("félicitations") ||
    lower.includes("vous avez gagné") ||
    lower.includes("cadeau") ||
    lower.includes("récompense")
  ) {
    score += 2;
    category = "Faux gain ou cadeau";
    alerts.push("Le message utilise une promesse de gain ou de récompense.");
  }

  if (
    lower.includes("maman") ||
    lower.includes("papa") ||
    lower.includes("j’ai changé de numéro") ||
    lower.includes("j'ai changé de numéro") ||
    lower.includes("virement rapidement")
  ) {
    score += 3;
    category = "Arnaque au proche";
    alerts.push("Le message ressemble à une demande urgente venant d’un proche.");
  }

  let confidenceMessage = "Aucun signal majeur détecté.";

  if (score >= 8) {
    confidenceMessage = "Très probablement frauduleux.";
  } else if (score >= 5) {
    confidenceMessage = "Plusieurs signaux suspects détectés.";
  } else if (score >= 3) {
    confidenceMessage = "Quelques éléments méritent de la prudence.";
  }

  const finalScore = Math.min(score, 10);

  if (finalScore <= 2) {
    return {
      risk: "Faible",
      color: "emerald",
      score: finalScore,
      alerts: alerts.length ? alerts : ["Aucun signal critique détecté."],
      recommendation:
        "Le contenu semble relativement sûr, mais restez vigilant.",
      technicalDetails,
      category,
      confidenceMessage,
    };
  }

  if (finalScore <= 5) {
    return {
      risk: "Moyen",
      color: "yellow",
      score: finalScore,
      alerts,
      recommendation:
        "Vérifiez l’expéditeur et évitez de cliquer trop rapidement.",
      technicalDetails,
      category,
      confidenceMessage,
    };
  }

  return {
    risk: "Élevé",
    color: "red",
    score: finalScore,
    alerts,
    recommendation:
      "Ne cliquez pas directement. Vérifiez l’information depuis le site officiel ou un canal connu.",
    technicalDetails,
    category,
    confidenceMessage,
  };
}