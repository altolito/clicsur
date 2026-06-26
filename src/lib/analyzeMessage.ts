import { analyzeDomain, extractDomain } from "./domainAnalysis";
import { checkSafeBrowsing } from "./checkSafeBrowsing";
import { getDomainReputation } from "./domainReputation";
import { supabase } from "./supabase";
import { checkPhishTank } from "./checkPhishTank";
import { isOfficialTrustedDomain } from "./domainAnalysis";


export type AnalysisResult = {
  risk: "Faible" | "Moyen" | "Élevé";
  color: "emerald" | "yellow" | "red";
  score: number;
  alerts: string[];
  safeSignals: string[];
  recommendation: string;
  technicalDetails: string[];
  category: string;
  confidenceMessage: string;
  likelyIntent: string;
  confidenceLevel: "Faible" | "Moyenne" | "Élevée";
  specialNotice?: string;
};

type ThreatProfiles = {
  marketing: number;
  phishing: number;
  financial: number;
  identity: number;
  fakeContest: number;
  packageScam: number;
  adminScam: number;
  bankingScam: number;
  familyScam: number;
  techSupport: number;
  otp: number;
};

const MARKETING_SAFE_SIGNALS = [
  "newsletter",
  "désabonner",
  "unsubscribe",
  "voir en ligne",
  "consulter en ligne",
  "votre commande est prête",
  "votre facture est disponible",
  "votre relevé est disponible",
  "merci de votre confiance",
  "recevoir nos offres",
  "offre du mois",
  "nouveautés",
  "promotions",
  "préférences",
  "gérer mes préférences",
];

const COMMON_BRANDS = [
  "ameli", "caf", "impots", "impôts", "chronopost", "mondial relay",
  "la poste", "netflix", "paypal", "amazon", "apple", "microsoft",
  "google", "facebook", "meta", "banque", "cpam", "cpf", "makita",
  "bosch", "dewalt", "leroy merlin", "castorama", "brico dépôt",
  "brico depot", "commejaime", "comme j'aime", "comme j aime",
];

const KNOWN_SMS_MARKETING_DOMAINS = ["lsms.fr", "isms.fr"];

const KNOWN_MARKETING_PLATFORMS = [
  "brevo.com",
  "sendinblue.com",
  "mailchimp.com",
  "mailjet.com",
  "mailin.fr",
  "commejaime.fr",
];

const TRUSTED_MARKETING_DOMAINS = [
  "commejaime.fr",
  "www.commejaime.fr",
];

const MARKETING_SIGNALS = [
  "offre", "offres", "promo", "promotion", "réduction", "reduction",
  "-50%", "jusqu'à", "jusqua", "offert", "offerts", "gratuit",
  "découvrez", "decouvrez", "profitez", "envie de", "stop",
  "désinscription", "desinscription", "se désabonner", "se desabonner",
];

const URGENCY_SIGNALS = [
  "urgence", "urgent", "immédiat", "immédiatement", "rapidement",
  "dernier rappel", "sous 24h", "sous 48h", "expire", "expiration",
  "dernier avertissement", "action requise", "jusqu'à dimanche",
];

const FINANCIAL_SIGNALS = [
  "paiement", "carte bancaire", "virement", "iban", "1,99€", "2,99€",
  "frais", "régulariser", "payer", "rembourser", "remboursement",
  "transaction",
];

const IDENTITY_SIGNALS = [
  "mot de passe", "code bancaire", "code de sécurité", "code confidentiel",
  "identifiants", "confirmez votre compte", "vérifiez votre compte",
];

const OTP_SIGNALS = [
  "code",
  "verification code",
  "code de vérification",
  "code verification",
  "security code",
  "code de sécurité",
  "code d'authentification",
  "authentification",
  "connexion",
  "login",
  "otp",
  "facebook code",
  "is your facebook code",
];

const FAKE_CONTEST_SIGNALS = [
  "félicitations", "felicitations", "vous avez gagné",
  "vous pouvez gagner", "gagner un prix", "prix exclusif", "cadeau",
  "récompense", "recompense", "tirage au sort", "lot gagné",
  "gagnant", "coffret",
];





function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
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

