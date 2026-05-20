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

const SUSPICIOUS_EXTENSIONS = [
  ".xyz",
  ".top",
  ".click",
  ".shop",
  ".info",
  ".online",
  ".site",
  ".live",
  ".support",
];

const URL_SHORTENERS = [
  "bit.ly",
  "tinyurl",
  "t.co",
  "goo.gl",
  "cutt.ly",
  "shorturl",
  "ow.ly",
  "is.gd",
];

const COMMON_BRANDS = [
  "ameli",
  "caf",
  "impots",
  "chronopost",
  "mondial relay",
  "la poste",
  "netflix",
  "paypal",
  "amazon",
  "apple",
  "microsoft",
  "google",
  "banque",
  "cpam",
  "cpf",
];

function extractDomain(rawUrl: string): string | null {
  try {
    const cleanedUrl = rawUrl.trim().replace(/[),.;!?]+$/g, "");

    const normalizedUrl =
      cleanedUrl.startsWith("http://") || cleanedUrl.startsWith("https://")
        ? cleanedUrl
        : `https://${cleanedUrl}`;

    return new URL(normalizedUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) {
    list.push(value);
  }
}

export function analyzeMessage(text: string): AnalysisResult {
  const lower = text.toLowerCase().trim();

  let score = 0;
  let category = "Analyse générale";

  const alerts: string[] = [];
  const technicalDetails: string[] = [];

  if (!lower) {
    return {
      risk: "Faible",
      color: "emerald",
      score: 0,
      alerts: ["Aucun texte à analyser."],
      recommendation: "Collez un SMS, un email ou un message suspect pour lancer l’analyse.",
      technicalDetails: [],
      category: "Aucune analyse",
      confidenceMessage: "Analyse impossible sans contenu.",
    };
  }

  const urlRegex =
    /(https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9-]+\.[a-z]{2,}(\/[^\s]*)?)/gi;

  const urls = text.match(urlRegex) || [];
  const domains = urls
    .map((url) => extractDomain(url))
    .filter((domain): domain is string => Boolean(domain));

  if (urls.length > 0) {
    score += 2;
    pushUnique(alerts, "Un lien a été détecté dans le message.");
    technicalDetails.push(`Nombre de liens détectés : ${urls.length}`);
  }

  domains.forEach((domain) => {
    technicalDetails.push(`Domaine détecté : ${domain}`);

    if (domain.length > 30) {
      score += 2;
      pushUnique(alerts, "Le nom de domaine est anormalement long.");
      technicalDetails.push(`Domaine long détecté : ${domain}`);
    }

    if (/\d/.test(domain)) {
      score += 1;
      pushUnique(alerts, "Le domaine contient des chiffres.");
    }

    if (domain.split("-").length > 2) {
      score += 1;
      pushUnique(alerts, "Le domaine contient plusieurs tirets.");
    }

    if (SUSPICIOUS_EXTENSIONS.some((extension) => domain.endsWith(extension))) {
      score += 2;
      pushUnique(
        alerts,
        "Le domaine utilise une extension souvent présente dans des campagnes douteuses."
      );
    }

    if (URL_SHORTENERS.some((shortener) => domain.includes(shortener))) {
      score += 3;
      pushUnique(alerts, "Le lien semble utiliser un raccourcisseur d’URL.");
      category = "Lien masqué ou raccourci";
    }
  });

  if (urls.some((url) => url.startsWith("http://"))) {
    score += 2;
    pushUnique(alerts, "Le lien utilise HTTP au lieu de HTTPS.");
    technicalDetails.push("Protocole HTTP non sécurisé détecté.");
  }

  if (urls.some((url) => url.length > 80)) {
    score += 2;
    pushUnique(alerts, "L’URL semble anormalement longue.");
  }

  if (
    includesAny(lower, [
      "urgence",
      "urgent",
      "immédiat",
      "immédiatement",
      "rapidement",
      "dernier rappel",
      "sous 24h",
      "sous 48h",
      "expire",
      "expiration",
      "dernier avertissement",
      "action requise",
    ])
  ) {
    score += 2;
    pushUnique(alerts, "Le message crée un sentiment d’urgence.");
  }

  if (
    includesAny(lower, [
      "paiement",
      "carte bancaire",
      "virement",
      "iban",
      "1,99€",
      "2,99€",
      "frais",
      "régulariser",
      "payer",
      "rembourser",
      "remboursement",
      "transaction",
    ])
  ) {
    score += 3;
    category = "Demande de paiement suspecte";
    pushUnique(alerts, "Une demande de paiement ou de régularisation a été détectée.");
  }

  if (
    includesAny(lower, [
      "mot de passe",
      "compte suspendu",
      "compte bloqué",
      "connexion",
      "identifiants",
      "code de sécurité",
      "code confidentiel",
      "confirmez votre compte",
      "vérifiez votre compte",
      "authentification",
    ])
  ) {
    score += 3;
    category = "Compte ou identifiants menacés";
    pushUnique(alerts, "Le message évoque des informations sensibles.");
  }

  if (
    includesAny(lower, [
      "colis",
      "livraison",
      "chronopost",
      "mondial relay",
      "la poste",
      "point relais",
      "frais de livraison",
      "votre colis est bloqué",
    ])
  ) {
    score += 2;
    category = "Arnaque au colis";
    pushUnique(alerts, "Le message ressemble à une arnaque liée à un colis ou une livraison.");
  }

  if (
    includesAny(lower, [
      "amende",
      "antai",
      "impôts",
      "impots",
      "ameli",
      "assurance maladie",
      "carte vitale",
      "caf",
      "cpf",
      "gouv",
      "service public",
    ])
  ) {
    score += 2;
    category = "Fausse administration";
    pushUnique(alerts, "Le message imite possiblement un service public ou administratif.");
  }

  if (
    includesAny(lower, [
      "banque",
      "compte bancaire",
      "opposition",
      "sécuriser votre compte",
      "activité suspecte",
      "paiement refusé",
      "nouveau bénéficiaire",
    ])
  ) {
    score += 3;
    category = "Fausse alerte bancaire";
    pushUnique(alerts, "Le message ressemble à une alerte bancaire suspecte.");
  }

  if (
    includesAny(lower, [
      "félicitations",
      "vous avez gagné",
      "cadeau",
      "récompense",
      "tirage au sort",
      "lot gagné",
      "gagnant",
    ])
  ) {
    score += 2;
    category = "Faux gain ou cadeau";
    pushUnique(alerts, "Le message utilise une promesse de gain ou de récompense.");
  }

  if (
    includesAny(lower, [
      "maman",
      "papa",
      "j’ai changé de numéro",
      "j'ai changé de numéro",
      "nouveau numéro",
      "virement rapidement",
      "je suis bloqué",
      "je ne peux pas appeler",
    ])
  ) {
    score += 3;
    category = "Arnaque au proche";
    pushUnique(alerts, "Le message ressemble à une demande urgente venant d’un proche.");
  }

  if (
    includesAny(lower, [
      "support microsoft",
      "ordinateur infecté",
      "virus détecté",
      "votre pc est bloqué",
      "assistance technique",
      "teamviewer",
      "anydesk",
    ])
  ) {
    score += 3;
    category = "Faux support technique";
    pushUnique(alerts, "Le message ressemble à une arnaque au faux support technique.");
  }

  if (COMMON_BRANDS.some((brand) => lower.includes(brand)) && urls.length > 0) {
    score += 1;
    pushUnique(
      alerts,
      "Le message mentionne une marque ou un service connu avec un lien à vérifier."
    );
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    technicalDetails.push("Adresse email détectée dans le contenu.");
  }

  if (/\b(0|\+33)[1-9](\s?\d{2}){4}\b/.test(text)) {
    technicalDetails.push("Numéro de téléphone détecté dans le contenu.");
  }

  const finalScore = Math.min(score, 10);

  let confidenceMessage = "Aucun signal majeur détecté.";

  if (finalScore >= 8) {
    confidenceMessage = "Très probablement frauduleux.";
  } else if (finalScore >= 6) {
    confidenceMessage = "Plusieurs signaux forts indiquent une tentative d’arnaque.";
  } else if (finalScore >= 3) {
    confidenceMessage = "Quelques éléments méritent de la prudence.";
  }

  if (finalScore <= 2) {
    return {
      risk: "Faible",
      color: "emerald",
      score: finalScore,
      alerts: alerts.length ? alerts : ["Aucun signal critique détecté."],
      recommendation: "Le contenu semble relativement sûr, mais restez vigilant.",
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
        "Vérifiez l’expéditeur, le domaine du lien et évitez de cliquer trop rapidement.",
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
      "Ne cliquez pas. Vérifiez l’information depuis le site officiel ou un canal connu.",
    technicalDetails,
    category,
    confidenceMessage,
  };
}