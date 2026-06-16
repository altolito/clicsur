export type DomainAnalysis = {
  domain: string;
  scoreImpact: number;
  alerts: string[];
  technicalDetails: string[];
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
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "cutt.ly",
  "ow.ly",
  "is.gd",
  "shorturl.at",
];

const TYPO_PATTERNS = [
  ["paypa1", "paypal"],
  ["paypai", "paypal"],
  ["arnazon", "amazon"],
  ["micr0soft", "microsoft"],
  ["netf1ix", "netflix"],
  ["g00gle", "google"],
  ["app1e", "apple"],
  ["amel1", "ameli"],
];

const TRUSTED_BRAND_DOMAINS = {
  microsoft: ["microsoft.com", "live.com"],
  google: ["google.com", "gmail.com"],
  netflix: ["netflix.com"],
  paypal: ["paypal.com", "paypal.fr", "service.paypal.com"],
  amazon: ["amazon.fr", "amazon.com"],
  ameli: ["ameli.fr"],
  facebook: ["facebook.com", "fb.com"],
  whatsapp: ["whatsapp.com"],
  mondialrelay: ["mondialrelay.fr"],
  chronopost: ["chronopost.fr"],
};

export function isOfficialTrustedDomain(domain: string) {
  return Object.values(TRUSTED_BRAND_DOMAINS)
    .flat()
    .some(
      (officialDomain) =>
        domain === officialDomain || domain.endsWith(`.${officialDomain}`)
    );
}

function detectBrandImpersonation(domain: string) {
  const normalizedDomain = domain.toLowerCase();
  console.log("DOMAIN CHECK =", normalizedDomain);

  for (const [brand, officialDomains] of Object.entries(TRUSTED_BRAND_DOMAINS)) {
    const mentionsBrand = normalizedDomain.includes(brand);
    const isOfficialDomain = officialDomains.some(
      (officialDomain) =>
        normalizedDomain === officialDomain ||
        normalizedDomain.endsWith(`.${officialDomain}`)
    );

    console.log(
  "BRAND RESULT",
  normalizedDomain,
  brand,
  isOfficialDomain
);

    if (mentionsBrand && !isOfficialDomain) {
      return {
        brand,
        officialDomains,
      };
    }
  }

  return null;
}

export function extractDomain(rawUrl: string): string | null {
  try {
    const cleanedUrl = rawUrl
      .trim()
      .replace(/[<>"'()[\],;!?]+$/g, "")
      .replace(/^[<>"'()[\],;!?]+/g, "");

    const emailMatch = cleanedUrl.match(
      /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
    );

    if (emailMatch?.[1]) {
      return emailMatch[1].toLowerCase().replace(/^www\./, "");
    }

    const domainMatch = cleanedUrl.match(
      /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:[/?#:]|$)/
    );

    if (domainMatch?.[1]) {
      return domainMatch[1].toLowerCase().replace(/^www\./, "");
    }

    const normalizedUrl =
      cleanedUrl.startsWith("http://") || cleanedUrl.startsWith("https://")
        ? cleanedUrl
        : `https://${cleanedUrl}`;

    return new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function analyzeDomain(rawUrl: string): DomainAnalysis | null {
  const domain = extractDomain(rawUrl);

  if (!domain) {
    return null;
  }

  let scoreImpact = 0;

  const alerts: string[] = [];
  const technicalDetails: string[] = [`Domaine détecté : ${domain}`];

  const isTrustedOfficialDomain = isOfficialTrustedDomain(domain);

  if (rawUrl.startsWith("http://")) {
    scoreImpact += 2;

    alerts.push("Le lien utilise HTTP au lieu de HTTPS.");

    technicalDetails.push("Protocole non sécurisé : HTTP");
  }

  if (domain.length > 30) {
    scoreImpact += 2;

    alerts.push("Le nom de domaine est anormalement long.");

    technicalDetails.push("Domaine long : oui");
  } else {
    technicalDetails.push("Domaine long : non");
  }

  if (/\d/.test(domain)) {
    scoreImpact += 1;

    alerts.push("Le domaine contient des chiffres.");

    technicalDetails.push("Chiffres dans le domaine : oui");
  }

  const dashCount = (domain.match(/-/g) || []).length;

  if (dashCount >= 2) {
    scoreImpact += 1;

    alerts.push("Le domaine contient plusieurs tirets.");

    technicalDetails.push(`Nombre de tirets : ${dashCount}`);
  }

  if (SUSPICIOUS_EXTENSIONS.some((extension) => domain.endsWith(extension))) {
    scoreImpact += 2;

    alerts.push(
      "Le domaine utilise une extension souvent présente dans des campagnes douteuses."
    );

    technicalDetails.push("Extension à surveiller : oui");
  }

  if (
    URL_SHORTENERS.some(
      (shortener) => domain === shortener || domain.endsWith(`.${shortener}`)
    )
  ) {
    scoreImpact += 3;

    alerts.push("Le lien utilise probablement un raccourcisseur d’URL.");

    technicalDetails.push("Raccourcisseur d’URL : oui");
  }

  const impersonation = detectBrandImpersonation(domain);

  if (impersonation) {
    scoreImpact += 4;

    alerts.push(
      `Le domaine semble imiter la marque "${impersonation.brand}".`
    );

    technicalDetails.push(
      `Possible usurpation de marque détectée : ${impersonation.brand}`
    );

    technicalDetails.push(
      `Domaines officiels connus : ${impersonation.officialDomains.join(", ")}`
    );
  }

  TYPO_PATTERNS.forEach(([fake, brand]) => {
    if (domain.includes(fake)) {
      scoreImpact += 4;

      alerts.push(`Le domaine semble utiliser une imitation de "${brand}".`);

      technicalDetails.push(
        `Possible typo-squatting détecté : ${fake} → ${brand}`
      );
    }
  });

  if (isTrustedOfficialDomain && scoreImpact > 0) {
    scoreImpact = Math.max(0, scoreImpact - 2);

    technicalDetails.push(
      "Le domaine correspond à un domaine officiel connu."
    );
  } else if (isTrustedOfficialDomain) {
    technicalDetails.push(
      "Le domaine correspond à un domaine officiel connu."
    );
  }

  return {
    domain,
    scoreImpact,
    alerts,
    technicalDetails,
  };
}