function isKnownMarketingDomain(domain: string) {
  return (
    KNOWN_SMS_MARKETING_DOMAINS.includes(domain) ||
    KNOWN_MARKETING_PLATFORMS.some(
      (knownDomain) =>
        domain === knownDomain || domain.endsWith(`.${knownDomain}`)
    )
  );
}

function getDominantProfile(profiles: ThreatProfiles) {
  return Object.entries(profiles).sort((a, b) => b[1] - a[1])[0] as [
    keyof ThreatProfiles,
    number
  ];
}

function getLikelyIntent(profile: keyof ThreatProfiles) {
  switch (profile) {
    case "otp":
      return "Code de connexion ou d’authentification";
    case "marketing":
      return "Publicité ou campagne marketing";
    case "phishing":
    case "identity":
      return "Vol d’identifiants";
    case "financial":
      return "Paiement frauduleux";
    case "packageScam":
      return "Fausse livraison ou faux colis";
    case "adminScam":
      return "Usurpation administrative";
    case "bankingScam":
      return "Récupération bancaire";
    case "fakeContest":
      return "Collecte de clics ou données personnelles";
    case "familyScam":
      return "Manipulation émotionnelle";
    case "techSupport":
      return "Prise de contrôle informatique";
    default:
      return "Indéterminé";
  }
}

function getConfidenceLevel(
  finalScore: number,
  dominantScore: number
): "Faible" | "Moyenne" | "Élevée" {
  if (finalScore >= 7 || dominantScore >= 5) return "Élevée";
  if (finalScore >= 3 || dominantScore >= 3) return "Moyenne";
  return "Faible";
}


async function saveAnalysis(
  inputText: string,
  result: AnalysisResult,
  urls: string[] = [],
  domains: string[] = [],
  userId: string | null = null
) {
  try {
    const { error } = await supabase.from("analyses").insert({
      input_text: inputText,
      risk: result.risk,
      score: result.score,
      category: result.category,
      urls,
      domains,
      user_id: userId,
    });

    if (error) {
      console.error("Erreur sauvegarde Supabase :", error);
    }
  } catch (error) {
    console.error("Erreur Supabase inattendue :", error);
  }
}

export async function analyzeMessage(
  text: string,
  userId: string | null = null
): Promise<AnalysisResult> {
  const lower = normalizeText(text);

  const looksLikeMarketingEmail =
  MARKETING_SAFE_SIGNALS.some((signal) =>
    lower.includes(signal)
  );

  let score = 0;
  let category = "Analyse générale";

  const alerts: string[] = [];
  const safeSignals: string[] = [];
  const technicalDetails: string[] = [];

  const profiles: ThreatProfiles = {
    marketing: 0,
    phishing: 0,
    financial: 0,
    identity: 0,
    fakeContest: 0,
    packageScam: 0,
    adminScam: 0,
    bankingScam: 0,
    familyScam: 0,
    techSupport: 0,
    otp: 0,
  };

  if (!lower) {
    return {
      risk: "Faible",
      color: "emerald",
      score: 0,
      alerts: ["Aucun texte à analyser."],
      safeSignals: [],
      recommendation:
        "Collez un SMS, un email ou un message suspect pour lancer l’analyse.",
      technicalDetails: [],
      category: "Aucune analyse",
      confidenceMessage: "Analyse impossible sans contenu.",
      likelyIntent: "Indéterminé",
      confidenceLevel: "Faible",
    };
  }

 const urlRegex =
  /(https?:\/\/[^\s<>]+|www\.[^\s<>]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-z0-9.-]+\.[a-z]{2,}(\/[^\s<>]*)?)/gi;

