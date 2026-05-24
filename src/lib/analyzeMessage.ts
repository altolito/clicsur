import { analyzeDomain, extractDomain } from "./domainAnalysis";
import { checkSafeBrowsing } from "./checkSafeBrowsing";

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

const COMMON_BRANDS = [
  "ameli", "caf", "impots", "impôts", "chronopost", "mondial relay",
  "la poste", "netflix", "paypal", "amazon", "apple", "microsoft",
  "google", "banque", "cpam", "cpf", "makita", "bosch", "dewalt",
  "leroy merlin", "castorama", "brico dépôt", "brico depot",
  "commejaime", "comme j'aime", "comme j aime",
];

const MARKETING_SIGNALS = [
  "offre", "offres", "promo", "promotion", "réduction", "reduction",
  "-50%", "jusqu'à", "jusqua", "offert", "offerts", "gratuit",
  "découvrez", "decouvrez", "profitez", "envie de", "stop",
];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value);
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’]/g, "'")
    .trim();
}

function countMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

export async function analyzeMessage(text: string): Promise<AnalysisResult> {
  const lower = normalizeText(text);

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
      recommendation:
        "Collez un SMS, un email ou un message suspect pour lancer l’analyse.",
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

  const marketingCount = countMatches(lower, MARKETING_SIGNALS);
  const hasStopMention = /\bstop\s?\d{4,6}\b/i.test(text);
  const hasShortSmsNumber = /\b3\d{4}\b/.test(text);
  const hasSensitiveKeywords = includesAny(lower, [
    "mot de passe",
    "code bancaire",
    "code de sécurité",
    "code confidentiel",
    "carte bancaire",
    "iban",
    "identifiants",
    "connexion",
    "confirmez votre compte",
    "vérifiez votre compte",
  ]);

  const looksLikeMarketingSms =
    marketingCount >= 2 && hasStopMention && !hasSensitiveKeywords;

  if (urls.length > 0) {
    score += looksLikeMarketingSms ? 1 : 2;
    pushUnique(alerts, "Un lien a été détecté dans le message.");
    pushUnique(technicalDetails, `Nombre de liens détectés : ${urls.length}`);
  }

  for (const url of urls) {
    const domainAnalysis = analyzeDomain(url);

    if (!domainAnalysis) continue;

    const isSmsRedirect =
      url.toLowerCase().includes("lsms.fr") ||
      url.toLowerCase().includes("sms") ||
      url.toLowerCase().includes("lien");

    const adjustedImpact =
      looksLikeMarketingSms && isSmsRedirect
        ? Math.min(domainAnalysis.scoreImpact, 1)
        : domainAnalysis.scoreImpact;

    score += adjustedImpact;

    domainAnalysis.alerts.forEach((alert) => {
      if (looksLikeMarketingSms && alert.toLowerCase().includes("http")) {
        pushUnique(
          technicalDetails,
          "Lien HTTP détecté, fréquent dans certaines plateformes SMS marketing."
        );
        return;
      }

      pushUnique(alerts, alert);
    });

    domainAnalysis.technicalDetails.forEach((detail) => {
      pushUnique(technicalDetails, detail);
    });

    if (
      domainAnalysis.alerts.some((alert) =>
        alert.toLowerCase().includes("raccourcisseur")
      )
    ) {
      category = "Lien masqué ou raccourci";
    }

    const safeBrowsing = await checkSafeBrowsing(url);

    if (safeBrowsing.dangerous) {
      score += 4;
      category = "URL dangereuse détectée";

      pushUnique(
        alerts,
        "Google Safe Browsing a signalé cette URL comme dangereuse."
      );

      safeBrowsing.threats.forEach((threat) => {
        pushUnique(technicalDetails, `Menace Google détectée : ${threat}`);
      });
    }
  }

  if (urls.some((url) => url.length > 80)) {
    score += looksLikeMarketingSms ? 1 : 2;
    pushUnique(alerts, "L’URL semble anormalement longue.");
  }

  if (
    includesAny(lower, [
      "urgence", "urgent", "immédiat", "immédiatement", "rapidement",
      "dernier rappel", "sous 24h", "sous 48h", "expire", "expiration",
      "dernier avertissement", "action requise",
    ])
  ) {
    score += looksLikeMarketingSms ? 1 : 2;
    pushUnique(alerts, "Le message crée un sentiment d’urgence.");
  }

  if (
    includesAny(lower, [
      "paiement", "carte bancaire", "virement", "iban", "1,99€", "2,99€",
      "frais", "régulariser", "payer", "rembourser", "remboursement",
      "transaction",
    ])
  ) {
    score += 3;
    category = "Demande de paiement suspecte";

    pushUnique(
      alerts,
      "Une demande de paiement ou de régularisation a été détectée."
    );
  }

  if (hasSensitiveKeywords) {
    score += 3;
    category = "Compte ou identifiants menacés";
    pushUnique(alerts, "Le message évoque des informations sensibles.");
  }

  if (
    includesAny(lower, [
      "colis", "livraison", "chronopost", "mondial relay", "la poste",
      "point relais", "frais de livraison", "votre colis est bloqué",
    ])
  ) {
    score += 2;
    category = "Arnaque au colis";

    pushUnique(
      alerts,
      "Le message ressemble à une arnaque liée à un colis ou une livraison."
    );
  }

  if (
    includesAny(lower, [
      "amende", "antai", "impôts", "impots", "ameli", "assurance maladie",
      "carte vitale", "caf", "cpf", "gouv", "service public",
    ])
  ) {
    score += 2;
    category = "Fausse administration";

    pushUnique(
      alerts,
      "Le message imite possiblement un service public ou administratif."
    );
  }

  if (
    includesAny(lower, [
      "banque", "compte bancaire", "opposition", "sécuriser votre compte",
      "activité suspecte", "paiement refusé", "nouveau bénéficiaire",
    ])
  ) {
    score += 3;
    category = "Fausse alerte bancaire";

    pushUnique(alerts, "Le message ressemble à une alerte bancaire suspecte.");
  }

  const hasFakeContestSignal = includesAny(lower, [
    "félicitations", "felicitations", "vous avez gagné",
    "vous pouvez gagner", "gagner un prix", "prix exclusif", "cadeau",
    "récompense", "recompense", "tirage au sort", "lot gagné",
    "gagnant", "coffret",
  ]);

  if (hasFakeContestSignal) {
    score += 3;
    category = "Faux concours ou cadeau";

    pushUnique(
      alerts,
      "Le message utilise une promesse de gain ou de récompense."
    );
  }

  if (
    includesAny(lower, ["félicitations", "felicitations"]) &&
    includesAny(lower, ["gagner", "prix", "cadeau", "coffret"])
  ) {
    score += 3;
    category = "Faux concours ou cadeau";

    pushUnique(
      alerts,
      "Le message utilise une mécanique classique de faux concours."
    );
  }

  if (
    includesAny(lower, ["commentaire", "commentaires", "avis", "sondage"]) &&
    includesAny(lower, ["prix", "cadeau", "récompense", "recompense", "coffret"])
  ) {
    score += 2;
    category = "Faux concours ou cadeau";

    pushUnique(
      alerts,
      "Le message tente d’échanger une action contre une récompense."
    );
  }

  if (
    COMMON_BRANDS.some((brand) => lower.includes(brand)) &&
    hasFakeContestSignal
  ) {
    score += 2;
    category = "Usurpation possible de marque";

    pushUnique(
      alerts,
      "Le message utilise possiblement une marque connue pour inspirer confiance."
    );

    pushUnique(
      technicalDetails,
      "Mention d’une marque connue dans un contexte de gain ou de cadeau."
    );
  }

  if (
    COMMON_BRANDS.some((brand) => lower.includes(brand)) &&
    domains.length > 0 &&
    !looksLikeMarketingSms
  ) {
    score += 1;

    pushUnique(
      alerts,
      "Le message mentionne une marque ou un service connu avec un lien à vérifier."
    );
  }

  if (
    includesAny(lower, [
      "maman", "papa", "j’ai changé de numéro", "j'ai changé de numéro",
      "nouveau numéro", "virement rapidement", "je suis bloqué",
      "je ne peux pas appeler",
    ])
  ) {
    score += 3;
    category = "Arnaque au proche";

    pushUnique(
      alerts,
      "Le message ressemble à une demande urgente venant d’un proche."
    );
  }

  if (
    includesAny(lower, [
      "support microsoft", "ordinateur infecté", "virus détecté",
      "votre pc est bloqué", "assistance technique", "teamviewer", "anydesk",
    ])
  ) {
    score += 3;
    category = "Faux support technique";

    pushUnique(
      alerts,
      "Le message ressemble à une arnaque au faux support technique."
    );
  }

  if (looksLikeMarketingSms) {
    category = "SMS marketing agressif";

    score = Math.min(score, hasSensitiveKeywords ? 6 : 5);

    pushUnique(
      alerts,
      "Le message ressemble davantage à une campagne marketing SMS qu’à un phishing."
    );

    pushUnique(
      technicalDetails,
      "Présence d’un mécanisme STOP typique des SMS marketing."
    );

    if (hasShortSmsNumber) {
      pushUnique(
        technicalDetails,
        "Numéro court détecté, fréquent dans les campagnes SMS commerciales."
      );
    }
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    pushUnique(technicalDetails, "Adresse email détectée dans le contenu.");
  }

  if (/\b(0|\+33)[1-9](\s?\d{2}){4}\b/.test(text)) {
    pushUnique(technicalDetails, "Numéro de téléphone détecté dans le contenu.");
  }

  const finalScore = Math.max(0, Math.min(score, 10));

  let confidenceMessage = "Aucun signal majeur détecté.";

  if (looksLikeMarketingSms) {
    confidenceMessage =
      "Le message semble surtout relever d’un SMS commercial agressif.";
  } else if (finalScore >= 8) {
    confidenceMessage = "Très probablement frauduleux.";
  } else if (finalScore >= 6) {
    confidenceMessage =
      "Plusieurs signaux forts indiquent une tentative d’arnaque.";
  } else if (finalScore >= 3) {
    confidenceMessage = "Quelques éléments méritent de la prudence.";
  }

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
      recommendation: looksLikeMarketingSms
        ? "Ne cliquez pas si vous n’êtes pas sûr de l’expéditeur. Utilisez le STOP si vous ne souhaitez plus recevoir ces SMS."
        : "Vérifiez l’expéditeur, le domaine du lien et évitez de cliquer trop rapidement.",
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