const urls = text.match(urlRegex) || [];
  
  const domains = urls
    .map((url) => extractDomain(url))
    .filter((domain): domain is string => Boolean(domain));

    const hasOfficialTrustedDomain = domains.some((domain) =>
  isOfficialTrustedDomain(domain)
    );

  const domainReputations = domains.map((domain) => ({
    domain,
    reputation: getDomainReputation(domain),
  }));

  const hasMarketingReputation = domainReputations.some(
    (item) => item.reputation.reputation === "marketing"
  );

  const hasDangerousReputation = domainReputations.some(
    (item) => item.reputation.reputation === "dangerous"
  );

  const hasKnownMarketingDomain =
    domains.some((domain) => isKnownMarketingDomain(domain)) ||
    hasMarketingReputation;

  const hasTrustedMarketingDomain = domains.some((domain) =>
    TRUSTED_MARKETING_DOMAINS.includes(domain)
  );

  const marketingCount = countMatches(lower, MARKETING_SIGNALS);
  const otpCount = countMatches(lower, OTP_SIGNALS);



  const hasStopMention = /\bstop\s?\d{4,6}\b/i.test(text);
  const hasShortSmsNumber = /\b3\d{4}\b/.test(text);
  const hasSensitiveKeywords = includesAny(lower, IDENTITY_SIGNALS);
  const hasFinancialKeywords = includesAny(lower, FINANCIAL_SIGNALS);
  const hasUrgency = includesAny(lower, URGENCY_SIGNALS);
  const hasFakeContestSignal = includesAny(lower, FAKE_CONTEST_SIGNALS);

  const isLowRiskLogisticsNotification =
  includesAny(lower, [
    "mondial relay",
    "by inpost",
    "inpost",
    "colis disponible",
    "votre colis est disponible",
    "code retrait",
    "code de retrait",
    "retrait jusqu'au",
    "retrait jusqu’au",
    "locker",
    "point relais",
  ]) &&
  !hasFinancialKeywords &&
  !hasUrgency &&
  urls.length === 0;

    const hasOtpPattern =
  /\b\d{4,8}\b/.test(text) &&
  (otpCount >= 1 || lower.includes("facebook")) &&
  !isLowRiskLogisticsNotification;

  const mentionsKnownBrand = COMMON_BRANDS.some((brand) =>
    lower.includes(brand)
  );

  if (isLowRiskLogisticsNotification) {
  const result: AnalysisResult = {
    risk: "Faible",
    color: "emerald",
    score: 1,
    alerts: ["Notification de retrait colis détectée."],
    safeSignals: [
      "Aucune demande de paiement détectée.",
      "Aucun lien suspect détecté.",
      "Présence d’un service de livraison connu.",
    ],
    recommendation:
      "Le message semble cohérent avec une notification de retrait colis. Vérifiez simplement que vous attendez bien un colis et ne partagez le code qu’au moment du retrait.",
    technicalDetails: ["Contexte compatible avec une notification Mondial Relay ou locker."],
    category: "Retrait colis légitime",
    confidenceMessage:
      "Le message ressemble à une notification logistique légitime.",
    likelyIntent: "Retrait de colis",
    confidenceLevel: "Moyenne",
    specialNotice:
      "📦 Notification de retrait colis détectée. Le message semble cohérent avec une notification logistique, surtout si aucun paiement n’est demandé.",
  };

  await saveAnalysis(
  text,
  result,
  urls,
  domains,
  userId
);

  return result;
}

  if (
    hasOtpPattern &&
    urls.length === 0 &&
    !hasFinancialKeywords &&
    !hasFakeContestSignal &&
    !hasUrgency
  ) {
    const result: AnalysisResult = {
      risk: "Faible",
      color: "emerald",
      score: 1,
      alerts: ["Code de connexion ou d’authentification détecté."],
      safeSignals: [
        "Aucun lien détecté.",
        "Aucune demande de paiement détectée.",
        "Aucune demande d’identifiants ou de mot de passe détectée.",
      ],
      recommendation:
        "Ne partagez jamais ce code. Si vous n’êtes pas à l’origine de cette demande, sécurisez votre compte depuis l’application ou le site officiel.",
      technicalDetails: ["Format compatible avec un code OTP ou MFA."],
      category: "Code de connexion",
      confidenceMessage:
        "Le message ressemble à un code de vérification légitime, mais il ne doit jamais être transmis à quelqu’un.",
      likelyIntent: "Code de connexion ou d’authentification",
      confidenceLevel: "Moyenne",
    };

    await saveAnalysis(
  text,
  result,
  urls,
  domains,
  userId
);

    return result;
  }

if (marketingCount >= 2) {
  profiles.marketing += 3;

  if (hasTrustedMarketingDomain) {
    score += 0;
  } else if (hasFinancialKeywords || hasSensitiveKeywords) {
    score += 3;
  } else {
    score += 1;
  }
}

  if (hasStopMention) {
    profiles.marketing += 3;
    score += 1;
  }

  if (hasShortSmsNumber) {
    profiles.marketing += 1;
  }

  if (hasKnownMarketingDomain) {
    profiles.marketing += 2;
    score += 1;
  }

  if (hasMarketingReputation) {
    profiles.marketing += 3;
    score += 1;
  }

  if (hasOtpPattern) {
    profiles.otp += 4;

    pushUnique(alerts, "Code de connexion ou d’authentification détecté.");
    pushUnique(
      safeSignals,
      "Un code seul n’est pas forcément suspect, mais il ne doit jamais être partagé."
    );
  }

  if (hasStopMention) {
    pushUnique(
      safeSignals,
      "Présence d’un mécanisme STOP souvent utilisé dans les SMS commerciaux."
    );
  }

  if (hasShortSmsNumber) {
    pushUnique(
      safeSignals,
      "Le message utilise un numéro court fréquent dans les campagnes SMS déclarées."
    );
  }

  if (hasKnownMarketingDomain) {
    pushUnique(
      safeSignals,
      "Le lien correspond à un domaine officiel connu."
    );

    const knownMarketingDomains = [
      ...new Set(
        domains.filter(
          (domain) =>
            isKnownMarketingDomain(domain) ||
            getDomainReputation(domain).reputation === "marketing"
        )
      ),
    ];

    pushUnique(
      technicalDetails,
      `Domaine marketing connu détecté : ${knownMarketingDomains.join(", ")}`
    );
  }

  if (
    hasMarketingReputation &&
    !hasSensitiveKeywords &&
    !hasFinancialKeywords
  ) {
    score = Math.max(score, 3);

    pushUnique(
      safeSignals,
      "Le domaine possède une réputation marketing connue."
    );

    pushUnique(technicalDetails, "Réputation domaine : marketing connu.");
  }

  if (hasDangerousReputation) {
    score += 5;
    profiles.phishing += 5;
    category = "Domaine dangereux connu";

    pushUnique(alerts, "Le domaine est connu comme dangereux ou frauduleux.");
    pushUnique(technicalDetails, "Réputation domaine : dangereux connu.");
  }

  if (hasUrgency) {
    score += hasKnownMarketingDomain && hasStopMention ? 1 : 2;
    profiles.phishing += 1;
    profiles.financial += 1;

    pushUnique(alerts, "Le message crée un sentiment d’urgence.");
  }

  if (hasFinancialKeywords) {
    score += 3;
    profiles.financial += 4;
    category = "Demande de paiement suspecte";

    pushUnique(
      alerts,
      "Une demande de paiement ou de régularisation a été détectée."
    );
  }

  if (hasSensitiveKeywords) {
    score += 3;
    profiles.phishing += 4;
    profiles.identity += 4;
    category = "Compte ou identifiants menacés";

    pushUnique(alerts, "Le message évoque des informations sensibles.");
  }

  const looksLikeMarketingSms =
    profiles.marketing >= 5 &&
    !hasSensitiveKeywords &&
    !hasFinancialKeywords &&
    !hasDangerousReputation;

  if (looksLikeMarketingSms && !hasSensitiveKeywords) {
    pushUnique(
      safeSignals,
      "Aucune demande d’identifiants ou de mot de passe détectée."
    );
  }

  if (looksLikeMarketingSms && !hasFinancialKeywords) {
    pushUnique(safeSignals, "Aucune demande directe de paiement détectée.");
  }

  if (urls.length > 0) {
    score += looksLikeMarketingSms ? 1 : 2;
    profiles.phishing += looksLikeMarketingSms ? 0 : 1;

      if (!hasKnownMarketingDomain) {
    pushUnique(alerts, "Un lien a été détecté dans le message.");
      }
    pushUnique(technicalDetails, `Nombre de liens détectés : ${urls.length}`);
  }

  for (const url of urls) {
    const domainAnalysis = analyzeDomain(url);

    if (!domainAnalysis) continue;

    const urlLower = url.toLowerCase();

    const isSmsRedirect =
      urlLower.includes("lsms.fr") ||
      urlLower.includes("isms.fr") ||
      urlLower.includes("sms") ||
      urlLower.includes("lien");

    const adjustedImpact =
      looksLikeMarketingSms && isSmsRedirect
        ? Math.min(domainAnalysis.scoreImpact, 1)
        : domainAnalysis.scoreImpact;

    score += adjustedImpact;

    if (adjustedImpact >= 2) {
      profiles.phishing += 2;
    }

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

    
    const safeBrowsing = await checkSafeBrowsing(url);
    pushUnique(
    technicalDetails,
    safeBrowsing.dangerous
      ? "Google Safe Browsing : URL signalée dangereuse."
      : "Google Safe Browsing : aucune menace détectée."
  );

    if (safeBrowsing.dangerous) {
      score += 4;
      profiles.phishing += 5;
      category = "URL dangereuse détectée";

      pushUnique(
        alerts,
        "Google Safe Browsing a signalé cette URL comme dangereuse."
      );

      safeBrowsing.threats.forEach((threat) => {
        pushUnique(technicalDetails, `Menace Google détectée : ${threat}`);
      });
    }
      const phishTank = await checkPhishTank(String(url));

pushUnique(
  technicalDetails,
  phishTank.listed
    ? "PhishTank : URL présente dans la base publique de phishing."
    : "PhishTank : URL non trouvée dans la base publique."
);

      if (phishTank.listed) {
        score += 4;
        profiles.phishing += 5;
        category = "URL référencée comme phishing";

        pushUnique(
          alerts,
          "Cette URL est présente dans une base publique de phishing."
        );

        if (phishTank.verified) {
          pushUnique(
            technicalDetails,
            "PhishTank : phishing vérifié."
          );
        }

        if (phishTank.phishDetailUrl) {
          pushUnique(
            technicalDetails,
            `Fiche PhishTank : ${phishTank.phishDetailUrl}`
          );
        }
      }
  }


  if (urls.some((url) => url.length > 80)) {
    score += looksLikeMarketingSms ? 1 : 2;
    profiles.phishing += looksLikeMarketingSms ? 0 : 1;

    pushUnique(alerts, "L’URL semble anormalement longue.");
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
      "colis bloqué",
      "colis suspendu",
      "livraison suspendue",
      "récupérez votre colis",
      "recuperez votre colis",
    ])
  ) {
    score += 3;
    profiles.packageScam += 5;
    category = "Arnaque au colis";

    pushUnique(
      alerts,
      "Le message ressemble à une arnaque liée à un colis ou une livraison."
    );
  }

  if (
    includesAny(lower, [
      "colis suspendu",
      "colis bloqué",
      "livraison suspendue",
      "frais de livraison",
      "charge ajustée",
      "charge ajustee",
      "récupérez votre colis",
      "recuperez votre colis",
    ])
  ) {
    score += 3;
    profiles.packageScam += 3;
    category = "Arnaque au colis";

    pushUnique(
      alerts,
      "Le message utilise une mécanique classique d’arnaque au colis."
    );
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
    profiles.adminScam += 4;
    category = "Fausse administration";

    pushUnique(
      alerts,
      "Le message imite possiblement un service public ou administratif."
    );
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
    profiles.bankingScam += 5;
    profiles.phishing += 2;
    category = "Fausse alerte bancaire";

    pushUnique(alerts, "Le message ressemble à une alerte bancaire suspecte.");
  }

  if (hasFakeContestSignal) {
    score += 3;
    profiles.fakeContest += 4;
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
    profiles.fakeContest += 4;
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
    profiles.fakeContest += 3;
    category = "Faux concours ou cadeau";

    pushUnique(
      alerts,
      "Le message tente d’échanger une action contre une récompense."
    );
  }

  if (mentionsKnownBrand && hasFakeContestSignal) {
    score += 2;
    profiles.fakeContest += 2;
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
      mentionsKnownBrand &&
      domains.length > 0 &&
      !looksLikeMarketingSms &&
      !hasKnownMarketingDomain &&
      !hasTrustedMarketingDomain
    ) {
    score += 1;
    profiles.phishing += 1;

    pushUnique(
      alerts,
      "Le message mentionne une marque ou un service connu avec un lien à vérifier."
    );
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
    profiles.familyScam += 5;
    category = "Arnaque au proche";

    pushUnique(
      alerts,
      "Le message ressemble à une demande urgente venant d’un proche."
    );
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
    profiles.techSupport += 5;
    category = "Faux support technique";

    pushUnique(
      alerts,
      "Le message ressemble à une arnaque au faux support technique."
    );
  }

  const [dominantProfile, dominantScore] = getDominantProfile(profiles);

  let likelyIntent =
    dominantScore > 0 ? getLikelyIntent(dominantProfile) : "Indéterminé";

 if (
  dominantScore > 0 &&
  category !== "Lien officiel probable" &&
  category !== "Communication commerciale légitime" &&
  !hasOfficialTrustedDomain
) {
  pushUnique(
    technicalDetails,
    `Profil dominant détecté : ${dominantProfile}`
  );
}

  if (category === "Lien officiel probable") {
    // On garde cette catégorie prioritaire.
  } else if (dominantProfile === "otp" && dominantScore >= 4) {
    category = "Code de connexion";
    score = Math.min(score, 2);

    pushUnique(
      safeSignals,
      "Le message ressemble à un code de vérification ou de connexion."
    );
} else if (looksLikeMarketingSms && dominantProfile === "marketing") {
  category = hasKnownMarketingDomain
    ? "SMS marketing identifié"
    : "Newsletter commerciale";

  score = Math.min(score, hasKnownMarketingDomain ? 2 : 2);

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
  } else if (dominantProfile === "phishing" || dominantProfile === "identity") {
    category = "Phishing probable";
  } else if (dominantProfile === "financial") {
    category = "Tentative financière suspecte";
  } else if (dominantProfile === "fakeContest") {
    category = mentionsKnownBrand
      ? "Usurpation possible de marque"
      : "Faux concours ou cadeau";
  } else if (dominantProfile === "packageScam") {
    category = "Arnaque au colis";
  } else if (dominantProfile === "adminScam") {
    category = "Fausse administration";
  } else if (dominantProfile === "bankingScam") {
    category = "Fausse alerte bancaire";
  } else if (dominantProfile === "familyScam") {
    category = "Arnaque au proche";
  } else if (dominantProfile === "techSupport") {
    category = "Faux support technique";
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    pushUnique(technicalDetails, "Adresse email détectée dans le contenu.");
  }

  if (/\b(0|\+33)[1-9](\s?\d{2}){4}\b/.test(text)) {
    pushUnique(technicalDetails, "Numéro de téléphone détecté dans le contenu.");
  }

  if (hasTrustedMarketingDomain && dominantProfile === "marketing") {
  score = Math.min(score, 2);

  category = "Newsletter commerciale";

  pushUnique(
    safeSignals,
    "Le lien correspond à un domaine officiel connu de la marque."
  );

  pushUnique(
    technicalDetails,
    "Domaine marketing officiel détecté."
  );
}

if (
  looksLikeMarketingEmail &&
  hasOfficialTrustedDomain &&
  !hasDangerousReputation
) {
  score = Math.min(score, 1);
  category = "Communication commerciale légitime";

  pushUnique(
    safeSignals,
    "Le message ressemble à une communication commerciale classique."
  );

  pushUnique(
    technicalDetails,
    "Plusieurs indices correspondent à une newsletter ou un email transactionnel légitime."
  );
}

if (
  looksLikeMarketingEmail &&
  hasOfficialTrustedDomain &&
  !hasDangerousReputation
) {
  likelyIntent = "Communication commerciale";
}

if (
  hasOfficialTrustedDomain &&
  !hasDangerousReputation &&
  !looksLikeMarketingEmail
) {
  score = Math.min(score, 2);
  category = "Lien officiel probable";

  pushUnique(
    safeSignals,
    "Le domaine détecté correspond à un domaine officiel connu."
  );

  pushUnique(
    technicalDetails,
    "Domaine officiel reconnu : réduction du score appliquée."
  );
}

  const finalScore = Math.max(0, Math.min(score, 10));
  let confidenceLevel = getConfidenceLevel(finalScore, dominantScore);

  if (
  looksLikeMarketingEmail &&
  hasOfficialTrustedDomain &&
  !hasDangerousReputation
) {
  confidenceLevel = "Faible";
}

  let confidenceMessage = "Aucun signal majeur détecté.";

  if (category === "Lien officiel probable") {
    confidenceMessage =
      "Le lien semble appartenir à un domaine officiel connu.";
  } else if (dominantProfile === "otp" && dominantScore >= 4) {
    confidenceMessage =
      "Le message ressemble à un code de connexion ou d’authentification.";
  } else if (looksLikeMarketingSms && dominantProfile === "marketing") {
    confidenceMessage = hasKnownMarketingDomain
      ? "Le message semble provenir d’une campagne SMS marketing identifiable."
      : "Le message semble surtout relever d’un SMS commercial agressif.";
  } else if (hasDangerousReputation) {
    confidenceMessage =
      "Le domaine utilisé est connu comme suspect ou dangereux.";
  } else if (finalScore >= 8) {
    confidenceMessage = "Très probablement frauduleux.";
  } else if (finalScore >= 6) {
    confidenceMessage =
      "Plusieurs signaux forts indiquent une tentative d’arnaque.";
  } else if (finalScore >= 3) {
    confidenceMessage = "Quelques éléments méritent de la prudence.";
  }

  let specialNotice: string | undefined;

  if (category === "Code de connexion") {
    specialNotice =
      "🔐 Code de vérification ou de retrait détecté. Ce type de message peut être légitime, mais ne partagez jamais ce code avec un tiers. Vérifiez que vous êtes bien à l’origine de l’action ou que vous attendez bien ce colis.";
  } else if (isLowRiskLogisticsNotification) {
    specialNotice =
      "📦 Notification de retrait colis détectée. Le message semble cohérent avec une notification logistique, surtout si aucun paiement n’est demandé. Vérifiez toutefois que vous attendez bien un colis et que l’expéditeur correspond à un service connu.";
  }

  let result: AnalysisResult;

  if (finalScore <= 2) {
    result = {
      risk: "Faible",
      color: "emerald",
      score: finalScore,
      alerts: alerts.length ? alerts : ["Aucun signal critique détecté."],
      safeSignals,
      recommendation:
        category === "Code de connexion"
          ? "Ne partagez jamais ce code. Si vous n’êtes pas à l’origine de cette demande, changez votre mot de passe depuis le site officiel."
          : category === "Lien officiel probable"
            ? "Le lien semble correspondre à un domaine officiel connu. Vérifiez tout de même que vous êtes bien à l’origine de l’action."
            : "Le contenu semble relativement sûr, mais restez vigilant.",
      technicalDetails,
      category,
      confidenceMessage,
      likelyIntent,
      confidenceLevel,
      specialNotice,
    };
  } else if (finalScore <= 5) {
    result = {
      risk: "Moyen",
      color: "yellow",
      score: finalScore,
      alerts,
      safeSignals,
      recommendation: looksLikeMarketingSms
        ? "Ne cliquez pas si vous n’êtes pas sûr de l’expéditeur. Utilisez le STOP si vous ne souhaitez plus recevoir ces SMS."
        : "Vérifiez l’expéditeur, le domaine du lien et évitez de cliquer trop rapidement.",
      technicalDetails,
      category,
      confidenceMessage,
      likelyIntent,
      confidenceLevel,
      specialNotice,
    };
  } else {
    result = {
      risk: "Élevé",
      color: "red",
      score: finalScore,
      alerts,
      safeSignals,
      recommendation:
        "Ne cliquez pas. Vérifiez l'information depuis le site officiel ou un canal connu.",
      technicalDetails,
      category,
      confidenceMessage,
      likelyIntent,
      confidenceLevel,
      specialNotice,
    };
  }

  await saveAnalysis(
  text,
  result,
  urls,
  domains,
  userId
);

  return result;
}